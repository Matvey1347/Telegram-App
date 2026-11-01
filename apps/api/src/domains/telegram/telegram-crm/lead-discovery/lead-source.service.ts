import { leadTransportSnapshot } from './lead-transport-snapshot';
import { leadImportReferences } from './lead-source-import';
export { leadImportReferences } from './lead-source-import';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type {
  LeadSourceInput,
  LeadSourcePatch,
  LeadSourceImportPreview,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { normalizeLeadSource } from './lead-normalization';

@Injectable()
export class TelegramLeadSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
    private readonly read: TelegramLeadReadService,
    private readonly events: TelegramLeadTransportEvents,
  ) {}
  async preview(
    userId: string,
    text: string,
    format: 'TEXT' | 'CSV',
  ): Promise<LeadSourceImportPreview> {
    const { workspaceId } = await this.policy.access(userId, 'manage');
    const rows = leadImportReferences(text, format).map((reference) => {
      try {
        return {
          reference,
          normalizedKey: normalizeLeadSource({
            type: 'TELEGRAM_CHANNEL',
            reference,
          }).normalizedKey,
          error: null,
          existingId: null as string | null,
        };
      } catch {
        return {
          reference,
          normalizedKey: null,
          error: 'LEAD_CHANNEL_REFERENCE_INVALID',
          existingId: null,
        };
      }
    });
    const existing = await this.prisma.telegramLeadSource.findMany({
      where: {
        workspaceId,
        normalizedKey: {
          in: rows.flatMap((row) =>
            row.normalizedKey ? [row.normalizedKey] : [],
          ),
        },
      },
      select: { id: true, normalizedKey: true },
    });
    for (const row of rows)
      row.existingId =
        existing.find((item) => item.normalizedKey === row.normalizedKey)?.id ??
        null;
    return { rows, validCount: rows.filter((row) => !row.error).length };
  }
  async import(userId: string, items: LeadSourceInput[]) {
    const { workspaceId } = await this.policy.access(userId, 'manage');
    if (!Array.isArray(items) || items.length > 100 || !items.length)
      throw new BadRequestException('LEAD_IMPORT_LIMIT');
    const errors: Array<{ reference: string; error: string }> = [],
      normalized: Array<
        ReturnType<typeof normalizeLeadSource> & { input: LeadSourceInput }
      > = [];
    for (const input of items) {
      try {
        if (
          !/^(policy|consent):[A-Za-z0-9_.-]{1,80}$/.test(
            input.processingReference,
          ) ||
          (input.title && input.title.length > 300)
        )
          throw new Error();
        normalized.push({ ...normalizeLeadSource(input), input });
      } catch {
        errors.push({
          reference: input.reference?.slice(0, 200) ?? '',
          error: 'LEAD_SOURCE_INVALID',
        });
      }
    }
    const accountIds = [
      ...new Set(
        normalized.flatMap((row) =>
          row.input.accountId ? [row.input.accountId] : [],
        ),
      ),
    ];
    const accounts = accountIds.length
      ? await this.prisma.telegramUserAccountIntegration.findMany({
          where: { workspaceId, id: { in: accountIds } },
          select: { id: true },
        })
      : [];
    const own = normalized.length
      ? await this.prisma.telegramChannel.findMany({
          where: {
            workspaceId,
            OR: [
              {
                telegramChatId: {
                  in: normalized.flatMap((row) =>
                    row.channelId
                      ? [row.channelId, `-100${row.channelId}`]
                      : [],
                  ),
                },
              },
              {
                username: {
                  in: normalized.flatMap((row) =>
                    row.username ? [row.username] : [],
                  ),
                  mode: 'insensitive',
                },
              },
            ],
          },
          select: { telegramChatId: true, username: true },
        })
      : [];
    const valid = normalized.filter((row) => {
      const accountId = row.input.accountId ?? null;
      const isOwn = own.some(
        (channel) =>
          (channel.username?.toLowerCase() === row.username &&
            row.username !== null) ||
          (channel.telegramChatId?.replace(/^-100/, '') === row.channelId &&
            row.channelId !== null),
      );
      const allowed =
        (!accountId || accounts.some((account) => account.id === accountId)) &&
        (!isOwn ||
          (row.input.allowOwnChannel === true &&
            this.policy.granted(
              {
                workspaceId,
                normalizedKey: row.normalizedKey,
                accountId,
                processingReference: row.input.processingReference,
                allowOwnChannel: true,
                channelId: row.channelId,
              },
              'ingest',
              true,
            )));
      if (!allowed)
        errors.push({
          reference: row.input.reference,
          error: isOwn
            ? 'LEAD_OWN_CHANNEL_NOT_APPROVED'
            : 'LEAD_ACCOUNT_NOT_FOUND',
        });
      return allowed;
    });
    if (!valid.length) return { created: 0, existing: 0, errors };
    const result = await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      const keys = [...new Set(valid.map((row) => row.normalizedKey))];
      const existing = await tx.telegramLeadSource.findMany({
        where: {
          workspaceId,
          OR: [
            { normalizedKey: { in: keys } },
            {
              channelId: {
                in: valid.flatMap((row) =>
                  row.channelId ? [row.channelId] : [],
                ),
              },
            },
          ],
        },
        select: { normalizedKey: true, channelId: true },
      });
      const conflicts = valid.filter(
        (row) =>
          row.channelId &&
          existing.some(
            (item) =>
              item.channelId === row.channelId &&
              item.normalizedKey !== row.normalizedKey,
          ),
      );
      for (const row of conflicts)
        errors.push({
          reference: row.input.reference,
          error: 'LEAD_SOURCE_CANONICAL_DUPLICATE',
        });
      const rows = [
        ...new Map(
          valid
            .filter(
              (row) =>
                !conflicts.includes(row) &&
                !existing.some(
                  (item) => item.normalizedKey === row.normalizedKey,
                ),
            )
            .map((row) => [row.normalizedKey, row]),
        ).values(),
      ];
      if (
        (await tx.telegramLeadSource.count({ where: { workspaceId } })) +
          rows.length >
        1000
      )
        throw new ConflictException('LEAD_SOURCE_LIMIT');
      const created = rows.length
        ? (
            await tx.telegramLeadSource.createMany({
              data: rows.map((row) => ({
                workspaceId,
                type: row.input.type,
                normalizedKey: row.normalizedKey,
                channelId: row.channelId,
                username: row.username,
                url: row.url,
                title:
                  row.input.title?.trim() ||
                  (row.normalizedKey.startsWith('telegram:invite:')
                    ? 'Private Telegram channel'
                    : row.input.reference.slice(0, 300)),
                accountId: row.input.accountId ?? null,
                processingReference: row.input.processingReference,
                allowOwnChannel: row.input.allowOwnChannel ?? false,
                monitoringState: 'PAUSED',
                monitoringActorUserId: userId,
                addedVia: items.length > 1 ? 'BULK_IMPORT' : 'MANUAL',
              })),
              skipDuplicates: true,
            })
          ).count
        : 0;
      return {
        created,
        existing: valid.length - created - conflicts.length,
        errors,
      };
    });
    if (result.created) this.events.refresh(workspaceId);
    return result;
  }
  async create(userId: string, input: LeadSourceInput) {
    const result = await this.import(userId, [input]);
    if (result.errors.length)
      throw new BadRequestException(result.errors[0].error);
    const { workspaceId } = await this.policy.access(userId);
    const row = await this.prisma.telegramLeadSource.findUniqueOrThrow({
      where: {
        workspaceId_normalizedKey: {
          workspaceId,
          normalizedKey: normalizeLeadSource(input).normalizedKey,
        },
      },
    });
    return this.read.source(userId, row.id);
  }
  async patch(userId: string, id: string, input: LeadSourcePatch) {
    const source = await this.policy.source(userId, id, 'manage');
    if (
      input.processingReference &&
      !/^(policy|consent):[A-Za-z0-9_.-]{1,80}$/.test(input.processingReference)
    )
      throw new BadRequestException('LEAD_PROCESSING_REFERENCE_INVALID');
    if (input.accountId) await this.policy.account(userId, input.accountId);
    const next = { ...source, ...input };
    const changedOwn =
      input.allowOwnChannel !== undefined &&
      input.allowOwnChannel !== source.allowOwnChannel;
    const changedAccount =
      input.accountId !== undefined && input.accountId !== source.accountId;
    if (
      changedAccount &&
      (input.monitoringState ?? source.monitoringState) === 'ACTIVE'
    )
      throw new ConflictException('LEAD_PAUSE_AND_VALIDATE_NEW_ACCOUNT_FIRST');
    if (input.monitoringState === 'ACTIVE') {
      if (changedOwn) throw new ConflictException('LEAD_VALIDATE_SOURCE_FIRST');
      if (source.monitoringState === 'ACCESS_LOST' || source.lastErrorCode)
        throw new ConflictException('LEAD_VALIDATE_SOURCE_FIRST');
      this.policy.assertProcessing(next, 'ingest');
      if (
        next.type === 'TELEGRAM_CHANNEL' &&
        (!next.accountId ||
          !next.channelId ||
          next.accessType !== 'SUBSCRIBED_CHANNEL')
      )
        throw new ConflictException('LEAD_VALIDATE_SUBSCRIBED_SOURCE_FIRST');
    }
    const data = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          value !== undefined && source[key as keyof typeof source] !== value,
      ),
    );
    if (Object.keys(data).length) {
      const updated = await this.prisma.telegramLeadSource.updateMany({
        where: {
          id,
          workspaceId: source.workspaceId,
          updatedAt: source.updatedAt,
          ...leadTransportSnapshot(source),
          allowOwnChannel: source.allowOwnChannel,
        },
        data: {
          ...data,
          monitoringActorUserId: userId,
          ...(changedAccount || changedOwn
            ? {
                monitoringState: 'PAUSED',
                accessType: 'UNVERIFIED',
                channelPts: null,
                coverageState: 'GAPPED',
                coverageFrom: null,
                coverageTo: null,
              }
            : {}),
          ...(input.monitoringState &&
          input.monitoringState !== source.monitoringState
            ? { coverageState: 'GAPPED', coverageFrom: null, coverageTo: null }
            : {}),
        },
      });
      if (!updated.count) throw new ConflictException('LEAD_SOURCE_CHANGED');
      this.events.refresh(source.workspaceId);
    }
    return this.read.source(userId, id);
  }
}
