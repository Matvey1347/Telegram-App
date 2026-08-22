import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import {
  CreateTelegramManagedPostDto,
  ReorderManagedPostSidebarDto,
} from './dto';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

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
      throw new BadRequestException(
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
      buttonRows?: unknown;
      icon?: string | null;
      groupId?: string | null;
      groupPosition?: number | null;
      jsonImportKey?: string | null;
    },
  ) {
    return tx.telegramManagedPost.create({
      data: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        title: params.title,
        text: params.text ?? null,
        imageUrls: params.imageUrls ?? [],
        buttonRows: normalizeTelegramPostButtonRows(params.buttonRows),
        origin: 'SYSTEM',
        assignedMemberId: params.assignedMemberId,
        icon: params.icon?.trim() || null,
        groupId: params.groupId,
        groupPosition: params.groupPosition,
        jsonImportKey: params.jsonImportKey ?? null,
      },
      include: this.managedPostInclude,
    });
  }

  async createManagedPost(
    userId: string,
    channelId: string,
    dto: CreateTelegramManagedPostDto,
  ) {
    if (dto.assignedMemberId === null) {
      throw new BadRequestException('Assigned member is required');
    }
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    if (!assignedMemberId) {
      throw new BadRequestException('Assigned member is required');
    }
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    const post = await this.createManagedPostRecord(this.prisma, {
      workspaceId,
      channelId,
      title,
      text: dto.text ?? null,
      imageUrls: dto.imageUrls ?? [],
      buttonRows: dto.buttonRows,
      assignedMemberId,
      icon: dto.icon?.trim() || null,
    });
    const [hydrated] =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        [post],
      );
    return hydrated;
  }
}
