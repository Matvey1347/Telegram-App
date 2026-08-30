import type {
  TelegramAdCrmAdvertiserSortBy,
  TelegramAdCrmAdvertiserListItem,
  TelegramAdCrmAdvertisersListResult,
  TelegramAdCrmFrequencyBucket,
  TelegramAdCrmRecencyBucket,
  TelegramAdCrmRfmSegment,
  TelegramAdCrmUrgency,
} from '@telegram-system/shared';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdPlacementStatus,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramAdvertisersQueryDto } from './dto';
import { decimal, decimalToString } from './domain/decimal';
import * as crmMetrics from './telegram-ad-sales-crm-advertiser-metrics';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { adSalesAuthorizationTestFallback } from './telegram-ad-sales-authorization-test-fallback';

@Injectable()
export class TelegramAdSalesCrmAdvertisersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly authorization: WorkspaceAuthorizationService = adSalesAuthorizationTestFallback(workspaceService),
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private recencyBucket(value: Date | null | undefined, now: Date) {
    return crmMetrics.recencyBucket(value, now);
  }

  private frequencyBucket(
    completedSalesCount: number,
    totalSalesCount: number,
  ) {
    return crmMetrics.frequencyBucket(completedSalesCount, totalSalesCount);
  }

  private crmAdvertiserSelect(): Prisma.TelegramAdvertiserSelect {
    return {
      id: true,
      displayName: true,
      companyName: true,
      telegramUsername: true,
      description: true,
      phone: true,
      email: true,
      website: true,
      status: true,
      lifecycleStage: true,
      completedSalesCount: true,
      totalSalesCount: true,
      totalRevenueInPrimaryCurrency: true,
      averageOrderValueInPrimaryCurrency: true,
      firstPurchaseAt: true,
      lastPurchaseAt: true,
      lastContactAt: true,
      nextContactAt: true,
      contacts: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: {
          id: true,
          type: true,
          value: true,
          label: true,
          isPrimary: true,
        },
      },
      ownerMember: {
        select: {
          id: true,
          avatarIcon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      tasks: {
        where: {
          status: {
            in: [
              TelegramAdvertiserTaskStatus.OPEN,
              TelegramAdvertiserTaskStatus.IN_PROGRESS,
            ],
          },
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: 1,
        select: {
          id: true,
          title: true,
          dueAt: true,
          priority: true,
          type: true,
          status: true,
        },
      },
    };
  }

  private mapCrmAdvertiser(
    advertiser: any,
    highValueThreshold: number,
    now: Date,
  ): TelegramAdCrmAdvertiserListItem {
    const primaryContact = advertiser.contacts?.[0] ?? null;
    const nextOpenTask = advertiser.tasks?.[0] ?? null;
    const totalRevenue =
      decimalToString(advertiser.totalRevenueInPrimaryCurrency) ?? '0';
    const averageOrderValue =
      decimalToString(advertiser.averageOrderValueInPrimaryCurrency) ?? '0';
    const monetaryValue = Number(totalRevenue);
    const safeMonetaryValue = Number.isFinite(monetaryValue)
      ? monetaryValue
      : 0;
    const recencyBucket = crmMetrics.recencyBucket(
      advertiser.lastPurchaseAt,
      now,
    );
    const frequencyBucket = crmMetrics.frequencyBucket(
      advertiser.completedSalesCount,
      advertiser.totalSalesCount,
    );
    const monetaryBucket = crmMetrics.monetaryBucket(
      safeMonetaryValue,
      highValueThreshold,
    );
    const effectiveStatus =
      advertiser.status === TelegramAdvertiserStatus.LOST ||
      advertiser.status === TelegramAdvertiserStatus.BLOCKED
        ? advertiser.status
        : advertiser.hasActiveSale
          ? TelegramAdvertiserStatus.ACTIVE
          : TelegramAdvertiserStatus.LEAD;
    const activityStatus = advertiser.hasActivePlacement
      ? ('ACTIVE' as const)
      : advertiser.hasWaitingPlacement
        ? ('WAITING' as const)
        : ('LEAD' as const);
    const rfmSegment = crmMetrics.rfmSegment({
      status: effectiveStatus,
      lifecycleStage: advertiser.lifecycleStage,
      completedSalesCount: advertiser.completedSalesCount,
      recencyBucket,
      frequencyBucket,
      monetaryBucket,
    });
    const priority = crmMetrics.crmPriority({
      segment: rfmSegment,
      nextOpenTask,
      nextContactAt: advertiser.nextContactAt ?? null,
      now,
    });
    const revenueByCurrency = Array.isArray(advertiser.revenueByCurrency)
      ? advertiser.revenueByCurrency
      : [];
    const averageOrderValueByCurrency = Array.isArray(
      advertiser.averageOrderValueByCurrency,
    )
      ? advertiser.averageOrderValueByCurrency
      : [];
    const purchasedChannels = Array.isArray(advertiser.purchasedChannels)
      ? advertiser.purchasedChannels
      : [];

    return {
      id: advertiser.id,
      displayName: advertiser.displayName,
      companyName: advertiser.companyName,
      telegramUsername: advertiser.telegramUsername,
      description: advertiser.description,
      phone: advertiser.phone,
      email: advertiser.email,
      website: advertiser.website,
      primaryContact: primaryContact
        ? {
            id: primaryContact.id,
            type: primaryContact.type,
            value: primaryContact.value,
            label: primaryContact.label,
            isPrimary: primaryContact.isPrimary,
          }
        : null,
      ownerMember: advertiser.ownerMember
        ? {
            id: advertiser.ownerMember.id,
            name: advertiser.ownerMember.user.name,
            email: advertiser.ownerMember.user.email,
            avatarPresentation: iconToResolvedEmoji(
              advertiser.ownerMember.avatarIcon,
            ),
          }
        : null,
      status: effectiveStatus,
      activityStatus,
      lifecycleStage: advertiser.lifecycleStage,
      completedSalesCount: advertiser.completedSalesCount,
      totalSalesCount: advertiser.totalSalesCount,
      paidSalesCount: advertiser.paidSalesCount ?? 0,
      completedPlacementsCount: advertiser.completedPlacementsCount ?? 0,
      totalPlacementsCount: advertiser.totalPlacementsCount ?? 0,
      totalRevenueInPrimaryCurrency: totalRevenue,
      averageOrderValueInPrimaryCurrency: averageOrderValue,
      revenueByCurrency,
      averageOrderValueByCurrency,
      purchasedChannels,
      firstPurchaseAt: advertiser.firstPurchaseAt?.toISOString() ?? null,
      lastPurchaseAt: advertiser.lastPurchaseAt?.toISOString() ?? null,
      lastContactAt: advertiser.lastContactAt?.toISOString() ?? null,
      nextContactAt: advertiser.nextContactAt?.toISOString() ?? null,
      daysSinceLastPurchase: crmMetrics.daysSince(
        advertiser.lastPurchaseAt,
        now,
      ),
      recencyBucket,
      frequencyBucket,
      monetaryValue: safeMonetaryValue,
      isHighValue: monetaryBucket === 'HIGH',
      rfmSegment,
      priorityRank: priority.priorityRank,
      urgency: priority.urgency,
      nextOpenTask: nextOpenTask
        ? {
            id: nextOpenTask.id,
            title: nextOpenTask.title,
            dueAt: nextOpenTask.dueAt.toISOString(),
            priority: nextOpenTask.priority,
            type: nextOpenTask.type,
            status: nextOpenTask.status,
          }
        : null,
      lostReason: null,
      lostAt: null,
    };
  }

  private isUnspecifiedAdvertiser(advertiser: {
    displayName: string;
    companyName: string | null;
    telegramUsername: string | null;
    primaryContact: unknown | null;
  }) {
    return (
      advertiser.displayName.trim().toLowerCase() === 'advertiser' &&
      !advertiser.companyName &&
      !advertiser.telegramUsername &&
      !advertiser.primaryContact
    );
  }

  private async currentStatsByAdvertiser(
    workspaceId: string,
    advertisers: Array<{
      id: string;
      displayName: string;
      companyName: string | null;
      telegramUsername: string | null;
      contacts?: Array<unknown>;
    }>,
    now: Date,
  ) {
    const advertiserIds = advertisers.map((advertiser) => advertiser.id);
    if (!advertiserIds.length) return new Map<string, Partial<any>>();
    const unassignedAdvertiserId = advertisers.find((advertiser) =>
      this.isUnspecifiedAdvertiser({
        displayName: advertiser.displayName,
        companyName: advertiser.companyName,
        telegramUsername: advertiser.telegramUsername,
        primaryContact: advertiser.contacts?.[0] ?? null,
      }),
    )?.id;
    const advertiserIdByTelegram = new Map<string, string>();
    const ambiguousTelegramUsernames = new Set<string>();
    for (const advertiser of advertisers) {
      const username = crmMetrics.normalizeTelegramUsername(
        advertiser.telegramUsername,
      );
      if (!username) continue;
      if (advertiserIdByTelegram.has(username)) {
        ambiguousTelegramUsernames.add(username);
      } else {
        advertiserIdByTelegram.set(username, advertiser.id);
      }
    }
    for (const username of ambiguousTelegramUsernames) {
      advertiserIdByTelegram.delete(username);
    }
    const telegramUsernames = [...advertiserIdByTelegram.keys()];
    const telegramUsernameVariants = telegramUsernames.flatMap((username) => [
      username,
      `@${username}`,
    ]);
    const sales = await this.prisma.telegramAdSale.findMany({
      where: {
        workspaceId,
        OR: [
          { advertiserId: { in: advertiserIds } },
          ...(unassignedAdvertiserId || telegramUsernames.length
            ? [
                {
                  advertiserId: null,
                  ...(telegramUsernames.length
                    ? {
                        OR: [
                          {
                            advertiserTelegram: {
                              in: telegramUsernameVariants,
                              mode: 'insensitive' as const,
                            },
                          },
                          {
                            advertiserTelegramSnapshot: {
                              in: telegramUsernameVariants,
                              mode: 'insensitive' as const,
                            },
                          },
                          ...(unassignedAdvertiserId
                            ? [
                                {
                                  AND: [
                                    { advertiserTelegram: null },
                                    { advertiserTelegramSnapshot: null },
                                  ],
                                },
                              ]
                            : []),
                        ],
                      }
                    : {}),
                },
              ]
            : []),
        ],
        status: { not: TelegramAdSaleStatus.CANCELLED },
      },
      select: {
        advertiserId: true,
        advertiserName: true,
        advertiserNameSnapshot: true,
        advertiserTelegram: true,
        advertiserTelegramSnapshot: true,
        advertiserContact: true,
        advertiserCompanySnapshot: true,
        status: true,
        createdAt: true,
        placements: {
          select: {
            id: true,
            status: true,
            publishedAt: true,
            plannedDeleteAt: true,
            deletedAt: true,
            agreedPrice: true,
            telegramChannel: {
              select: { id: true, title: true, photoUrl: true },
            },
          },
        },
        payments: {
          where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
          select: {
            amount: true,
            currency: true,
            amountInPrimaryCurrency: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const stats = new Map<
      string,
      {
        totalSalesCount: number;
        paidSalesCount: number;
        completedSalesCount: number;
        totalPlacementsCount: number;
        completedPlacementsCount: number;
        totalRevenueInPrimaryCurrency: Prisma.Decimal;
        averageOrderValueInPrimaryCurrency: Prisma.Decimal;
        revenueByCurrency: Array<{ currency: string; amount: string }>;
        averageOrderValueByCurrency: Array<{
          currency: string;
          amount: string;
        }>;
        purchasedChannels: Array<{
          id: string;
          title: string;
          photoUrl: string | null;
        }>;
        firstPurchaseAt: Date | null;
        lastPurchaseAt: Date | null;
        hasActiveSale: boolean;
        hasActivePlacement: boolean;
        hasWaitingPlacement: boolean;
      }
    >();
    for (const sale of sales) {
      const snapshotTelegram = crmMetrics.normalizeTelegramUsername(
        sale.advertiserTelegramSnapshot ?? sale.advertiserTelegram,
      );
      const advertiserId =
        sale.advertiserId ??
        (snapshotTelegram
          ? advertiserIdByTelegram.get(snapshotTelegram)
          : null) ??
        (this.isAnonymousSaleSnapshot(sale) ? unassignedAdvertiserId : null);
      if (!advertiserId) continue;
      const current = stats.get(advertiserId) ?? {
        totalSalesCount: 0,
        paidSalesCount: 0,
        completedSalesCount: 0,
        totalPlacementsCount: 0,
        completedPlacementsCount: 0,
        totalRevenueInPrimaryCurrency: decimal(0),
        averageOrderValueInPrimaryCurrency: decimal(0),
        revenueByCurrency: [],
        averageOrderValueByCurrency: [],
        purchasedChannels: [],
        firstPurchaseAt: null,
        lastPurchaseAt: null,
        hasActiveSale: false,
        hasActivePlacement: false,
        hasWaitingPlacement: false,
      };
      current.totalSalesCount += 1;
      if (
        sale.status === TelegramAdSaleStatus.RESERVED ||
        sale.status === TelegramAdSaleStatus.CONFIRMED ||
        sale.status === TelegramAdSaleStatus.IN_PROGRESS
      ) {
        current.hasActiveSale = true;
      }
      const agreedTotal = sale.placements.reduce(
        (sum, placement) => sum.add(decimal(placement.agreedPrice ?? 0)),
        decimal(0),
      );
      const paidTotal = sale.payments.reduce(
        (sum, payment) => sum.add(decimal(payment.amount)),
        decimal(0),
      );
      if (
        agreedTotal.greaterThan(0) &&
        paidTotal.greaterThanOrEqualTo(agreedTotal)
      ) {
        current.paidSalesCount += 1;
      }
      current.totalPlacementsCount += sale.placements.length;
      current.hasActivePlacement ||= sale.placements.some(
        (placement) =>
          Boolean(placement.publishedAt) &&
          !placement.deletedAt &&
          placement.plannedDeleteAt != null &&
          placement.plannedDeleteAt.getTime() > now.getTime(),
      );
      current.hasWaitingPlacement ||= sale.placements.some(
        (placement) =>
          !placement.publishedAt &&
          (placement.status === TelegramAdPlacementStatus.DRAFT ||
            placement.status === TelegramAdPlacementStatus.RESERVED ||
            placement.status === TelegramAdPlacementStatus.SCHEDULED),
      );
      current.purchasedChannels = [
        ...new Map(
          [
            ...current.purchasedChannels,
            ...sale.placements
              .map((placement) => placement.telegramChannel)
              .filter(Boolean),
          ].map((channel) => [channel.id, channel] as const),
        ).values(),
      ].sort((left, right) => left.title.localeCompare(right.title));
      current.completedPlacementsCount += crmMetrics.completedPlacementsCount(
        sale.placements,
      );
      const completed =
        sale.status === TelegramAdSaleStatus.CONFIRMED ||
        sale.status === TelegramAdSaleStatus.IN_PROGRESS ||
        sale.status === TelegramAdSaleStatus.COMPLETED;
      if (completed) {
        current.completedSalesCount += 1;
        current.firstPurchaseAt ??= sale.createdAt;
        current.lastPurchaseAt = sale.createdAt;
      }
      current.totalRevenueInPrimaryCurrency =
        current.totalRevenueInPrimaryCurrency.add(
          sale.payments.reduce(
            (sum, payment) => sum.add(decimal(payment.amountInPrimaryCurrency)),
            decimal(0),
          ),
        );
      const nativeRevenue = new Map(
        current.revenueByCurrency.map((item) => [
          item.currency,
          decimal(item.amount),
        ]),
      );
      for (const payment of sale.payments) {
        const currency = payment.currency.trim().toUpperCase();
        nativeRevenue.set(
          currency,
          (nativeRevenue.get(currency) ?? decimal(0)).add(payment.amount),
        );
      }
      current.revenueByCurrency = [...nativeRevenue.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => ({
          currency,
          amount: decimalToString(amount) ?? '0',
        }));
      stats.set(advertiserId, current);
    }
    for (const value of stats.values()) {
      value.averageOrderValueInPrimaryCurrency = value.totalSalesCount
        ? value.totalRevenueInPrimaryCurrency.div(value.totalSalesCount)
        : decimal(0);
      value.averageOrderValueByCurrency = value.revenueByCurrency.map(
        ({ currency, amount }) => ({
          currency,
          amount: value.totalSalesCount
            ? (decimalToString(decimal(amount).div(value.totalSalesCount)) ??
              '0')
            : '0',
        }),
      );
    }
    return stats;
  }

  private isAnonymousSaleSnapshot(sale: {
    advertiserName: string;
    advertiserNameSnapshot: string | null;
    advertiserTelegram: string | null;
    advertiserTelegramSnapshot: string | null;
    advertiserContact: string | null;
    advertiserCompanySnapshot: string | null;
  }) {
    if (
      sale.advertiserTelegram?.trim() ||
      sale.advertiserTelegramSnapshot?.trim() ||
      sale.advertiserContact?.trim() ||
      sale.advertiserCompanySnapshot?.trim()
    ) {
      return false;
    }
    const name = (sale.advertiserNameSnapshot ?? sale.advertiserName)
      .trim()
      .toLowerCase();
    return [
      'advertiser',
      'direct sale',
      'telegram advertiser',
      'no client',
    ].includes(name);
  }

  private advertiserOrderBy(
    sortBy: TelegramAdCrmAdvertiserSortBy = 'PRIORITY',
    sortDirection: Prisma.SortOrder = 'desc',
  ): Prisma.TelegramAdvertiserOrderByWithRelationInput[] {
    const direction = sortDirection;
    if (sortBy === 'REVENUE') {
      return [{ totalRevenueInPrimaryCurrency: direction }, { id: direction }];
    }
    if (sortBy === 'RECENT_PURCHASE') {
      return [
        { lastPurchaseAt: { sort: direction, nulls: 'last' } },
        { id: direction },
      ];
    }
    if (sortBy === 'NAME') {
      return [{ displayName: direction }, { id: direction }];
    }
    if (sortBy === 'SALES') {
      return [{ totalSalesCount: direction }, { id: direction }];
    }
    return [
      {
        nextContactAt: {
          sort: direction === 'desc' ? 'asc' : 'desc',
          nulls: 'last',
        },
      },
      { totalRevenueInPrimaryCurrency: direction },
      { updatedAt: direction },
      { id: direction },
    ];
  }

  async listCrmAdvertisers(
    userId: string,
    query: TelegramAdvertisersQueryDto,
  ): Promise<TelegramAdCrmAdvertisersListResult> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const workspaceId = access.workspaceId;
    const pagination = normalizePagination(query);
    const search = query.search?.trim();
    const where: Prisma.TelegramAdvertiserWhereInput = {
      workspaceId,
      ...(query.archived === true
        ? { archivedAt: { not: null } }
        : query.archived === false
          ? { archivedAt: null }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.lifecycleStage ? { lifecycleStage: query.lifecycleStage } : {}),
      ...(query.ownerMemberId ? { ownerMemberId: query.ownerMemberId } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              {
                telegramUsername: {
                  contains:
                    crmMetrics.normalizeTelegramUsername(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: crmMetrics.normalizePhone(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: crmMetrics.normalizeEmail(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                contacts: {
                  some: {
                    normalizedValue: {
                      contains: search.toLowerCase(),
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    if (
      (await this.authorization.can(userId, 'adSales.crm.editOwn')) &&
      !(await this.authorization.can(userId, 'adSales.crm.editAny'))
    ) where.ownerMemberId = access.memberId;
    const crmSettings =
      await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
        where: { workspaceId },
        select: { highValueCustomerThreshold: true },
      });
    const highValueThreshold = Number(
      decimalToString(crmSettings?.highValueCustomerThreshold ?? decimal(0)) ??
        '0',
    );
    const direction = query.sortDirection === 'ASC' ? 'asc' : 'desc';
    let items: any[];
    let totalItems: number;
    if (query.sortBy === 'PRIORITY') {
      const unspecifiedWhere: Prisma.TelegramAdvertiserWhereInput = {
        displayName: { equals: 'Advertiser', mode: 'insensitive' },
        companyName: null,
        telegramUsername: null,
        contacts: { none: {} },
      };
      const regularWhere: Prisma.TelegramAdvertiserWhereInput = {
        AND: [where, { NOT: unspecifiedWhere }],
      };
      const fallbackWhere: Prisma.TelegramAdvertiserWhereInput = {
        AND: [where, unspecifiedWhere],
      };
      const [regularCount, fallbackCount] = await this.prisma.$transaction([
        this.prisma.telegramAdvertiser.count({ where: regularWhere }),
        this.prisma.telegramAdvertiser.count({ where: fallbackWhere }),
      ]);
      const regularTake = Math.max(
        0,
        Math.min(pagination.take, regularCount - pagination.skip),
      );
      const fallbackSkip = Math.max(0, pagination.skip - regularCount);
      const fallbackTake = pagination.take - regularTake;
      const [regularItems, fallbackItems] = await this.prisma.$transaction([
        this.prisma.telegramAdvertiser.findMany({
          where: regularWhere,
          select: this.crmAdvertiserSelect(),
          orderBy: this.advertiserOrderBy('PRIORITY', direction),
          skip: pagination.skip,
          take: regularTake,
        }),
        this.prisma.telegramAdvertiser.findMany({
          where: fallbackWhere,
          select: this.crmAdvertiserSelect(),
          orderBy: [{ id: 'asc' }],
          skip: fallbackSkip,
          take: fallbackTake,
        }),
      ]);
      items = [...regularItems, ...fallbackItems];
      totalItems = regularCount + fallbackCount;
    } else {
      [items, totalItems] = await this.prisma.$transaction([
        this.prisma.telegramAdvertiser.findMany({
          where,
          select: this.crmAdvertiserSelect(),
          orderBy: this.advertiserOrderBy(query.sortBy, direction),
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.telegramAdvertiser.count({ where }),
      ]);
    }
    const now = new Date();
    const currentStats = await this.currentStatsByAdvertiser(
      workspaceId,
      items,
      now,
    );
    return createPaginatedResponse(
      items.map((item) =>
        this.mapCrmAdvertiser(
          {
            ...item,
            ...(currentStats.get(item.id) ?? {}),
          },
          highValueThreshold,
          now,
        ),
      ),
      totalItems,
      pagination,
    );
  }
}
