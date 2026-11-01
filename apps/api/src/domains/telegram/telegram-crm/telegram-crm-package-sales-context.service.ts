import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmPackageSalesContext } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  decodeSalesContextCursor,
  encodeSalesContextCursor,
  salesContextLimit,
} from './telegram-crm-sales-context-cursor';

const eligibleChannel = {
  isActive: true,
  adminLinks: { some: {} },
} satisfies Prisma.TelegramChannelWhereInput;
const productSelect = {
  id: true,
  name: true,
  defaultPricingMode: true,
  defaultFixedPrice: true,
  defaultCpm: true,
  minimumPrice: true,
  currency: true,
  topDurationMinutes: true,
  feedDurationHours: true,
  deleteAfterHours: true,
  isPermanent: true,
  updatedAt: true,
  telegramChannel: {
    select: {
      id: true,
      title: true,
      adSchedulePolicy: {
        select: {
          timezone: true,
          maxAdsPerDay: true,
          minHoursBetweenAds: true,
          minDaysBetweenAds: true,
          allowManualSlots: true,
        },
      },
    },
  },
} satisfies Prisma.TelegramAdProductSelect;

/** Pure current catalog read: no default-product materialization or historical repricing. */
@Injectable()
export class TelegramCrmPackageSalesContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  /** Selected products only: no network enumeration or implicit catalog expansion. */
  async forCopilot(
    userId: string,
    productIds: string[],
  ): Promise<CrmPackageSalesContext['products']> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    await this.authorization.require(userId, 'adSales.sales.view');
    const rows = await this.prisma.telegramAdProduct.findMany({
      where: {
        workspaceId: access.workspaceId,
        id: { in: productIds.slice(0, 5) },
        isActive: true,
        telegramChannel: {
          workspaceId: access.workspaceId,
          ...eligibleChannel,
        },
      },
      select: productSelect,
      orderBy: { id: 'asc' },
      take: 5,
    });
    return rows.map((product) => ({
      id: product.id,
      name: product.name,
      channel: {
        id: product.telegramChannel.id,
        title: product.telegramChannel.title,
      },
      pricingMode: product.defaultPricingMode,
      fixedPrice: product.defaultFixedPrice?.toFixed() ?? null,
      cpm: product.defaultCpm?.toFixed() ?? null,
      minimumPrice: product.minimumPrice?.toFixed() ?? null,
      currency: product.currency,
      quoteRequired:
        product.defaultPricingMode !== 'FIXED' ||
        product.defaultFixedPrice === null,
      topDurationMinutes: product.topDurationMinutes,
      feedDurationHours: product.feedDurationHours,
      deleteAfterHours: product.deleteAfterHours,
      isPermanent: product.isPermanent,
      updatedAt: product.updatedAt.toISOString(),
      constraints: product.telegramChannel.adSchedulePolicy,
    }));
  }

  async list(
    userId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<CrmPackageSalesContext> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    await this.authorization.require(userId, 'adSales.sales.view');
    const limit = salesContextLimit(query.limit);
    const cursor = decodeSalesContextCursor(query.cursor, 'products');
    const workspaceId = access.workspaceId;
    const [rows, networks] = await this.prisma.$transaction([
      this.prisma.telegramAdProduct.findMany({
        where: {
          workspaceId,
          isActive: true,
          telegramChannel: { workspaceId, ...eligibleChannel },
          ...(cursor ? { id: { gt: cursor.id } } : {}),
        },
        select: productSelect,
        orderBy: { id: 'asc' },
        take: limit + 1,
      }),
      this.prisma.telegramChannelNetwork.findMany({
        where: {
          workspaceId,
          channels: {
            some: {},
            every: {
              workspaceId,
              telegramChannel: { workspaceId, ...eligibleChannel },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 51,
        select: {
          id: true,
          name: true,
          updatedAt: true,
          channels: {
            where: { workspaceId },
            orderBy: { telegramChannelId: 'asc' },
            take: 101,
            select: { telegramChannel: { select: { id: true, title: true } } },
          },
        },
      }),
    ]);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      asOf: new Date().toISOString(),
      discountPolicy: 'MANAGER_APPROVAL_REQUIRED',
      networks: networks.slice(0, 50).map((network) => ({
        id: network.id,
        name: network.name,
        updatedAt: network.updatedAt.toISOString(),
        channels: network.channels
          .slice(0, 100)
          .map((member) => member.telegramChannel),
        channelsTruncated: network.channels.length > 100,
      })),
      networksTruncated: networks.length > 50,
      products: page.map((product) => ({
        id: product.id,
        name: product.name,
        channel: {
          id: product.telegramChannel.id,
          title: product.telegramChannel.title,
        },
        pricingMode: product.defaultPricingMode,
        fixedPrice: product.defaultFixedPrice?.toFixed() ?? null,
        cpm: product.defaultCpm?.toFixed() ?? null,
        minimumPrice: product.minimumPrice?.toFixed() ?? null,
        currency: product.currency,
        quoteRequired:
          product.defaultPricingMode !== 'FIXED' ||
          product.defaultFixedPrice === null,
        topDurationMinutes: product.topDurationMinutes,
        feedDurationHours: product.feedDurationHours,
        deleteAfterHours: product.deleteAfterHours,
        isPermanent: product.isPermanent,
        updatedAt: product.updatedAt.toISOString(),
        constraints: product.telegramChannel.adSchedulePolicy,
      })),
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit && last
          ? encodeSalesContextCursor({ kind: 'products', id: last.id })
          : null,
    };
  }
}
