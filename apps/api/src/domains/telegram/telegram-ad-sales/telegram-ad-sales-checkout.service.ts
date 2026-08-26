import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramAdCrmDealStage,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TransactionType,
} from '@prisma/client';
import {
  allocateTelegramAdSalesTotalPrice,
  type TelegramAdSale,
} from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceCategoriesService } from '../../finance/finance-categories/finance-categories.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { decimal, decimalOrNull } from './domain/decimal';
import { utcDateKey } from './domain/timezone';
import {
  CreateTelegramAdSaleCheckoutDto,
  CreateTelegramAdSaleCheckoutPaymentDto,
} from './dto';
import {
  assertTelegramAdPlacementConflictFree,
  telegramAdSalesAdvisoryLockKey,
} from './telegram-ad-sales-reservation';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

type CheckoutProduct = Prisma.TelegramAdProductGetPayload<
  Record<string, never>
>;
type CheckoutPost = { id: string; telegramChannelId: string };
type CheckoutNetwork = Prisma.TelegramChannelNetworkGetPayload<{
  include: { channels: { select: { telegramChannelId: true } } };
}>;
type CreatedPlacement = {
  id: string;
  telegramChannelId: string;
  agreedPrice: Prisma.Decimal;
};

export type TelegramAdSalesPaymentlessReservationInput = Omit<
  CreateTelegramAdSaleCheckoutDto,
  'payment'
> & {
  idempotencyKey: string;
  financeSkipped: true;
};

type TelegramAdSalesReservationInput = Omit<
  CreateTelegramAdSaleCheckoutDto,
  'payment'
> & {
  idempotencyKey?: string | null;
  financeSkipped?: boolean;
  payment?: CreateTelegramAdSaleCheckoutPaymentDto;
};

