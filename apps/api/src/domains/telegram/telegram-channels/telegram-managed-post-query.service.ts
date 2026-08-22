import { Injectable } from '@nestjs/common';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostAutoRepairService } from './telegram-managed-post-auto-repair.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responseCache: ResponseCacheService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostReconciliationService: TelegramManagedPostReconciliationService,
    private readonly telegramManagedPostAutoRepairService: TelegramManagedPostAutoRepairService,
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

  async managedPosts(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.telegramChannelCatalogService.findOne(
      userId,
      channelId,
    );
    try {
      const reconciliation =
        await this.telegramManagedPostReconciliationService.reconcileDueManagedPosts(
          workspaceId,
          channelId,
        );
      if (reconciliation.checked) {
        this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
          userId,
          workspaceId,
        );
      }
      await this.telegramManagedPostAutoRepairService.autoRepairImportedManagedPostsOnRead(
        {
          workspaceId,
          channelId,
          channel,
        },
      );
      await this.telegramPostGroupsService.normalizeChannelPostGroupNumberingOnRead(
        workspaceId,
        channelId,
      );
      return this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        await this.prisma.telegramManagedPost.findMany({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: this.managedPostInclude,
        }),
      );
    } catch (error) {
      if (
        !this.telegramChannelSchemaCompatibilityService.isMissingTelegramManagedPostOriginColumns(
          error,
        )
      )
        throw error;
      await this.telegramChannelSchemaCompatibilityService.ensureTelegramManagedPostOriginColumnsAvailable();
      const reconciliation =
        await this.telegramManagedPostReconciliationService.reconcileDueManagedPosts(
          workspaceId,
          channelId,
        );
      if (reconciliation.checked) {
        this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
          userId,
          workspaceId,
        );
      }
      await this.telegramManagedPostAutoRepairService.autoRepairImportedManagedPostsOnRead(
        {
          workspaceId,
          channelId,
          channel,
        },
      );
      await this.telegramPostGroupsService.normalizeChannelPostGroupNumberingOnRead(
        workspaceId,
        channelId,
      );
      return this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        await this.prisma.telegramManagedPost.findMany({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: this.managedPostInclude,
        }),
      );
    }
  }
}
