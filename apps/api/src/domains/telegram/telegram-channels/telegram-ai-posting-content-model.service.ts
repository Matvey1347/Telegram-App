import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : {};
const text = (value: unknown, max: number, fallback = '') =>
  typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const rows = (value: unknown) => Array.isArray(value) ? value : [];
const id = (value: unknown) => text(value, 128);

const defaults = [
  { id: 'ultra-short', name: 'Ультракороткая', emoji: '⚡', minCharacters: 0, maxCharacters: 99 },
  { id: 'short', name: 'Короткая', emoji: '📝', minCharacters: 100, maxCharacters: 299 },
  { id: 'medium', name: 'Средняя', emoji: '📖', minCharacters: 300, maxCharacters: 699 },
  { id: 'long', name: 'Длинная', emoji: '📚', minCharacters: 700, maxCharacters: null },
];

@Injectable()
export class TelegramAiPostingContentModelService {
  async replace(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    channelId: string,
    configuration: RecordValue,
  ) {
    const mediaPreferenceIds = new Set(rows(configuration.mediaPreferences).map((value) => id(record(value).id)));
    const lengthRows = rows(configuration.lengths).length
      ? rows(configuration.lengths)
      : defaults;
    const lengths = lengthRows.map((value) => {
      const item = record(value);
      const minCharacters = Number(item.minCharacters);
      const maxCharacters = item.maxCharacters == null ? null : Number(item.maxCharacters);
      if (
        !id(item.id) || !text(item.name, 80) ||
        !Number.isInteger(minCharacters) || minCharacters < 0 ||
        (maxCharacters !== null && (!Number.isInteger(maxCharacters) || maxCharacters < minCharacters || maxCharacters > 100_000))
      ) throw new BadRequestException('AI_POSTING_LENGTH_INVALID');
      return {
        id: id(item.id), name: text(item.name, 80), emoji: text(item.emoji, 32, '✍️'),
        minCharacters, maxCharacters,
      };
    });
    if (new Set(lengths.map((item) => item.id)).size !== lengths.length || new Set(lengths.map((item) => item.name.toLocaleLowerCase())).size !== lengths.length)
      throw new BadRequestException('AI_POSTING_LENGTH_DUPLICATE');
    const dbLengthId = (lengthId: string) => `${channelId}::${lengthId}`;

    const sphereRows = rows(configuration.spheres).map(record);
    const spheres = sphereRows.map((item) => {
      const sourceValues = rows(item.sources);
      if (sourceValues.length > 10 || sourceValues.some((value) => typeof value !== 'string'))
        throw new BadRequestException('AI_POSTING_SPHERE_SOURCE_INVALID');
      const sources = sourceValues.flatMap((value) => {
        try {
          const url = new URL(value as string);
          if (url.protocol !== 'https:' || url.username || url.password)
            throw new BadRequestException('AI_POSTING_SPHERE_SOURCE_INVALID');
          url.hash = '';
          return [url.toString()];
        } catch { throw new BadRequestException('AI_POSTING_SPHERE_SOURCE_INVALID'); }
      });
      const tier = item.parentId ? 'SECONDARY' : item.tier === 'PRIMARY' ? 'PRIMARY' : 'SECONDARY';
      if (!id(item.id) || !text(item.name, 120) || !['PRIMARY', 'SECONDARY'].includes(tier))
        throw new BadRequestException('AI_POSTING_SPHERE_INVALID');
      return {
        id: id(item.id), parentId: item.parentId ? id(item.parentId) : null,
        name: text(item.name, 120), emoji: text(item.emoji, 32, '✨'), tier,
        description: text(item.description, 2000), sources,
        mediaPreferenceId: item.mediaPreferenceId ? id(item.mediaPreferenceId) : null,
      };
    });
    if (new Set(spheres.map((item) => item.id)).size !== spheres.length)
      throw new BadRequestException('AI_POSTING_SPHERE_DUPLICATE');
    const sphereIds = new Set(spheres.map((item) => item.id));
    if (spheres.some((item) => item.parentId && (!sphereIds.has(item.parentId) || item.parentId === item.id)))
      throw new BadRequestException('AI_POSTING_SPHERE_PARENT_INVALID');
    const sphereById = new Map(spheres.map((item) => [item.id, item]));
    if (spheres.some((item) => item.mediaPreferenceId && !mediaPreferenceIds.has(item.mediaPreferenceId)))
      throw new BadRequestException('AI_POSTING_SPHERE_MEDIA_PREFERENCE_INVALID');
    if (spheres.some((item) => item.parentId && sphereById.get(item.parentId)?.parentId))
      throw new BadRequestException('AI_POSTING_SPHERE_DEPTH_INVALID');

    // The editor can hold an untouched, empty rubric row while users fill in
    // other settings. Treat that row as a draft instead of rejecting the
    // entire settings transaction; partially filled rubrics remain invalid.
    const rubricRows = rows(configuration.rubrics)
      .map(record)
      .filter((item) => text(item.name, 120) || text(item.description, 2000) || text(item.goal, 1000));
    const rubrics = rubricRows.map((item) => {
      const sphereId = item.sphereId ? id(item.sphereId) : null;
      if (!id(item.id) || !text(item.name, 120) || (sphereId && !sphereIds.has(sphereId)))
        throw new BadRequestException('AI_POSTING_RUBRIC_INVALID');
      const requestedLengths = rows(item.lengthIds).map(id).filter(Boolean);
      const lengthIds = requestedLengths.length ? [...new Set(requestedLengths)] : lengths.map((length) => length.id);
      if (lengthIds.some((lengthId) => !lengths.some((length) => length.id === lengthId)))
        throw new BadRequestException('AI_POSTING_RUBRIC_LENGTH_INVALID');
      return {
        id: id(item.id), sphereId, name: text(item.name, 120), emoji: text(item.emoji, 32, '📝'),
        description: text(item.description, 2000), goal: text(item.goal, 1000), lengthIds,
      };
    });
    if (new Set(rubrics.map((item) => item.id)).size !== rubrics.length)
      throw new BadRequestException('AI_POSTING_RUBRIC_DUPLICATE');

    await tx.telegramAiPostingIdea.upsert({
      where: { telegramChannelId: channelId },
      create: {
        workspaceId, telegramChannelId: channelId,
        audience: text(configuration.audience, 4000),
        valueProposition: text(configuration.topic, 4000),
        language: text(configuration.language, 32),
      },
      update: {
        audience: text(configuration.audience, 4000),
        valueProposition: text(configuration.topic, 4000),
        language: text(configuration.language, 32),
      },
    });
    await tx.telegramAiPostingRubric.deleteMany({ where: { workspaceId, telegramChannelId: channelId } });
    await tx.telegramAiPostingSphere.deleteMany({ where: { workspaceId, telegramChannelId: channelId } });
    await tx.telegramAiPostingLength.deleteMany({ where: { workspaceId, telegramChannelId: channelId } });
    await tx.telegramAiPostingLength.createMany({
      data: lengths.map((item) => ({ ...item, id: dbLengthId(item.id), workspaceId, telegramChannelId: channelId })),
    });
    const pending = new Map(spheres.map((item) => [item.id, item]));
    let created = new Set<string>();
    while (pending.size) {
      const batch = [...pending.values()].filter((item) => !item.parentId || created.has(item.parentId));
      if (!batch.length) throw new BadRequestException('AI_POSTING_SPHERE_CYCLE');
      await tx.telegramAiPostingSphere.createMany({
        data: batch.map((item) => ({ ...item, workspaceId, telegramChannelId: channelId, sources: item.sources as Prisma.InputJsonValue })),
      });
      batch.forEach((item) => { created.add(item.id); pending.delete(item.id); });
    }
    for (const rubric of rubrics) {
      await tx.telegramAiPostingRubric.create({
        data: {
          id: rubric.id, workspaceId, telegramChannelId: channelId,
          sphereId: rubric.sphereId, name: rubric.name, emoji: rubric.emoji,
          description: rubric.description, goal: rubric.goal,
          lengths: { create: rubric.lengthIds.map((lengthId) => ({ lengthId: dbLengthId(lengthId) })) },
        },
      });
    }
  }

