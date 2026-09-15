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
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostHistoryService } from './telegram-managed-post-history.service';
import { TelegramManagedPostMoveService } from './telegram-managed-post-move.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';
import { buildUnifiedImportPreviewSections } from './telegram-unified-import-preview';

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

  private async resolveHypothesisIconId(
    workspaceId: string,
    userId: string,
    rawIcon: string | null | undefined,
    fallbackIconId: string | null | undefined,
    title: string,
  ) {
    if (rawIcon === undefined) return fallbackIconId;
    const icon = rawIcon?.trim();
    if (!icon) return null;
    const existingById = await this.prisma.icon.findFirst({
      where: { id: icon, OR: [{ workspaceId }, { workspaceId: null }] },
      select: { id: true },
    });
    if (existingById) return existingById.id;
    const existingByEmoji = await this.prisma.icon.findFirst({
      where: { workspaceId, type: 'emoji', emoji: icon },
      select: { id: true },
    });
    if (existingByEmoji) return existingByEmoji.id;
    return (
      await this.prisma.icon.create({
        data: {
          workspaceId,
          type: 'emoji',
          name: `${title.trim()} · ${icon}`,
          emoji: icon,
          createdByUserId: userId,
        },
        select: { id: true },
      })
    ).id;
  }

  async preview(
    userId: string,
    channelId: string,
    manifest: TelegramUnifiedImportManifest,
  ): Promise<TelegramUnifiedImportPreview> {
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
      row.action !== 'UNSCHEDULE' && row.slotId ? [row.slotId] : [],
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
            select: { id: true, scheduleId: true },
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
    const sections = buildUnifiedImportPreviewSections(manifest, {
      existingGroups,
      existingPosts,
      existingHypotheses,
      existingSlots: existingSlots as Array<{ id: string; scheduleId: string }>,
      scheduleAssignment,
    });
    return {
      version: 1,
      manifestHash: unifiedImportHash(manifest),
      valid: sections.every((section) => section.invalidCount === 0),
      sections,
    };
  }

  async apply(
    userId: string,
    channelId: string,
    manifest: TelegramUnifiedImportManifest,
    expectedHash: string,
  ): Promise<TelegramUnifiedImportResult> {
    const preview = await this.preview(userId, channelId, manifest);
    if (!expectedHash || expectedHash !== preview.manifestHash)
      throw new BadRequestException('Manifest changed after preview');
    if (!preview.valid)
      throw new BadRequestException({
        message: 'Unified import has validation errors',
        preview,
      });
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const refs = new Map<string, string>();
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
    for (const row of manifest.groups ?? []) {
      try {
        if (row.action === 'CREATE') {
          const value = await this.groups.createPostGroup(userId, {
            telegramChannelId: channelId,
            title: row.title!,
            icon: row.icon,
          });
          refs.set(row.ref, String(value.id));
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
      } catch (error) {
        results.groups.failed.push({
          ref: row.ref,
          error:
            error instanceof Error ? error.message : 'Group operation failed',
        });
      }
    }
    for (const row of manifest.hypotheses ?? []) {
      try {
        if (row.action === 'DELETE') {
          await this.hypotheses.remove(userId, channelId, row.id!);
          results.hypotheses.deleted++;
        } else if (row.action === 'CREATE') {
          const iconId = await this.resolveHypothesisIconId(
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
          refs.set(row.ref, String(value.id));
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
          const iconId = await this.resolveHypothesisIconId(
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
      } catch (error) {
        results.hypotheses.failed.push({
          ref: row.ref,
          error:
            error instanceof Error
              ? error.message
              : 'Hypothesis operation failed',
        });
      }
    }
    for (const row of manifest.posts ?? []) {
      if (row.imported) {
        if (row.id) refs.set(row.ref, row.id);
        continue;
      }
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
            { groupId: row.groupRef ? refs.get(row.groupRef) : null },
          );
          refs.set(row.ref, value.id);
          if (row.hypothesisRefs?.length)
            await this.hypotheses.setPostHypotheses(
              userId,
              channelId,
              value.id,
              {
                hypothesisIds: row.hypothesisRefs.map((ref) => refs.get(ref)!),
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
                hypothesisIds: row.hypothesisRefs.map((ref) => refs.get(ref)!),
              },
            );
          results.posts.updated++;
        } else {
          await this.moves.deleteManagedPost(userId, channelId, row.id!);
          results.posts.deleted++;
        }
      } catch (error) {
        results.posts.failed.push({
          ref: row.ref,
          error:
            error instanceof Error ? error.message : 'Post operation failed',
        });
      }
    }
    const importedPostRefs = new Set(
      (manifest.posts ?? [])
        .filter((row) => row.imported)
        .map((row) => row.ref),
    );
    for (const row of manifest.schedule ?? []) {
      try {
        if (row.action === 'UNSCHEDULE') {
          await this.publication.returnManagedPostToDraft(
            userId,
            channelId,
            row.postId!,
          );
          results.schedule.unscheduled++;
          continue;
        }
        if (row.postRef && importedPostRefs.has(row.postRef)) continue;
        const postId = row.postId ?? refs.get(row.postRef!);
        if (!postId) throw new Error('Post operation did not produce an id');
        await this.publication.scheduleManagedPost(userId, channelId, postId, {
          scheduledAt: row.scheduledAt!,
          publicationSlotId: row.slotId!,
        });
        results.schedule.scheduled++;
      } catch (error) {
        results.schedule.failed.push({
          ref: row.postRef ?? row.postId ?? 'schedule',
          error:
            error instanceof Error
              ? error.message
              : 'Schedule operation failed',
        });
      }
    }
    for (const row of manifest.delete?.posts ?? []) {
      try {
        await this.moves.deleteManagedPost(userId, channelId, row.id);
        results.posts.deleted++;
      } catch (error) {
        results.posts.failed.push({
          ref: `delete:post:${row.id}`,
          error: error instanceof Error ? error.message : 'Post delete failed',
        });
      }
    }
    for (const row of manifest.delete?.hypotheses ?? []) {
      try {
        await this.hypotheses.remove(userId, channelId, row.id);
        results.hypotheses.deleted++;
      } catch (error) {
        results.hypotheses.failed.push({
          ref: `delete:hypothesis:${row.id}`,
          error:
            error instanceof Error ? error.message : 'Hypothesis delete failed',
        });
      }
    }
    for (const row of manifest.delete?.groups ?? []) {
      try {
        await this.groups.deletePostGroup(userId, row.id);
        results.groups.deleted++;
      } catch (error) {
        results.groups.failed.push({
          ref: `delete:group:${row.id}`,
          error: error instanceof Error ? error.message : 'Group delete failed',
        });
      }
    }
    return {
      manifestHash: preview.manifestHash,
      sections: [
        results.groups,
        results.hypotheses,
        results.posts,
        results.schedule,
      ],
    };
  }
}
