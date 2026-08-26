import { Injectable, NotFoundException } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { DashboardService } from '../../operations/dashboard/dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramWorkspaceFullSyncService } from '../telegram-sync/telegram-workspace-full-sync.service';
import { TelegramChannelSyncOrchestrator } from '../telegram-channels/telegram-channel-sync.orchestrator';

@Injectable()
export class TelegramSystemBotDomainGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async channels(workspaceId: string, telegramUserId: string) {
    return this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        adminLinks: {
          some: {
            telegramUserAccountIntegration: {
              telegramUserId,
              isActive: true,
            },
          },
        },
      },
      orderBy: { title: 'asc' },
      take: 20,
      select: {
        id: true,
        title: true,
        username: true,
        photoUrl: true,
        isActive: true,
        lastPublicSyncedAt: true,
        currentSubscribersCount: true,
      },
    });
  }

  async syncAll(workspaceId: string, userId: string) {
    const service = await this.moduleRef.resolve(
      TelegramWorkspaceFullSyncService,
      undefined,
      { strict: false },
    );
    return service.syncWorkspace({
      workspaceId,
      actor: { type: 'SYSTEM_BOT', userId },
    });
  }

  async syncChannel(
    userId: string,
    workspaceId: string,
    telegramUserId: string,
    channelId: string,
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: {
        id: channelId,
        workspaceId,
        adminLinks: {
          some: {
            telegramUserAccountIntegration: {
              telegramUserId,
              isActive: true,
            },
          },
        },
      },
      select: { id: true },
    });
    if (!channel)
      throw new NotFoundException('Telegram channel is unavailable');
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId } },
      contextId,
    );
    const service = await this.moduleRef.resolve(
      TelegramChannelSyncOrchestrator,
      contextId,
      { strict: false },
    );
    return service.syncNow(userId, channelId);
  }

  async stats(workspaceId: string) {
    const service = await this.moduleRef.resolve(DashboardService, undefined, {
      strict: false,
    });
    return service.summaryForWorkspace(workspaceId);
  }
}