  async read(workspaceId: string, channelId: string, prisma: PrismaService) {
    const [idea, spheres, lengths, rubrics] = await Promise.all([
      prisma.telegramAiPostingIdea.findFirst({ where: { workspaceId, telegramChannelId: channelId }, select: { audience: true, valueProposition: true, language: true } }),
      prisma.telegramAiPostingSphere.findMany({ where: { workspaceId, telegramChannelId: channelId }, orderBy: [{ parentId: 'asc' }, { name: 'asc' }] }),
      prisma.telegramAiPostingLength.findMany({ where: { workspaceId, telegramChannelId: channelId }, orderBy: [{ minCharacters: 'asc' }] }),
      prisma.telegramAiPostingRubric.findMany({ where: { workspaceId, telegramChannelId: channelId }, include: { lengths: { select: { lengthId: true } } }, orderBy: { name: 'asc' } }),
    ]);
    return {
      idea: idea ?? { audience: '', valueProposition: '', language: '' },
      spheres: spheres.map(({ workspaceId: _w, telegramChannelId: _c, createdAt: _created, updatedAt: _updated, ...item }) => item),
      lengths: lengths.map((item) => ({
        id: item.id.slice(`${channelId}::`.length),
        name: item.name,
        emoji: item.emoji,
        minCharacters: item.minCharacters,
        maxCharacters: item.maxCharacters,
      })),
      rubrics: rubrics.map(({ workspaceId: _w, telegramChannelId: _c, createdAt: _created, updatedAt: _updated, lengths: assigned, ...item }) => ({ ...item, lengthIds: assigned.map((length) => length.lengthId.slice(`${channelId}::`.length)) })),
    };
  }
}
