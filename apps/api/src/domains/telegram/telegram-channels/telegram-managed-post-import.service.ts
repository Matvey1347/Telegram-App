import { Injectable } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ImportTelegramManagedPostsDto } from './dto';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import {
  ManagedPostImportProgressHandler,
  ManagedPostImportResultRow,
  NormalizedManagedPostImportRow,
} from './telegram-channels.internal';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostImportParserService } from './telegram-managed-post-import-parser.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  postGroupNotFound,
  telegramPostsBadRequest,
  telegramPostsNotFound,
} from './telegram-posts.errors';

@Injectable()
export class TelegramManagedPostImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
    private readonly telegramManagedPostCommandService: TelegramManagedPostCommandService,
    private readonly telegramManagedPostImportParserService: TelegramManagedPostImportParserService,
    private readonly telegramManagedPostMediaStorageService: TelegramManagedPostMediaStorageService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
  ) {}

  private readonly iconSelect = {
    id: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
  } as const;

  private readonly memberSummarySelect = {
    id: true,
    role: true,
    telegramUsername: true,
    avatarIconId: true,
    avatarIcon: { select: this.iconSelect },
    user: { select: { id: true, name: true } },
  } as const;

  private readonly managedPostInclude = {
    assignedMember: { select: this.memberSummarySelect },
    group: {
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        title: true,
        icon: true,
        isSystem: true,
        systemKey: true,
        statusNumberingEnabled: true,
        sidebarPosition: true,
      },
    },
  } as const;
  async importManagedPosts(
    userId: string,
    channelId: string,
    dto: ImportTelegramManagedPostsDto,
    onProgress?: ManagedPostImportProgressHandler,
    signal?: AbortSignal,
  ) {
    const maxBatchSize = 25;
    if (dto.rows.length > maxBatchSize) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_BATCH_LIMIT_EXCEEDED',
        `Import is limited to ${maxBatchSize} posts per request`,
        { maxBatchSize },
      );
    }
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    if (!assignedMemberId) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
        'Assigned member is required',
      );
    }
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const trimmedGroupId = dto.postGroupId?.trim() || null;
    const defaultGroup = trimmedGroupId
      ? await this.prisma.postGroup.findFirst({
          where: {
            id: trimmedGroupId,
            workspaceId,
            telegramChannelId: channelId,
          },
          select: { id: true },
        })
      : null;
    if (trimmedGroupId && !defaultGroup) {
      throw postGroupNotFound();
    }

    const normalized = dto.rows.map((row, index) => ({
      index,
      ...this.telegramManagedPostImportParserService.normalizeManagedPostImportRow(
        row,
      ),
    }));
    const rows: ManagedPostImportResultRow[] = normalized
      .filter((row) => !row.value)
      .map((row) => ({
        index: row.index,
        status: 'skipped' as const,
        error: row.error ?? 'Row is invalid',
      }));
    const validRows = normalized.filter(
      (row): row is { index: number; value: NormalizedManagedPostImportRow } =>
        Boolean(row.value),
    );
    const explicitGroupIds = [
      ...new Set(
        validRows
          .map((row) => row.value.groupId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const explicitGroups = explicitGroupIds.length
      ? await this.prisma.postGroup.findMany({
          where: {
            id: { in: explicitGroupIds },
            workspaceId,
            telegramChannelId: channelId,
          },
          select: { id: true },
        })
      : [];
    if (explicitGroups.length !== explicitGroupIds.length) {
      throw telegramPostsNotFound(
        'TELEGRAM_POST_GROUP_NOT_FOUND',
        'One or more post groups were not found',
      );
    }
    const validRowsWithIcons = await Promise.all(
      validRows.map(async (row) => ({
        ...row,
        value: {
          ...row.value,
          icon: await this.telegramManagedPostImportParserService.resolveManagedPostImportIconId(
            workspaceId,
            userId,
            row.value.icon,
            row.value.title,
          ),
        },
      })),
    );

    const identityFor = (value: NormalizedManagedPostImportRow) =>
      createHash('sha256')
        .update(
          JSON.stringify({
            title: value.title,
            text: value.text,
            imageUrls: value.imageUrls,
            icon: value.icon,
          }),
        )
        .digest('hex');
    const identities = validRowsWithIcons.map((row) => identityFor(row.value));
    const existing = identities.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            jsonImportKey: { in: identities },
          },
          include: this.managedPostInclude,
        })
      : [];
    const existingByIdentity = new Map(
      existing.map((post) => [post.jsonImportKey, post]),
    );
    const touchedGroupIds = new Set<string>();
    const defaultGroupPositionStart = defaultGroup
      ? await this.prisma.telegramManagedPost.count({
          where: { groupId: defaultGroup.id },
        })
      : 0;
    let defaultGroupPositionOffset = 0;
    let processedRows = 0;
    for (const invalid of rows.filter((row) => row.status === 'skipped')) {
      if (signal?.aborted) break;
      processedRows += 1;
      onProgress?.(
        {
          index: invalid.index,
          status: 'skipped',
          error: invalid.error,
          errorCode: 'TELEGRAM_POST_IMPORT_ROW_INVALID',
          errorParams: { row: invalid.index + 1 },
          message: `Row ${invalid.index + 1} skipped: ${invalid.error}`,
        },
        processedRows,
        normalized.length,
      );
    }
    for (const row of validRowsWithIcons) {
      if (signal?.aborted) break;
      const identity = identityFor(row.value);
      let post = existingByIdentity.get(identity);
      if (post) {
        if (
          row.value.scheduledAt &&
          post.status !== TelegramManagedPostStatus.SCHEDULED &&
          post.status !== TelegramManagedPostStatus.PUBLISHED
        ) {
          try {
            post =
              await this.telegramManagedPostPublicationService.publishManagedPost(
                workspaceId,
                channelId,
                post.id,
                row.value.scheduledAt,
                post.publishMode === 'CAPTION_THEN_TEXT'
                  ? 'CAPTION_THEN_TEXT'
                  : 'IMAGES_THEN_TEXT',
                userId,
              );
            rows.push({ index: row.index, status: 'scheduled', post });
          } catch (error) {
            rows.push({
              index: row.index,
              status: 'scheduleFailed',
              post,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not schedule post',
            });
          }
        } else {
          rows.push({ index: row.index, status: 'alreadyExists', post });
        }
        processedRows += 1;
        const resultRow = rows.at(-1);
        onProgress?.(
          {
            index: row.index,
            status: resultRow?.status ?? 'alreadyExists',
            title: row.value.title,
            postId: post.id,
            error:
              resultRow && 'error' in resultRow ? resultRow.error : undefined,
            errorCode:
              resultRow?.status === 'scheduleFailed'
                ? 'TELEGRAM_POST_PUBLISH_FAILED'
                : undefined,
            errorParams:
              resultRow?.status === 'scheduleFailed'
                ? { title: row.value.title }
                : undefined,
            message:
              resultRow?.status === 'scheduleFailed'
                ? `Could not schedule ${row.value.title}: ${resultRow.error}`
                : resultRow?.status === 'scheduled'
                  ? `Post scheduled: ${row.value.title}`
                  : `Post already exists: ${row.value.title}`,
          },
          processedRows,
          normalized.length,
        );
        continue;
      }
      const effectiveGroupId =
        row.value.groupId === undefined
          ? (defaultGroup?.id ?? null)
          : row.value.groupId;
      try {
        const imageUrls =
          await this.telegramManagedPostMediaStorageService.persistImageUrls(
            row.value.imageUrls,
          );
        post = await this.prisma.$transaction(async (tx) => {
          const created =
            await this.telegramManagedPostCommandService.createManagedPostRecord(
              tx,
              {
                workspaceId,
                channelId,
                assignedMemberId,
                title: row.value.title,
                text: row.value.text,
                imageUrls,
                icon: row.value.icon,
                groupId: effectiveGroupId,
                groupPosition:
                  effectiveGroupId === defaultGroup?.id
                    ? defaultGroupPositionStart + defaultGroupPositionOffset++
                    : null,
                jsonImportKey: identity,
              },
            );
          await this.telegramManagedPostRevisionStore.createManagedPostRevision(
            tx,
            created,
            'created',
            userId,
          );
          return created;
        });
        if (effectiveGroupId) touchedGroupIds.add(effectiveGroupId);
        rows.push({ index: row.index, status: 'created', post });
        if (row.value.scheduledAt) {
          try {
            post =
              await this.telegramManagedPostPublicationService.publishManagedPost(
                workspaceId,
                channelId,
                post.id,
                row.value.scheduledAt,
                post.publishMode === 'CAPTION_THEN_TEXT'
                  ? 'CAPTION_THEN_TEXT'
                  : 'IMAGES_THEN_TEXT',
                userId,
              );
            rows[rows.length - 1] = {
              index: row.index,
              status: 'scheduled',
              post,
            };
          } catch (error) {
            rows[rows.length - 1] = {
              index: row.index,
              status: 'scheduleFailed',
              post,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not schedule post',
            };
          }
        }
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          const duplicate = await this.prisma.telegramManagedPost.findFirst({
            where: {
              workspaceId,
              telegramChannelId: channelId,
              jsonImportKey: identity,
            },
            include: this.managedPostInclude,
          });
          if (duplicate)
            rows.push({
              index: row.index,
              status: 'alreadyExists',
              post: duplicate,
            });
          else
            rows.push({
              index: row.index,
              status: 'skipped',
              error: 'Could not create post',
            });
        } else
          rows.push({
            index: row.index,
            status: 'skipped',
            error:
              error instanceof Error ? error.message : 'Could not create post',
          });
      }
      processedRows += 1;
      const resultRow = rows.at(-1);
      onProgress?.(
        {
          index: row.index,
          status:
            resultRow?.status === 'scheduled' ||
            resultRow?.status === 'scheduleFailed' ||
            resultRow?.status === 'skipped'
              ? resultRow.status
              : 'created',
          title: row.value.title,
          postId: post?.id,
          error:
            resultRow && 'error' in resultRow ? resultRow.error : undefined,
          errorCode:
            resultRow?.status === 'scheduleFailed'
              ? 'TELEGRAM_POST_PUBLISH_FAILED'
              : resultRow?.status === 'skipped'
                ? 'TELEGRAM_POST_IMPORT_ROW_INVALID'
                : undefined,
          errorParams:
            resultRow?.status === 'scheduleFailed' ||
            resultRow?.status === 'skipped'
              ? { title: row.value.title }
              : undefined,
          message:
            resultRow?.status === 'scheduleFailed'
              ? `Could not schedule ${row.value.title}: ${resultRow.error}`
              : resultRow?.status === 'skipped'
                ? `Could not import ${row.value.title}: ${resultRow.error}`
                : resultRow?.status === 'scheduled'
                  ? `Post scheduled: ${row.value.title}`
                  : `Post created: ${row.value.title}`,
        },
        processedRows,
        normalized.length,
      );
    }
    for (const groupId of touchedGroupIds)
      await this.prisma.$transaction((tx) =>
        this.telegramPostGroupsService.normalizePostGroupNumbering(tx, groupId),
      );
    const createdRows = rows.filter(
      (
        row,
      ): row is Extract<
        ManagedPostImportResultRow,
        { status: 'created' | 'scheduled' }
      > => row.status === 'created' || row.status === 'scheduled',
    );

    rows.sort((left, right) => left.index - right.index);
    return {
      createdCount: createdRows.length,
      skippedCount: rows.filter(
        (row) => row.status === 'skipped' || row.status === 'scheduleFailed',
      ).length,
      rows,
    };
  }
}