@Injectable()
export class TelegramAdSalesCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly financeCategoriesService: FinanceCategoriesService,
    private readonly logger: ApplicationLoggerService,
    private readonly responseCache: ResponseCacheService,
    private readonly salesService: TelegramAdSalesService,
  ) {}

  async create(
    userId: string,
    dto: CreateTelegramAdSaleCheckoutDto,
  ): Promise<TelegramAdSale> {
    return this.createReservation(userId, {
      ...dto,
      idempotencyKey: dto.payment.idempotencyKey,
      financeSkipped: false,
      payment: dto.payment,
    });
  }

  async reserveWithoutPayment(
    userId: string,
    dto: TelegramAdSalesPaymentlessReservationInput,
  ): Promise<TelegramAdSale> {
    return this.createReservation(userId, dto);
  }

  private async createReservation(
    userId: string,
    dto: TelegramAdSalesReservationInput,
  ): Promise<TelegramAdSale> {
    if (!dto.placements.length) {
      throw new BadRequestException('At least one placement is required');
    }
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const idempotencyKey = dto.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existingSale = await this.prisma.telegramAdSale.findFirst({
        where: { workspaceId, idempotencyKey },
        select: { id: true },
      });
      if (existingSale) {
        return (await this.salesService.getSale(
          userId,
          existingSale.id,
        )) as TelegramAdSale;
      }
    }
    if (dto.payment?.idempotencyKey) {
      const existing = await this.prisma.telegramAdSalePayment.findFirst({
        where: { workspaceId, idempotencyKey: dto.payment.idempotencyKey },
        select: { telegramAdSaleId: true },
      });
      if (existing) {
        return (await this.salesService.getSale(
          userId,
          existing.telegramAdSaleId,
        )) as TelegramAdSale;
      }
    }
    const payment = dto.payment;
    const paidAt = payment ? new Date(payment.paidAt) : null;
    const channelIds = [
      ...new Set(dto.placements.map((item) => item.telegramChannelId)),
    ];
    const productIds = [
      ...new Set(
        dto.placements.flatMap((item) =>
          item.telegramAdProductId ? [item.telegramAdProductId] : [],
        ),
      ),
    ];
    const postIds = [
      ...new Set(
        dto.placements.flatMap((item) =>
          item.telegramPostId ? [item.telegramPostId] : [],
        ),
      ),
    ];
    const networkIds = [
      ...new Set(
        dto.placements.flatMap((item) =>
          item.telegramChannelNetworkId ? [item.telegramChannelNetworkId] : [],
        ),
      ),
    ];
    const productsPromise: Promise<CheckoutProduct[]> = productIds.length
      ? this.prisma.telegramAdProduct.findMany({
          where: { id: { in: productIds }, workspaceId, isActive: true },
        })
      : Promise.resolve([]);
    const postsPromise: Promise<CheckoutPost[]> = postIds.length
      ? this.prisma.telegramPost.findMany({
          where: { id: { in: postIds }, workspaceId },
          select: { id: true, telegramChannelId: true },
        })
      : Promise.resolve([]);
    const networksPromise: Promise<CheckoutNetwork[]> = networkIds.length
      ? this.prisma.telegramChannelNetwork.findMany({
          where: { id: { in: networkIds }, workspaceId },
          include: { channels: { select: { telegramChannelId: true } } },
        })
      : Promise.resolve([]);
    const [
      workspace,
      account,
      channels,
      products,
      posts,
      networks,
      advertiser,
    ] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { primaryCurrency: true },
      }),
      payment
        ? this.prisma.account.findFirst({
            where: { id: payment.accountId, workspaceId, isActive: true },
          })
        : Promise.resolve(null),
      this.prisma.telegramChannel.findMany({
        where: { id: { in: channelIds }, workspaceId },
        select: { id: true, currentSubscribersCount: true },
      }),
      productsPromise,
      postsPromise,
      networksPromise,
      dto.advertiserId
        ? this.prisma.telegramAdvertiser.findFirst({
            where: { id: dto.advertiserId, workspaceId },
          })
        : Promise.resolve(null),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (payment && !account) throw new NotFoundException('Account not found');
    if (payment && account && account.currency !== payment.currency) {
      throw new BadRequestException(
        'Payment currency must match the selected account currency',
      );
    }
    if (channels.length !== channelIds.length) {
      throw new NotFoundException(
        'One or more Telegram channels were not found',
      );
    }
    if (dto.advertiserId && !advertiser) {
      throw new NotFoundException('Advertiser not found');
    }

    const productById = new Map(
      products.map((item) => [item.id, item] as const),
    );
    const postById = new Map(posts.map((item) => [item.id, item] as const));
    const networkById = new Map(
      networks.map((item) => [item.id, item] as const),
    );
    for (const placement of dto.placements) {
      const product = placement.telegramAdProductId
        ? productById.get(placement.telegramAdProductId)
        : null;
      if (
        placement.telegramAdProductId &&
        (!product || product.telegramChannelId !== placement.telegramChannelId)
      ) {
        throw new BadRequestException(
          'Telegram ad product does not belong to target channel',
        );
      }
      const post = placement.telegramPostId
        ? postById.get(placement.telegramPostId)
        : null;
      if (
        placement.telegramPostId &&
        (!post || post.telegramChannelId !== placement.telegramChannelId)
      ) {
        throw new BadRequestException(
          'Telegram post does not belong to target channel',
        );
      }
      const network = placement.telegramChannelNetworkId
        ? networkById.get(placement.telegramChannelNetworkId)
        : null;
      if (
        placement.telegramChannelNetworkId &&
        (!network ||
          !network.channels.some(
            (item) => item.telegramChannelId === placement.telegramChannelId,
          ))
      ) {
        throw new BadRequestException(
          'Selected network does not contain chosen channel',
        );
      }
    }

    let agreedPrices = dto.placements.map((placement) => placement.agreedPrice);
    if (dto.priceAllocation?.mode === 'PROPORTIONAL_BY_AUDIENCE') {
      if (
        payment &&
        Math.round(payment.amount * 100) !==
          Math.round(dto.priceAllocation.totalAmount * 100)
      ) {
        throw new BadRequestException(
          'Payment amount must equal the total placement price',
        );
      }
      const audienceByChannelId = new Map(
        channels.map((channel) => [
          channel.id,
          channel.currentSubscribersCount ?? 0,
        ]),
      );
      try {
        agreedPrices = allocateTelegramAdSalesTotalPrice(
          dto.priceAllocation.totalAmount,
          dto.placements.map((placement, index) => ({
            key: `${placement.telegramChannelId}:${index}`,
            weight: audienceByChannelId.get(placement.telegramChannelId) ?? 0,
          })),
        ).map((share) => share.amount);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Invalid total placement price',
        );
      }
    }

    const rate = payment
      ? await this.currencyConversionService.getRate(
          payment.currency,
          workspace.primaryCurrency,
          workspaceId,
          paidAt!,
        )
      : null;
    if (payment && !rate) {
      throw new BadRequestException(
        `No exchange rate from ${payment.currency} to ${workspace.primaryCurrency}`,
      );
    }
    if (payment) {
      await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    }
    const category = payment
      ? await this.prisma.transactionCategory.findFirst({
          where: { workspaceId, key: 'channel_advertising_revenue' },
        })
      : null;
    if (payment && !category)
      throw new NotFoundException('Advertising revenue category not found');

    const saleId = await this.prisma.$transaction(async (tx) => {
      let advertiserId = advertiser?.id ?? null;
      if (!advertiserId && dto.createAdvertiser) {
        const createdAdvertiser = await tx.telegramAdvertiser.create({
          data: {
            workspaceId,
            displayName: dto.advertiserName.trim(),
            companyName: dto.advertiserCompanyName?.trim() || null,
            telegramUsername: this.normalizeTelegramUsername(
              dto.advertiserTelegram,
            ),
            phone: this.normalizePhone(dto.advertiserContact),
            email: this.normalizeEmail(dto.advertiserContact),
            ownerMemberId: assignedMemberId,
            createdByUserId: userId,
            status: TelegramAdvertiserStatus.LEAD,
            lifecycleStage: TelegramAdvertiserLifecycleStage.NEW,
          },
        });
        advertiserId = createdAdvertiser.id;
      }
      const sale = await tx.telegramAdSale.create({
        data: {
          workspaceId,
          advertiserId,
          advertiserName: dto.advertiserName.trim(),
          advertiserTelegram: dto.advertiserTelegram?.trim() || null,
          advertiserContact: dto.advertiserContact?.trim() || null,
          advertiserNameSnapshot:
            advertiser?.displayName ?? dto.advertiserName.trim(),
          advertiserTelegramSnapshot:
            advertiser?.telegramUsername ??
            this.normalizeTelegramUsername(dto.advertiserTelegram),
          advertiserCompanySnapshot:
            advertiser?.companyName ??
            (dto.advertiserCompanyName?.trim() || null),
          origin: dto.origin,
          settlementCurrency: dto.settlementCurrency,
          idempotencyKey,
          financeSkipped: dto.financeSkipped === true && !payment,
          status: TelegramAdSaleStatus.RESERVED,
          crmDealStage: TelegramAdCrmDealStage.SLOT_RESERVED,
          createdByUserId: userId,
          assignedMemberId,
        },
      });
      if (advertiserId) {
        await tx.telegramAdvertiserActivity.create({
          data: {
            workspaceId,
            advertiserId,
            saleId: sale.id,
            actorUserId: userId,
            type: TelegramAdvertiserActivityType.SALE_CREATED,
            title: sale.advertiserName,
            metadata: Prisma.JsonNull,
            occurredAt: new Date(),
          },
        });
      }

      const createdPlacements: CreatedPlacement[] = [];
      for (const [inputIndex, input] of dto.placements.entries()) {
        const product = input.telegramAdProductId
          ? productById.get(input.telegramAdProductId)
          : null;
        const scheduledAt = new Date(input.scheduledAt);
        const placement = await tx.telegramAdSalePlacement.create({
          data: {
            workspaceId,
            telegramAdSaleId: sale.id,
            telegramChannelId: input.telegramChannelId,
            telegramChannelNetworkId: input.telegramChannelNetworkId ?? null,
            telegramAdProductId: product?.id ?? null,
            inventoryOpportunityKey:
              input.inventoryOpportunityKey?.trim() || null,
            status: TelegramAdPlacementStatus.DRAFT,
            scheduledAt,
            timezone: input.timezone,
            pricingMode:
              input.pricingMode ??
              product?.defaultPricingMode ??
              TelegramAdPricingMode.CPM,
            expectedViews: input.expectedViews ?? 0,
            recommendedPrice:
              decimalOrNull(input.recommendedPrice) ?? decimal(0),
            minimumPrice:
              decimalOrNull(input.minimumPrice) ??
              decimalOrNull(product?.minimumPrice) ??
              decimal(0),
            agreedPrice: decimal(agreedPrices[inputIndex]),
            currency: input.currency,
            topDurationMinutesSnapshot: product?.topDurationMinutes ?? null,
            feedDurationHoursSnapshot: product?.feedDurationHours ?? null,
            deleteAfterHoursSnapshot: product?.deleteAfterHours ?? null,
            isPermanentSnapshot: product?.isPermanent ?? false,
            manualPriceReason: input.manualPriceReason?.trim() || null,
            telegramPostId: input.telegramPostId ?? null,
          },
        });
        const lockKey = telegramAdSalesAdvisoryLockKey(
          input.telegramChannelId,
          utcDateKey(scheduledAt, input.timezone),
        );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
        await assertTelegramAdPlacementConflictFree(tx, {
          workspaceId,
          placementId: placement.id,
          channelId: input.telegramChannelId,
          scheduledAt,
          logger: this.logger,
        });
        await tx.telegramAdSalePlacement.update({
          where: { id: placement.id },
          data: { status: TelegramAdPlacementStatus.RESERVED },
        });
        createdPlacements.push(placement);
      }

      if (payment) {
        if (!account || !rate || !category || !paidAt) {
          throw new BadRequestException('Payment context is incomplete');
        }
        let remaining = payment.amount;
        const allocations: Array<{ placementId: string; amount: number }> = [];
        for (const placement of createdPlacements) {
          const allocated = Math.min(remaining, Number(placement.agreedPrice));
          if (allocated > 0)
            allocations.push({ placementId: placement.id, amount: allocated });
          remaining = Number((remaining - allocated).toFixed(2));
        }
        const transaction = await tx.transaction.create({
          data: {
            workspaceId,
            accountId: account.id,
            telegramChannelId:
              createdPlacements.length === 1
                ? createdPlacements[0].telegramChannelId
                : null,
            type: TransactionType.income,
            amount: decimal(payment.amount),
            currency: account.currency,
            amountInPrimaryCurrency: decimal(payment.amount * rate),
            exchangeRateToPrimary: decimal(rate),
            category: category.name,
            categoryId: category.id,
            description:
              payment.notes?.trim() || `Telegram ad sale payment ${sale.id}`,
            date: paidAt,
            assignedMemberId,
            createdByUserId: userId,
          },
        });
        await tx.telegramAdSalePayment.create({
          data: {
            workspaceId,
            telegramAdSaleId: sale.id,
            accountId: account.id,
            transactionId: transaction.id,
            amount: decimal(payment.amount),
            currency: payment.currency,
            amountInPrimaryCurrency: decimal(payment.amount * rate),
            exchangeRateToPrimary: decimal(rate),
            paidAt,
            notes: payment.notes?.trim() || null,
            status: TelegramAdSalePaymentStatus.ACTIVE,
            idempotencyKey: payment.idempotencyKey?.trim() || null,
            createdByUserId: userId,
            allocations: {
              create: allocations.map((allocation) => ({
                workspaceId,
                telegramAdSalePlacementId: allocation.placementId,
                amount: decimal(allocation.amount),
                currency: payment.currency,
                amountInPrimaryCurrency: decimal(allocation.amount * rate),
              })),
            },
          },
        });
      }
      return sale.id;
    });

    this.responseCache.clearByPrefix(
      `telegram-ad-sales:availability:${workspaceId}:`,
    );
    return (await this.salesService.getSale(userId, saleId)) as TelegramAdSale;
  }

  private normalizeTelegramUsername(value?: string | null) {
    return value?.trim().replace(/^@+/, '').toLowerCase() || null;
  }

  private normalizePhone(value?: string | null) {
    if (!value || value.includes('@')) return null;
    return value.trim().replace(/[^\d+]/g, '') || null;
  }

  private normalizeEmail(value?: string | null) {
    return value?.includes('@') ? value.trim().toLowerCase() : null;
  }
}
