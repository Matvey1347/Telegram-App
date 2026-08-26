import { BadRequestException, Injectable } from '@nestjs/common';
import {
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramAdSalesPlacementOptionsService } from './telegram-ad-sales-placement-options.service';

const SALE_STATUSES = [
  TelegramAdSaleStatus.DRAFT,
  TelegramAdSaleStatus.RESERVED,
  TelegramAdSaleStatus.CONFIRMED,
  TelegramAdSaleStatus.IN_PROGRESS,
] as const;
const PLACEMENT_STATUSES = [
  TelegramAdPlacementStatus.DRAFT,
  TelegramAdPlacementStatus.RESERVED,
  TelegramAdPlacementStatus.SCHEDULED,
  TelegramAdPlacementStatus.PUBLISHED,
] as const;

export type ClaimedTelegramAdPlacement = {
  placementId: string;
  saleId: string;
  saleStatus: TelegramAdSaleStatus;
  placementStatus: TelegramAdPlacementStatus;
  channelId: string;
  productId: string | null;
  scheduledAt: string;
  timezone: string;
  managedPostId: string | null;
  deleteAfterHours: number | null;
  isPermanent: boolean;
};

@Injectable()
export class TelegramAdSalesBotExistingPlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly options: TelegramAdSalesPlacementOptionsService,
  ) {}

  async claim(
    userId: string,
    workspaceId: string,
    placementId: string,
    commandId: string,
  ): Promise<ClaimedTelegramAdPlacement> {
    const key = `system-bot:${commandId}`;
    try {
      const option = await this.options.resolve(userId, placementId);
      await this.prisma.telegramAdSalePlacement.updateMany({
        where: {
          id: option.placementId,
          workspaceId,
          managedPostId: null,
          attachmentIdempotencyKey: null,
          status: { in: [...PLACEMENT_STATUSES] },
          sale: { workspaceId, status: { in: [...SALE_STATUSES] } },
          telegramChannel: {
            workspaceId,
            isActive: true,
            archivedAt: null,
            adminLinks: { some: {} },
          },
        },
        data: { attachmentIdempotencyKey: key },
      });
    } catch {
      // A retry after attachment no longer appears in the attachable picker.
      // Ownership is proven below by the command-specific unique claim.
    }

    const resumed = await this.prisma.telegramAdSalePlacement.findFirst({
      where: {
        id: placementId,
        workspaceId,
        attachmentIdempotencyKey: key,
        status: { in: [...PLACEMENT_STATUSES] },
        sale: { workspaceId, status: { in: [...SALE_STATUSES] } },
        telegramChannel: {
          workspaceId,
          isActive: true,
          archivedAt: null,
          adminLinks: { some: {} },
        },
      },
      select: {
        id: true,
        telegramAdSaleId: true,
        telegramChannelId: true,
        telegramAdProductId: true,
        scheduledAt: true,
        timezone: true,
        status: true,
        managedPostId: true,
        deleteAfterHoursSnapshot: true,
        isPermanentSnapshot: true,
        sale: { select: { status: true } },
      },
    });
    if (!resumed) {
      throw new BadRequestException(
        'Ad placement is unavailable or claimed by another command',
      );
    }
    return {
      placementId: resumed.id,
      saleId: resumed.telegramAdSaleId,
      saleStatus: resumed.sale.status,
      placementStatus: resumed.status,
      channelId: resumed.telegramChannelId,
      productId: resumed.telegramAdProductId,
      scheduledAt: resumed.scheduledAt.toISOString(),
      timezone: resumed.timezone,
      managedPostId: resumed.managedPostId,
      deleteAfterHours: resumed.deleteAfterHoursSnapshot,
      isPermanent: resumed.isPermanentSnapshot,
    };
  }
}
