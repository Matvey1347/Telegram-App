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
  TransactionType,
} from '@prisma/client';
import {
  allocateTelegramAdSalesTotalPrice,
  type TelegramAdSale,
  type TelegramAdSaleCheckoutWorkflowResponse,
} from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { runBounded } from '../../../common/run-bounded';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceCategoriesService } from '../../finance/finance-categories/finance-categories.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { notifyScheduledTaskDueWorkChanged } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { decimal, decimalOrNull } from './domain/decimal';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import {
  CreateTelegramAdSaleCheckoutDto,
  CreateTelegramAdSaleCheckoutPaymentDto,
} from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { TelegramAdvertiserCheckoutResolverService } from './telegram-advertiser-checkout-resolver.service';
import { TelegramAdSalesCustomerAutomationFactsService } from './telegram-ad-sales-customer-automation-facts.service';

type CheckoutProduct = Prisma.TelegramAdProductGetPayload<
  Record<string, never>
>;
type CheckoutPost = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
};
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
    private readonly advertiserResolver: TelegramAdvertiserCheckoutResolverService = new TelegramAdvertiserCheckoutResolverService(),
    private readonly automationFacts?: TelegramAdSalesCustomerAutomationFactsService,
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

  async createWorkflow(
    userId: string,
    dto: CreateTelegramAdSaleCheckoutDto,
    onProgress?: (
      item: { operation: string; message: string; placementId?: string },
      current: number,
      total: number,
    ) => void,
  ): Promise<TelegramAdSaleCheckoutWorkflowResponse> {
    const total =
      1 +
      dto.placements.filter((placement) => placement.managedPostDraft).length *
        2;
    let current = 0;
    const report = (item: {
      operation: string;
      message: string;
      placementId?: string;
    }) => onProgress?.(item, ++current, total);
    const sale = await this.create(userId, dto);
    report({ operation: 'CREATE_SALE', message: 'Sale and placements saved' });
    const placementByTarget = new Map(
      sale.placements.map((placement) => [
        `${placement.telegramChannelId}:${placement.scheduledAt}`,
        placement,
      ]),
    );
    const failures: TelegramAdSaleCheckoutWorkflowResponse['failures'] = [];
    const schedulePlacementIds: string[] = [];
    let successful = 1;
    let skipped = 0;

    await runBounded(dto.placements, 4, async (input) => {
      const managedPostDraft = input.managedPostDraft;
      if (!managedPostDraft) return;
      const placement = placementByTarget.get(
        `${input.telegramChannelId}:${input.scheduledAt}`,
      );
      if (!placement) {
        failures.push({
          placementId: '',
          channelId: input.telegramChannelId,
          operation: 'CREATE_POST',
          message: 'Reserved placement could not be matched',
        });
        skipped += 1;
        report({ operation: 'CREATE_POST', message: 'Post creation skipped' });
        report({ operation: 'SCHEDULE_POST', message: 'Scheduling skipped' });
        return;
      }
      if (placement.managedPostId) {
        skipped += 1;
        report({
          operation: 'CREATE_POST',
          placementId: placement.id,
          message: 'Post already exists',
        });
        if (!['SCHEDULED', 'PUBLISHED'].includes(placement.status)) {
          schedulePlacementIds.push(placement.id);
        } else {
          report({
            operation: 'SCHEDULE_POST',
            placementId: placement.id,
            message: 'Post already scheduled',
          });
        }
        return;
      }
      try {
        await this.salesService.createManagedPostFromPlacement(
          userId,
          sale.id,
          placement.id,
          {
            ...managedPostDraft,
            buttonRows: managedPostDraft.buttonRows ?? [],
          },
        );
        successful += 1;
        schedulePlacementIds.push(placement.id);
        report({
          operation: 'CREATE_POST',
          placementId: placement.id,
          message: 'Advertising post created',
        });
      } catch (error) {
        failures.push({
          placementId: placement.id,
          channelId: input.telegramChannelId,
          operation: 'CREATE_POST',
          message:
            error instanceof Error ? error.message : 'Could not create post',
        });
        skipped += 1;
        report({
          operation: 'CREATE_POST',
          placementId: placement.id,
          message: 'Post creation failed',
        });
        report({
          operation: 'SCHEDULE_POST',
          placementId: placement.id,
          message: 'Scheduling skipped',
        });
      }
    });
    if (schedulePlacementIds.length) {
      const scheduled = await this.salesService.scheduleSale(userId, sale.id, {
        placements: schedulePlacementIds.map((placementId) => ({
          placementId,
        })),
      });
      for (const result of scheduled.results) {
        const placement = sale.placements.find(
          (item) => item.id === result.placementId,
        );
        if (result.success) {
          successful += 1;
          report({
            operation: 'SCHEDULE_POST',
            placementId: String(result.placementId),
            message: 'Post scheduled',
          });
          continue;
        }
        failures.push({
          placementId: String(result.placementId),
          channelId: placement?.telegramChannelId ?? '',
          operation: 'SCHEDULE_POST',
          message:
            typeof result.error === 'string'
              ? result.error
              : 'Could not schedule post',
        });
        report({
          operation: 'SCHEDULE_POST',
          placementId: String(result.placementId),
          message: 'Post scheduling failed',
        });
      }
    }
    return {
      sale: (await this.salesService.getSale(
        userId,
        sale.id,
      )) as TelegramAdSale,
      summary: {
        total,
        successful,
        failed: failures.length,
        skipped,
      },
      failures,
    };
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
          select: { id: true, telegramChannelId: true, postDate: true },
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
      try {
        agreedPrices = allocateTelegramAdSalesTotalPrice(
          dto.priceAllocation.totalAmount,
          dto.placements.map((placement, index) => ({
            key: `${placement.telegramChannelId}:${index}`,
            // recommendedPrice is the quote value after expected views and CPM
            // (or fixed pricing) have both been applied.
            weight: placement.recommendedPrice,
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

    const automationEligibleAt = new Date();
    const saleId = await this.prisma.$transaction(async (tx) => {
      const resolvedAdvertiser = await this.advertiserResolver.resolve(
        tx,
        dto,
        {
          workspaceId,
          userId,
          ownerMemberId: assignedMemberId,
          selected: advertiser,
        },
      );
      const advertiserId = resolvedAdvertiser?.id ?? null;
      const sale = await tx.telegramAdSale.create({
        data: {
          workspaceId,
          advertiserId,
          advertiserName: dto.advertiserName.trim(),
          advertiserTelegram: dto.advertiserTelegram?.trim() || null,
          advertiserContact: dto.advertiserContact?.trim() || null,
          advertiserNameSnapshot:
            resolvedAdvertiser?.displayName ?? dto.advertiserName.trim(),
          advertiserTelegramSnapshot:
            resolvedAdvertiser?.telegramUsername ??
            this.normalizeTelegramUsername(dto.advertiserTelegram),
          advertiserCompanySnapshot:
            resolvedAdvertiser?.companyName ??
            (dto.advertiserCompanyName?.trim() || null),
          origin: dto.origin,
          settlementCurrency: dto.settlementCurrency,
          idempotencyKey,
          financeSkipped: dto.financeSkipped === true && !payment,
          status: TelegramAdSaleStatus.RESERVED,
          crmDealStage: TelegramAdCrmDealStage.SLOT_RESERVED,
          createdByUserId: userId,
          assignedMemberId,
          customerAutomationEligibleAt: automationEligibleAt,
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
        const linkedPublishedAt = input.telegramPostId
          ? (postById.get(input.telegramPostId)?.postDate ?? null)
          : null;
        const plannedDeleteAt = linkedPublishedAt
          ? calculateAdPlacementDeleteAt({
              scheduledAt,
              publishedAt: linkedPublishedAt,
              deleteAfterHoursSnapshot: product?.deleteAfterHours ?? null,
              isPermanentSnapshot: product?.isPermanent ?? false,
            })
          : null;
        const placement = await tx.telegramAdSalePlacement.create({
          data: {
            workspaceId,
            telegramAdSaleId: sale.id,
            telegramChannelId: input.telegramChannelId,
            telegramChannelNetworkId: input.telegramChannelNetworkId ?? null,
            telegramAdProductId: product?.id ?? null,
            inventoryOpportunityKey:
              input.inventoryOpportunityKey?.trim() || null,
            status: linkedPublishedAt
              ? TelegramAdPlacementStatus.PUBLISHED
              : TelegramAdPlacementStatus.DRAFT,
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
            publishedAt: linkedPublishedAt,
            plannedDeleteAt,
          },
        });
        await tx.telegramAdSalePlacement.update({
          where: { id: placement.id },
          data: {
            status: linkedPublishedAt
              ? TelegramAdPlacementStatus.PUBLISHED
              : TelegramAdPlacementStatus.RESERVED,
          },
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

    await this.automationFacts?.dealCreated(
      workspaceId,
      saleId,
      automationEligibleAt,
    );

    this.responseCache.clearByPrefix(
      `telegram-ad-sales:availability:${workspaceId}:`,
    );
    if (postIds.length) {
      notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
    }
    return (await this.salesService.getSale(userId, saleId)) as TelegramAdSale;
  }

  private normalizeTelegramUsername(value?: string | null) {
    return value?.trim().replace(/^@+/, '').toLowerCase() || null;
  }
}
