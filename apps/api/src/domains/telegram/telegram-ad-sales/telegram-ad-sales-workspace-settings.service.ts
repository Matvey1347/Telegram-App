import { ForbiddenException, Injectable } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateTelegramAdSalesWorkspaceSettingsDto } from './dto';
import {
  findOrCreateAdSalesWorkspaceSettings,
  mapAdSalesWorkspaceSettings,
} from './telegram-ad-sales-workspace-settings';

@Injectable()
export class TelegramAdSalesWorkspaceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly responseCache: ResponseCacheService,
  ) {}

  async get(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return mapAdSalesWorkspaceSettings(
      await findOrCreateAdSalesWorkspaceSettings(this.prisma, workspaceId),
    );
  }

  async update(userId: string, dto: UpdateTelegramAdSalesWorkspaceSettingsDto) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const workspaceId = membership.workspaceId;
    if (
      (dto.salesCommissionEnabled !== undefined ||
        dto.defaultSalesCommissionRate !== undefined) &&
      membership.role !== WorkspaceRole.owner
    ) {
      throw new ForbiddenException(
        'Only workspace owners can change sales commission settings',
      );
    }

    const settings = await this.prisma.telegramAdSalesWorkspaceSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        defaultOrganicPostsPerAdSlot: dto.defaultOrganicPostsPerAdSlot ?? 3,
        salesCommissionEnabled: dto.salesCommissionEnabled ?? false,
        defaultSalesCommissionRate: dto.defaultSalesCommissionRate ?? 0,
      },
      update: {
        ...(dto.defaultOrganicPostsPerAdSlot === undefined
          ? {}
          : { defaultOrganicPostsPerAdSlot: dto.defaultOrganicPostsPerAdSlot }),
        ...(dto.salesCommissionEnabled === undefined
          ? {}
          : { salesCommissionEnabled: dto.salesCommissionEnabled }),
        ...(dto.defaultSalesCommissionRate === undefined
          ? {}
          : { defaultSalesCommissionRate: dto.defaultSalesCommissionRate }),
      },
    });
    this.responseCache.clearByPrefix(
      `telegram-ad-sales:availability:${workspaceId}:`,
    );
    return mapAdSalesWorkspaceSettings(settings);
  }
}
