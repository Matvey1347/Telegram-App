import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreview,
  TelegramUnifiedImportResult,
  TelegramUnifiedImportSectionResult,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostHistoryService } from './telegram-managed-post-history.service';
import { TelegramManagedPostMoveService } from './telegram-managed-post-move.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';
import { buildUnifiedImportPreviewSections } from './telegram-unified-import-preview';
import {
  reportUnifiedImportOperation,
  TelegramUnifiedImportProgressReporter,
  type TelegramUnifiedImportProgressCallback,
} from './telegram-unified-import-progress';
import {
  applyUnifiedImportRootDeletes,
  applyUnifiedImportSchedule,
  skipImportedEntity,
} from './telegram-unified-import-finalize';
import { resolveUnifiedImportHypothesisIconId } from './telegram-unified-import-icon';
import { normalizeUnifiedImportManifest } from './telegram-unified-import-normalize';

type SectionKey = TelegramUnifiedImportSectionResult['key'];

export function unifiedImportHash(manifest: TelegramUnifiedImportManifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

@Injectable()
export class TelegramUnifiedImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly groups: TelegramPostGroupsService,
    private readonly commands: TelegramManagedPostCommandService,
    private readonly history: TelegramManagedPostHistoryService,
    private readonly moves: TelegramManagedPostMoveService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly hypotheses: TelegramContentHypothesesService,
  ) {}

  private async context(userId: string, channelId: string) {
    const membership =
      await this.workspaces.resolveWorkspaceMembershipForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: {
        id: channelId,
        workspaceId: membership.workspaceId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return membership.workspaceId;
  }

  async preview(
    userId: string,
    channelId: string,
    manifest: TelegramUnifiedImportManifest,
  ): Promise<TelegramUnifiedImportPreview> {
    const sourceManifest = manifest;
    manifest = normalizeUnifiedImportManifest(manifest);
    const workspaceId = await this.context(userId, channelId);
    if (manifest.version !== 1)
      throw new BadRequestException('Unsupported unified import version');
    const deleteGroups = manifest.delete?.groups ?? [];
    const deleteHypotheses = manifest.delete?.hypotheses ?? [];
    const deletePosts = manifest.delete?.posts ?? [];
    const groupIds = [
      ...(manifest.groups ?? []).flatMap((row) => (row.id ? [row.id] : [])),
      ...deleteGroups.map((row) => row.id),
    ];
    const postIds = [
      ...(manifest.posts ?? []).flatMap((row) => (row.id ? [row.id] : [])),
      ...(manifest.schedule ?? []).flatMap((row) =>
        row.postId ? [row.postId] : [],
      ),
      ...deletePosts.map((row) => row.id),
    ];
    const hypothesisIds = [
      ...(manifest.hypotheses ?? []).flatMap((row) => (row.id ? [row.id] : [])),
      ...deleteHypotheses.map((row) => row.id),
    ];
    const slotIds = (manifest.schedule ?? []).flatMap((row) =>
      row.slotId ? [row.slotId] : [],
    );
    const [
      existingGroups,
      existingPosts,
      existingHypotheses,
      existingSlots,
      scheduleAssignment,
    ] = await Promise.all([
      groupIds.length
        ? this.prisma.postGroup.findMany({
            where: {
              id: { in: groupIds },
              workspaceId,
              telegramChannelId: channelId,
            },
            select: { id: true, title: true, description: true, icon: true },
          })
        : [],
      postIds.length
        ? this.prisma.telegramManagedPost.findMany({
            where: {
              id: { in: postIds },
              workspaceId,
              telegramChannelId: channelId,
            },
            select: {
              id: true,
              title: true,
              text: true,
              imageUrls: true,
              icon: true,
              status: true,
              scheduledAt: true,
              publicationSlot: {
                select: { id: true, kind: true, title: true },
              },
            },
          })
        : [],
      hypothesisIds.length
        ? this.prisma.telegramContentHypothesis.findMany({
            where: {
              id: { in: hypothesisIds },
              workspaceId,
              telegramChannelId: channelId,
            },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              conclusion: true,
              icon: { select: { emoji: true } },
            },
          })
        : [],
      slotIds.length
        ? this.prisma.telegramPublicationScheduleSlot.findMany({
            where: { id: { in: slotIds }, schedule: { workspaceId } },
            select: { id: true, scheduleId: true, kind: true, title: true },
          })
        : [],
      this.prisma.telegramChannelPublicationScheduleAssignment.findFirst({
        where: { workspaceId, channelId },
        select: {
          scheduleId: true,
          selectionMode: true,
          selectedSlots: { select: { slotId: true } },
        },
      }),
    ]);
    const iconIds = [
      ...(manifest.posts ?? []).map((post) => post.icon),
      ...existingPosts.map((post) => post.icon),
    ].filter(
      (value): value is string =>
        typeof value === 'string' &&
        Boolean(value) &&
        !/\p{Extended_Pictographic}/u.test(value),
    );
    const icons = iconIds.length
      ? await this.prisma.icon.findMany({
          where: {
            id: { in: [...new Set(iconIds)] },
            OR: [{ workspaceId }, { workspaceId: null }],
          },
          select: {
            id: true,
            type: true,
            name: true,
            emoji: true,
            imageUrl: true,
          },
        })
      : [];
    const sections = buildUnifiedImportPreviewSections(manifest, {
      existingGroups,
      existingPosts,
      existingHypotheses,
      existingSlots,
      scheduleAssignment,
      iconPresentationsById: new Map(
        icons.flatMap((icon) => {
          const presentation = iconToResolvedEmoji(icon);
          return presentation ? [[icon.id, presentation] as const] : [];
        }),
      ),
    });
    return {
      version: 1,
      manifestHash: unifiedImportHash(sourceManifest),
      valid: sections.every((section) => section.invalidCount === 0),
      sections,
    };
  }

  async apply(
    userId: string,
    channelId: string,
    manifest: TelegramUnifiedImportManifest,
    expectedHash: string,
    onProgress?: TelegramUnifiedImportProgressCallback,
    signal?: AbortSignal,
  ): Promise<TelegramUnifiedImportResult> {
    const preview = await this.preview(userId, channelId, manifest);
    if (!expectedHash || expectedHash !== preview.manifestHash)
      throw new BadRequestException('Manifest changed after preview');
    if (!preview.valid)
      throw new BadRequestException({
        message: 'Unified import has validation errors',
        preview,
      });
    const schedulePreviewItems =
      preview.sections.find((section) => section.key === 'schedule')?.items ??
      [];
    manifest = normalizeUnifiedImportManifest(manifest);
    manifest = {
      ...manifest,
      schedule: (manifest.schedule ?? []).map((row, index) => {
        if (row.action !== 'UNSCHEDULE') return row;
        const item = schedulePreviewItems[index];
        return {
          ...row,
          scheduledAt: row.scheduledAt ?? item?.scheduledAt ?? undefined,
          slotId: row.slotId ?? item?.slotId ?? undefined,
          slotKind: row.slotKind ?? item?.slotKind ?? undefined,
        };
      }),
    };
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const refs = new Map<string, string>();
    const actionableGroupRefs = new Set(
      preview.sections
        .find((section) => section.key === 'groups')
        ?.items.map((item) => item.ref) ?? [],
    );
    const actionableHypothesisRefs = new Set(
      preview.sections
        .find((section) => section.key === 'hypotheses')
        ?.items.map((item) => item.ref) ?? [],
    );
    const result = (key: SectionKey): TelegramUnifiedImportSectionResult => ({
      key,
      created: 0,
      updated: 0,
      deleted: 0,
      scheduled: 0,
      unscheduled: 0,
      failed: [],
    });
    const results = {
      groups: result('groups'),
      hypotheses: result('hypotheses'),
      posts: result('posts'),
      schedule: result('schedule'),
    };
    const progress = new TelegramUnifiedImportProgressReporter(
      manifest,
      onProgress,
      signal,
    );
    const resolveRef = (ref: string, entity: 'group' | 'hypothesis') => {
      const id = refs.get(ref);
      if (!id)
        throw new Error(
          `${entity === 'group' ? 'Group' : 'Hypothesis'} dependency ${ref} did not produce an id`,
        );
      return id;
    };
    progress.phase('groups', 'started');
    for (const row of manifest.groups ?? []) {
      const label = row.title ?? row.id ?? row.ref;
      if (skipImportedEntity(row, 'groups', label, refs, progress)) continue;
      if (row.action === 'UPDATE' && !actionableGroupRefs.has(row.ref)) {
        refs.set(row.ref, row.id!);
        row.imported = true;
        reportUnifiedImportOperation(
          progress,
          'groups',
          row.action,
          row.ref,
          label,
          'skipped',
        );
        continue;
      }
      try {
        if (row.action === 'CREATE') {
          const value = await this.groups.createPostGroup(userId, {
            telegramChannelId: channelId,
            title: row.title!,
            icon: row.icon,
          });
          row.id = String(value.id);
          refs.set(row.ref, row.id);
          results.groups.created++;
        } else if (row.action === 'UPDATE') {
          await this.groups.updatePostGroup(userId, row.id!, {
            title: row.title,
            icon: row.icon,
          });
          refs.set(row.ref, row.id!);
          results.groups.updated++;
        } else {
          await this.groups.deletePostGroup(userId, row.id!);
          results.groups.deleted++;
        }
        row.imported = true;
        reportUnifiedImportOperation(
          progress,
          'groups',
          row.action,
          row.ref,
          label,
          'success',
        );
      } catch (error) {
        row.imported = false;
        const message =
          error instanceof Error ? error.message : 'Group operation failed';
        results.groups.failed.push({
          ref: row.ref,
          error: message,
        });
        reportUnifiedImportOperation(
          progress,
          'groups',
          row.action,
          row.ref,
          label,
          'failed',
          message,
        );
      }
    }
    progress.phase('groups', 'completed');
    progress.phase('hypotheses', 'started');
    for (const row of manifest.hypotheses ?? []) {
      const label = row.value?.name ?? row.id ?? row.ref;
      if (skipImportedEntity(row, 'hypotheses', label, refs, progress))
        continue;
      if (row.action === 'UPDATE' && !actionableHypothesisRefs.has(row.ref)) {
        refs.set(row.ref, row.id!);
        row.imported = true;
        reportUnifiedImportOperation(
          progress,
          'hypotheses',
          row.action,
          row.ref,
          label,
          'skipped',
        );
        continue;
      }
      try {
        if (row.action === 'DELETE') {
          await this.hypotheses.remove(userId, channelId, row.id!);
          results.hypotheses.deleted++;
        } else if (row.action === 'CREATE') {
          const iconId = await resolveUnifiedImportHypothesisIconId(
            this.prisma,
            workspaceId,
            userId,
            row.icon,
            undefined,
            row.value!.name,
          );
          const value = await this.hypotheses.create(userId, channelId, {
            ...row.value!,
            iconId,
          });
          row.id = String(value.id);
          refs.set(row.ref, row.id);
          results.hypotheses.created++;
        } else {
          const archived =
            row.action === 'ARCHIVE' && !row.value?.name
              ? await this.prisma.telegramContentHypothesis.findUniqueOrThrow({
                  where: { id: row.id! },
                  select: {
                    name: true,
                    description: true,
                    iconId: true,
                    conclusion: true,
                  },
                })
              : null;
          const merged = {
            ...archived,
            ...row.value!,
            name: row.value?.name ?? archived!.name,
          };
          const iconId = await resolveUnifiedImportHypothesisIconId(
            this.prisma,
            workspaceId,
            userId,
            row.icon,
            merged.iconId,
            merged.name,
          );
          const value = await this.hypotheses.update(
            userId,
            channelId,
            row.id!,
            {
              ...merged,
              iconId,
              status: row.action === 'ARCHIVE' ? 'ARCHIVED' : row.value?.status,
            },
          );
          refs.set(row.ref, String(value.id));
          results.hypotheses.updated++;
        }
        row.imported = true;
        reportUnifiedImportOperation(
          progress,
          'hypotheses',
          row.action,
          row.ref,
          label,
          'success',
        );
      } catch (error) {
        row.imported = false;
        const message =
          error instanceof Error
            ? error.message
            : 'Hypothesis operation failed';
        results.hypotheses.failed.push({
          ref: row.ref,
          error: message,
        });
        reportUnifiedImportOperation(
          progress,
          'hypotheses',
          row.action,
          row.ref,
          label,
          'failed',
          message,
        );
      }
    }
    progress.phase('hypotheses', 'completed');
    progress.phase('posts', 'started');
    for (const row of manifest.posts ?? []) {
      const label = row.title ?? row.id ?? row.ref;
      if (skipImportedEntity(row, 'posts', label, refs, progress)) continue;
      try {
        if (row.action === 'CREATE') {
          const value = await this.commands.createManagedPost(
            userId,
            channelId,
            {
              title: row.title!,
              icon: row.icon,
              text: row.text ?? undefined,
              imageUrls: row.imageUrls,
            },
            {
              groupId: row.groupRef ? resolveRef(row.groupRef, 'group') : null,
            },
          );
          row.id = value.id;
          refs.set(row.ref, row.id);
          if (row.hypothesisRefs?.length)
            await this.hypotheses.setPostHypotheses(
              userId,
              channelId,
              value.id,
              {
                hypothesisIds: row.hypothesisRefs.map((ref) =>
                  resolveRef(ref, 'hypothesis'),
                ),
              },
            );
          results.posts.created++;
        } else if (row.action === 'UPDATE') {
          await this.history.updateManagedPost(userId, channelId, row.id!, {
            title: row.title,
            icon: row.icon,
            text: row.text ?? undefined,
            imageUrls: row.imageUrls,
          });
          refs.set(row.ref, row.id!);
          if (row.hypothesisRefs)
            await this.hypotheses.setPostHypotheses(
              userId,
              channelId,
              row.id!,
              {
                hypothesisIds: row.hypothesisRefs.map((ref) =>
                  resolveRef(ref, 'hypothesis'),
                ),
              },
            );
          results.posts.updated++;
        } else {
          await this.moves.deleteManagedPost(userId, channelId, row.id!);
          results.posts.deleted++;
        }
        row.imported = true;
        reportUnifiedImportOperation(
          progress,
          'posts',
          row.action,
          row.ref,
          label,
          'success',
        );
      } catch (error) {
        row.imported = false;
        const message =
          error instanceof Error ? error.message : 'Post operation failed';
        results.posts.failed.push({
          ref: row.ref,
          error: message,
        });
        reportUnifiedImportOperation(
          progress,
          'posts',
          row.action,
          row.ref,
          label,
          'failed',
          message,
        );
      }
    }
    progress.phase('posts', 'completed');
    await applyUnifiedImportSchedule({
      userId,
      channelId,
      manifest,
      refs,
      results,
      progress,
      publication: this.publication,
    });
    await applyUnifiedImportRootDeletes({
      userId,
      channelId,
      manifest,
      results,
      progress,
      moves: this.moves,
      hypotheses: this.hypotheses,
      groups: this.groups,
    });
    return {
      manifestHash: preview.manifestHash,
      manifest,
      sections: [
        results.groups,
        results.hypotheses,
        results.posts,
        results.schedule,
      ],
    };
  }
}
