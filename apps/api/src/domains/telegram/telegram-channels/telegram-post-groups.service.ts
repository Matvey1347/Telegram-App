import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreatePostGroupDto,
  ImportPostGroupsDto,
  PostGroupsQueryDto,
  PostIdsDto,
  ReorderPostGroupDto,
  UpdatePostGroupDto,
} from './dto';
import {
  postGroupStatusSummary,
  validateCompletePostOrder,
} from './post-groups.helpers';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  postGroupNotFound,
  telegramChannelNotFound,
  telegramPostsBadRequest,
} from './telegram-posts.errors';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramPostGroupStore } from './telegram-post-group.store';

@Injectable()
export class TelegramPostGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramPostGroupStore: TelegramPostGroupStore,
  ) {}

  private async resolvePostGroupIconId(
    workspaceId: string,
    userId: string,
    rawIcon: string | null | undefined,
    title: string,
  ) {
    const icon = rawIcon?.trim();
    if (!icon) return null;
    const existingById = await this.prisma.icon.findFirst({
      where: {
        id: icon,
        OR: [{ workspaceId }, { workspaceId: null }],
      },
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
          name: title,
          emoji: icon,
          createdByUserId: userId,
        },
        select: { id: true },
      })
    ).id;
  }

  ensureTelegramImportedSystemGroup(
    ...args: Parameters<
      TelegramPostGroupStore['ensureTelegramImportedSystemGroup']
    >
  ) {
    return this.telegramPostGroupStore.ensureTelegramImportedSystemGroup(
      ...args,
    );
  }

  ensureAdvertiseSystemGroup(
    workspaceId: string,
    channelId: string,
    preferredMemberId?: string | null,
  ) {
    return this.telegramPostGroupStore.ensureAdvertiseSystemGroup(
      this.prisma,
      workspaceId,
      channelId,
      preferredMemberId,
    );
  }

  postGroupForWorkspace(
    ...args: Parameters<TelegramPostGroupStore['postGroupForWorkspace']>
  ) {
    return this.telegramPostGroupStore.postGroupForWorkspace(...args);
  }

  normalizePostGroupNumbering(
    ...args: Parameters<TelegramPostGroupStore['normalizePostGroupNumbering']>
  ) {
    return this.telegramPostGroupStore.normalizePostGroupNumbering(...args);
  }

  normalizeChannelPostGroupNumberingOnRead(
    ...args: Parameters<
      TelegramPostGroupStore['normalizeChannelPostGroupNumberingOnRead']
    >
  ) {
    return this.telegramPostGroupStore.normalizeChannelPostGroupNumberingOnRead(
      ...args,
    );
  }

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

  private readonly postGroupBaseInclude = {
    createdByMember: { select: this.memberSummarySelect },
    telegramChannel: { select: { id: true, title: true } },
  } as const;

  private readonly postGroupListSelect = {
    id: true,
    workspaceId: true,
    telegramChannelId: true,
    title: true,
    description: true,
    icon: true,
    isSystem: true,
    systemKey: true,
    statusNumberingEnabled: true,
    createdByMemberId: true,
    sidebarPosition: true,
    createdAt: true,
    updatedAt: true,
    ...this.postGroupBaseInclude,
  } as const;

  async postGroups(userId: string, query: PostGroupsQueryDto) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    if (query.telegramChannelId) {
      const channel = await this.prisma.telegramChannel.findFirst({
        where: {
          id: query.telegramChannelId,
          workspaceId,
          isActive: true,
        },
        select: { id: true, assignedMemberId: true },
      });
      if (!channel) throw telegramChannelNotFound();
      await this.telegramPostGroupStore.ensureRequiredChannelSystemGroups(
        this.prisma,
        workspaceId,
        query.telegramChannelId,
        channel.assignedMemberId ?? null,
      );
      await this.telegramPostGroupStore.ensureTelegramImportedSystemGroup(
        workspaceId,
        query.telegramChannelId,
        channel.assignedMemberId ?? null,
      );
      await this.telegramPostGroupStore.normalizeChannelPostGroupNumberingOnRead(
        workspaceId,
        query.telegramChannelId,
      );
    }
    const where = {
      workspaceId,
      telegramChannelId: query.telegramChannelId,
      title: query.search?.trim()
        ? { contains: query.search.trim(), mode: 'insensitive' as const }
        : undefined,
    };
    const pagination = normalizePagination(query);
    const [groups, totalItems] = await this.prisma.$transaction([
      this.prisma.postGroup.findMany({
        where,
        select: this.postGroupListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.postGroup.count({ where }),
    ]);
    const statusCounts = groups.length
      ? await this.prisma.telegramManagedPost.groupBy({
          by: ['groupId', 'status'],
          where: {
            workspaceId,
            groupId: { in: groups.map((group) => group.id) },
          },
          _count: { _all: true },
        })
      : [];
    const statusesByGroupId = new Map<string, TelegramManagedPostStatus[]>();
    for (const row of statusCounts) {
      if (!row.groupId) continue;
      const statuses = statusesByGroupId.get(row.groupId) ?? [];
      statuses.push(...Array(row._count._all).fill(row.status));
      statusesByGroupId.set(row.groupId, statuses);
    }
    const items = groups.map((group) => ({
      ...group,
      postsCount: statusesByGroupId.get(group.id)?.length ?? 0,
      statusSummary: postGroupStatusSummary(
        statusesByGroupId.get(group.id) ?? [],
      ),
    }));
    return createPaginatedResponse(
      await this.telegramManagedPostGroupPresentationService.attachPostGroupIcons(
        items,
      ),
      totalItems,
      pagination,
    );
  }

  async postGroup(userId: string, groupId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true },
    });
    if (!group) throw postGroupNotFound();
    await this.prisma.$transaction(async (tx) => {
      await this.telegramPostGroupStore.normalizePostGroupNumbering(
        tx,
        groupId,
      );
    });
    return this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
  }

  async createPostGroup(userId: string, dto: CreatePostGroupDto) {
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const channel = await (this.prisma.telegramChannel as any).findFirst({
      where: {
        id: dto.telegramChannelId,
        workspaceId: membership.workspaceId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!channel) throw telegramChannelNotFound();
    const title = dto.title.trim();
    if (!title)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TITLE_REQUIRED',
        'Title is required',
      );
    const createdByMemberId = dto.createdByMemberId?.trim() || membership.id;
    if (createdByMemberId !== membership.id) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: {
          id: createdByMemberId,
          workspaceId: membership.workspaceId,
        },
        select: { id: true },
      });
      if (!member) {
        throw telegramPostsBadRequest(
          'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
          'Group member must belong to the current workspace',
        );
      }
    }
    const postIds = [...new Set(dto.postIds ?? [])];
    if (postIds.length !== (dto.postIds?.length ?? 0)) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_SCHEDULE',
        'postIds must not contain duplicates',
      );
    }
    const iconId = await this.resolvePostGroupIconId(
      membership.workspaceId,
      userId,
      dto.icon,
      title,
    );
    const previousGroupIds = await this.prisma.$transaction(async (tx) => {
      const posts = postIds.length
        ? await tx.telegramManagedPost.findMany({
            where: {
              id: { in: postIds },
              workspaceId: membership.workspaceId,
              telegramChannelId: channel.id,
            },
            select: { id: true, groupId: true },
          })
        : [];
      if (posts.length !== postIds.length) {
        throw telegramPostsBadRequest(
          'TELEGRAM_MANAGED_POST_NOT_FOUND',
          'Every post must belong to the selected channel and workspace',
        );
      }
      const group = await tx.postGroup.create({
        data: {
          workspaceId: membership.workspaceId,
          telegramChannelId: channel.id,
          title,
          description: dto.description?.trim() || null,
          icon: iconId,
          statusNumberingEnabled: dto.statusNumberingEnabled ?? false,
          createdByMemberId,
        },
      });
      await Promise.all(
        postIds.map((postId, groupPosition) =>
          tx.telegramManagedPost.update({
            where: { id: postId },
            data: { groupId: group.id, groupPosition },
          }),
        ),
      );
      const oldGroupIds = [
        ...new Set(
          posts
            .map((post) => post.groupId)
            .filter((id): id is string => Boolean(id) && id !== group.id),
        ),
      ];
      for (const oldGroupId of oldGroupIds) {
        await this.telegramPostGroupStore.normalizePostGroupNumbering(
          tx,
          oldGroupId,
        );
      }
      await this.telegramPostGroupStore.normalizePostGroupNumbering(
        tx,
        group.id,
      );
      return { groupId: group.id, oldGroupIds };
    });
    return this.telegramPostGroupStore.postGroupForWorkspace(
      membership.workspaceId,
      previousGroupIds.groupId,
    );
  }

  async importPostGroups(
    userId: string,
    dto: ImportPostGroupsDto,
    onProgress?: (item: unknown, current: number, total: number) => void,
  ) {
    const results: Array<Record<string, unknown>> = [];
    for (const [index, group] of dto.groups.entries()) {
      try {
        const created = await this.createPostGroup(userId, group);
        const item = {
          index,
          title: group.title,
          success: true,
          action: 'CREATED',
          groupId: created.id,
          message: `Created ${group.title}`,
        };
        results.push(item);
        onProgress?.(item, index + 1, dto.groups.length);
      } catch (error) {
        const item = {
          index,
          title: group.title,
          success: false,
          action: 'FAILED',
          error:
            error instanceof Error ? error.message : 'Could not create group',
          message: `Failed ${group.title}`,
        };
        results.push(item);
        onProgress?.(item, index + 1, dto.groups.length);
      }
    }
    return {
      total: results.length,
      successCount: results.filter((item) => item.success).length,
      failedCount: results.filter((item) => !item.success).length,
      skippedCount: 0,
      results,
    };
  }

  async updatePostGroup(
    userId: string,
    groupId: string,
    dto: UpdatePostGroupDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const group = await this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
    if (group.isSystem) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_EDITABLE',
        'System post groups cannot be edited',
      );
    }
    if (dto.title !== undefined && !dto.title.trim()) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TITLE_REQUIRED',
        'Title is required',
      );
    }
    await this.prisma.postGroup.update({
      where: { id: groupId },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        icon: dto.icon === undefined ? undefined : dto.icon?.trim() || null,
        statusNumberingEnabled: dto.statusNumberingEnabled,
      },
    });
    return this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
  }

  async deletePostGroup(userId: string, groupId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const group = await this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
    if (group.isSystem) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_EDITABLE',
        'System post groups cannot be deleted',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.updateMany({
        where: { groupId, workspaceId },
        data: { groupId: null, groupPosition: null, statusPosition: null },
      });
      return tx.postGroup.delete({ where: { id: groupId } });
    });
  }

  async addPostsToGroup(userId: string, groupId: string, dto: PostIdsDto) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
    });
    if (!group) throw postGroupNotFound();
    const postIds = [...new Set(dto.postIds)];
    if (postIds.length !== dto.postIds.length) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_SCHEDULE',
        'postIds must not contain duplicates',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const posts = await tx.telegramManagedPost.findMany({
        where: {
          id: { in: postIds },
          workspaceId,
          telegramChannelId: group.telegramChannelId,
        },
        select: { id: true, groupId: true },
      });
      if (posts.length !== postIds.length) {
        throw telegramPostsBadRequest(
          'TELEGRAM_MANAGED_POST_NOT_FOUND',
          'Every post must belong to the group channel and workspace',
        );
      }
      const existingCount = await tx.telegramManagedPost.count({
        where: { groupId },
      });
      const attach = posts.filter((post) => post.groupId !== groupId);
      await Promise.all(
        attach.map((post, index) =>
          tx.telegramManagedPost.update({
            where: { id: post.id },
            data: {
              groupId,
              groupPosition: existingCount + index,
            },
          }),
        ),
      );
      const oldGroupIds = [
        ...new Set(
          attach
            .map((post) => post.groupId)
            .filter((id): id is string => Boolean(id) && id !== groupId),
        ),
      ];
      for (const oldGroupId of oldGroupIds) {
        await this.telegramPostGroupStore.normalizePostGroupNumbering(
          tx,
          oldGroupId,
        );
      }
      await this.telegramPostGroupStore.normalizePostGroupNumbering(
        tx,
        groupId,
      );
    });
    return this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
  }

  async removePostFromGroup(userId: string, groupId: string, postId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, groupId, workspaceId },
      select: { id: true },
    });
    if (!post) throw postGroupNotFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.update({
        where: { id: postId },
        data: { groupId: null, groupPosition: null, statusPosition: null },
      });
      await this.telegramPostGroupStore.normalizePostGroupNumbering(
        tx,
        groupId,
      );
    });
    return this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
  }

  async reorderPostGroup(
    userId: string,
    groupId: string,
    dto: ReorderPostGroupDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: { groupId, workspaceId },
      select: { id: true },
    });
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true },
    });
    if (!group) throw postGroupNotFound();
    validateCompletePostOrder(
      posts.map((post) => post.id),
      dto.orderedPostIds,
    );
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        dto.orderedPostIds.map((postId, groupPosition) =>
          tx.telegramManagedPost.update({
            where: { id: postId },
            data: { groupPosition },
          }),
        ),
      );
      await this.telegramPostGroupStore.normalizePostGroupNumbering(
        tx,
        groupId,
      );
    });
    return this.telegramPostGroupStore.postGroupForWorkspace(
      workspaceId,
      groupId,
    );
  }
}
