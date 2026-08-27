import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  normalizePostGroupNumbering as normalizePostGroupNumberingRecords,
  normalizePostGroupsNumbering as normalizePostGroupsNumberingRecords,
  postGroupStatusSummary,
} from './post-groups.helpers';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import {
  ADVERTISE_SYSTEM_GROUP_KEY,
  ADVERTISE_SYSTEM_GROUP_ICON,
  ADVERTISE_SYSTEM_GROUP_TITLE,
  SYSTEM_BOT_POSTS_GROUP_KEY,
  SYSTEM_BOT_POSTS_GROUP_TITLE,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE,
} from './telegram-channels.internal';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';

@Injectable()
export class TelegramPostGroupStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
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

  private readonly postGroupBaseInclude = {
    createdByMember: { select: this.memberSummarySelect },
    telegramChannel: { select: { id: true, title: true } },
  } as const;

  public async resolvePostGroupCreatorMemberId(
    workspaceId: string,
    preferredMemberId?: string | null,
  ) {
    if (preferredMemberId) return preferredMemberId;
    return (
      await this.prisma.workspaceMember.findFirst({
        where: { workspaceId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id;
  }

  public async ensureAdvertiseSystemGroup(
    client: Prisma.TransactionClient | PrismaService,
    workspaceId: string,
    channelId: string,
    preferredMemberId?: string | null,
  ) {
    const channel = await client.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const groups = await client.postGroup.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const existing =
      groups.find((group) => group.systemKey === ADVERTISE_SYSTEM_GROUP_KEY) ??
      groups.find(
        (group) =>
          group.title.trim().toLocaleLowerCase() ===
          ADVERTISE_SYSTEM_GROUP_TITLE.toLocaleLowerCase(),
      );
    if (existing) {
      if (
        existing.isSystem &&
        existing.systemKey === ADVERTISE_SYSTEM_GROUP_KEY &&
        existing.title === ADVERTISE_SYSTEM_GROUP_TITLE &&
        existing.icon === ADVERTISE_SYSTEM_GROUP_ICON
      ) {
        return existing;
      }
      return client.postGroup.update({
        where: { id: existing.id },
        data: {
          title: ADVERTISE_SYSTEM_GROUP_TITLE,
          icon: ADVERTISE_SYSTEM_GROUP_ICON,
          isSystem: true,
          systemKey: ADVERTISE_SYSTEM_GROUP_KEY,
        },
      });
    }

    const preferredMember = preferredMemberId
      ? await client.workspaceMember.findFirst({
          where: { id: preferredMemberId, workspaceId },
          select: { id: true },
        })
      : null;
    const createdByMemberId =
      preferredMember?.id ??
      (
        await client.workspaceMember.findFirst({
          where: { workspaceId },
          select: { id: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      )?.id;
    if (!createdByMemberId) {
      throw new BadRequestException(
        'Workspace member is required to create the advertise system group',
      );
    }
    return client.postGroup.upsert({
      where: {
        telegramChannelId_systemKey: {
          telegramChannelId: channelId,
          systemKey: ADVERTISE_SYSTEM_GROUP_KEY,
        },
      },
      update: {
        title: ADVERTISE_SYSTEM_GROUP_TITLE,
        icon: ADVERTISE_SYSTEM_GROUP_ICON,
        isSystem: true,
      },
      create: {
        workspaceId,
        telegramChannelId: channelId,
        title: ADVERTISE_SYSTEM_GROUP_TITLE,
        icon: ADVERTISE_SYSTEM_GROUP_ICON,
        isSystem: true,
        systemKey: ADVERTISE_SYSTEM_GROUP_KEY,
        createdByMemberId,
      },
    });
  }

  public async ensureSystemBotPostsGroup(
    client: Prisma.TransactionClient | PrismaService,
    workspaceId: string,
    channelId: string,
    preferredMemberId?: string | null,
  ) {
    const channel = await client.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const existing = await client.postGroup.findFirst({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        systemKey: SYSTEM_BOT_POSTS_GROUP_KEY,
      },
    });
    if (existing) {
      if (
        existing.isSystem &&
        existing.title === SYSTEM_BOT_POSTS_GROUP_TITLE
      ) {
        return existing;
      }
      return client.postGroup.update({
        where: { id: existing.id },
        data: { title: SYSTEM_BOT_POSTS_GROUP_TITLE, isSystem: true },
      });
    }
    const createdByMemberId = await this.resolveSystemGroupCreator(
      client,
      workspaceId,
      preferredMemberId,
    );
    if (!createdByMemberId) {
      throw new BadRequestException(
        'Workspace member is required to create the System Bot posts group',
      );
    }
    return client.postGroup.upsert({
      where: {
        telegramChannelId_systemKey: {
          telegramChannelId: channelId,
          systemKey: SYSTEM_BOT_POSTS_GROUP_KEY,
        },
      },
      update: { title: SYSTEM_BOT_POSTS_GROUP_TITLE, isSystem: true },
      create: {
        workspaceId,
        telegramChannelId: channelId,
        title: SYSTEM_BOT_POSTS_GROUP_TITLE,
        isSystem: true,
        systemKey: SYSTEM_BOT_POSTS_GROUP_KEY,
        createdByMemberId,
      },
    });
  }

  public async ensureRequiredChannelSystemGroups(
    client: Prisma.TransactionClient | PrismaService,
    workspaceId: string,
    channelId: string,
    preferredMemberId?: string | null,
  ) {
    const advertise = await this.ensureAdvertiseSystemGroup(
      client,
      workspaceId,
      channelId,
      preferredMemberId,
    );
    const systemBotPosts = await this.ensureSystemBotPostsGroup(
      client,
      workspaceId,
      channelId,
      preferredMemberId,
    );
    return { advertise, systemBotPosts };
  }

  private async resolveSystemGroupCreator(
    client: Prisma.TransactionClient | PrismaService,
    workspaceId: string,
    preferredMemberId?: string | null,
  ) {
    const preferredMember = preferredMemberId
      ? await client.workspaceMember.findFirst({
          where: { id: preferredMemberId, workspaceId },
          select: { id: true },
        })
      : null;
    return (
      preferredMember ??
      (await client.workspaceMember.findFirst({
        where: { workspaceId },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }))
    )?.id;
  }

  public async ensureTelegramImportedSystemGroup(
    workspaceId: string,
    channelId: string,
    preferredMemberId?: string | null,
  ) {
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    const createdByMemberId = await this.resolvePostGroupCreatorMemberId(
      workspaceId,
      preferredMemberId,
    );
    if (!createdByMemberId) {
      throw new BadRequestException(
        'Assigned member is required to create system post groups',
      );
    }
    const existing = await this.prisma.postGroup.findFirst({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        OR: [
          { systemKey: TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY },
          { isSystem: true, title: TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE },
        ],
      },
    });
    const systemGroupIconId =
      await this.telegramManagedPostGroupPresentationService.resolveTelegramImportedSystemGroupIconId();
    const hasExpectedSystemGroupIcon =
      systemGroupIconId === TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID
        ? !existing?.icon
        : existing?.icon === systemGroupIconId;
    const withSystemGroupIcon =
      systemGroupIconId === TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID
        ? {}
        : { icon: systemGroupIconId };
    if (existing) {
      if (
        existing.isSystem &&
        existing.title === TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE
      ) {
        if (
          existing.systemKey === TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY &&
          hasExpectedSystemGroupIcon
        )
          return existing;
        return this.prisma.postGroup.update({
          where: { id: existing.id },
          data: {
            isSystem: true,
            systemKey: TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY,
            title: TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE,
            ...withSystemGroupIcon,
          },
        });
      }
      return this.prisma.postGroup.update({
        where: { id: existing.id },
        data: {
          isSystem: true,
          systemKey: TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY,
          title: TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE,
          ...withSystemGroupIcon,
        },
      });
    }
    return this.prisma.postGroup.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        title: TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE,
        isSystem: true,
        systemKey: TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY,
        ...withSystemGroupIcon,
        createdByMemberId,
      },
    });
  }

  public async postGroupForWorkspace(workspaceId: string, groupId: string) {
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        ...this.postGroupBaseInclude,
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
          include: this.managedPostInclude,
        },
      },
    });
    if (!group) throw new NotFoundException('Post group not found');
    const [hydratedGroup] =
      await this.telegramManagedPostGroupPresentationService.attachPostGroupIcons(
        [
          {
            ...group,
            statusSummary: postGroupStatusSummary(
              group.posts.map((post) => post.status),
            ),
          },
        ],
      );
    return hydratedGroup;
  }

  public async normalizePostGroupNumbering(
    tx: Prisma.TransactionClient,
    groupId: string,
  ) {
    await normalizePostGroupNumberingRecords(tx, groupId);
  }

  public async normalizeChannelPostGroupNumberingOnRead(
    workspaceId: string,
    channelId: string,
  ) {
    const groupedPosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        groupId: { not: null },
      },
      select: { groupId: true },
      distinct: ['groupId'],
    });
    const groupIds = groupedPosts
      .map((post) => post.groupId)
      .filter((groupId): groupId is string => Boolean(groupId));
    await normalizePostGroupsNumberingRecords(this.prisma, groupIds);
  }
}
