import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TelegramPostMediaItem } from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '@api/telegram/shared/markup/telegram-inline-keyboard';
import {
  CreateTelegramManagedPostDto,
  ReorderManagedPostSidebarDto,
} from './dto';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  telegramChannelNotFound,
  telegramPostsBadRequest,
  telegramPostsNotFound,
} from './telegram-posts.errors';

import { resolveImportedEditorial } from './telegram-unified-import-editorial';
import type { TelegramUnifiedImportEditorial } from '@telegram-system/shared';

@Injectable()
export class TelegramManagedPostCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
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

  async reorderManagedPostSidebar(
    userId: string,
    channelId: string,
    dto: ReorderManagedPostSidebarDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const [groups, posts] = await Promise.all([
      this.prisma.postGroup.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        select: { id: true },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: { workspaceId, telegramChannelId: channelId, groupId: null },
        select: { id: true },
      }),
    ]);
    const expected = [
      ...groups.map((group) => `group:${group.id}`),
      ...posts.map((post) => `post:${post.id}`),
    ];
    if (
      dto.orderedItems.length !== expected.length ||
      new Set(dto.orderedItems).size !== dto.orderedItems.length ||
      dto.orderedItems.some((item) => !expected.includes(item))
    ) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_SCHEDULE',
        'orderedItems must contain every group and ungrouped post exactly once',
      );
    }
    await this.prisma.$transaction(
      dto.orderedItems.map((item, sidebarPosition) => {
        const [type, id] = item.split(':', 2);
        return type === 'group'
          ? this.prisma.postGroup.update({
              where: { id },
              data: { sidebarPosition },
            })
          : this.prisma.telegramManagedPost.update({
              where: { id },
              data: { sidebarPosition },
            });
      }),
    );
    return { success: true };
  }

  public createManagedPostRecord(
    tx: Prisma.TransactionClient | PrismaService,
    params: {
      workspaceId: string;
      channelId: string;
      assignedMemberId: string;
      title: string;
      text?: string | null;
      imageUrls?: string[];
      mediaItems?: TelegramPostMediaItem[];
      buttonRows?: unknown;
      icon?: string | null;
      deleteAfterHours?: number | null;
      groupId?: string | null;
      groupPosition?: number | null;
      jsonImportKey?: string | null;
      aiPostingReviewStatus?: string | null;
      aiPostingApprovedWithoutEdits?: boolean | null;
      aiPostingRecheckRequired?: boolean;
      aiPostingSphereId?: string;
      aiPostingRubricId?: string;
      aiPostingLengthId?: string | null;
    },
  ) {
    return tx.telegramManagedPost.create({
      data: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        title: params.title,
        text: params.text ?? null,
        imageUrls: params.imageUrls ?? [],
        mediaItems: params.mediaItems ?? [],
        buttonRows: normalizeTelegramPostButtonRows(params.buttonRows),
        origin: 'SYSTEM',
        assignedMemberId: params.assignedMemberId,
        icon: params.icon?.trim() || null,
        deleteAfterHours: params.deleteAfterHours ?? null,
        groupId: params.groupId,
        groupPosition: params.groupPosition,
        jsonImportKey: params.jsonImportKey ?? null,
        aiPostingReviewStatus: params.aiPostingReviewStatus ?? null,
        aiPostingApprovedWithoutEdits:
          params.aiPostingApprovedWithoutEdits ?? null,
        aiPostingRecheckRequired: params.aiPostingRecheckRequired ?? false,
        aiPostingSphereId: params.aiPostingSphereId,
        aiPostingRubricId: params.aiPostingRubricId,
        aiPostingLengthId: params.aiPostingLengthId,
      },
      include: this.managedPostInclude,
    });
  }

  public async prepareManagedPostCreate(
    userId: string,
    channelId: string,
    dto: CreateTelegramManagedPostDto,
  ) {
    if (dto.assignedMemberId === null) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
        'Assigned member is required',
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
    return this.prepareDraftFields(
      workspaceId,
      assignedMemberId,
      channelId,
      dto,
    );
  }

  private prepareDraftFields(
    workspaceId: string,
    assignedMemberId: string,
    channelId: string,
    dto: CreateTelegramManagedPostDto,
  ) {
    const title = dto.title.trim();
    if (!title)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TITLE_REQUIRED',
        'Title is required',
      );
    const { imageUrls, mediaItems } =
      this.telegramManagedPostMediaStorageService.persistMediaUrls(
        dto.mediaItems,
        dto.imageUrls,
      );
    return {
      workspaceId,
      channelId,
      title,
      text: dto.text ?? null,
      imageUrls,
      mediaItems,
      buttonRows: dto.buttonRows,
      assignedMemberId,
      icon: dto.icon?.trim() || null,
      deleteAfterHours: dto.deleteAfterHours ?? null,
    };
  }

  private async createDraftWithRevision(
    tx: Prisma.TransactionClient,
    data: Parameters<
      TelegramManagedPostCommandService['createManagedPostRecord']
    >[1],
    userId: string,
  ) {
    const draft = await this.createManagedPostRecord(tx, data);
    await this.telegramManagedPostRevisionStore.createManagedPostRevision(
      tx,
      draft,
      'created',
      userId,
    );
    return draft;
  }

  async createManagedPostDrafts(
    userId: string,
    entries: {
      channelId: string;
      dto: Omit<CreateTelegramManagedPostDto, 'assignedMemberId'>;
    }[],
    onCreated: (
      tx: Prisma.TransactionClient,
      postIds: string[],
    ) => Promise<void>,
  ) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(userId);
    if (!assignedMemberId) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
        'Assigned member is required',
      );
    }
    const ids = [...new Set(entries.map(({ channelId }) => channelId))];
    const available = await this.prisma.telegramChannel.count({
      where: { workspaceId, id: { in: ids } },
    });
    if (available !== ids.length) throw telegramChannelNotFound();
    const prepared = entries.map(({ channelId, dto }) =>
      this.prepareDraftFields(workspaceId, assignedMemberId, channelId, dto),
    );
    await this.prisma.$transaction(
      async (tx) => {
        const postIds: string[] = [];
        for (const entry of prepared) {
          const created = await this.createDraftWithRevision(tx, entry, userId);
          postIds.push(created.id);
        }
        await onCreated(tx, postIds);
      },
      { timeout: 15000 },
    );
  }

  async createManagedPost(
    userId: string,
    channelId: string,
    dto: CreateTelegramManagedPostDto,
    options: {
      groupId?: string | null;
      editorial?: TelegramUnifiedImportEditorial;
      onCreated?: (
        tx: Prisma.TransactionClient,
        postId: string,
      ) => Promise<void>;
    } = {},
  ) {
    const prepared = await this.prepareManagedPostCreate(
      userId,
      channelId,
      dto,
    );
    const create = async (
      client: Prisma.TransactionClient,
      groupId?: string | null,
      groupPosition?: number | null,
    ) => {
      const created = await this.createDraftWithRevision(
        client,
        {
          ...prepared,
          ...(options.editorial &&
            (await resolveImportedEditorial(
              client,
              prepared.workspaceId,
              channelId,
              options.editorial,
            ))),
          groupId,
          groupPosition,
        },
        userId,
      );
      await options.onCreated?.(client, created.id);
      return created;
    };
    const requestedGroupId = options.groupId?.trim() || null;
    const post = await this.prisma.$transaction(async (tx) => {
      if (requestedGroupId) {
        const group = await tx.postGroup.findFirst({
          where: {
            id: requestedGroupId,
            workspaceId: prepared.workspaceId,
            telegramChannelId: channelId,
          },
          select: { id: true },
        });
        if (!group)
          throw telegramPostsNotFound(
            'TELEGRAM_POST_GROUP_NOT_FOUND',
            'Post group is unavailable',
          );
        const groupPosition = await tx.telegramManagedPost.count({
          where: { groupId: group.id },
        });
        return create(tx, group.id, groupPosition);
      }
      return create(tx);
    });
    const [hydrated] =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        [post],
      );
    return hydrated;
  }
}
