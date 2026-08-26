import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';

export const TELEGRAM_AD_SALES_PLACEMENT_OPTION_LIMIT = 50;

export type TelegramAdSalesPlacementOption = {
  placementId: string;
  saleId: string;
  saleLabel: string;
  saleStatus: TelegramAdSaleStatus;
  saleStatusLabel: string;
  placementStatus: TelegramAdPlacementStatus;
  placementStatusLabel: string;
  channelId: string;
  channelTitle: string;
  channelUsername: string | null;
  productId: string | null;
  productLabel: string;
  scheduledAt: string;
  timezone: string;
  scheduledLabel: string;
  label: string;
};

const ATTACHABLE_SALE_STATUSES = [
  TelegramAdSaleStatus.DRAFT,
  TelegramAdSaleStatus.RESERVED,
  TelegramAdSaleStatus.CONFIRMED,
  TelegramAdSaleStatus.IN_PROGRESS,
] as const;

const ATTACHABLE_PLACEMENT_STATUSES = [
  TelegramAdPlacementStatus.DRAFT,
  TelegramAdPlacementStatus.RESERVED,
  TelegramAdPlacementStatus.SCHEDULED,
  TelegramAdPlacementStatus.PUBLISHED,
] as const;

const placementSelect = {
  id: true,
  telegramAdSaleId: true,
  telegramChannelId: true,
  telegramAdProductId: true,
  status: true,
  scheduledAt: true,
  timezone: true,
  sale: {
    select: {
      id: true,
      title: true,
      advertiserName: true,
      advertiserNameSnapshot: true,
      status: true,
    },
  },
  telegramChannel: {
    select: { id: true, title: true, username: true },
  },
  product: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TelegramAdSalesPlacementOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async list(userId: string): Promise<TelegramAdSalesPlacementOption[]> {
    const workspaceId = await this.workspaceId(userId);
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: this.attachableWhere(workspaceId),
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: TELEGRAM_AD_SALES_PLACEMENT_OPTION_LIMIT,
      select: placementSelect,
    });
    return placements.map((placement) => this.toOption(placement));
  }

  async resolve(
    userId: string,
    placementId: string,
  ): Promise<TelegramAdSalesPlacementOption> {
    const id = placementId.trim();
    if (!id) throw new NotFoundException('Ad placement is unavailable');
    const workspaceId = await this.workspaceId(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: this.attachableWhere(workspaceId, id),
      select: placementSelect,
    });
    if (!placement) throw new NotFoundException('Ad placement is unavailable');
    return this.toOption(placement);
  }

  private workspaceId(userId: string) {
    return this.workspaceService
      .resolveWorkspaceMembershipForUser(userId)
      .then((membership) => membership.workspaceId);
  }

  private attachableWhere(workspaceId: string, id?: string) {
    return {
      id,
      workspaceId,
      managedPostId: null,
      status: { in: [...ATTACHABLE_PLACEMENT_STATUSES] },
      sale: {
        workspaceId,
        status: { in: [...ATTACHABLE_SALE_STATUSES] },
      },
      telegramChannel: {
        workspaceId,
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
      },
    };
  }

  private toOption(placement: {
    id: string;
    telegramAdSaleId: string;
    telegramChannelId: string;
    telegramAdProductId: string | null;
    status: TelegramAdPlacementStatus;
    scheduledAt: Date;
    timezone: string;
    sale: {
      id: string;
      title: string | null;
      advertiserName: string;
      advertiserNameSnapshot: string | null;
      status: TelegramAdSaleStatus;
    };
    telegramChannel: { id: string; title: string; username: string | null };
    product: { id: string; name: string } | null;
  }): TelegramAdSalesPlacementOption {
    const saleLabel =
      placement.sale.title?.trim() ||
      placement.sale.advertiserNameSnapshot?.trim() ||
      placement.sale.advertiserName.trim() ||
      `Sale ${placement.sale.id}`;
    const productLabel = placement.product?.name ?? 'Custom placement';
    const scheduledLabel = this.formatSchedule(
      placement.scheduledAt,
      placement.timezone,
    );
    return {
      placementId: placement.id,
      saleId: placement.telegramAdSaleId,
      saleLabel,
      saleStatus: placement.sale.status,
      saleStatusLabel: this.statusLabel(placement.sale.status),
      placementStatus: placement.status,
      placementStatusLabel: this.statusLabel(placement.status),
      channelId: placement.telegramChannelId,
      channelTitle: placement.telegramChannel.title,
      channelUsername: placement.telegramChannel.username,
      productId: placement.telegramAdProductId,
      productLabel,
      scheduledAt: placement.scheduledAt.toISOString(),
      timezone: placement.timezone,
      scheduledLabel,
      label: `${saleLabel} · ${placement.telegramChannel.title} · ${productLabel} · ${scheduledLabel}`,
    };
  }

  private statusLabel(value: string) {
    return value
      .toLocaleLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (first) => first.toLocaleUpperCase());
  }

  private formatSchedule(value: Date, timezone: string) {
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    };
    try {
      return new Intl.DateTimeFormat('en-GB', {
        ...options,
        timeZone: timezone,
      }).format(value);
    } catch {
      return new Intl.DateTimeFormat('en-GB', options).format(value);
    }
  }
}
