import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS } from '@telegram-system/shared';
import {
  Prisma,
  TelegramAdCrmDealStage,
  TelegramAdSalePaymentStatus,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleOrigin,
  TelegramAdSaleStatus,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
  TelegramAdSlotStrategy,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
  TelegramCrmContactStage,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TransactionType,
  WorkspaceRole,
} from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { runBounded } from '../../../common/run-bounded';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { adDeletionReadyWhere } from '../../operations/scheduled-tasks/due-work-predicates';
import { notifyScheduledTaskDueWorkChanged } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { FinanceCategoriesService } from '../../finance/finance-categories/finance-categories.service';
import { TelegramManagedPostCommandService } from '../telegram-channels/telegram-managed-post-command.service';
import {
  legacyAdvertiserLifecycleStage,
  legacyAdvertiserFilter,
  legacyAdvertiserStatus,
  stageFromLegacyAdvertiser,
} from '../telegram-crm/telegram-crm-legacy-compatibility';
import { syncLegacyCrmPeer } from '../telegram-crm/telegram-crm-legacy-peer';
import {
  telegramAdvertiserCompatibilityInclude,
  telegramAdvertiserInclude,
} from './telegram-ad-sales-advertiser-read-model';
import { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
import { TelegramManagedPostRemoteSyncService } from '../telegram-channels/telegram-managed-post-remote-sync.service';
import { TelegramPostGroupsService } from '../telegram-channels/telegram-post-groups.service';
import { TelegramChannelAccessService } from '../telegram-channels/telegram-channel-access.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import {
  buildStableTelegramPostUrl,
  parseTelegramPostUrl,
} from '../../../telegram/shared/telegram-post-url';
import {
  AttachPlacementManagedPostDto,
  TelegramAdAlertsQueryDto,
  TelegramAdAnalyticsQueryDto,
  TelegramAdAnalyticsSeriesQueryDto,
  TelegramAdInventoryDetailsQueryDto,
  TelegramAdInventoryRebuildDto,
  TelegramAdNetworkAnalyticsQueryDto,
  TelegramAdPriceFillCorrelationQueryDto,
  TelegramAdRevenueScenarioDto,
  CancelPlacementDto,
  CompletePermanentPlacementDto,
  CreateTelegramAdProductDto,
  CreateTelegramAdQuoteDto,
  CreateTelegramAdvertiserActivityDto,
  CreateTelegramAdvertiserContactDto,
  CreateTelegramAdvertiserDto,
  CreateTelegramAdSaleDto,
  CreateTelegramAdSalePlacementDto,
  CreateTelegramAdSalePaymentDto,
  CreateTelegramAdvertiserTaskDto,
  CreatePlacementManagedPostDto,
  PublishPlacementDto,
  RecommendTelegramAdPolicyDto,
  ReserveTelegramAdSaleDto,
  ReschedulePlacementDto,
  RetryPlacementDeletionDto,
  SchedulePlacementDto,
  ScheduleSaleDto,
  TelegramAdAvailabilityQueryDto,
  TelegramAdPriceHistoryQueryDto,
  TelegramAdProductsQueryDto,
  TelegramAdSalesQueryDto,
  TelegramAdvertiserActivitiesQueryDto,
  TelegramAdvertiserSearchDto,
  TelegramAdvertiserTasksQueryDto,
  TelegramAdvertisersQueryDto,
  CompleteTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  UpdateTelegramAdChannelPricingDto,
  UpdateTelegramAdSalesMemberPreferencesDto,
  UpdateTelegramAdSalesWorkspaceSettingsDto,
  UpdateTelegramAdSalePaymentDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
  UpdateTelegramAdvertiserTaskDto,
  UpdateTelegramAdPolicyDto,
  UpdateTelegramAdProductDto,
  UpdateTelegramAdSaleDto,
  UpdateTelegramAdSalePlacementDto,
  VoidTelegramAdSalePaymentDto,
} from './dto';
import { recommendPolicyFromOrganicPosts } from './domain/policy-recommendation';
import { decimal, decimalOrNull, decimalToString } from './domain/decimal';
import { ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES } from './telegram-ad-sales-reservation';
import { reconcileTelegramAdPlacementMetrics } from './telegram-ad-placement-metrics';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import {
  isTelegramMessageAlreadyAbsent,
  resolveAdPlacementDeletionMessageIds,
  selectAdPlacementDeletionSource,
} from './domain/deletion-source';
import {
  pricingSettingsForChannel,
  pricingWindowSummary,
  TelegramAdSalesPricingReader,
} from './telegram-ad-sales-pricing-reader';
import { TelegramAdSalesAvailabilityReader } from './telegram-ad-sales-availability-reader';
import {
  summarizeAdSalesInventory,
  TelegramAdSalesInventoryReader,
} from './telegram-ad-sales-inventory-reader';
import {
  AdSalesAnalyticsDatasetParams,
  TelegramAdSalesAnalyticsDatasetReader,
} from './telegram-ad-sales-analytics-dataset-reader';
import {
  bucketAdSalesAnalyticsDate,
  endOfUtcDay,
  listUtcDatesInRange,
  resolveAdSalesAnalyticsRange,
  selectedAdSalesAnalyticsChannelIds,
  startOfUtcDay,
  sumAdSalesPaidAllocations,
} from './telegram-ad-sales-analytics-utils';
import {
  buildAdSalesAnalyticsSummary,
  buildAdSalesRevenueSeries,
} from './telegram-ad-sales-analytics-summary';
import {
  buildAdSalesAnalyticsAlerts,
  buildAdSalesInventoryAnalytics,
} from './telegram-ad-sales-analytics-inventory-alerts';
import { buildAdSalesChannelAnalytics } from './telegram-ad-sales-channel-analytics';
import {
  loadAdSalesProductsForChannelsWithDefaults,
  materializeDefaultAdSalesProducts,
  normalizeDefaultAdSalesProductName,
  TELEGRAM_AD_SALES_DEFAULT_PRODUCTS,
} from './telegram-ad-sales-default-products';
import {
  findOrCreateAdSalesWorkspaceSettings,
  mapAdSalesWorkspaceSettings,
} from './telegram-ad-sales-workspace-settings';
import { TelegramAdSalesSaleReadService } from './telegram-ad-sales-sale-read.service';
import { TelegramAdSalesCustomerAutomationFactsService } from './telegram-ad-sales-customer-automation-facts.service';
import {
  assertNoActiveSalePayments,
  cancelAdSaleRecords,
  deleteAdSaleRecords,
  isDedicatedSaleCancellation,
} from './telegram-ad-sales-lifecycle-records';
import { hydrateManagedTelegramPosts } from './telegram-ad-sales-managed-post-metrics';

@Injectable()
export class TelegramAdSalesService {
  private readonly pricingReader: TelegramAdSalesPricingReader;
  private readonly availabilityReader: TelegramAdSalesAvailabilityReader;
  private readonly inventoryReader: TelegramAdSalesInventoryReader;
  private readonly analyticsDatasetReader: TelegramAdSalesAnalyticsDatasetReader;
  private readonly saleReadService: TelegramAdSalesSaleReadService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly logger: ApplicationLoggerService,
    private readonly responseCache: ResponseCacheService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly financeCategoriesService: FinanceCategoriesService,
    private readonly telegramManagedPostCommandService: TelegramManagedPostCommandService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
    private readonly telegramManagedPostRemoteSyncService: TelegramManagedPostRemoteSyncService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramBotApiClient: TelegramBotApiClient,
    private readonly automationFacts?: TelegramAdSalesCustomerAutomationFactsService,
  ) {
    this.pricingReader = new TelegramAdSalesPricingReader(prisma);
    this.inventoryReader = new TelegramAdSalesInventoryReader(
      prisma,
      this.pricingReader,
    );
    this.analyticsDatasetReader = new TelegramAdSalesAnalyticsDatasetReader(
      prisma,
    );
    this.saleReadService = new TelegramAdSalesSaleReadService(
      prisma,
      workspaceService,
    );
    this.availabilityReader = new TelegramAdSalesAvailabilityReader(
      prisma,
      this.pricingReader,
      (workspaceId, sales) =>
        hydrateManagedTelegramPosts(this.prisma, workspaceId, sales),
    );
  }

  private availabilityCacheKey(params: {
    workspaceId: string;
    channelIds: string[];
    networkId?: string | null;
    productIds?: string[];
    from: string;
    to: string;
    cacheBust?: string;
  }) {
    return [
      'telegram-ad-sales',
      'availability',
      params.workspaceId,
      params.from,
      params.to,
      params.networkId ?? 'all-networks',
      [...params.channelIds].sort().join(','),
      [...(params.productIds ?? [])].sort().join(',') || 'all-products',
      params.cacheBust ?? 'cached',
    ].join(':');
  }

  private invalidateAvailabilityCache(workspaceId: string) {
    this.responseCache.clearByPrefix(
      `telegram-ad-sales:availability:${workspaceId}:`,
    );
  }

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private async findWorkspaceChannel(workspaceId: string, channelId: string) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      include: {
        timePosts: { orderBy: [{ position: 'asc' }, { time: 'asc' }] },
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return channel;
  }

  private async findWorkspaceNetwork(workspaceId: string, networkId: string) {
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      include: { channels: true },
    });
    if (!network)
      throw new NotFoundException('Telegram channel network not found');
    return network;
  }

  private async findSale(workspaceId: string, id: string) {
    const sale = await this.prisma.telegramAdSale.findFirst({
      where: { id, workspaceId },
      include: {
        placements: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException('Telegram ad sale not found');
    return sale;
  }

  private mapProduct(product: any) {
    return {
      ...product,
      defaultCpm: decimalToString(product.defaultCpm),
      defaultFixedPrice: decimalToString(product.defaultFixedPrice),
      minimumPrice: decimalToString(product.minimumPrice),
      estimatedPrice: decimalToString(product.estimatedPrice),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private mapPolicy(policy: any) {
    return {
      ...policy,
      expectedOrganicPostsPerDay: decimalToString(
        policy.expectedOrganicPostsPerDay,
      ),
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  private mapSnapshot(snapshot: any) {
    return {
      ...snapshot,
      averageViews: decimalToString(snapshot.averageViews),
      medianViews: decimalToString(snapshot.medianViews),
      adjustedViews: decimalToString(snapshot.adjustedViews),
      targetCpm: decimalToString(snapshot.targetCpm),
      minimumCpm: decimalToString(snapshot.minimumCpm),
      recommendedPrice: decimalToString(snapshot.recommendedPrice),
      minimumPrice: decimalToString(snapshot.minimumPrice),
      calculatedAt: snapshot.calculatedAt.toISOString(),
      createdAt: snapshot.createdAt.toISOString(),
    };
  }

  private mapPlacement(placement: any) {
    const hasLifecyclePolicy =
      placement.isPermanentSnapshot ||
      placement.deleteAfterHoursSnapshot != null;
    const effectivePlannedDeleteAt = calculateAdPlacementDeleteAt({
      scheduledAt: placement.scheduledAt,
      publishedAt: placement.publishedAt,
      deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
      isPermanentSnapshot: placement.isPermanentSnapshot,
    });
    return {
      ...placement,
      telegramPostUrl:
        placement.managedPost?.telegramMessageUrls?.[0] ??
        buildStableTelegramPostUrl({
          telegramChatId: placement.telegramChannel?.telegramChatId,
          messageId: placement.telegramPost?.telegramMessageId,
        }),
      quotedCpm: decimalToString(placement.quotedCpm),
      recommendedPrice: decimalToString(placement.recommendedPrice),
      minimumPrice: decimalToString(placement.minimumPrice),
      agreedPrice: decimalToString(placement.agreedPrice),
      actualCpm: decimalToString(placement.actualCpm),
      scheduledAt: placement.scheduledAt.toISOString(),
      scheduledManagedAt: placement.scheduledManagedAt?.toISOString() ?? null,
      publishedAt: placement.publishedAt?.toISOString() ?? null,
      plannedDeleteAt: hasLifecyclePolicy
        ? (effectivePlannedDeleteAt?.toISOString() ?? null)
        : (placement.plannedDeleteAt?.toISOString() ?? null),
      deletedAt: placement.deletedAt?.toISOString() ?? null,
      lastDeletionAttemptAt:
        placement.lastDeletionAttemptAt?.toISOString() ?? null,
      completedAt: placement.completedAt?.toISOString() ?? null,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
      paidAllocatedAmount: decimalToString(placement.paidAllocatedAmount),
      unpaidAmount: decimalToString(placement.unpaidAmount),
      underpricingAmount: decimalToString(placement.underpricingAmount),
      underpricingPercent: decimalToString(placement.underpricingPercent),
    };
  }

  private mapPayment(payment: any) {
    return {
      ...payment,
      amount: decimalToString(payment.amount),
      amountInPrimaryCurrency: decimalToString(payment.amountInPrimaryCurrency),
      exchangeRateToPrimary: decimalToString(payment.exchangeRateToPrimary),
      paidAt: payment.paidAt.toISOString(),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      allocations: Array.isArray(payment.allocations)
        ? payment.allocations.map((allocation: any) => ({
            ...allocation,
            amount: decimalToString(allocation.amount),
            amountInPrimaryCurrency: decimalToString(
              allocation.amountInPrimaryCurrency,
            ),
            createdAt: allocation.createdAt.toISOString(),
          }))
        : [],
    };
  }

  private mapSale(sale: any) {
    const detailed = this.buildSaleSummary(sale);
    return {
      ...sale,
      assignedMember: sale.assignedMember
        ? {
            id: sale.assignedMember.id,
            name:
              sale.assignedMember.user?.name ||
              sale.assignedMember.telegramUsername ||
              sale.assignedMember.user?.email ||
              'Workspace member',
            email: sale.assignedMember.user?.email ?? null,
            avatarPresentation: iconToResolvedEmoji(
              sale.assignedMember.avatarIcon,
            ),
          }
        : null,
      reservedUntil: sale.reservedUntil?.toISOString() ?? null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      placements: detailed.placements.map((placement: any) =>
        this.mapPlacement(placement),
      ),
      payments: detailed.payments.map((payment: any) =>
        this.mapPayment(payment),
      ),
      advertiser: sale.advertiser ? this.mapAdvertiser(sale.advertiser) : null,
      ...detailed.summary,
    };
  }

  private normalizeTelegramUsername(value?: string | null) {
    const normalized = value?.trim().replace(/^@+/, '').toLowerCase() || '';
    return normalized || null;
  }

  private normalizePhone(value?: string | null) {
    const normalized = value?.trim().replace(/[^\d+]/g, '') || '';
    return normalized || null;
  }

  private normalizeEmail(value?: string | null) {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized || null;
  }

  private normalizeWebsite(value?: string | null) {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized || null;
  }

  private normalizeContactValue(
    type: TelegramAdvertiserContactType,
    value?: string | null,
  ) {
    if (type === TelegramAdvertiserContactType.TELEGRAM_USERNAME) {
      return this.normalizeTelegramUsername(value);
    }
    if (type === TelegramAdvertiserContactType.PHONE) {
      return this.normalizePhone(value);
    }
    if (type === TelegramAdvertiserContactType.EMAIL) {
      return this.normalizeEmail(value);
    }
    if (type === TelegramAdvertiserContactType.WEBSITE) {
      return this.normalizeWebsite(value);
    }
    return value?.trim() || null;
  }

  private mapAdvertiserContact(contact: any) {
    return {
      ...contact,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  private mapAdvertiserActivity(activity: any) {
    return {
      ...activity,
      occurredAt: activity.occurredAt.toISOString(),
      createdAt: activity.createdAt.toISOString(),
    };
  }

  private mapAdvertiserTask(task: any) {
    return {
      ...task,
      dueAt: task.dueAt.toISOString(),
      remindAt: task.remindAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      skippedAt: task.skippedAt?.toISOString() ?? null,
      snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private mapAdvertiser(settings: any) {
    const { stage, crmPeers, _count, ...legacySettings } = settings;
    const hasActiveDeal = Number(_count?.sales ?? 0) > 0;
    return {
      ...legacySettings,
      telegramUserId: crmPeers?.[0]?.telegramUserId ?? null,
      status: legacyAdvertiserStatus(stage, hasActiveDeal),
      lifecycleStage: legacyAdvertiserLifecycleStage(stage),
      totalRevenueInPrimaryCurrency: decimalToString(
        settings.totalRevenueInPrimaryCurrency,
      ),
      averageOrderValueInPrimaryCurrency: decimalToString(
        settings.averageOrderValueInPrimaryCurrency,
      ),
      lastContactAt: settings.lastContactAt?.toISOString() ?? null,
      lastPurchaseAt: settings.lastPurchaseAt?.toISOString() ?? null,
      nextContactAt: settings.nextContactAt?.toISOString() ?? null,
      firstPurchaseAt: settings.firstPurchaseAt?.toISOString() ?? null,
      repeatCustomerAt: settings.repeatCustomerAt?.toISOString() ?? null,
      archivedAt: settings.archivedAt?.toISOString() ?? null,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
      contacts: Array.isArray(settings.contacts)
        ? settings.contacts.map((contact: any) =>
            this.mapAdvertiserContact(contact),
          )
        : undefined,
      recentActivities: Array.isArray(settings.activities)
        ? settings.activities.map((activity: any) =>
            this.mapAdvertiserActivity(activity),
          )
        : undefined,
      openTasks: Array.isArray(settings.tasks)
        ? settings.tasks.map((task: any) => this.mapAdvertiserTask(task))
        : undefined,
      sales: Array.isArray(settings.sales)
        ? settings.sales.map((sale: any) => this.mapSale(sale))
        : undefined,
    };
  }

  private policyDefaults(timezone: string) {
    return {
      timezone,
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: true,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 999,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
      fallbackSlotTimes: [],
      allowManualSlots: false,
    };
  }

  private mapAdSalesMemberPreferences(preferences: any) {
    return {
      ...preferences,
      createdAt: preferences.createdAt.toISOString(),
      updatedAt: preferences.updatedAt.toISOString(),
    };
  }

  private async resolveWorkspaceTimezone(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    return workspace.timezone || 'Europe/Warsaw';
  }

  private async resolvePolicy(
    workspaceId: string,
    channelId: string,
    timezone = 'UTC',
  ) {
    const policy = await this.prisma.telegramAdSchedulePolicy.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
    });
    const workspaceSettings = await findOrCreateAdSalesWorkspaceSettings(
      this.prisma,
      workspaceId,
    );
    if (policy) {
      return policy.useWorkspaceDefault
        ? {
            ...policy,
            organicPostsPerAdSlot:
              workspaceSettings.defaultOrganicPostsPerAdSlot,
          }
        : policy;
    }
    return {
      id: 'virtual',
      workspaceId,
      telegramChannelId: channelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...this.policyDefaults(timezone),
      organicPostsPerAdSlot: workspaceSettings.defaultOrganicPostsPerAdSlot,
    };
  }

  async getChannelBaseline(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(workspaceId, channelId);
    const sources = await this.pricingReader.sourcesForChannels(workspaceId, [
      channel,
    ]);
    const source = sources.get(channelId)!;
    const baseline = this.pricingReader.expectedViews(source, null);
    const h24 = this.pricingReader.expectedViews(source, 24);
    const h48 = this.pricingReader.expectedViews(source, 48);
    const h72 = this.pricingReader.expectedViews(source, 72);
    const d7 = this.pricingReader.expectedViews(source, 168);
    return {
      channelId,
      expectedViews: baseline.expectedViews,
      averageViews: baseline.averageViews,
      medianViews: baseline.medianViews,
      adjustedViews: baseline.adjustedViews,
      postsSampleCount: baseline.postsSampleCount,
      methodVersion: baseline.methodVersion,
      dataQuality: baseline.dataQuality,
      warnings: baseline.warnings,
      fallbackSource: baseline.fallbackSource,
      sample: baseline.sample.map((item) => ({
        ...item,
        date: item.date.toISOString(),
      })),
      pricing: pricingSettingsForChannel(channel),
      windows: {
        final: pricingWindowSummary(baseline),
        h24: pricingWindowSummary(h24),
        h48: pricingWindowSummary(h48),
        h72: pricingWindowSummary(h72),
        d7: pricingWindowSummary(d7),
      },
    };
  }

  async getChannelSetup(userId: string, channelId: string) {
    const [baseline, policy, products] = await Promise.all([
      this.getChannelBaseline(userId, channelId),
      this.getPolicy(userId, channelId),
      this.listChannelProducts(userId, channelId),
    ]);
    return { baseline, policy, products };
  }

  async updateChannelPricing(
    userId: string,
    channelId: string,
    dto: UpdateTelegramAdChannelPricingDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const channel = await this.prisma.telegramChannel.update({
      where: { id: channelId },
      data: {
        ...(dto.baseCpm === undefined
          ? {}
          : { adBaseCpm: decimalOrNull(dto.baseCpm) }),
        ...(dto.currency === undefined ? {} : { adBaseCurrency: dto.currency }),
      },
      select: {
        id: true,
        adBaseCpm: true,
        adBaseCurrency: true,
        updatedAt: true,
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return pricingSettingsForChannel(channel);
  }

  private async ensurePlacementBelongsToSale(
    workspaceId: string,
    saleId: string,
    placementId: string,
  ) {
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: {
        id: placementId,
        workspaceId,
        telegramAdSaleId: saleId,
      },
    });
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    return placement;
  }

  private async resolvePrimaryCurrency(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace.primaryCurrency;
  }

  private async resolveRateToPrimary(
    workspaceId: string,
    fromCurrency: string,
    paidAt: Date,
  ) {
    const primaryCurrency = await this.resolvePrimaryCurrency(workspaceId);
    const rate = await this.currencyConversionService.getRate(
      fromCurrency,
      primaryCurrency,
      workspaceId,
      paidAt,
    );
    if (!rate) {
      throw new BadRequestException(
        `No exchange rate from ${fromCurrency} to ${primaryCurrency}`,
      );
    }
    return { primaryCurrency, rate };
  }

  private async resolveSystemCategory(
    workspaceId: string,
    key: 'channel_advertising_revenue' | 'telegram_ad_sales_reversal',
  ) {
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    const category = await this.prisma.transactionCategory.findFirst({
      where: { workspaceId, key },
    });
    if (!category) throw new NotFoundException(`Category ${key} not found`);
    return category;
  }

  private includeSaleRelations() {
    return {
      advertiser: {
        include: telegramAdvertiserCompatibilityInclude,
      },
      placements: {
        orderBy: { scheduledAt: 'asc' as const },
        include: {
          telegramChannel: {
            select: { telegramChatId: true, username: true },
          },
          paymentAllocations: {
            include: { payment: true },
          },
          managedPost: {
            select: {
              id: true,
              title: true,
              text: true,
              imageUrls: true,
              buttonRows: true,
              telegramChannelId: true,
              sourceType: true,
              sourceId: true,
              status: true,
              telegramRemoteStatus: true,
              telegramScheduledMessageIds: true,
              telegramMessageIds: true,
              telegramMessageUrls: true,
              publishedAt: true,
              scheduledAt: true,
              lastError: true,
            },
          },
          telegramPost: {
            select: {
              id: true,
              telegramMessageId: true,
              viewsCount: true,
              forwardsCount: true,
              reactionsCount: true,
              commentsCount: true,
              postDate: true,
            },
          },
        },
      },
      payments: {
        orderBy: { paidAt: 'asc' as const },
        include: {
          allocations: true,
          account: {
            select: {
              id: true,
              name: true,
              currency: true,
            },
          },
          transaction: {
            select: {
              id: true,
              date: true,
              amount: true,
              type: true,
              category: true,
            },
          },
          reversalTransaction: {
            select: {
              id: true,
              date: true,
              amount: true,
              type: true,
              category: true,
            },
          },
        },
      },
    };
  }

  private paymentStatusFromTotals(
    totalPaid: Prisma.Decimal,
    totalAgreed: Prisma.Decimal,
  ) {
    if (totalPaid.eq(0)) return 'UNPAID';
    if (totalPaid.lt(totalAgreed)) return 'PARTIALLY_PAID';
    if (totalPaid.eq(totalAgreed)) return 'PAID';
    return 'OVERPAID';
  }

  private advertiserInclude() {
    return telegramAdvertiserInclude(this.includeSaleRelations());
  }

  private async getAdvertiser(workspaceId: string, advertiserId: string) {
    const advertiser = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: advertiserId, workspaceId },
      include: this.advertiserInclude(),
    });
    if (!advertiser)
      throw new NotFoundException('Telegram advertiser not found');
    return advertiser;
  }

  private async createAdvertiserActivity(
    workspaceId: string,
    advertiserId: string,
    payload: {
      type: TelegramAdvertiserActivityType;
      title: string;
      description?: string | null;
      saleId?: string | null;
      placementId?: string | null;
      taskId?: string | null;
      actorUserId?: string | null;
      actorMemberId?: string | null;
      metadata?: Prisma.InputJsonValue | null;
      occurredAt?: Date;
    },
  ) {
    return this.prisma.telegramAdvertiserActivity.create({
      data: {
        workspaceId,
        advertiserId,
        saleId: payload.saleId ?? null,
        placementId: payload.placementId ?? null,
        taskId: payload.taskId ?? null,
        actorUserId: payload.actorUserId ?? null,
        actorMemberId: payload.actorMemberId ?? null,
        type: payload.type,
        title: payload.title,
        description: payload.description ?? null,
        metadata: payload.metadata ?? Prisma.JsonNull,
        occurredAt: payload.occurredAt ?? new Date(),
      },
    });
  }

  private async recalculateAdvertiserStats(
    workspaceId: string,
    advertiserId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const sales = await tx.telegramAdSale.findMany({
      where: {
        workspaceId,
        advertiserId,
        status: { not: TelegramAdSaleStatus.CANCELLED },
      },
      include: {
        placements: true,
        payments: {
          where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const totalSalesCount = sales.length;
    const completedSales = sales.filter(
      (sale) =>
        sale.status === TelegramAdSaleStatus.CONFIRMED ||
        sale.status === TelegramAdSaleStatus.IN_PROGRESS ||
        sale.status === TelegramAdSaleStatus.COMPLETED,
    );
    const completedSalesCount = completedSales.length;
    const customerSales = sales.filter((sale) => {
      if (completedSales.includes(sale)) return true;
      const agreedTotal = sale.placements.reduce(
        (sum, placement) => sum.add(decimal(placement.agreedPrice ?? 0)),
        decimal(0),
      );
      const paidTotal = sale.payments.reduce(
        (sum, payment) => sum.add(decimal(payment.amount)),
        decimal(0),
      );
      return (
        agreedTotal.greaterThan(0) &&
        paidTotal.greaterThanOrEqualTo(agreedTotal)
      );
    });
    const totalPlacementsCount = sales.reduce(
      (sum, sale) => sum + sale.placements.length,
      0,
    );
    const totalRevenue = sales.reduce(
      (sum, sale) =>
        sum.add(
          sale.payments.reduce(
            (paymentSum, payment) =>
              paymentSum.add(payment.amountInPrimaryCurrency),
            decimal(0),
          ),
        ),
      decimal(0),
    );
    const averageOrderValue = totalSalesCount
      ? totalRevenue.div(totalSalesCount)
      : decimal(0);
    const purchaseDates = customerSales
      .map((sale) => sale.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());
    const firstPurchaseAt = purchaseDates[0] ?? null;
    const lastPurchaseAt = purchaseDates[purchaseDates.length - 1] ?? null;
    const repeatCustomerAt = purchaseDates[1] ?? null;
    await tx.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: {
        totalSalesCount,
        completedSalesCount,
        totalPlacementsCount,
        totalRevenueInPrimaryCurrency: totalRevenue,
        averageOrderValueInPrimaryCurrency: averageOrderValue,
        firstPurchaseAt,
        lastPurchaseAt,
        repeatCustomerAt,
      },
    });
  }

  private async resolveAdvertiserForSale(
    workspaceId: string,
    userId: string,
    dto: CreateTelegramAdSaleDto | UpdateTelegramAdSaleDto,
    assignedMemberId?: string | null,
  ) {
    if (dto.advertiserId) {
      return this.getAdvertiser(workspaceId, dto.advertiserId);
    }
    const shouldCreate =
      'createAdvertiser' in dto ? dto.createAdvertiser : false;
    if (!shouldCreate) return null;
    const created = await this.prisma.telegramAdvertiser.create({
      data: {
        workspaceId,
        displayName: (dto.advertiserName ?? 'Advertiser').trim(),
        companyName: dto.advertiserCompanyName?.trim() || null,
        telegramUsername: this.normalizeTelegramUsername(
          dto.advertiserTelegram,
        ),
        phone: this.normalizePhone(dto.advertiserContact),
        email: this.normalizeEmail(dto.advertiserContact),
        ownerMemberId: assignedMemberId ?? null,
        createdByUserId: userId,
        stage: TelegramCrmContactStage.NEW,
      },
    });
    if (dto.advertiserTelegram?.trim()) {
      await this.prisma.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId: created.id,
          type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
          value: dto.advertiserTelegram.trim(),
          normalizedValue: this.normalizeTelegramUsername(
            dto.advertiserTelegram,
          )!,
          isPrimary: true,
        },
      });
    }
    if (dto.advertiserContact?.trim()) {
      const normalizedEmail = this.normalizeEmail(dto.advertiserContact);
      const normalizedPhone = this.normalizePhone(dto.advertiserContact);
      const type = normalizedEmail?.includes('@')
        ? TelegramAdvertiserContactType.EMAIL
        : TelegramAdvertiserContactType.PHONE;
      await this.prisma.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId: created.id,
          type,
          value: dto.advertiserContact.trim(),
          normalizedValue:
            (type === TelegramAdvertiserContactType.EMAIL
              ? normalizedEmail
              : normalizedPhone) ?? dto.advertiserContact.trim(),
          isPrimary: !dto.advertiserTelegram?.trim(),
        },
      });
    }
    await this.createAdvertiserActivity(workspaceId, created.id, {
      type: TelegramAdvertiserActivityType.ADVERTISER_CREATED,
      title: 'Advertiser created from ad sale',
      actorUserId: userId,
    });
    return this.getAdvertiser(workspaceId, created.id);
  }

  private appendPlacementFinancials(placement: any) {
    const paidAllocatedAmount = (placement.paymentAllocations ?? [])
      .filter(
        (allocation: any) =>
          allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
      )
      .reduce(
        (sum: Prisma.Decimal, allocation: any) =>
          sum.add(decimal(allocation.amount)),
        decimal(0),
      );
    const unpaidAmount = decimal(placement.agreedPrice).sub(
      paidAllocatedAmount,
    );
    const underpricingAmount = decimal(placement.minimumPrice).gt(
      decimal(placement.agreedPrice),
    )
      ? decimal(placement.minimumPrice).sub(decimal(placement.agreedPrice))
      : decimal(0);
    const underpricingPercent =
      decimal(placement.minimumPrice).gt(0) && underpricingAmount.gt(0)
        ? underpricingAmount.div(decimal(placement.minimumPrice)).mul(100)
        : decimal(0);
    return {
      ...placement,
      paidAllocatedAmount,
      unpaidAmount,
      underpricingAmount,
      underpricingPercent,
    };
  }

  private buildSaleSummary(sale: any) {
    const placements = (sale.placements ?? []).map((placement: any) =>
      this.appendPlacementFinancials(placement),
    );
    const payments = (sale.payments ?? []).filter(
      (payment: any) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
    );
    const totalAgreedAmount = placements.reduce(
      (sum: Prisma.Decimal, placement: any) =>
        sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const totalRecommendedAmount = placements.reduce(
      (sum: Prisma.Decimal, placement: any) =>
        sum.add(decimal(placement.recommendedPrice)),
      decimal(0),
    );
    const totalMinimumAmount = placements.reduce(
      (sum: Prisma.Decimal, placement: any) =>
        sum.add(decimal(placement.minimumPrice)),
      decimal(0),
    );
    const totalPaidAmount = payments.reduce(
      (sum: Prisma.Decimal, payment: any) => sum.add(decimal(payment.amount)),
      decimal(0),
    );
    const totalAmountInPrimaryCurrency = payments.reduce(
      (sum: Prisma.Decimal, payment: any) =>
        sum.add(decimal(payment.amountInPrimaryCurrency)),
      decimal(0),
    );
    const outstandingAmount = totalPaidAmount.gte(totalAgreedAmount)
      ? decimal(0)
      : totalAgreedAmount.sub(totalPaidAmount);
    const overpaidAmount = totalPaidAmount.gt(totalAgreedAmount)
      ? totalPaidAmount.sub(totalAgreedAmount)
      : decimal(0);

    const channelBreakdown = placements.map((placement: any) => ({
      placementId: placement.id,
      channelId: placement.telegramChannelId,
      agreedPrice: decimalToString(decimal(placement.agreedPrice)),
      paidAllocatedAmount: decimalToString(placement.paidAllocatedAmount),
      unpaidAmount: decimalToString(placement.unpaidAmount),
      recommendedPrice: decimalToString(decimal(placement.recommendedPrice)),
      minimumPrice: decimalToString(decimal(placement.minimumPrice)),
      underpricingAmount: decimalToString(placement.underpricingAmount),
      underpricingPercent: decimalToString(placement.underpricingPercent),
      status: placement.status,
    }));

    return {
      placements,
      payments,
      summary: {
        placementsCount: placements.length,
        totalAgreedAmount: decimalToString(totalAgreedAmount),
        totalRecommendedAmount: decimalToString(totalRecommendedAmount),
        totalMinimumAmount: decimalToString(totalMinimumAmount),
        totalPaidAmount: decimalToString(totalPaidAmount),
        outstandingAmount: decimalToString(outstandingAmount),
        overpaidAmount: decimalToString(overpaidAmount),
        paymentStatus: this.paymentStatusFromTotals(
          totalPaidAmount,
          totalAgreedAmount,
        ),
        totalAmountInPrimaryCurrency: decimalToString(
          totalAmountInPrimaryCurrency,
        ),
        channelBreakdown,
      },
    };
  }

  private async getSaleDetails(workspaceId: string, id: string) {
    const sale = await this.prisma.telegramAdSale.findFirst({
      where: { id, workspaceId },
      include: this.includeSaleRelations(),
    });
    if (!sale) throw new NotFoundException('Telegram ad sale not found');
    await hydrateManagedTelegramPosts(this.prisma, workspaceId, [sale]);
    return sale;
  }

  private analyticsRange(query?: TelegramAdAnalyticsQueryDto) {
    return resolveAdSalesAnalyticsRange(query);
  }

  private inventorySlotsForChannels(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    return this.inventoryReader.slotsForChannels(params);
  }

  private summarizeInventory(
    slots: Awaited<
      ReturnType<TelegramAdSalesInventoryReader['slotsForChannels']>
    >,
  ) {
    return summarizeAdSalesInventory(slots);
  }

  private adAnalyticsDataset(params: AdSalesAnalyticsDatasetParams) {
    return this.analyticsDatasetReader.read(params);
  }

  private analyticsChannelIds(query: TelegramAdAnalyticsQueryDto) {
    return selectedAdSalesAnalyticsChannelIds(query);
  }

  private startOfUtcDay(value: Date) {
    return startOfUtcDay(value);
  }

  private endOfUtcDay(value: Date) {
    return endOfUtcDay(value);
  }

  private listDatesInRange(from: Date, to: Date) {
    return listUtcDatesInRange(from, to);
  }

  private async resolveAnalyticsChannelIds(params: {
    workspaceId: string;
    channelId?: string;
    networkId?: string;
    networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
  }) {
    if (params.channelId) return [params.channelId];
    if (params.networkId) {
      const network = await this.findWorkspaceNetwork(
        params.workspaceId,
        params.networkId,
      );
      return network.channels.map((item) => item.telegramChannelId);
    }
    return (
      await this.prisma.telegramChannel.findMany({
        where: { workspaceId: params.workspaceId, isActive: true },
        select: { id: true },
      })
    ).map((channel) => channel.id);
  }

  private async buildInventorySnapshotForDate(params: {
    workspaceId: string;
    channelId: string;
    date: Date;
    force?: boolean;
  }) {
    const dayStart = this.startOfUtcDay(params.date);
    const dayEnd = this.endOfUtcDay(params.date);
    await this.findWorkspaceChannel(params.workspaceId, params.channelId);
    const policy =
      (await this.prisma.telegramAdSchedulePolicy.findFirst({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
        },
      })) ??
      (await this.resolvePolicy(params.workspaceId, params.channelId, 'UTC'));
    const products = await this.prisma.telegramAdProduct.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        currency: true,
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const slots = await this.inventorySlotsForChannels({
      workspaceId: params.workspaceId,
      channelIds: [params.channelId],
      from: dayStart,
      to: dayEnd,
    });
    const channelSlots = slots.filter(
      (slot) => slot.channelId === params.channelId,
    );
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        status: true,
        expectedViews: true,
        actualViewsFinal: true,
        actualReactionsFinal: true,
        recommendedPrice: true,
        minimumPrice: true,
        agreedPrice: true,
        paymentAllocations: {
          select: {
            amount: true,
            payment: { select: { status: true } },
          },
        },
      },
    });
    const inventory = this.summarizeInventory(channelSlots);
    const bookedPlacements = placements.filter((placement) =>
      ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES.includes(placement.status),
    );
    const publishedPlacements = placements.filter(
      (placement) =>
        placement.status === TelegramAdPlacementStatus.PUBLISHED ||
        placement.status === TelegramAdPlacementStatus.COMPLETED,
    );
    const cancelledPlacements = placements.filter(
      (placement) => placement.status === TelegramAdPlacementStatus.CANCELLED,
    );
    const agreedRevenue = publishedPlacements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const paidRevenue = publishedPlacements.reduce(
      (sum, placement) =>
        sum.add(
          placement.paymentAllocations.reduce(
            (inner, allocation) =>
              allocation.payment.status === TelegramAdSalePaymentStatus.VOIDED
                ? inner
                : inner.add(decimal(allocation.amount)),
            decimal(0),
          ),
        ),
      decimal(0),
    );
    const underpricingLoss = bookedPlacements.reduce((sum, placement) => {
      const recommended = decimal(placement.recommendedPrice);
      const agreed = decimal(placement.agreedPrice);
      return sum.add(
        recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0),
      );
    }, decimal(0));
    const recommendedInventoryRevenue = channelSlots.reduce(
      (sum, slot) =>
        slot.state === 'MANUAL_ONLY'
          ? sum
          : sum.add(decimal(slot.recommendedPrice)),
      decimal(0),
    );
    const minimumInventoryRevenue = channelSlots.reduce(
      (sum, slot) =>
        slot.state === 'MANUAL_ONLY'
          ? sum
          : sum.add(decimal(slot.minimumPrice)),
      decimal(0),
    );
    const unsoldInventoryOpportunity = channelSlots.reduce((sum, slot) => {
      if (slot.state === 'AVAILABLE' || slot.state === 'PAST') {
        return sum.add(decimal(slot.recommendedPrice));
      }
      return sum;
    }, decimal(0));
    const expectedViews = bookedPlacements.reduce(
      (sum, placement) => sum + placement.expectedViews,
      0,
    );
    const actualViews = publishedPlacements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );

    return {
      workspaceId: params.workspaceId,
      telegramChannelId: params.channelId,
      date: dayStart,
      timezone: policy.timezone,
      eligibleSlots: inventory.eligibleSlots,
      bookedSlots: bookedPlacements.length,
      publishedSlots: publishedPlacements.length,
      cancelledSlots: cancelledPlacements.length,
      missedSlots: inventory.pastUnusedSlots,
      blockedSlots: inventory.blockedSlots,
      recommendedInventoryRevenue,
      minimumInventoryRevenue,
      agreedRevenue,
      paidRevenue,
      outstandingRevenue: agreedRevenue.sub(paidRevenue),
      underpricingLoss,
      unsoldInventoryOpportunity,
      expectedViews,
      actualViews,
      policySnapshot: {
        timezone: policy.timezone,
        maxAdsPerDay: policy.maxAdsPerDay,
        minHoursBetweenAds: policy.minHoursBetweenAds,
        minDaysBetweenAds: policy.minDaysBetweenAds,
        slotStrategy: policy.slotStrategy,
        fallbackSlotTimes: policy.fallbackSlotTimes,
      },
      productSnapshot: products.map((product) => ({
        id: product.id,
        name: product.name,
        isActive: product.isActive,
        currency: product.currency,
      })),
      pricingSnapshot: {
        eligibleSlots: channelSlots.map((slot) => ({
          scheduledAt: slot.scheduledAt.toISOString(),
          recommendedPrice: slot.recommendedPrice,
          minimumPrice: slot.minimumPrice,
        })),
      },
      calculationVersion: 'inventory-v1',
      calculatedAt: new Date(),
    };
  }

  private async saveInventorySnapshot(
    snapshot: Awaited<
      ReturnType<TelegramAdSalesService['buildInventorySnapshotForDate']>
    >,
    options?: { force?: boolean },
  ) {
    const recalculationCutoff = this.startOfUtcDay(new Date());
    recalculationCutoff.setUTCDate(recalculationCutoff.getUTCDate() - 7);
    const canOverwrite = options?.force || snapshot.date >= recalculationCutoff;
    const existing =
      await this.prisma.telegramAdInventoryDailySnapshot.findFirst({
        where: {
          workspaceId: snapshot.workspaceId,
          telegramChannelId: snapshot.telegramChannelId,
          date: snapshot.date,
        },
        select: { id: true },
      });
    if (existing && !canOverwrite) {
      return { status: 'skipped' as const, snapshotId: existing.id };
    }
    const saved = existing
      ? await this.prisma.telegramAdInventoryDailySnapshot.update({
          where: { id: existing.id },
          data: snapshot,
        })
      : await this.prisma.telegramAdInventoryDailySnapshot.create({
          data: snapshot,
        });
    return {
      status: existing ? ('updated' as const) : ('created' as const),
      snapshotId: saved.id,
    };
  }

  private async loadInventorySnapshots(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    return this.prisma.telegramAdInventoryDailySnapshot.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: { in: params.channelIds },
        date: {
          gte: this.startOfUtcDay(params.from),
          lte: this.startOfUtcDay(params.to),
        },
      },
      orderBy: [{ date: 'asc' }, { telegramChannelId: 'asc' }],
    });
  }

  private aggregateInventorySnapshots(items: Array<any>) {
    const zero = decimal(0);
    const total = items.reduce(
      (acc, item) => ({
        eligibleSlots: acc.eligibleSlots + item.eligibleSlots,
        bookedSlots: acc.bookedSlots + item.bookedSlots,
        publishedSlots: acc.publishedSlots + item.publishedSlots,
        cancelledSlots: acc.cancelledSlots + item.cancelledSlots,
        missedSlots: acc.missedSlots + item.missedSlots,
        blockedSlots: acc.blockedSlots + item.blockedSlots,
        recommendedInventoryRevenue: acc.recommendedInventoryRevenue.add(
          item.recommendedInventoryRevenue,
        ),
        minimumInventoryRevenue: acc.minimumInventoryRevenue.add(
          item.minimumInventoryRevenue,
        ),
        agreedRevenue: acc.agreedRevenue.add(item.agreedRevenue),
        paidRevenue: acc.paidRevenue.add(item.paidRevenue),
        outstandingRevenue: acc.outstandingRevenue.add(item.outstandingRevenue),
        underpricingLoss: acc.underpricingLoss.add(item.underpricingLoss),
        unsoldInventoryOpportunity: acc.unsoldInventoryOpportunity.add(
          item.unsoldInventoryOpportunity,
        ),
        expectedViews: acc.expectedViews + item.expectedViews,
        actualViews: acc.actualViews + item.actualViews,
      }),
      {
        eligibleSlots: 0,
        bookedSlots: 0,
        publishedSlots: 0,
        cancelledSlots: 0,
        missedSlots: 0,
        blockedSlots: 0,
        recommendedInventoryRevenue: zero,
        minimumInventoryRevenue: zero,
        agreedRevenue: zero,
        paidRevenue: zero,
        outstandingRevenue: zero,
        underpricingLoss: zero,
        unsoldInventoryOpportunity: zero,
        expectedViews: 0,
        actualViews: 0,
      },
    );
    const averageAgreedPrice =
      total.bookedSlots > 0 ? total.agreedRevenue.div(total.bookedSlots) : zero;
    const averageRecommendedPrice =
      total.eligibleSlots > 0
        ? total.recommendedInventoryRevenue.div(total.eligibleSlots)
        : zero;
    const averageMinimumPrice =
      total.eligibleSlots > 0
        ? total.minimumInventoryRevenue.div(total.eligibleSlots)
        : zero;
    return {
      ...total,
      bookingFillRate: total.eligibleSlots
        ? (total.bookedSlots / total.eligibleSlots) * 100
        : 0,
      publishedFillRate: total.eligibleSlots
        ? (total.publishedSlots / total.eligibleSlots) * 100
        : 0,
      cancellationRate: total.bookedSlots
        ? (total.cancelledSlots / total.bookedSlots) * 100
        : 0,
      averageAgreedPrice,
      medianAgreedPrice: averageAgreedPrice,
      averageRecommendedPrice,
      averageMinimumPrice,
      revenuePerEligibleSlot:
        total.eligibleSlots > 0
          ? total.agreedRevenue.div(total.eligibleSlots)
          : zero,
      revenuePerPublishedSlot:
        total.publishedSlots > 0
          ? total.agreedRevenue.div(total.publishedSlots)
          : zero,
      inventoryRevenueEfficiency: total.recommendedInventoryRevenue.gt(0)
        ? Number(
            total.agreedRevenue
              .div(total.recommendedInventoryRevenue)
              .mul(100)
              .toFixed(2),
          )
        : 0,
      totalMonetizationGap: total.unsoldInventoryOpportunity.add(
        total.underpricingLoss,
      ),
      expectedCpm:
        total.expectedViews > 0
          ? total.agreedRevenue.div(total.expectedViews).mul(1000)
          : zero,
      effectiveCpm:
        total.actualViews > 0
          ? total.agreedRevenue.div(total.actualViews).mul(1000)
          : zero,
    };
  }

  async listProducts(userId: string, query: TelegramAdProductsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramAdProductWhereInput = {
      workspaceId,
      ...(query.telegramChannelId
        ? { telegramChannelId: query.telegramChannelId }
        : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdProduct.findMany({
        where,
        orderBy: [
          { telegramChannelId: 'asc' },
          { position: 'asc' },
          { createdAt: 'asc' },
        ],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdProduct.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((item) => this.mapProduct(item)),
      totalItems,
      pagination,
    );
  }

  async listChannelProducts(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(workspaceId, channelId);
    await materializeDefaultAdSalesProducts(this.prisma, {
      workspaceId,
      channelId,
      currency: channel.adBaseCurrency || 'USD',
    });
    const products = await this.prisma.telegramAdProduct.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [
        { isActive: 'desc' },
        { position: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    const sources = await this.pricingReader.sourcesForChannels(workspaceId, [
      channel,
    ]);
    const source = sources.get(channel.id)!;
    return products.map((product) => {
      const preview = this.pricingReader.previewFromSource(source, product);
      return this.mapProduct({
        ...product,
        pricingWindowHours: preview.pricingWindowHours,
        pricingWindowLabel: preview.pricingWindowLabel,
        estimatedViews: preview.expectedViews,
        estimatedPrice: decimal(preview.recommendedPrice),
      });
    });
  }
  async listProductsByChannels(userId: string, requestedChannelIds: string[]) {
    const workspaceId = await this.workspace(userId);
    const channelIds = [...new Set(requestedChannelIds)];
    if (!channelIds.length) return {};
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds } },
    });
    if (channels.length !== channelIds.length) {
      throw new NotFoundException(
        'One or more Telegram channels were not found',
      );
    }
    const products = await loadAdSalesProductsForChannelsWithDefaults(
      this.prisma,
      { workspaceId, channels },
    );
    const channelsById = new Map(
      channels.map((channel) => [channel.id, channel]),
    );
    const pricingSources = await this.pricingReader.sourcesForChannels(
      workspaceId,
      channels,
    );
    const mappedProducts = products.map((product) => {
      const channel = channelsById.get(product.telegramChannelId)!;
      const preview = this.pricingReader.previewFromSource(
        pricingSources.get(channel.id)!,
        product,
      );
      return this.mapProduct({
        ...product,
        pricingWindowHours: preview.pricingWindowHours,
        pricingWindowLabel: preview.pricingWindowLabel,
        estimatedViews: preview.expectedViews,
        estimatedPrice: decimal(preview.recommendedPrice),
      });
    });
    return Object.fromEntries(
      channelIds.map((channelId) => [
        channelId,
        mappedProducts.filter(
          (product) => product.telegramChannelId === channelId,
        ),
      ]),
    );
  }
  async createProduct(
    userId: string,
    channelId: string,
    dto: CreateTelegramAdProductDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const product = await this.prisma.telegramAdProduct.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        topDurationMinutes: dto.topDurationMinutes ?? null,
        feedDurationHours: dto.feedDurationHours ?? null,
        deleteAfterHours: dto.deleteAfterHours ?? null,
        isPermanent: dto.isPermanent ?? false,
        defaultPricingMode: dto.defaultPricingMode,
        defaultCpm: decimalOrNull(dto.defaultCpm),
        defaultFixedPrice: decimalOrNull(dto.defaultFixedPrice),
        minimumPrice: decimalOrNull(dto.minimumPrice),
        currency: dto.currency,
        isActive: dto.isActive ?? true,
        position: dto.position ?? 0,
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapProduct(product);
  }

  async updateProduct(
    userId: string,
    id: string,
    dto: UpdateTelegramAdProductDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdProduct.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Telegram ad product not found');
    const product = await this.prisma.telegramAdProduct.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description?.trim() || null }),
        ...(dto.topDurationMinutes === undefined
          ? {}
          : { topDurationMinutes: dto.topDurationMinutes }),
        ...(dto.feedDurationHours === undefined
          ? {}
          : { feedDurationHours: dto.feedDurationHours }),
        ...(dto.deleteAfterHours === undefined
          ? {}
          : { deleteAfterHours: dto.deleteAfterHours }),
        ...(dto.isPermanent === undefined
          ? {}
          : { isPermanent: dto.isPermanent }),
        ...(dto.defaultPricingMode === undefined
          ? {}
          : { defaultPricingMode: dto.defaultPricingMode }),
        ...(dto.defaultCpm === undefined
          ? {}
          : { defaultCpm: decimalOrNull(dto.defaultCpm) }),
        ...(dto.defaultFixedPrice === undefined
          ? {}
          : { defaultFixedPrice: decimalOrNull(dto.defaultFixedPrice) }),
        ...(dto.minimumPrice === undefined
          ? {}
          : { minimumPrice: decimalOrNull(dto.minimumPrice) }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...(dto.position === undefined ? {} : { position: dto.position }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapProduct(product);
  }

  async deactivateProduct(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdProduct.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Telegram ad product not found');
    const normalizedName = normalizeDefaultAdSalesProductName(existing.name);
    const isDefaultFormat = TELEGRAM_AD_SALES_DEFAULT_PRODUCTS.some(
      (template) =>
        normalizeDefaultAdSalesProductName(template.name) === normalizedName,
    );
    if (isDefaultFormat) {
      throw new BadRequestException(
        'Default placement formats cannot be removed',
      );
    }
    await this.prisma.telegramAdProduct.delete({
      where: { id },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return { success: true };
  }

  async getAdSalesWorkspaceSettings(userId: string) {
    const workspaceId = await this.workspace(userId);
    return mapAdSalesWorkspaceSettings(
      await findOrCreateAdSalesWorkspaceSettings(this.prisma, workspaceId),
    );
  }

  async updateAdSalesWorkspaceSettings(
    userId: string,
    dto: UpdateTelegramAdSalesWorkspaceSettingsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const settings = await this.prisma.telegramAdSalesWorkspaceSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        defaultOrganicPostsPerAdSlot: dto.defaultOrganicPostsPerAdSlot ?? 3,
      },
      update: {
        ...(dto.defaultOrganicPostsPerAdSlot === undefined
          ? {}
          : { defaultOrganicPostsPerAdSlot: dto.defaultOrganicPostsPerAdSlot }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return mapAdSalesWorkspaceSettings(settings);
  }

  async getAdSalesMemberPreferences(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const existing =
      await this.prisma.telegramAdSalesMemberPreferences.findUnique({
        where: { workspaceMemberId: membership.id },
      });
    if (existing) return this.mapAdSalesMemberPreferences(existing);
    const preferences =
      await this.prisma.telegramAdSalesMemberPreferences.create({
        data: {
          workspaceId: membership.workspaceId,
          workspaceMemberId: membership.id,
          selectedChannelIds: [],
          selectedNetworkId: null,
          calendarView: 'week',
          initialized: false,
        },
      });
    return this.mapAdSalesMemberPreferences(preferences);
  }

  async updateAdSalesMemberPreferences(
    userId: string,
    dto: UpdateTelegramAdSalesMemberPreferencesDto,
  ) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const update: Prisma.TelegramAdSalesMemberPreferencesUpdateInput = {};
    const create: Prisma.TelegramAdSalesMemberPreferencesCreateInput = {
      workspace: { connect: { id: membership.workspaceId } },
      workspaceMember: { connect: { id: membership.id } },
      selectedChannelIds: [],
      selectedNetworkId: null,
      calendarView: 'week',
      initialized: false,
    };
    if (dto.selectedChannelIds !== undefined) {
      const uniqueIds = Array.from(new Set(dto.selectedChannelIds));
      if (uniqueIds.length) {
        const count = await this.prisma.telegramChannel.count({
          where: { workspaceId: membership.workspaceId, id: { in: uniqueIds } },
        });
        if (count !== uniqueIds.length) {
          throw new BadRequestException(
            'Some selected channels do not belong to workspace',
          );
        }
      }
      update.selectedChannelIds = uniqueIds;
      create.selectedChannelIds = uniqueIds;
    }
    if (dto.selectedNetworkId !== undefined) {
      if (dto.selectedNetworkId) {
        await this.findWorkspaceNetwork(
          membership.workspaceId,
          dto.selectedNetworkId,
        );
      }
      update.selectedNetworkId = dto.selectedNetworkId;
      create.selectedNetworkId = dto.selectedNetworkId;
    }
    if (dto.calendarView !== undefined) {
      update.calendarView = dto.calendarView;
      create.calendarView = dto.calendarView;
    }
    if (dto.initialized !== undefined) {
      update.initialized = dto.initialized;
      create.initialized = dto.initialized;
    }
    const preferences =
      await this.prisma.telegramAdSalesMemberPreferences.upsert({
        where: { workspaceMemberId: membership.id },
        create,
        update,
      });
    return this.mapAdSalesMemberPreferences(preferences);
  }

  async getPolicy(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const workspaceTimezone = await this.resolveWorkspaceTimezone(workspaceId);
    return this.mapPolicy(
      await this.resolvePolicy(workspaceId, channelId, workspaceTimezone),
    );
  }

  async upsertPolicy(
    userId: string,
    channelId: string,
    dto: UpdateTelegramAdPolicyDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const workspaceTimezone = await this.resolveWorkspaceTimezone(workspaceId);
    const defaults = this.policyDefaults(workspaceTimezone);
    const useWorkspaceDefault = dto.useWorkspaceDefault ?? false;
    const organicPostsPerAdSlot =
      dto.organicPostsPerAdSlot ?? defaults.organicPostsPerAdSlot;
    const policy = await this.prisma.telegramAdSchedulePolicy.upsert({
      where: { telegramChannelId: channelId },
      create: {
        workspaceId,
        telegramChannelId: channelId,
        timezone: dto.timezone ?? workspaceTimezone,
        autoFrequencyEnabled: dto.autoFrequencyEnabled ?? true,
        expectedOrganicPostsPerDay: decimalOrNull(
          dto.expectedOrganicPostsPerDay,
        ),
        useWorkspaceDefault,
        organicPostsPerAdSlot,
        maxAdsPerDay: dto.maxAdsPerDay ?? defaults.maxAdsPerDay,
        minHoursBetweenAds:
          dto.minHoursBetweenAds ?? defaults.minHoursBetweenAds,
        minDaysBetweenAds: dto.minDaysBetweenAds ?? defaults.minDaysBetweenAds,
        slotStrategy: dto.slotStrategy ?? defaults.slotStrategy,
        fallbackSlotTimes: dto.fallbackSlotTimes ?? [],
        allowManualSlots: dto.allowManualSlots ?? false,
      },
      update: {
        timezone: dto.timezone ?? workspaceTimezone,
        ...(dto.autoFrequencyEnabled === undefined
          ? {}
          : { autoFrequencyEnabled: dto.autoFrequencyEnabled }),
        ...(dto.expectedOrganicPostsPerDay === undefined
          ? {}
          : {
              expectedOrganicPostsPerDay: decimalOrNull(
                dto.expectedOrganicPostsPerDay,
              ),
            }),
        ...(dto.useWorkspaceDefault === undefined
          ? {}
          : { useWorkspaceDefault }),
        ...(dto.organicPostsPerAdSlot === undefined
          ? {}
          : { organicPostsPerAdSlot }),
        ...(dto.maxAdsPerDay === undefined
          ? {}
          : { maxAdsPerDay: dto.maxAdsPerDay }),
        ...(dto.minHoursBetweenAds === undefined
          ? {}
          : { minHoursBetweenAds: dto.minHoursBetweenAds }),
        ...(dto.minDaysBetweenAds === undefined
          ? {}
          : { minDaysBetweenAds: dto.minDaysBetweenAds }),
        ...(dto.slotStrategy === undefined
          ? {}
          : { slotStrategy: dto.slotStrategy }),
        ...(dto.fallbackSlotTimes === undefined
          ? {}
          : { fallbackSlotTimes: dto.fallbackSlotTimes }),
        ...(dto.allowManualSlots === undefined
          ? {}
          : { allowManualSlots: dto.allowManualSlots }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapPolicy(
      await this.resolvePolicy(workspaceId, channelId, workspaceTimezone),
    );
  }

  async recommendPolicy(
    userId: string,
    channelId: string,
    dto: RecommendTelegramAdPolicyDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const statisticsWindowDays = dto.statisticsWindowDays ?? 30;
    const from = new Date(
      Date.now() - statisticsWindowDays * 24 * 60 * 60 * 1000,
    );
    const organicPosts = await this.prisma.telegramPost.count({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        postDate: { gte: from },
      },
    });
    const expectedOrganicPostsPerDay = organicPosts / statisticsWindowDays;
    return recommendPolicyFromOrganicPosts(expectedOrganicPostsPerDay);
  }

  async createQuote(userId: string, dto: CreateTelegramAdQuoteDto) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(
      workspaceId,
      dto.telegramChannelId,
    );
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const product = dto.telegramAdProductId
      ? await this.prisma.telegramAdProduct.findFirst({
          where: {
            id: dto.telegramAdProductId,
            workspaceId,
            telegramChannelId: dto.telegramChannelId,
          },
        })
      : null;
    if (dto.telegramAdProductId && !product) {
      throw new NotFoundException('Telegram ad product not found');
    }

    const pricingMode =
      dto.pricingMode ??
      product?.defaultPricingMode ??
      TelegramAdPricingMode.CPM;
    const quoteOverrides = {
      pricingMode,
      targetCpm: dto.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0,
      minimumCpm:
        dto.minimumCpm ??
        dto.targetCpm ??
        channel.adBaseCpm ??
        product?.defaultCpm ??
        0,
      fixedPrice: dto.fixedPrice ?? product?.defaultFixedPrice ?? 0,
      asOf: scheduledAt,
    };
    let preview = await this.pricingReader.preview(
      workspaceId,
      channel,
      product,
      quoteOverrides,
    );
    if (
      scheduledAt &&
      scheduledAt > new Date() &&
      preview.expectedViews == null
    ) {
      preview = await this.pricingReader.preview(
        workspaceId,
        channel,
        product,
        {
          ...quoteOverrides,
          asOf: null,
        },
      );
    }
    if (preview.expectedViews == null) {
      return {
        snapshotId: null,
        expectedViews: null,
        targetCpm: preview.targetCpm,
        recommendedPrice: '0.00',
        minimumPrice: '0.00',
        currency: dto.currency ?? preview.currency,
        dataQuality: preview.dataQuality,
        warnings: preview.warnings.map((code) => ({
          code,
          message: code,
        })),
        sample: preview.sample.map((item) => ({
          ...item,
          date: item.date.toISOString(),
        })),
      };
    }

    const snapshot = await this.prisma.telegramAdPriceSnapshot.create({
      data: {
        workspaceId,
        telegramChannelId: channel.id,
        telegramAdProductId: product?.id ?? null,
        source: dto.source ?? 'quote',
        methodVersion: preview.methodVersion,
        statisticsWindowDays: 30,
        postsSampleCount: preview.postsSampleCount,
        expectedViews: preview.expectedViews,
        averageViews: decimalOrNull(preview.averageViews),
        medianViews: decimalOrNull(preview.medianViews),
        adjustedViews: decimalOrNull(preview.adjustedViews),
        targetCpm: decimal(preview.targetCpm),
        minimumCpm: decimal(preview.targetCpm),
        recommendedPrice: decimal(preview.recommendedPrice),
        minimumPrice: decimal(preview.minimumPrice),
        currency: dto.currency ?? preview.currency,
        metadata: {
          dataQuality: preview.dataQuality,
          warnings: preview.warnings,
          fallbackSource: preview.fallbackSource,
          pricingWindowHours: preview.pricingWindowHours,
          pricingWindowLabel: preview.pricingWindowLabel,
          pricedAt: scheduledAt?.toISOString() ?? null,
        },
      },
    });

    this.logger.info({
      event: 'telegram_ad_sales.quote_created',
      message: `Created price quote for channel ${channel.id}`,
      metadata: {
        channelId: channel.id,
        productId: product?.id ?? null,
        snapshotId: snapshot.id,
        pricedAt: scheduledAt?.toISOString() ?? null,
      },
    });

    return {
      snapshotId: snapshot.id,
      expectedViews: snapshot.expectedViews,
      targetCpm: decimalToString(snapshot.targetCpm),
      recommendedPrice: decimalToString(snapshot.recommendedPrice),
      minimumPrice: decimalToString(snapshot.minimumPrice),
      currency: snapshot.currency,
      dataQuality: preview.dataQuality,
      warnings: [...preview.warnings].map((code) => ({
        code,
        message: code,
      })),
    };
  }

  async priceHistory(
    userId: string,
    channelId: string,
    query: TelegramAdPriceHistoryQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const history = await this.prisma.telegramAdPriceSnapshot.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        ...(query.telegramAdProductId
          ? { telegramAdProductId: query.telegramAdProductId }
          : {}),
      },
      orderBy: { calculatedAt: 'desc' },
      take: query.limit ?? 50,
    });
    return history.map((item) => this.mapSnapshot(item));
  }

  async availability(userId: string, dto: TelegramAdAvailabilityQueryDto) {
    const workspaceId = await this.workspace(userId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    const days =
      Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 93) {
      throw new BadRequestException('Availability range cannot exceed 93 days');
    }
    if (!dto.channelIds?.length && !dto.networkId) {
      throw new BadRequestException('Provide channelIds or networkId');
    }
    let channelIds = dto.channelIds ?? [];
    if (dto.networkId) {
      const network = await this.findWorkspaceNetwork(
        workspaceId,
        dto.networkId,
      );
      channelIds = network.channels.map((item) => item.telegramChannelId);
    }
    if (channelIds.length > 50) {
      throw new BadRequestException(
        'Availability request cannot exceed 50 channels',
      );
    }
    const cacheKey = this.availabilityCacheKey({
      workspaceId,
      channelIds,
      networkId: dto.networkId ?? null,
      productIds: dto.productIds,
      from: dto.from,
      to: dto.to,
      cacheBust: dto.cacheBust,
    });
    return this.responseCache.getOrSet(cacheKey, 30_000, () =>
      this.availabilityReader.read(workspaceId, dto, channelIds),
    );
  }
  async analyticsSummary(userId: string, query: TelegramAdAnalyticsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const sourceParams = {
      workspaceId,
      channelIds: this.analyticsChannelIds(query),
      networkId: query.networkId ?? null,
    };
    const [dataset, previousRevenue] = await Promise.all([
      this.adAnalyticsDataset({ ...sourceParams, from, to }),
      this.analyticsDatasetReader.sumAgreedRevenue({
        ...sourceParams,
        from: new Date(from.getTime() - periodMs),
        to: new Date(from.getTime() - 1),
      }),
    ]);
    const now = new Date();
    const nextSevenDays = await this.inventorySlotsForChannels({
      workspaceId,
      channelIds: dataset.channels.map((channel) => channel.id),
      from: now,
      to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    return buildAdSalesAnalyticsSummary({
      dataset,
      previousRevenue,
      nextSevenDays,
      from,
      to,
      timezone,
      now,
    });
  }
  async channelAnalytics(
    userId: string,
    channelId: string,
    query: TelegramAdAnalyticsQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const [channel, dataset, inventorySlots, priceHistory] = await Promise.all([
      this.findWorkspaceChannel(workspaceId, channelId),
      this.adAnalyticsDataset({
        workspaceId,
        from,
        to,
        channelIds: [channelId],
      }),
      this.inventorySlotsForChannels({
        workspaceId,
        channelIds: [channelId],
        from,
        to,
      }),
      this.prisma.telegramAdPriceSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { calculatedAt: 'desc' },
        take: 1,
      }),
    ]);
    return buildAdSalesChannelAnalytics({
      channel,
      dataset,
      inventorySlots,
      latestPrice: priceHistory[0] ?? null,
      from,
      to,
      timezone,
    });
  }

  async analyticsOverview(
    userId: string,
    query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    const selectedChannelIds = [...new Set(query.channelIds ?? [])];
    if (
      selectedChannelIds.length > TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS
    ) {
      throw new BadRequestException(
        `Analytics supports at most ${TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS} selected channels`,
      );
    }
    const workspaceId = await this.workspace(userId);
    let effectiveQuery = query;
    if (query.allTime) {
      const [earliestSale, earliestPlacement] = await Promise.all([
        this.prisma.telegramAdSale.findFirst({
          where: { workspaceId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.telegramAdSalePlacement.findFirst({
          where: { workspaceId },
          orderBy: { scheduledAt: 'asc' },
          select: { scheduledAt: true },
        }),
      ]);
      const now = new Date();
      const historyFrom = new Date(
        Math.min(
          earliestSale?.createdAt.getTime() ?? now.getTime(),
          earliestPlacement?.scheduledAt.getTime() ?? now.getTime(),
        ),
      );
      historyFrom.setUTCHours(0, 0, 0, 0);
      effectiveQuery = {
        ...query,
        dateFrom: historyFrom.toISOString(),
        dateTo: now.toISOString(),
        granularity: query.granularity ?? 'month',
      };
    }
    const { from, to, timezone } = this.analyticsRange(effectiveQuery);
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const sourceParams = {
      workspaceId,
      channelIds: this.analyticsChannelIds(effectiveQuery),
      networkId: effectiveQuery.networkId ?? null,
    };
    const [dataset, previousRevenue, networklessChannelDataset] =
      await Promise.all([
        this.adAnalyticsDataset({ ...sourceParams, from, to }),
        this.analyticsDatasetReader.sumAgreedRevenue({
          ...sourceParams,
          from: new Date(from.getTime() - periodMs),
          to: new Date(from.getTime() - 1),
        }),
        effectiveQuery.networkId && selectedChannelIds.length
          ? this.adAnalyticsDataset({
              workspaceId,
              from,
              to,
              channelIds: selectedChannelIds,
            })
          : Promise.resolve(null),
      ]);
    const channelDataset = networklessChannelDataset ?? dataset;
    const inventoryChannelIds = effectiveQuery.channelIds?.length
      ? effectiveQuery.channelIds
      : await this.resolveAnalyticsChannelIds({
          workspaceId,
          channelId: effectiveQuery.channelId,
          networkId: effectiveQuery.networkId,
        });
    const now = new Date();
    const [
      nextSevenDays,
      snapshots,
      selectedChannels,
      selectedInventorySlots,
      latestPrices,
    ] = await Promise.all([
      this.inventorySlotsForChannels({
        workspaceId,
        channelIds: dataset.channels.map((channel) => channel.id),
        from: now,
        to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      }),
      this.loadInventorySnapshots({
        workspaceId,
        channelIds: inventoryChannelIds,
        from,
        to,
      }),
      selectedChannelIds.length
        ? this.prisma.telegramChannel.findMany({
            where: { workspaceId, id: { in: selectedChannelIds } },
            select: { id: true, title: true, photoUrl: true },
          })
        : Promise.resolve([]),
      this.inventorySlotsForChannels({
        workspaceId,
        channelIds: selectedChannelIds,
        from,
        to,
      }),
      this.pricingReader.latestSnapshotsForChannels(
        workspaceId,
        selectedChannelIds,
      ),
    ]);
    if (selectedChannels.length !== selectedChannelIds.length) {
      throw new NotFoundException('Telegram channel not found');
    }
    const inventory = buildAdSalesInventoryAnalytics({
      snapshots,
      from,
      to,
      timezone,
    });
    const summary = buildAdSalesAnalyticsSummary({
      dataset,
      previousRevenue,
      nextSevenDays,
      from,
      to,
      timezone,
      now,
    });
    const revenueSeries = buildAdSalesRevenueSeries({
      dataset,
      from,
      to,
      timezone,
      granularity: effectiveQuery.granularity ?? 'day',
    });
    const alerts = buildAdSalesAnalyticsAlerts({
      dataset,
      inventory,
      from,
      to,
      timezone,
      now,
    });
    const channelsById = new Map<string, (typeof selectedChannels)[number]>(
      selectedChannels.map((channel) => [channel.id, channel] as const),
    );
    const channels = selectedChannelIds.map((channelId) =>
      buildAdSalesChannelAnalytics({
        channel: channelsById.get(channelId)!,
        dataset: {
          ...channelDataset,
          placements: channelDataset.placements.filter(
            (placement) => placement.telegramChannelId === channelId,
          ),
          channels: channelDataset.channels.filter(
            (channel) => channel.id === channelId,
          ),
        },
        inventorySlots: selectedInventorySlots.filter(
          (slot) => slot.channelId === channelId,
        ),
        latestPrice: latestPrices.get(channelId) ?? null,
        from,
        to,
        timezone,
        now,
      }),
    );
    return { summary, revenueSeries, inventory, alerts, channels };
  }

  async networkAnalytics(
    userId: string,
    networkId: string,
    query: TelegramAdNetworkAnalyticsQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const network = await this.findWorkspaceNetwork(workspaceId, networkId);
    const { from, to, timezone } = this.analyticsRange(query);
    const mode = query.mode ?? 'SALE_CONTEXT';
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      networkId,
      networkMode: mode,
      channelIds:
        mode === 'CURRENT_CHANNELS'
          ? network.channels.map((channel) => channel.telegramChannelId)
          : undefined,
    });
    const inventorySlots = await this.inventorySlotsForChannels({
      workspaceId,
      channelIds: network.channels.map((channel) => channel.telegramChannelId),
      from,
      to,
    });
    const inventory = this.summarizeInventory(inventorySlots);
    const totalRevenue = dataset.placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const paidRevenue = sumAdSalesPaidAllocations(dataset.placements);
    const actualViews = dataset.placements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );
    const expectedViews = dataset.placements.reduce(
      (sum, placement) => sum + placement.expectedViews,
      0,
    );

    const channels = await Promise.all(
      dataset.channels.map(async (channel) => {
        const channelPlacements = dataset.placements.filter(
          (placement) => placement.telegramChannelId === channel.id,
        );
        const channelRevenue = channelPlacements.reduce(
          (sum, placement) => sum.add(decimal(placement.agreedPrice)),
          decimal(0),
        );
        const nextAvailable = inventorySlots
          .filter(
            (slot) =>
              slot.channelId === channel.id && slot.state === 'AVAILABLE',
          )
          .sort(
            (left, right) =>
              left.scheduledAt.getTime() - right.scheduledAt.getTime(),
          )[0];
        return {
          channelId: channel.id,
          title: channel.title,
          revenue: decimalToString(channelRevenue),
          revenueSharePercent: totalRevenue.gt(0)
            ? Number(channelRevenue.div(totalRevenue).mul(100).toFixed(2))
            : 0,
          placementsCount: channelPlacements.length,
          fillRate: inventory.eligibleSlots
            ? Number(
                (
                  (inventorySlots.filter(
                    (slot) =>
                      slot.channelId === channel.id && slot.state === 'SOLD',
                  ).length /
                    Math.max(
                      1,
                      inventorySlots.filter(
                        (slot) => slot.channelId === channel.id,
                      ).length,
                    )) *
                  100
                ).toFixed(2),
              )
            : 0,
          nextAvailableSlotAt: nextAvailable?.scheduledAt.toISOString() ?? null,
        };
      }),
    );

    return {
      networkId: network.id,
      name: network.name,
      mode,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      totalRevenue: decimalToString(totalRevenue),
      paidRevenue: decimalToString(paidRevenue),
      outstandingRevenue: decimalToString(totalRevenue.sub(paidRevenue)),
      placementsCount: dataset.placements.length,
      fillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
      expectedViews,
      actualViews,
      blendedExpectedCpm:
        expectedViews > 0
          ? decimalToString(totalRevenue.div(expectedViews).mul(1000))
          : '0',
      blendedActualCpm:
        actualViews > 0
          ? decimalToString(totalRevenue.div(actualViews).mul(1000))
          : '0',
      underpricingLoss: decimalToString(
        dataset.placements.reduce((sum, placement) => {
          const recommended = decimal(placement.recommendedPrice);
          const agreed = decimal(placement.agreedPrice);
          return sum.add(
            recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0),
          );
        }, decimal(0)),
      ),
      channels,
    };
  }

  async revenueSeries(
    userId: string,
    query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const granularity = query.granularity ?? 'day';
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds: query.channelId
        ? [query.channelId]
        : this.analyticsChannelIds(query),
      networkId: query.networkId ?? null,
    });
    return buildAdSalesRevenueSeries({
      dataset,
      from,
      to,
      timezone,
      granularity,
    });
  }

  async pricingSeries(
    userId: string,
    query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const granularity = query.granularity ?? 'day';
    const history = await this.prisma.telegramAdPriceSnapshot.findMany({
      where: {
        workspaceId,
        calculatedAt: { gte: from, lte: to },
        ...(query.channelId ? { telegramChannelId: query.channelId } : {}),
        ...(query.telegramAdProductId
          ? { telegramAdProductId: query.telegramAdProductId }
          : {}),
      },
      orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        telegramChannelId: true,
        telegramAdProductId: true,
        calculatedAt: true,
        expectedViews: true,
        recommendedPrice: true,
        minimumPrice: true,
        targetCpm: true,
        minimumCpm: true,
        postsSampleCount: true,
        methodVersion: true,
      },
    });
    const deduped = new Map<string, any>();
    for (const point of history) {
      const key = `${bucketAdSalesAnalyticsDate(point.calculatedAt, granularity)}:${point.telegramChannelId}:${point.telegramAdProductId ?? 'default'}`;
      deduped.set(key, point);
    }
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      granularity,
      points: [...deduped.values()].map((point) => ({
        date: bucketAdSalesAnalyticsDate(point.calculatedAt, granularity),
        channelId: point.telegramChannelId,
        productId: point.telegramAdProductId,
        expectedViews: point.expectedViews,
        recommendedPrice: decimalToString(point.recommendedPrice),
        minimumPrice: decimalToString(point.minimumPrice),
        targetCpm: decimalToString(point.targetCpm),
        minimumCpm: decimalToString(point.minimumCpm),
        sampleCount: point.postsSampleCount,
        methodVersion: point.methodVersion,
      })),
    };
  }

  async inventoryAnalytics(
    userId: string,
    query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const channelIds = query.channelIds?.length
      ? query.channelIds
      : await this.resolveAnalyticsChannelIds({
          workspaceId,
          channelId: query.channelId,
          networkId: query.networkId,
        });
    const snapshots = await this.loadInventorySnapshots({
      workspaceId,
      channelIds,
      from,
      to,
    });
    return buildAdSalesInventoryAnalytics({ snapshots, from, to, timezone });
  }

  async analyticsAlerts(userId: string, query: TelegramAdAlertsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const [dataset, inventory] = await Promise.all([
      this.adAnalyticsDataset({
        workspaceId,
        from,
        to,
        channelIds: this.analyticsChannelIds(query),
        networkId: query.networkId ?? null,
      }),
      this.inventoryAnalytics(userId, query),
    ]);
    return buildAdSalesAnalyticsAlerts({
      dataset,
      inventory,
      from,
      to,
      timezone,
      kinds: query.kinds,
    });
  }

  async listAdvertisers(userId: string, query: TelegramAdvertisersQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const search = query.search?.trim();
    const where: Prisma.TelegramAdvertiserWhereInput = {
      workspaceId,
      ...(query.archived ? {} : { archivedAt: null }),
      ...legacyAdvertiserFilter(query),
      ...(query.ownerMemberId ? { ownerMemberId: query.ownerMemberId } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              {
                telegramUsername: {
                  contains: this.normalizeTelegramUsername(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: this.normalizePhone(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: this.normalizeEmail(search) ?? search,
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
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiser.findMany({
        where,
        include: this.advertiserInclude(),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiser.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((item) => this.mapAdvertiser(item)),
      totalItems,
      pagination,
    );
  }

  async advertiserSearch(
    userId: string,
    query: TelegramAdvertiserSearchDto,
    ownerMemberId?: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const search = query.q.trim();
    const normalizedVariants = [
      search.toLowerCase(),
      this.normalizeTelegramUsername(search),
      this.normalizePhone(search),
      this.normalizeEmail(search),
    ].filter(Boolean) as string[];
    const items = await this.prisma.telegramAdvertiser.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        ...(ownerMemberId ? { ownerMemberId } : {}),
        OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          ...normalizedVariants.map((value) => ({
            telegramUsername: { contains: value, mode: 'insensitive' as const },
          })),
          ...normalizedVariants.map((value) => ({
            phone: { contains: value, mode: 'insensitive' as const },
          })),
          ...normalizedVariants.map((value) => ({
            email: { contains: value, mode: 'insensitive' as const },
          })),
          ...normalizedVariants.map((value) => ({
            contacts: {
              some: {
                normalizedValue: {
                  contains: value,
                  mode: 'insensitive' as const,
                },
              },
            },
          })),
        ],
      },
      include: telegramAdvertiserCompatibilityInclude,
      orderBy: [
        { totalRevenueInPrimaryCurrency: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: Math.max(1, Math.min(20, query.limit ?? 10)),
    });
    return items.map((item) => this.mapAdvertiser(item));
  }

  async getAdvertiserDetails(userId: string, advertiserId: string) {
    const workspaceId = await this.workspace(userId);
    return this.mapAdvertiser(
      await this.getAdvertiser(workspaceId, advertiserId),
    );
  }

  async createAdvertiser(userId: string, dto: CreateTelegramAdvertiserDto) {
    const workspaceId = await this.workspace(userId);
    const advertiser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.telegramAdvertiser.create({
        data: {
          workspaceId,
          displayName: dto.displayName.trim(),
          companyName: dto.companyName?.trim() || null,
          telegramUsername: this.normalizeTelegramUsername(
            dto.telegramUsername,
          ),
          phone: this.normalizePhone(dto.phone),
          email: this.normalizeEmail(dto.email),
          website: this.normalizeWebsite(dto.website),
          description: dto.description?.trim() || null,
          source: dto.source?.trim() || null,
          stage: stageFromLegacyAdvertiser(dto) ?? TelegramCrmContactStage.NEW,
          archivedAt:
            stageFromLegacyAdvertiser(dto) === TelegramCrmContactStage.ARCHIVED
              ? new Date()
              : null,
          ownerMemberId: dto.ownerMemberId ?? null,
          createdByUserId: userId,
          nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : null,
          defaultFollowUpDays: dto.defaultFollowUpDays ?? null,
          preferredCurrency: dto.preferredCurrency ?? null,
          preferredContactMethod: dto.preferredContactMethod ?? null,
        },
      });
      await syncLegacyCrmPeer(tx, {
        workspaceId,
        contactId: created.id,
        telegramUserId: dto.telegramUserId,
        telegramUserIdSpecified: Boolean(dto.telegramUserId?.trim()),
        username: dto.telegramUsername,
        usernameSpecified: dto.telegramUsername !== undefined,
      });
      return tx.telegramAdvertiser.findUniqueOrThrow({
        where: { id: created.id },
        include: this.advertiserInclude(),
      });
    });
    await this.createAdvertiserActivity(workspaceId, advertiser.id, {
      type: TelegramAdvertiserActivityType.ADVERTISER_CREATED,
      title: 'Advertiser created',
      actorUserId: userId,
    });
    return this.mapAdvertiser(advertiser);
  }

  async updateAdvertiser(
    userId: string,
    advertiserId: string,
    dto: UpdateTelegramAdvertiserDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const stage = stageFromLegacyAdvertiser(dto);
    const advertiser = await this.prisma.$transaction(async (tx) => {
      await tx.telegramAdvertiser.update({
        where: { id: advertiserId },
        data: {
          ...(dto.displayName === undefined
            ? {}
            : { displayName: dto.displayName.trim() }),
          ...(dto.companyName === undefined
            ? {}
            : { companyName: dto.companyName?.trim() || null }),
          ...(dto.telegramUsername === undefined
            ? {}
            : {
                telegramUsername: this.normalizeTelegramUsername(
                  dto.telegramUsername,
                ),
              }),
          ...(dto.phone === undefined
            ? {}
            : { phone: this.normalizePhone(dto.phone) }),
          ...(dto.email === undefined
            ? {}
            : { email: this.normalizeEmail(dto.email) }),
          ...(dto.website === undefined
            ? {}
            : { website: this.normalizeWebsite(dto.website) }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() || null }),
          ...(dto.source === undefined
            ? {}
            : { source: dto.source?.trim() || null }),
          ...(stage === undefined
            ? {}
            : {
                stage,
                archivedAt:
                  stage === TelegramCrmContactStage.ARCHIVED
                    ? new Date()
                    : null,
              }),
          ...(dto.ownerMemberId === undefined
            ? {}
            : { ownerMemberId: dto.ownerMemberId }),
          ...(dto.nextContactAt === undefined
            ? {}
            : {
                nextContactAt: dto.nextContactAt
                  ? new Date(dto.nextContactAt)
                  : null,
              }),
          ...(dto.defaultFollowUpDays === undefined
            ? {}
            : { defaultFollowUpDays: dto.defaultFollowUpDays }),
          ...(dto.preferredCurrency === undefined
            ? {}
            : { preferredCurrency: dto.preferredCurrency }),
          ...(dto.preferredContactMethod === undefined
            ? {}
            : { preferredContactMethod: dto.preferredContactMethod }),
        },
      });
      await syncLegacyCrmPeer(tx, {
        workspaceId,
        contactId: advertiserId,
        telegramUserId: dto.telegramUserId,
        telegramUserIdSpecified: dto.telegramUserId !== undefined,
        username: dto.telegramUsername,
        usernameSpecified: dto.telegramUsername !== undefined,
      });
      return tx.telegramAdvertiser.findUniqueOrThrow({
        where: { id: advertiserId },
        include: this.advertiserInclude(),
      });
    });
    return this.mapAdvertiser(advertiser);
  }

  async archiveAdvertiser(userId: string, advertiserId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const advertiser = await this.prisma.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: {
        archivedAt: new Date(),
        stage: TelegramCrmContactStage.ARCHIVED,
      },
      include: this.advertiserInclude(),
    });
    return this.mapAdvertiser(advertiser);
  }

  async restoreAdvertiser(userId: string, advertiserId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const advertiser = await this.prisma.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: { archivedAt: null, stage: TelegramCrmContactStage.LEAD },
      include: this.advertiserInclude(),
    });
    return this.mapAdvertiser(advertiser);
  }

  async addAdvertiserContact(
    userId: string,
    advertiserId: string,
    dto: CreateTelegramAdvertiserContactDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const normalizedValue = this.normalizeContactValue(dto.type, dto.value);
    if (!normalizedValue)
      throw new BadRequestException('Contact value is required');
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.telegramAdvertiserContact.updateMany({
          where: { workspaceId, advertiserId },
          data: { isPrimary: false },
        });
      }
      return tx.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId,
          type: dto.type,
          value: dto.value.trim(),
          normalizedValue,
          label: dto.label?.trim() || null,
          isPrimary: dto.isPrimary ?? false,
          isVerified: dto.isVerified ?? false,
        },
      });
    });
    await this.createAdvertiserActivity(workspaceId, advertiserId, {
      type: TelegramAdvertiserActivityType.CONTACT_ADDED,
      title: `Contact added: ${dto.type}`,
      actorUserId: userId,
      metadata: {
        contactId: contact.id,
        type: dto.type,
      } as Prisma.InputJsonValue,
    });
    return this.mapAdvertiserContact(contact);
  }

  async updateAdvertiserContact(
    userId: string,
    advertiserId: string,
    contactId: string,
    dto: UpdateTelegramAdvertiserContactDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const existing = await this.prisma.telegramAdvertiserContact.findFirst({
      where: { id: contactId, workspaceId, advertiserId },
    });
    if (!existing)
      throw new NotFoundException('Telegram advertiser contact not found');
    const nextType = dto.type ?? existing.type;
    const nextValue = dto.value ?? existing.value;
    const normalizedValue = this.normalizeContactValue(nextType, nextValue);
    if (!normalizedValue)
      throw new BadRequestException('Contact value is required');
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.telegramAdvertiserContact.updateMany({
          where: { workspaceId, advertiserId },
          data: { isPrimary: false },
        });
      }
      return tx.telegramAdvertiserContact.update({
        where: { id: contactId },
        data: {
          type: nextType,
          value: nextValue.trim(),
          normalizedValue,
          ...(dto.label === undefined
            ? {}
            : { label: dto.label?.trim() || null }),
          ...(dto.isPrimary === undefined ? {} : { isPrimary: dto.isPrimary }),
          ...(dto.isVerified === undefined
            ? {}
            : { isVerified: dto.isVerified }),
        },
      });
    });
    return this.mapAdvertiserContact(contact);
  }

  async deleteAdvertiserContact(
    userId: string,
    advertiserId: string,
    contactId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    await this.prisma.telegramAdvertiserContact.deleteMany({
      where: { id: contactId, workspaceId, advertiserId },
    });
    return { success: true };
  }

  async setPrimaryAdvertiserContact(
    userId: string,
    advertiserId: string,
    contactId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const [_, contact] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserContact.updateMany({
        where: { workspaceId, advertiserId },
        data: { isPrimary: false },
      }),
      this.prisma.telegramAdvertiserContact.update({
        where: { id: contactId },
        data: { isPrimary: true },
      }),
    ]);
    return this.mapAdvertiserContact(contact);
  }

  async listAdvertiserActivities(
    userId: string,
    advertiserId: string,
    query: TelegramAdvertiserActivitiesQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const pagination = normalizePagination(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserActivity.findMany({
        where: { workspaceId, advertiserId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiserActivity.count({
        where: { workspaceId, advertiserId },
      }),
    ]);
    return createPaginatedResponse(
      items.map((item) => this.mapAdvertiserActivity(item)),
      totalItems,
      pagination,
    );
  }

  async createAdvertiserActivityEntry(
    userId: string,
    advertiserId: string,
    dto: CreateTelegramAdvertiserActivityDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const activity = await this.createAdvertiserActivity(
      workspaceId,
      advertiserId,
      {
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        actorUserId: userId,
        metadata: (dto.metadata as Prisma.InputJsonValue | undefined) ?? null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    );
    return this.mapAdvertiserActivity(activity);
  }

  async createAdvertiserNote(
    userId: string,
    advertiserId: string,
    dto: CreateTelegramAdvertiserActivityDto,
  ) {
    return this.createAdvertiserActivityEntry(userId, advertiserId, {
      ...dto,
      type: TelegramAdvertiserActivityType.NOTE_ADDED,
    });
  }

  async listCrmTasks(
    userId: string,
    query: TelegramAdvertiserTasksQueryDto,
    ownerMemberId?: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramAdvertiserTaskWhereInput = {
      workspaceId,
      ...(ownerMemberId ? { advertiser: { ownerMemberId } } : {}),
      ...(query.advertiserId ? { advertiserId: query.advertiserId } : {}),
      ...(query.assignedMemberId
        ? { assignedMemberId: query.assignedMemberId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserTask.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiserTask.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((item) => this.mapAdvertiserTask(item)),
      totalItems,
      pagination,
    );
  }

  async createAdvertiserTask(
    userId: string,
    advertiserId: string,
    dto: CreateTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const task = await this.prisma.telegramAdvertiserTask.create({
      data: {
        workspaceId,
        advertiserId,
        saleId: dto.saleId ?? null,
        placementId: dto.placementId ?? null,
        assignedMemberId: dto.assignedMemberId,
        createdByUserId: userId,
        type: dto.type,
        priority: dto.priority ?? TelegramAdvertiserTaskPriority.NORMAL,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        dueAt: new Date(dto.dueAt),
        remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
        metadata:
          (dto.metadata as Prisma.InputJsonValue | undefined) ??
          Prisma.JsonNull,
      },
    });
    await this.createAdvertiserActivity(workspaceId, advertiserId, {
      type: TelegramAdvertiserActivityType.FOLLOW_UP_CREATED,
      title: task.title,
      taskId: task.id,
      saleId: task.saleId,
      placementId: task.placementId,
      actorUserId: userId,
    });
    return this.mapAdvertiserTask(task);
  }

  async updateCrmTask(
    userId: string,
    taskId: string,
    dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdvertiserTask.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!existing)
      throw new NotFoundException('Telegram advertiser task not found');
    const task = await this.prisma.telegramAdvertiserTask.update({
      where: { id: taskId },
      data: {
        ...(dto.assignedMemberId === undefined
          ? {}
          : { assignedMemberId: dto.assignedMemberId }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.priority === undefined ? {} : { priority: dto.priority }),
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description?.trim() || null }),
        ...(dto.dueAt === undefined
          ? {}
          : { dueAt: dto.dueAt ? new Date(dto.dueAt) : existing.dueAt }),
        ...(dto.remindAt === undefined
          ? {}
          : { remindAt: dto.remindAt ? new Date(dto.remindAt) : null }),
        ...(dto.snoozedUntil === undefined
          ? {}
          : {
              snoozedUntil: dto.snoozedUntil
                ? new Date(dto.snoozedUntil)
                : null,
            }),
      },
    });
    return this.mapAdvertiserTask(task);
  }

  async completeCrmTask(
    userId: string,
    taskId: string,
    dto: CompleteTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdvertiserTask.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!existing)
      throw new NotFoundException('Telegram advertiser task not found');
    const task = await this.prisma.telegramAdvertiserTask.update({
      where: { id: taskId },
      data: {
        status: TelegramAdvertiserTaskStatus.COMPLETED,
        completedAt: existing.completedAt ?? new Date(),
        completionNote: dto.completionNote?.trim() || null,
      },
    });
    const activityExists =
      await this.prisma.telegramAdvertiserActivity.findFirst({
        where: {
          workspaceId,
          advertiserId: task.advertiserId,
          taskId,
          type: TelegramAdvertiserActivityType.FOLLOW_UP_COMPLETED,
        },
      });
    if (!activityExists) {
      await this.createAdvertiserActivity(workspaceId, task.advertiserId, {
        type: TelegramAdvertiserActivityType.FOLLOW_UP_COMPLETED,
        title: task.title,
        taskId: task.id,
        saleId: task.saleId,
        placementId: task.placementId,
        actorUserId: userId,
        description: dto.completionNote?.trim() || null,
      });
    }
    return this.mapAdvertiserTask(task);
  }

  async snoozeCrmTask(
    userId: string,
    taskId: string,
    dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    return this.updateCrmTask(userId, taskId, dto);
  }

  async skipCrmTask(
    userId: string,
    taskId: string,
    dto: SkipTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdvertiserTask.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!existing)
      throw new NotFoundException('Telegram advertiser task not found');
    const task = await this.prisma.telegramAdvertiserTask.update({
      where: { id: taskId },
      data: {
        status: TelegramAdvertiserTaskStatus.SKIPPED,
        skippedAt: new Date(),
        completionNote: dto.reason?.trim() || null,
      },
    });
    await this.createAdvertiserActivity(workspaceId, task.advertiserId, {
      type: TelegramAdvertiserActivityType.FOLLOW_UP_SKIPPED,
      title: task.title,
      taskId: task.id,
      actorUserId: userId,
      description: dto.reason?.trim() || null,
    });
    return this.mapAdvertiserTask(task);
  }

  async rebuildInventorySnapshots(
    userId: string,
    dto: TelegramAdInventoryRebuildDto,
  ) {
    const membership = await this.workspaceService.requireWorkspaceRole(
      userId,
      [WorkspaceRole.owner, WorkspaceRole.admin],
    );
    const workspaceId = membership.workspaceId;
    const from = this.startOfUtcDay(new Date(dto.dateFrom));
    const to = this.endOfUtcDay(new Date(dto.dateTo));
    const days = this.listDatesInRange(from, to);
    if (days.length > 366) {
      throw new BadRequestException('Rebuild range cannot exceed 366 days');
    }
    const channelIds = dto.channelIds?.length
      ? dto.channelIds
      : dto.networkId
        ? (
            await this.findWorkspaceNetwork(workspaceId, dto.networkId)
          ).channels.map((item) => item.telegramChannelId)
        : [];
    if (channelIds.length > 50) {
      throw new BadRequestException('Rebuild cannot exceed 50 channels');
    }
    const uniqueChannelIds = [...new Set(channelIds)];
    const jobRunId = `inventory-rebuild:${Date.now()}`;
    if (dto.dryRun) {
      const existing = await this.prisma.telegramAdInventoryDailySnapshot.count(
        {
          where: {
            workspaceId,
            telegramChannelId: { in: uniqueChannelIds },
            date: { gte: from, lte: this.startOfUtcDay(to) },
          },
        },
      );
      return {
        dryRun: true,
        force: dto.force,
        jobRunId,
        channels: uniqueChannelIds.length,
        days: days.length,
        estimatedChanges: uniqueChannelIds.length * days.length,
        existingSnapshots: existing,
      };
    }
    if (dto.force !== true) {
      throw new BadRequestException(
        'force must be explicitly true for a rebuild run',
      );
    }
    let processed = 0;
    let success = 0;
    let failed = 0;
    let skipped = 0;
    for (const channelId of uniqueChannelIds) {
      for (const date of days) {
        processed += 1;
        try {
          const snapshot = await this.buildInventorySnapshotForDate({
            workspaceId,
            channelId,
            date,
            force: dto.force,
          });
          const result = await this.saveInventorySnapshot(snapshot, {
            force: dto.force,
          });
          if (result.status === 'skipped') skipped += 1;
          else success += 1;
        } catch (error) {
          failed += 1;
        }
      }
    }
    this.logger.info({
      event: 'telegram_ad_sales.inventory_rebuild',
      message: `Inventory rebuild finished: ${jobRunId}`,
      metadata: {
        jobRunId,
        workspaceId,
        processed,
        success,
        failed,
        skipped,
        channelIds: uniqueChannelIds,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      },
    });
    return {
      dryRun: false,
      force: dto.force,
      jobRunId,
      processed,
      success,
      failed,
      skipped,
    };
  }

  async priceFillCorrelation(
    userId: string,
    query: TelegramAdPriceFillCorrelationQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const bucketMap = { DAY: 'day', WEEK: 'week', MONTH: 'month' } as const;
    const granularity = bucketMap[query.bucket ?? 'DAY'];
    const channelIds = await this.resolveAnalyticsChannelIds({
      workspaceId,
      channelId: query.channelId,
      networkId: query.networkId,
      networkMode: query.networkMode,
    });
    const snapshots = await this.loadInventorySnapshots({
      workspaceId,
      channelIds,
      from,
      to,
    });
    const grouped = new Map<string, any[]>();
    for (const snapshot of snapshots) {
      const key = bucketAdSalesAnalyticsDate(snapshot.date, granularity);
      grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
    }
    const points = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => {
        const metrics = this.aggregateInventorySnapshots(items);
        return {
          periodStart: key,
          periodEnd: key,
          eligibleSlots: metrics.eligibleSlots,
          bookedSlots: metrics.bookedSlots,
          publishedSlots: metrics.publishedSlots,
          fillRate: Number(metrics.bookingFillRate.toFixed(2)),
          averageAgreedPrice: decimalToString(metrics.averageAgreedPrice),
          medianAgreedPrice: decimalToString(metrics.medianAgreedPrice),
          averageRecommendedPrice: decimalToString(
            metrics.averageRecommendedPrice,
          ),
          agreedRevenue: decimalToString(metrics.agreedRevenue),
          paidRevenue: decimalToString(metrics.paidRevenue),
          revenuePerEligibleSlot: decimalToString(
            metrics.revenuePerEligibleSlot,
          ),
          revenuePerPublishedSlot: decimalToString(
            metrics.revenuePerPublishedSlot,
          ),
          unsoldInventoryOpportunity: decimalToString(
            metrics.unsoldInventoryOpportunity,
          ),
          underpricingLoss: decimalToString(metrics.underpricingLoss),
        };
      });
    const correlation = (pairs: Array<{ x: number; y: number }>) => {
      if (pairs.length < 2) return null;
      const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
      const yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
      const numerator = pairs.reduce(
        (sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean),
        0,
      );
      const xDenominator = Math.sqrt(
        pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0),
      );
      const yDenominator = Math.sqrt(
        pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0),
      );
      if (xDenominator === 0 || yDenominator === 0) return null;
      return Number((numerator / (xDenominator * yDenominator)).toFixed(4));
    };
    const priceFillPairs = points.map((point) => ({
      x: Number(point.averageAgreedPrice ?? 0),
      y: point.fillRate,
    }));
    const priceRevenuePairs = points.map((point) => ({
      x: Number(point.averageAgreedPrice ?? 0),
      y: Number(point.agreedRevenue ?? 0),
    }));
    const fillRevenuePairs = points.map((point) => ({
      x: point.fillRate,
      y: Number(point.agreedRevenue ?? 0),
    }));
    const sampleSize = points.length;
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      sampleSize,
      confidence:
        sampleSize < 6
          ? 'INSUFFICIENT_DATA'
          : sampleSize < 12
            ? 'LOW'
            : 'NORMAL',
      warnings:
        sampleSize < 6
          ? [
              'Observed correlation is unavailable because fewer than 6 buckets were found.',
            ]
          : sampleSize < 12
            ? [
                'Observed correlation is based on a small sample and has low confidence.',
              ]
            : ['Observed correlation does not prove causation.'],
      priceFillCorrelation: correlation(priceFillPairs),
      priceRevenueCorrelation: correlation(priceRevenuePairs),
      fillRevenueCorrelation: correlation(fillRevenuePairs),
      points,
    };
  }

  async revenueScenario(userId: string, dto: TelegramAdRevenueScenarioDto) {
    const workspaceId = await this.workspace(userId);
    const from = this.startOfUtcDay(new Date(dto.dateFrom));
    const to = this.endOfUtcDay(new Date(dto.dateTo));
    const channelIds = await this.resolveAnalyticsChannelIds({
      workspaceId,
      channelId: dto.channelId,
      networkId: dto.networkId,
      networkMode: dto.networkMode,
    });
    const snapshots = await this.loadInventorySnapshots({
      workspaceId,
      channelIds,
      from,
      to,
    });
    const metrics = this.aggregateInventorySnapshots(snapshots);
    const currentAveragePrice = Number(
      decimalToString(metrics.averageAgreedPrice) ?? 0,
    );
    const currentFillRate = metrics.bookingFillRate;
    const proposedAveragePrice =
      dto.proposedFixedPrice ??
      Number(
        (
          currentAveragePrice *
          (1 + (dto.proposedPriceChangePercent ?? 0) / 100)
        ).toFixed(2),
      );
    const assumedFillRate =
      dto.assumedFillRate ??
      (dto.useHistoricalElasticity && snapshots.length >= 12
        ? Math.max(0, Math.min(100, currentFillRate))
        : currentFillRate);
    const projectedBookedSlots = Math.round(
      metrics.eligibleSlots * (assumedFillRate / 100),
    );
    const projectedRevenue =
      decimal(proposedAveragePrice).mul(projectedBookedSlots);
    return {
      currentAveragePrice: currentAveragePrice.toFixed(2),
      currentFillRate: Number(currentFillRate.toFixed(2)),
      currentEligibleSlots: metrics.eligibleSlots,
      currentRevenue: decimalToString(metrics.agreedRevenue),
      proposedAveragePrice: proposedAveragePrice.toFixed(2),
      assumedFillRate: Number(assumedFillRate.toFixed(2)),
      projectedBookedSlots,
      projectedRevenue: decimalToString(projectedRevenue),
      projectedRevenuePerEligibleSlot:
        metrics.eligibleSlots > 0
          ? decimalToString(projectedRevenue.div(metrics.eligibleSlots))
          : '0',
      difference: decimalToString(projectedRevenue.sub(metrics.agreedRevenue)),
      differencePercent: metrics.agreedRevenue.gt(0)
        ? Number(
            projectedRevenue
              .sub(metrics.agreedRevenue)
              .div(metrics.agreedRevenue)
              .mul(100)
              .toFixed(2),
          )
        : null,
      warnings:
        dto.useHistoricalElasticity && snapshots.length < 12
          ? [
              'Historical elasticity was not applied because the sample is too small.',
            ]
          : ['Scenario analysis is a projection, not a forecast.'],
      methodology:
        dto.useHistoricalElasticity && snapshots.length >= 12
          ? 'Historical fill rate was used as an observed reference. Correlation does not imply causation.'
          : 'Projection uses the provided or current fill rate assumption with transparent arithmetic.',
    };
  }

  async inventoryDetails(
    userId: string,
    query: TelegramAdInventoryDetailsQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const from = query.dateFrom
      ? this.startOfUtcDay(new Date(query.dateFrom))
      : undefined;
    const to = query.dateTo
      ? this.endOfUtcDay(new Date(query.dateTo))
      : undefined;
    const channelIds = await this.resolveAnalyticsChannelIds({
      workspaceId,
      channelId: query.channelId,
      networkId: query.networkId,
    });
    const where: Prisma.TelegramAdSalePlacementWhereInput = {
      workspaceId,
      telegramChannelId: { in: channelIds },
      ...(from || to
        ? {
            scheduledAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdSalePlacement.findMany({
        where,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          telegramAdSaleId: true,
          telegramChannelId: true,
          status: true,
          scheduledAt: true,
          agreedPrice: true,
          recommendedPrice: true,
          expectedViews: true,
          actualViewsFinal: true,
          actualReactionsFinal: true,
          actualCpm: true,
          currency: true,
          sale: {
            select: {
              advertiserName: true,
            },
          },
          paymentAllocations: {
            select: {
              amount: true,
              payment: { select: { status: true } },
            },
          },
        },
      }),
      this.prisma.telegramAdSalePlacement.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((item) => ({
        placementId: item.id,
        saleId: item.telegramAdSaleId,
        channelId: item.telegramChannelId,
        advertiserName: item.sale.advertiserName,
        agreedPrice: decimalToString(item.agreedPrice),
        recommendedPrice: decimalToString(item.recommendedPrice),
        status: item.status,
        scheduledAt: item.scheduledAt.toISOString(),
        paidAmount: decimalToString(
          item.paymentAllocations.reduce(
            (sum, allocation) =>
              allocation.payment.status === TelegramAdSalePaymentStatus.VOIDED
                ? sum
                : sum.add(decimal(allocation.amount)),
            decimal(0),
          ),
        ),
        expectedViews: item.expectedViews,
        actualViews: item.actualViewsFinal,
        cpm: decimalToString(item.actualCpm),
        currency: item.currency,
      })),
      totalItems,
      pagination,
    );
  }

  async listSales(userId: string, query: TelegramAdSalesQueryDto) {
    return this.saleReadService.listSales(userId, query);
  }

  async getSale(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    return this.mapSale(await this.getSaleDetails(workspaceId, id));
  }

  async createSale(userId: string, dto: CreateTelegramAdSaleDto) {
    const automationEligibleAt = new Date();
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const advertiser = await this.resolveAdvertiserForSale(
      workspaceId,
      userId,
      dto,
      assignedMemberId,
    );
    const sale = await this.prisma.telegramAdSale.create({
      data: {
        workspaceId,
        advertiserId: advertiser?.id ?? dto.advertiserId ?? null,
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
        title: dto.title?.trim() || null,
        notes: dto.notes?.trim() || null,
        origin: dto.origin ?? TelegramAdSaleOrigin.DIRECT,
        crmDealStage: dto.crmDealStage ?? TelegramAdCrmDealStage.NEW_LEAD,
        expectedCloseAt: dto.expectedCloseAt
          ? new Date(dto.expectedCloseAt)
          : null,
        lostReason: dto.lostReason?.trim() || null,
        nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
        settlementCurrency: dto.settlementCurrency,
        reservedUntil: dto.reservedUntil ? new Date(dto.reservedUntil) : null,
        sourceTaskId: dto.sourceTaskId ?? null,
        sourceAdvertiserActivityId: dto.sourceAdvertiserActivityId ?? null,
        createdByUserId: userId,
        assignedMemberId,
        customerAutomationEligibleAt: automationEligibleAt,
      },
      include: this.includeSaleRelations(),
    });
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
      await this.createAdvertiserActivity(workspaceId, sale.advertiserId, {
        type: TelegramAdvertiserActivityType.SALE_CREATED,
        title: sale.title?.trim() || sale.advertiserName,
        saleId: sale.id,
        actorUserId: userId,
      });
    }
    await this.automationFacts?.dealCreated(
      workspaceId,
      sale.id,
      automationEligibleAt,
    );
    return this.mapSale(sale);
  }

  async updateSale(userId: string, id: string, dto: UpdateTelegramAdSaleDto) {
    if (isDedicatedSaleCancellation(dto)) return this.cancelSale(userId, id);
    const workspaceId = await this.workspace(userId);
    const existing = await this.getSaleDetails(workspaceId, id);
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    if (dto.status) {
      this.assertSaleTransition(existing.status, dto.status);
      if (
        dto.status === TelegramAdSaleStatus.CONFIRMED &&
        !existing.placements.length
      ) {
        throw new BadRequestException('Cannot confirm sale without placements');
      }
    }
    const linkedAdvertiser =
      dto.advertiserId === undefined
        ? existing.advertiser
        : dto.advertiserId
          ? await this.getAdvertiser(workspaceId, dto.advertiserId)
          : null;
    if (
      dto.crmDealStage === TelegramAdCrmDealStage.LOST &&
      !dto.lostReason &&
      !existing.lostReason
    ) {
      throw new BadRequestException(
        'lostReason is required when crmDealStage is LOST',
      );
    }
    const sale = await this.prisma.telegramAdSale.update({
      where: { id },
      data: {
        ...(dto.advertiserId === undefined
          ? {}
          : { advertiserId: dto.advertiserId }),
        ...(dto.advertiserName === undefined
          ? {}
          : { advertiserName: dto.advertiserName.trim() }),
        ...(dto.advertiserTelegram === undefined
          ? {}
          : { advertiserTelegram: dto.advertiserTelegram?.trim() || null }),
        ...(dto.advertiserContact === undefined
          ? {}
          : { advertiserContact: dto.advertiserContact?.trim() || null }),
        ...(dto.advertiserCompanyName === undefined
          ? {}
          : {
              advertiserCompanySnapshot:
                dto.advertiserCompanyName?.trim() || null,
            }),
        ...(dto.title === undefined
          ? {}
          : { title: dto.title?.trim() || null }),
        ...(dto.notes === undefined
          ? {}
          : { notes: dto.notes?.trim() || null }),
        ...(dto.origin === undefined ? {} : { origin: dto.origin }),
        ...(dto.settlementCurrency === undefined
          ? {}
          : { settlementCurrency: dto.settlementCurrency }),
        ...(dto.reservedUntil === undefined
          ? {}
          : {
              reservedUntil: dto.reservedUntil
                ? new Date(dto.reservedUntil)
                : null,
            }),
        ...(assignedMemberId === undefined ? {} : { assignedMemberId }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.crmDealStage === undefined
          ? {}
          : { crmDealStage: dto.crmDealStage }),
        ...(dto.expectedCloseAt === undefined
          ? {}
          : {
              expectedCloseAt: dto.expectedCloseAt
                ? new Date(dto.expectedCloseAt)
                : null,
            }),
        ...(dto.lostReason === undefined
          ? {}
          : { lostReason: dto.lostReason?.trim() || null }),
        ...(dto.nextActionAt === undefined
          ? {}
          : {
              nextActionAt: dto.nextActionAt
                ? new Date(dto.nextActionAt)
                : null,
            }),
        ...(dto.sourceTaskId === undefined
          ? {}
          : { sourceTaskId: dto.sourceTaskId }),
        ...(dto.sourceAdvertiserActivityId === undefined
          ? {}
          : { sourceAdvertiserActivityId: dto.sourceAdvertiserActivityId }),
        ...(dto.advertiserId === undefined &&
        dto.advertiserName === undefined &&
        dto.advertiserTelegram === undefined &&
        dto.advertiserCompanyName === undefined
          ? {}
          : {
              advertiserNameSnapshot:
                dto.advertiserName?.trim() ||
                (linkedAdvertiser?.displayName ??
                  existing.advertiserNameSnapshot ??
                  existing.advertiserName),
              advertiserTelegramSnapshot:
                dto.advertiserTelegram === undefined
                  ? (linkedAdvertiser?.telegramUsername ??
                    existing.advertiserTelegramSnapshot ??
                    existing.advertiserTelegram)
                  : dto.advertiserTelegram?.trim() || null,
              advertiserCompanySnapshot:
                dto.advertiserCompanyName === undefined
                  ? (linkedAdvertiser?.companyName ??
                    existing.advertiserCompanySnapshot ??
                    null)
                  : dto.advertiserCompanyName?.trim() || null,
            }),
      },
      include: this.includeSaleRelations(),
    });
    this.invalidateAvailabilityCache(workspaceId);
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    if (dto.crmDealStage && sale.advertiserId) {
      await this.createAdvertiserActivity(workspaceId, sale.advertiserId, {
        type: TelegramAdvertiserActivityType.SALE_STAGE_CHANGED,
        title: `Sale stage changed to ${dto.crmDealStage}`,
        saleId: sale.id,
        actorUserId: userId,
      });
    }
    return this.mapSale(sale);
  }

  async deleteSale(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.getSaleDetails(workspaceId, id);
    const channelIds = [
      ...new Set(
        existing.placements.map(
          (placement: { telegramChannelId: string }) =>
            placement.telegramChannelId,
        ),
      ),
    ];
    const publishedPlacements = existing.placements.filter(
      (placement) =>
        placement.publishedAt &&
        !placement.deletedAt &&
        (placement.managedPost?.telegramMessageIds.length ||
          placement.telegramPost?.telegramMessageId),
    );
    const scheduledManagedPosts = new Map(
      existing.placements.flatMap((placement) =>
        placement.managedPost?.telegramScheduledMessageIds?.length
          ? [
              [
                placement.managedPost.id,
                {
                  ...placement.managedPost,
                  telegramChannel: placement.telegramChannel,
                },
              ] as const,
            ]
          : [],
      ),
    );
    for (const managedPost of scheduledManagedPosts.values()) {
      await this.telegramManagedPostPublicationService.cancelScheduledManagedPost(
        workspaceId,
        managedPost,
      );
    }
    for (const placement of publishedPlacements) {
      await this.deletePublishedPlacement(workspaceId, placement.id, {
        notifyScheduler: false,
      });
    }

    const transactionIds = existing.payments.flatMap((payment) =>
      [payment.transaction?.id, payment.reversalTransaction?.id].filter(
        (transactionId): transactionId is string => Boolean(transactionId),
      ),
    );
    const managedPostIds = existing.placements.flatMap((placement) =>
      placement.managedPost?.id ? [placement.managedPost.id] : [],
    );
    const telegramPostIds = existing.placements.flatMap((placement) =>
      placement.telegramPost?.id ? [placement.telegramPost.id] : [],
    );
    await this.automationFacts?.cancelled(workspaceId, id);
    await this.prisma.$transaction(async (tx) => {
      await deleteAdSaleRecords(tx, {
        workspaceId,
        saleId: id,
        transactionIds,
        managedPostIds,
        telegramPostIds,
      });
    });
    this.invalidateAvailabilityCache(workspaceId);
    this.notifyAdDeletionDueWorkChanged();
    if (existing.advertiserId)
      await this.recalculateAdvertiserStats(workspaceId, existing.advertiserId);
    return { id, channelIds };
  }

  async addPlacement(
    userId: string,
    saleId: string,
    dto: CreateTelegramAdSalePlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const channel = await this.findWorkspaceChannel(
      workspaceId,
      dto.telegramChannelId,
    );
    if (dto.telegramChannelNetworkId) {
      const network = await this.findWorkspaceNetwork(
        workspaceId,
        dto.telegramChannelNetworkId,
      );
      if (
        !network.channels.some((item) => item.telegramChannelId === channel.id)
      ) {
        throw new BadRequestException(
          'Selected network does not contain chosen channel',
        );
      }
    }
    const product = dto.telegramAdProductId
      ? await this.prisma.telegramAdProduct.findFirst({
          where: {
            id: dto.telegramAdProductId,
            workspaceId,
            telegramChannelId: channel.id,
          },
        })
      : null;
    if (dto.telegramAdProductId && !product) {
      throw new NotFoundException('Telegram ad product not found');
    }
    const snapshot = dto.pricingSnapshotId
      ? await this.prisma.telegramAdPriceSnapshot.findFirst({
          where: {
            id: dto.pricingSnapshotId,
            workspaceId,
            telegramChannelId: channel.id,
            ...(product ? { telegramAdProductId: product.id } : {}),
          },
        })
      : null;
    if (dto.pricingSnapshotId && !snapshot) {
      throw new NotFoundException('Pricing snapshot not found');
    }
    const expectedViewsResult = snapshot
      ? {
          expectedViews: snapshot.expectedViews,
          recommendedPrice: snapshot.recommendedPrice,
          minimumPrice: snapshot.minimumPrice,
          targetCpm: snapshot.targetCpm,
        }
      : null;
    let placement;
    try {
      placement = await this.prisma.telegramAdSalePlacement.create({
        data: {
          workspaceId,
          telegramAdSaleId: sale.id,
          telegramChannelId: channel.id,
          telegramChannelNetworkId: dto.telegramChannelNetworkId ?? null,
          telegramAdProductId: product?.id ?? null,
          inventoryOpportunityKey: dto.inventoryOpportunityKey?.trim() || null,
          pricingSnapshotId: snapshot?.id ?? null,
          status: TelegramAdPlacementStatus.DRAFT,
          scheduledAt: new Date(dto.scheduledAt),
          timezone: dto.timezone,
          pricingMode:
            dto.pricingMode ??
            product?.defaultPricingMode ??
            TelegramAdPricingMode.CPM,
          expectedViews:
            dto.expectedViews ?? expectedViewsResult?.expectedViews ?? 0,
          quotedCpm: decimalOrNull(dto.quotedCpm),
          recommendedPrice:
            decimalOrNull(dto.recommendedPrice) ??
            expectedViewsResult?.recommendedPrice ??
            decimal(0),
          minimumPrice:
            decimalOrNull(dto.minimumPrice) ??
            expectedViewsResult?.minimumPrice ??
            decimal(0),
          agreedPrice:
            decimalOrNull(dto.agreedPrice) ??
            expectedViewsResult?.recommendedPrice ??
            decimalOrNull(product?.defaultFixedPrice) ??
            decimal(0),
          currency:
            dto.currency ??
            snapshot?.currency ??
            product?.currency ??
            sale.settlementCurrency,
          topDurationMinutesSnapshot: product?.topDurationMinutes ?? null,
          feedDurationHoursSnapshot: product?.feedDurationHours ?? null,
          deleteAfterHoursSnapshot: product?.deleteAfterHours ?? null,
          isPermanentSnapshot: product?.isPermanent ?? false,
          manualPriceReason: dto.manualPriceReason?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This ad opportunity is already booked');
      }
      throw error;
    }
    this.invalidateAvailabilityCache(workspaceId);
    await this.automationFacts?.scheduleChanged(workspaceId, sale.id);
    return this.mapPlacement(placement);
  }

  async updatePlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: UpdateTelegramAdSalePlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(
      workspaceId,
      saleId,
      placementId,
    );
    const agreedPrice =
      dto.agreedPrice === undefined
        ? placement.agreedPrice
        : decimal(dto.agreedPrice);
    const minimumPrice =
      dto.minimumPrice === undefined
        ? placement.minimumPrice
        : decimal(dto.minimumPrice);
    const product =
      dto.telegramAdProductId === undefined || dto.telegramAdProductId === null
        ? null
        : await this.prisma.telegramAdProduct.findFirst({
            where: {
              id: dto.telegramAdProductId,
              workspaceId,
              telegramChannelId: placement.telegramChannelId,
              isActive: true,
            },
          });
    if (dto.telegramAdProductId && !product) {
      throw new NotFoundException('Telegram ad product not found');
    }
    const nextScheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : placement.scheduledAt;
    const nextDeleteAfterHours =
      dto.telegramAdProductId === undefined
        ? placement.deleteAfterHoursSnapshot
        : (product?.deleteAfterHours ?? null);
    const nextIsPermanent =
      dto.telegramAdProductId === undefined
        ? placement.isPermanentSnapshot
        : (product?.isPermanent ?? false);
    const underMinimumPricingChanged =
      !agreedPrice.eq(placement.agreedPrice) ||
      !minimumPrice.eq(placement.minimumPrice);
    if (
      agreedPrice.lt(minimumPrice) &&
      underMinimumPricingChanged &&
      !(dto.manualPriceReason ?? placement.manualPriceReason)
    ) {
      this.logger.info({
        level: 'warn',
        event: 'telegram_ad_sales.price_below_minimum',
        message: `Placement ${placementId} price below minimum`,
        metadata: {
          placementId,
          saleId,
        },
      });
      throw new BadRequestException({
        code: 'UNDER_MINIMUM_PRICE',
        message:
          'manualPriceReason is required when agreedPrice is below minimumPrice',
      });
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        ...(dto.scheduledAt === undefined
          ? {}
          : { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.telegramAdProductId === undefined
          ? {}
          : {
              telegramAdProductId: product?.id ?? null,
              topDurationMinutesSnapshot: product?.topDurationMinutes ?? null,
              feedDurationHoursSnapshot: product?.feedDurationHours ?? null,
              deleteAfterHoursSnapshot: nextDeleteAfterHours,
              isPermanentSnapshot: nextIsPermanent,
            }),
        ...((dto.scheduledAt !== undefined ||
          dto.telegramAdProductId !== undefined) &&
        placement.publishedAt
          ? {
              plannedDeleteAt: calculateAdPlacementDeleteAt({
                scheduledAt: nextScheduledAt,
                publishedAt: placement.publishedAt,
                deleteAfterHoursSnapshot: nextDeleteAfterHours,
                isPermanentSnapshot: nextIsPermanent,
              }),
            }
          : {}),
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
        ...(dto.pricingMode === undefined
          ? {}
          : { pricingMode: dto.pricingMode }),
        ...(dto.expectedViews === undefined
          ? {}
          : { expectedViews: dto.expectedViews }),
        ...(dto.recommendedPrice === undefined
          ? {}
          : { recommendedPrice: decimal(dto.recommendedPrice) }),
        ...(dto.minimumPrice === undefined
          ? {}
          : { minimumPrice: decimal(dto.minimumPrice) }),
        ...(dto.agreedPrice === undefined
          ? {}
          : { agreedPrice: decimal(dto.agreedPrice) }),
        ...(dto.quotedCpm === undefined
          ? {}
          : { quotedCpm: decimalOrNull(dto.quotedCpm) }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
        ...(dto.manualPriceReason === undefined
          ? {}
          : { manualPriceReason: dto.manualPriceReason?.trim() || null }),
        ...(dto.managedPostId === undefined
          ? {}
          : { managedPostId: dto.managedPostId || null }),
        ...(dto.telegramPostId === undefined
          ? {}
          : { telegramPostId: dto.telegramPostId || null }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    await this.automationFacts?.scheduleChanged(workspaceId, saleId);
    return {
      ...this.mapPlacement(updated),
      warnings: updated.agreedPrice.lt(updated.minimumPrice)
        ? [
            {
              code: 'UNDER_MINIMUM_PRICE',
              message: 'Placement price is below minimum',
            },
          ]
        : [],
    };
  }

  async createPayment(
    userId: string,
    saleId: string,
    dto: CreateTelegramAdSalePaymentDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, workspaceId, isActive: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    const paidAt = new Date(dto.paidAt);
    const { primaryCurrency, rate } = await this.resolveRateToPrimary(
      workspaceId,
      dto.currency,
      paidAt,
    );
    const category = await this.resolveSystemCategory(
      workspaceId,
      'channel_advertising_revenue',
    );
    const allocationPlacementIds = dto.allocations.map(
      (item) => item.placementId,
    );
    const placements = sale.placements.filter((placement: any) =>
      allocationPlacementIds.includes(placement.id),
    );
    if (placements.length !== dto.allocations.length) {
      throw new BadRequestException(
        'One or more allocations refer to invalid placements',
      );
    }
    const allocationTotal = dto.allocations.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    if (allocationTotal - dto.amount > 0.000001) {
      throw new BadRequestException(
        'Allocation total cannot exceed payment amount',
      );
    }
    for (const placement of placements) {
      const requestedAllocation = dto.allocations.find(
        (item) => item.placementId === placement.id,
      )!;
      const paidAlready = (placement.paymentAllocations ?? [])
        .filter(
          (allocation: any) =>
            allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
        )
        .reduce(
          (sum: number, allocation: any) => sum + Number(allocation.amount),
          0,
        );
      if (
        paidAlready +
          requestedAllocation.amount -
          Number(placement.agreedPrice) >
        0.000001
      ) {
        throw new BadRequestException(
          'Allocation exceeds placement agreedPrice',
        );
      }
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.telegramAdSalePayment.findFirst({
        where: { workspaceId, idempotencyKey: dto.idempotencyKey },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
      if (existing) return this.mapPayment(existing);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: account.id,
          telegramChannelId:
            placements.length === 1 ? placements[0].telegramChannelId : null,
          type: TransactionType.income,
          amount: decimal(dto.amount),
          currency: account.currency,
          amountInPrimaryCurrency: decimal(dto.amount * rate),
          exchangeRateToPrimary: decimal(rate),
          category: category.name,
          categoryId: category.id,
          description:
            dto.notes?.trim() || `Telegram ad sale payment ${sale.id}`,
          date: paidAt,
          assignedMemberId: sale.assignedMemberId ?? null,
          createdByUserId: userId,
        },
      });
      const createdPayment = await tx.telegramAdSalePayment.create({
        data: {
          workspaceId,
          telegramAdSaleId: sale.id,
          accountId: account.id,
          transactionId: transaction.id,
          amount: decimal(dto.amount),
          currency: dto.currency,
          amountInPrimaryCurrency: decimal(dto.amount * rate),
          exchangeRateToPrimary: decimal(rate),
          paidAt,
          notes: dto.notes?.trim() || null,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
          createdByUserId: userId,
          allocations: {
            create: dto.allocations.map((allocation) => ({
              workspaceId,
              telegramAdSalePlacementId: allocation.placementId,
              amount: decimal(allocation.amount),
              currency: dto.currency,
              amountInPrimaryCurrency: decimal(allocation.amount * rate),
            })),
          },
        },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
      return createdPayment;
    });
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    return this.mapPayment(payment);
  }

  async listPayments(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getSaleDetails(workspaceId, saleId);
    const payments = await this.prisma.telegramAdSalePayment.findMany({
      where: { workspaceId, telegramAdSaleId: saleId },
      orderBy: { paidAt: 'asc' },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
    return payments.map((payment) => this.mapPayment(payment));
  }

  async updatePayment(
    userId: string,
    saleId: string,
    paymentId: string,
    dto: UpdateTelegramAdSalePaymentDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const payment = await this.prisma.telegramAdSalePayment.findFirst({
      where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
    if (!payment)
      throw new NotFoundException('Telegram ad sale payment not found');
    if (payment.status === TelegramAdSalePaymentStatus.VOIDED) {
      throw new BadRequestException('Cannot update a voided payment');
    }
    const accountId = dto.accountId ?? payment.accountId;
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const amount = dto.amount ?? Number(payment.amount);
    const currency = dto.currency ?? payment.currency;
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : payment.paidAt;
    const allocations =
      dto.allocations ??
      payment.allocations.map((allocation: any) => ({
        placementId: allocation.telegramAdSalePlacementId,
        amount: Number(allocation.amount),
      }));
    const allocationPlacementIds = allocations.map((item) => item.placementId);
    const placements = sale.placements.filter((placement: any) =>
      allocationPlacementIds.includes(placement.id),
    );
    if (placements.length !== allocations.length) {
      throw new BadRequestException(
        'One or more allocations refer to invalid placements',
      );
    }
    const allocationTotal = allocations.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    if (allocationTotal - amount > 0.000001) {
      throw new BadRequestException(
        'Allocation total cannot exceed payment amount',
      );
    }
    for (const placement of placements) {
      const requestedAllocation = allocations.find(
        (item) => item.placementId === placement.id,
      )!;
      const paidAlready = (placement.paymentAllocations ?? [])
        .filter(
          (allocation: any) =>
            allocation.telegramAdSalePaymentId !== paymentId &&
            allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
        )
        .reduce(
          (sum: number, allocation: any) => sum + Number(allocation.amount),
          0,
        );
      if (
        paidAlready +
          requestedAllocation.amount -
          Number(placement.agreedPrice) >
        0.000001
      ) {
        throw new BadRequestException(
          'Allocation exceeds placement agreedPrice',
        );
      }
    }

    const { rate } = await this.resolveRateToPrimary(
      workspaceId,
      currency,
      paidAt,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      if (payment.transactionId) {
        await tx.transaction.update({
          where: { id: payment.transactionId },
          data: {
            accountId: account.id,
            telegramChannelId:
              placements.length === 1 ? placements[0].telegramChannelId : null,
            amount: decimal(amount),
            currency: account.currency,
            amountInPrimaryCurrency: decimal(amount * rate),
            exchangeRateToPrimary: decimal(rate),
            date: paidAt,
            ...(dto.notes === undefined
              ? {}
              : {
                  description:
                    dto.notes?.trim() || `Telegram ad sale payment ${sale.id}`,
                }),
            assignedMemberId: sale.assignedMemberId ?? null,
          },
        });
      }
      await tx.telegramAdSalePaymentAllocation.deleteMany({
        where: { telegramAdSalePaymentId: paymentId },
      });
      return tx.telegramAdSalePayment.update({
        where: { id: paymentId },
        data: {
          accountId: account.id,
          amount: decimal(amount),
          currency,
          amountInPrimaryCurrency: decimal(amount * rate),
          exchangeRateToPrimary: decimal(rate),
          paidAt,
          ...(dto.notes === undefined
            ? {}
            : { notes: dto.notes?.trim() || null }),
          allocations: {
            create: allocations.map((allocation) => ({
              workspaceId,
              telegramAdSalePlacementId: allocation.placementId,
              amount: decimal(allocation.amount),
              currency,
              amountInPrimaryCurrency: decimal(allocation.amount * rate),
            })),
          },
        },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
    });
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    return this.mapPayment(updated);
  }

  async voidPayment(
    userId: string,
    saleId: string,
    paymentId: string,
    dto: VoidTelegramAdSalePaymentDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const payment = await this.prisma.telegramAdSalePayment.findFirst({
      where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
      include: {
        allocations: true,
        account: true,
        transaction: true,
      },
    });
    if (!payment)
      throw new NotFoundException('Telegram ad sale payment not found');
    if (payment.status === TelegramAdSalePaymentStatus.VOIDED) {
      return this.mapPayment(payment);
    }
    const category = await this.resolveSystemCategory(
      workspaceId,
      'telegram_ad_sales_reversal',
    );
    const reversed = await this.prisma.$transaction(async (tx) => {
      const reversalTransaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: payment.accountId,
          telegramChannelId: null,
          type: TransactionType.expense,
          amount: payment.amount,
          currency: payment.account.currency,
          amountInPrimaryCurrency: payment.amountInPrimaryCurrency,
          exchangeRateToPrimary: payment.exchangeRateToPrimary,
          category: category.name,
          categoryId: category.id,
          description: `Void telegram ad sale payment ${payment.id}: ${dto.reason.trim()}`,
          date: new Date(),
          createdByUserId: userId,
        },
      });
      return tx.telegramAdSalePayment.update({
        where: { id: payment.id },
        data: {
          status: TelegramAdSalePaymentStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: dto.reason.trim(),
          reversalTransactionId: reversalTransaction.id,
        },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
    });
    const sale = await this.prisma.telegramAdSale.findFirst({
      where: { id: saleId, workspaceId },
      select: { advertiserId: true },
    });
    if (sale?.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    return this.mapPayment(reversed);
  }

  async createManagedPostFromPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: CreatePlacementManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const placement = sale.placements.find(
      (item: any) => item.id === placementId,
    );
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    const advertiseGroup =
      await this.telegramPostGroupsService.ensureAdvertiseSystemGroup(
        workspaceId,
        placement.telegramChannelId,
        dto.assignedMemberId ?? sale.assignedMemberId ?? undefined,
      );
    const managedPost =
      await this.telegramManagedPostCommandService.createManagedPost(
        userId,
        placement.telegramChannelId,
        {
          title:
            dto.title?.trim() ||
            `[AD] ${sale.title?.trim() || sale.advertiserName} / ${sale.id}`,
          text: dto.text ?? undefined,
          imageUrls: dto.imageUrls ?? [],
          assignedMemberId:
            dto.assignedMemberId ?? sale.assignedMemberId ?? undefined,
          icon: dto.icon ?? null,
          buttonRows: dto.buttonRows ?? [],
        },
        { groupId: advertiseGroup.id },
      );
    await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: { managedPostId: managedPost.id },
    });
    return managedPost;
  }

  async attachManagedPost(
    userId: string,
    saleId: string,
    placementId: string,
    dto: AttachPlacementManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(
      workspaceId,
      saleId,
      placementId,
    );
    if (
      placement.status === TelegramAdPlacementStatus.CANCELLED ||
      placement.status === TelegramAdPlacementStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Placement cannot accept a managed post in its current status',
      );
    }
    if (!dto.managedPostId && !dto.telegramPostId && !dto.telegramPostUrl) {
      throw new BadRequestException(
        'managedPostId or telegramPostId is required',
      );
    }
    let resolvedTelegramPostId = dto.telegramPostId;
    if (dto.telegramPostUrl) {
      const parsed = parseTelegramPostUrl(dto.telegramPostUrl.trim());
      if (!parsed) throw new BadRequestException('Invalid Telegram post URL');
      const channel = await this.prisma.telegramChannel.findFirst({
        where: { id: placement.telegramChannelId, workspaceId },
        select: { username: true, telegramChatId: true },
      });
      const channelMatches =
        parsed.kind === 'public'
          ? channel?.username?.replace(/^@/, '').toLowerCase() ===
            parsed.username
          : channel?.telegramChatId?.replace(/^-100/, '') === parsed.chatId;
      if (!channelMatches) {
        throw new BadRequestException(
          'This post does not belong to this channel.',
        );
      }
      resolvedTelegramPostId = (
        await this.prisma.telegramPost.findFirst({
          where: {
            workspaceId,
            telegramChannelId: placement.telegramChannelId,
            telegramMessageId: parsed.messageId,
          },
          select: { id: true },
        })
      )?.id;
      if (!resolvedTelegramPostId) {
        throw new NotFoundException(
          'Telegram post is not synchronized yet. Sync the channel and try again.',
        );
      }
    }
    if (resolvedTelegramPostId) {
      const telegramPost = await this.prisma.telegramPost.findFirst({
        where: {
          id: resolvedTelegramPostId,
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
        },
      });
      if (!telegramPost) throw new NotFoundException('Telegram post not found');
      const updated = await this.prisma.telegramAdSalePlacement.update({
        where: { id: placementId },
        data: {
          telegramPostId: telegramPost.id,
          status: TelegramAdPlacementStatus.PUBLISHED,
          publishedAt: telegramPost.postDate,
          plannedDeleteAt: calculateAdPlacementDeleteAt({
            scheduledAt: placement.scheduledAt,
            publishedAt: telegramPost.postDate,
            deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
            isPermanentSnapshot: placement.isPermanentSnapshot,
          }),
        },
      });
      this.notifyAdDeletionDueWorkChanged();
      await this.automationFacts?.verifiedPublication(workspaceId, saleId);
      return this.mapPlacement(this.appendPlacementFinancials(updated));
    }
    const managedPost = await this.prisma.telegramManagedPost.findFirst({
      where: {
        id: dto.managedPostId,
        workspaceId,
        telegramChannelId: placement.telegramChannelId,
      },
    });
    if (!managedPost) throw new NotFoundException('Managed post not found');
    const advertiseGroup =
      await this.telegramPostGroupsService.ensureAdvertiseSystemGroup(
        workspaceId,
        placement.telegramChannelId,
        managedPost.assignedMemberId,
      );
    await this.telegramPostGroupsService.addPostsToGroup(
      userId,
      advertiseGroup.id,
      { postIds: [managedPost.id] },
    );
    let telegramPostId: string | null = null;
    let telegramPublishedAt: Date | null = null;
    const isPublishedManagedPost =
      managedPost.status === TelegramManagedPostStatus.PUBLISHED &&
      managedPost.telegramIdVerificationStatus ===
        TelegramManagedPostIdVerificationStatus.VERIFIED;
    if (isPublishedManagedPost && managedPost.telegramMessageIds.length) {
      const telegramPost = await this.prisma.telegramPost.findFirst({
        where: {
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
          telegramMessageId: { in: managedPost.telegramMessageIds },
        },
        orderBy: { postDate: 'desc' },
      });
      telegramPostId = telegramPost?.id ?? null;
      telegramPublishedAt = telegramPost?.postDate ?? null;
    }
    const publishedAt =
      telegramPublishedAt ?? managedPost.publishedAt ?? placement.scheduledAt;
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        managedPostId: managedPost.id,
        ...(isPublishedManagedPost
          ? {
              status: TelegramAdPlacementStatus.PUBLISHED,
              publishedAt,
              plannedDeleteAt: calculateAdPlacementDeleteAt({
                scheduledAt: placement.scheduledAt,
                publishedAt,
                deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
                isPermanentSnapshot: placement.isPermanentSnapshot,
              }),
              telegramPostId,
            }
          : {}),
      },
    });
    if (isPublishedManagedPost) this.notifyAdDeletionDueWorkChanged();
    if (isPublishedManagedPost) {
      await this.automationFacts?.verifiedPublication(workspaceId, saleId);
    }
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async detachManagedPost(userId: string, saleId: string, placementId: string) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
      include: {
        managedPost: true,
        paymentAllocations: { include: { payment: true } },
      },
    });
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    if (
      placement.managedPost &&
      placement.managedPost.status === TelegramManagedPostStatus.PUBLISHED
    ) {
      throw new BadRequestException(
        'Published managed post cannot be detached',
      );
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: { managedPostId: null },
    });
    await this.automationFacts?.scheduleChanged(workspaceId, saleId);
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  private assertSaleTransition(
    from: TelegramAdSaleStatus,
    to: TelegramAdSaleStatus,
  ) {
    const transitions: Record<TelegramAdSaleStatus, TelegramAdSaleStatus[]> = {
      DRAFT: [TelegramAdSaleStatus.RESERVED, TelegramAdSaleStatus.CANCELLED],
      RESERVED: [
        TelegramAdSaleStatus.CONFIRMED,
        TelegramAdSaleStatus.CANCELLED,
      ],
      CONFIRMED: [
        TelegramAdSaleStatus.IN_PROGRESS,
        TelegramAdSaleStatus.CANCELLED,
      ],
      IN_PROGRESS: [
        TelegramAdSaleStatus.COMPLETED,
        TelegramAdSaleStatus.CANCELLED,
      ],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!transitions[from].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_SALE_STATUS_TRANSITION',
        message: `Cannot move sale from ${from} to ${to}`,
      });
    }
  }

  private assertPlacementTransition(
    from: TelegramAdPlacementStatus,
    to: TelegramAdPlacementStatus,
  ) {
    const transitions: Record<
      TelegramAdPlacementStatus,
      TelegramAdPlacementStatus[]
    > = {
      DRAFT: [
        TelegramAdPlacementStatus.RESERVED,
        TelegramAdPlacementStatus.CANCELLED,
      ],
      RESERVED: [
        TelegramAdPlacementStatus.SCHEDULED,
        TelegramAdPlacementStatus.CANCELLED,
        TelegramAdPlacementStatus.MISSED,
      ],
      SCHEDULED: [
        TelegramAdPlacementStatus.PUBLISHED,
        TelegramAdPlacementStatus.CANCELLED,
        TelegramAdPlacementStatus.MISSED,
      ],
      PUBLISHED: [TelegramAdPlacementStatus.COMPLETED],
      COMPLETED: [],
      CANCELLED: [],
      MISSED: [],
    };
    if (!transitions[from].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_PLACEMENT_STATUS_TRANSITION',
        message: `Cannot move placement from ${from} to ${to}`,
      });
    }
  }

  async schedulePlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: SchedulePlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const placement = sale.placements.find(
      (item: any) => item.id === placementId,
    );
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    if (!placement.managedPostId) {
      throw new BadRequestException(
        'Managed post is required before scheduling',
      );
    }
    if (sale.status === TelegramAdSaleStatus.DRAFT) {
      throw new BadRequestException('Confirm sale before scheduling');
    }
    this.assertPlacementTransition(
      placement.status,
      TelegramAdPlacementStatus.SCHEDULED,
    );
    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : placement.scheduledAt;
    await this.telegramManagedPostPublicationService.scheduleManagedPost(
      userId,
      placement.telegramChannelId,
      placement.managedPostId,
      {
        scheduledAt: scheduledAt.toISOString(),
        longTextMode: dto.longTextMode,
      },
    );
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        scheduledAt,
        scheduledManagedAt: scheduledAt,
        status: TelegramAdPlacementStatus.SCHEDULED,
        plannedDeleteAt: null,
      },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    if (sale.status === TelegramAdSaleStatus.CONFIRMED) {
      await this.prisma.telegramAdSale.update({
        where: { id: sale.id },
        data: { status: TelegramAdSaleStatus.IN_PROGRESS },
      });
    }
    await this.automationFacts?.scheduleChanged(workspaceId, saleId);
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async recreateScheduledPostsViaBot(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const placements = sale.placements.filter(
      (placement) =>
        placement.status === TelegramAdPlacementStatus.SCHEDULED &&
        placement.managedPost?.sourceType === TelegramSourceType.MTPROTO &&
        placement.managedPost.telegramScheduledMessageIds?.length,
    );
    if (!placements.length) {
      throw new BadRequestException(
        'This deal has no MTProto scheduled advertising posts to recreate',
      );
    }

    for (const placement of placements) {
      await this.telegramChannelAccessService.checkProductionBotPublishingAccess(
        userId,
        placement.telegramChannelId,
      );
    }

    for (const placement of placements) {
      await this.telegramManagedPostPublicationService.returnManagedPostToDraft(
        userId,
        placement.telegramChannelId,
        placement.managedPost!.id,
      );
      await this.telegramManagedPostPublicationService.scheduleManagedPost(
        userId,
        placement.telegramChannelId,
        placement.managedPost!.id,
        { scheduledAt: placement.scheduledAt.toISOString() },
      );
    }
    return this.getSale(userId, saleId);
  }

  async scheduleSale(userId: string, saleId: string, dto: ScheduleSaleDto) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const targets = dto.placements?.length
      ? sale.placements.filter((placement: any) =>
          dto.placements?.some((item) => item.placementId === placement.id),
        )
      : sale.placements.filter((placement: any) =>
          Boolean(placement.managedPostId),
        );
    const results: Array<Record<string, unknown>> = [];
    for (const placement of targets) {
      try {
        const override = dto.placements?.find(
          (item) => item.placementId === placement.id,
        );
        const targetDate = override?.scheduledAt
          ? new Date(override.scheduledAt)
          : new Date(placement.scheduledAt);
        // Never publish before the booked instant. Bot API posts are scheduled
        // locally and the due worker releases them only once this time arrives.
        const scheduled =
          targetDate.getTime() <= Date.now()
            ? await this.publishPlacement(userId, saleId, placement.id, {
                longTextMode: override?.longTextMode,
              })
            : await this.schedulePlacement(userId, saleId, placement.id, {
                scheduledAt: targetDate.toISOString(),
                longTextMode: override?.longTextMode,
              });
        results.push({
          placementId: placement.id,
          success: true,
          status: scheduled.status,
          scheduledAt: scheduled.scheduledAt,
        });
      } catch (error) {
        results.push({
          placementId: placement.id,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not schedule placement',
        });
      }
    }
    return { saleId, results };
  }

  async publishPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: PublishPlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
      include: {
        managedPost: true,
        paymentAllocations: { include: { payment: true } },
      },
    });
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    if (!placement.managedPostId)
      throw new BadRequestException('Managed post is required');
    const publishedManagedPost =
      await this.telegramManagedPostPublicationService.publishManagedPostNow(
        userId,
        placement.telegramChannelId,
        placement.managedPostId,
        { longTextMode: dto.longTextMode },
      );
    const publishedAt = publishedManagedPost.publishedAt ?? new Date();
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt,
        plannedDeleteAt: calculateAdPlacementDeleteAt({
          scheduledAt: placement.scheduledAt,
          publishedAt,
          deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
          isPermanentSnapshot: placement.isPermanentSnapshot,
        }),
      },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    this.notifyAdDeletionDueWorkChanged();
    await this.automationFacts?.verifiedPublication(workspaceId, saleId);
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async reschedulePlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: ReschedulePlacementDto,
  ) {
    return this.schedulePlacement(userId, saleId, placementId, dto);
  }

  async cancelPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    _dto: CancelPlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
      include: {
        paymentAllocations: { include: { payment: true } },
        managedPost: true,
      },
    });
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    if (placement.status === TelegramAdPlacementStatus.PUBLISHED) {
      throw new BadRequestException(
        'Published placement requires a separate completion/deletion flow',
      );
    }
    const hasPaidAllocation = (placement.paymentAllocations ?? []).some(
      (allocation: any) =>
        allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
    );
    if (hasPaidAllocation) {
      throw new BadRequestException(
        'Paid placement cannot be cancelled without payment reversal',
      );
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: { status: TelegramAdPlacementStatus.CANCELLED },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    await this.automationFacts?.scheduleChanged(workspaceId, saleId);
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async completePermanentPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    _dto: CompletePermanentPlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(
      workspaceId,
      saleId,
      placementId,
    );
    if (!placement.isPermanentSnapshot) {
      throw new BadRequestException(
        'Only permanent placements can be completed manually',
      );
    }
    if (placement.status !== TelegramAdPlacementStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only published permanent placements can be completed',
      );
    }
    const metrics = await this.reconcilePlacementMetrics(
      workspaceId,
      placement.id,
    );
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placement.id },
      data: {
        status: TelegramAdPlacementStatus.COMPLETED,
        completedAt: new Date(),
        actualViewsFinal:
          metrics.actualViewsFinal ?? placement.actualViewsFinal,
        actualReactionsFinal:
          metrics.actualReactionsFinal ?? placement.actualReactionsFinal,
        actualCpm: metrics.actualCpm ?? placement.actualCpm,
      },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    await this.automationFacts?.verifiedPublication(workspaceId, saleId);
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  private async reconcilePlacementMetrics(
    workspaceId: string,
    placementId: string,
  ) {
    return reconcileTelegramAdPlacementMetrics(
      this.prisma,
      workspaceId,
      placementId,
    );
  }

  private async deletePublishedPlacement(
    workspaceId: string,
    placementId: string,
    options: { notifyScheduler?: boolean } = {},
  ) {
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId },
      include: {
        managedPost: true,
        telegramPost: true,
        telegramChannel: true,
      },
    });
    if (!placement)
      throw new NotFoundException('Telegram ad sale placement not found');
    const messageIds = resolveAdPlacementDeletionMessageIds(placement);
    if (!messageIds.length) {
      throw new BadRequestException(
        'Managed post has no published telegram messages',
      );
    }
    // Persist the latest locally synchronized counters before the remote
    // message disappears. The TelegramPost and its snapshots remain stored.
    const metrics = await this.reconcilePlacementMetrics(
      workspaceId,
      placement.id,
    );
    const sources = await this.sourceAccessService.sourcesForChannel(
      workspaceId,
      placement.telegramChannelId,
    );
    const selectedSource = selectAdPlacementDeletionSource(
      sources,
      placement.managedPost ?? {
        sourceType: null,
        sourceId: null,
        publishedAt: placement.publishedAt,
      },
    );
    if (!selectedSource) {
      throw new BadRequestException(
        'No connected source can delete this placement',
      );
    }

    if (selectedSource.sourceType === TelegramSourceType.MTPROTO) {
      await this.deletePlacementMessagesWithMtproto(
        workspaceId,
        placement.telegramChannel,
        selectedSource.sourceId,
        messageIds,
      );
    } else {
      const token = await this.telegramChannelAccessService.botTokenForSource(
        workspaceId,
        selectedSource.sourceId,
      );
      if (!placement.telegramChannel.telegramChatId) {
        throw new BadRequestException('Channel has no Telegram chat id');
      }
      try {
        for (const messageId of messageIds) {
          await this.telegramBotApiClient.deleteMessage(token, {
            chat_id: placement.telegramChannel.telegramChatId,
            message_id: Number(messageId),
          });
        }
      } catch (botError) {
        if (!isTelegramMessageAlreadyAbsent(botError)) {
          const mtprotoFallback = sources.find(
            (source) =>
              source.sourceType === TelegramSourceType.MTPROTO &&
              source.permissions.canDeleteMessages,
          );
          if (!mtprotoFallback) {
            throw new BadRequestException(
              `Telegram could not delete the post: ${botError instanceof Error ? botError.message : 'Bot API request failed'}`,
            );
          }
          await this.deletePlacementMessagesWithMtproto(
            workspaceId,
            placement.telegramChannel,
            mtprotoFallback.sourceId,
            messageIds,
          );
        }
      }
    }

    await this.prisma.$transaction([
      ...(placement.managedPost
        ? [
            this.prisma.telegramManagedPost.update({
              where: { id: placement.managedPost.id },
              data: {
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
                lastTelegramSyncedAt: new Date(),
                lastTelegramSyncNote:
                  'Placement deleted after ad format expiry.',
              },
            }),
          ]
        : []),
      this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          deletedAt: new Date(),
          status: TelegramAdPlacementStatus.COMPLETED,
          completedAt: new Date(),
          lastDeletionAttemptAt: new Date(),
          lastDeletionError: null,
          actualViews24h: metrics.actualViews24h,
          actualViews48h: metrics.actualViews48h,
          actualViewsFinal: metrics.actualViewsFinal,
          actualReactionsFinal: metrics.actualReactionsFinal,
          actualCpm: metrics.actualCpm,
        },
      }),
    ]);
    if (options.notifyScheduler !== false) {
      this.notifyAdDeletionDueWorkChanged();
    }
    return this.getSaleDetails(workspaceId, placement.telegramAdSaleId);
  }

  private async deletePlacementMessagesWithMtproto(
    workspaceId: string,
    channel: {
      telegramChatId: string | null;
      username: string | null;
      telegramAccessHash: string | null;
    },
    sourceId: string,
    messageIds: string[],
  ) {
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: sourceId, workspaceId, isActive: true },
    });
    if (!account?.sessionEncrypted) {
      throw new BadRequestException('MTProto source is not connected');
    }
    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const session = this.encryptionService.decrypt({
      encrypted: account.sessionEncrypted,
      iv: account.sessionIv ?? '',
      authTag: account.sessionAuthTag ?? '',
    });
    try {
      await this.mtprotoClient.deletePublishedMessages({
        apiId: account.apiId,
        apiHash,
        session,
        channel,
        messageIds,
      });
    } catch (error) {
      if (!isTelegramMessageAlreadyAbsent(error)) throw error;
    }
  }

  async retryDeletion(
    userId: string,
    saleId: string,
    placementId: string,
    _dto: RetryPlacementDeletionDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(
      workspaceId,
      saleId,
      placementId,
    );
    if (placement.isPermanentSnapshot) {
      throw new BadRequestException(
        'Permanent placement cannot use automatic deletion retry',
      );
    }
    try {
      await this.deletePublishedPlacement(workspaceId, placement.id);
    } catch (error) {
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          lastDeletionAttemptAt: new Date(),
          lastDeletionError:
            error instanceof Error ? error.message : 'Deletion failed',
        },
      });
      this.notifyAdDeletionDueWorkChanged();
      throw error;
    }
    return this.getSale(userId, saleId);
  }

  async reconcileSale(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const channelIds = [
      ...new Set(
        sale.placements.map((placement: any) => placement.telegramChannelId),
      ),
    ];
    for (const channelId of channelIds) {
      await this.telegramManagedPostRemoteSyncService.syncManagedPosts(
        userId,
        channelId,
      );
    }

    const refreshed = await this.getSaleDetails(workspaceId, saleId);
    let dueWorkChanged = false;
    await runBounded(refreshed.placements, 4, async (placement) => {
      const metrics = await this.reconcilePlacementMetrics(
        workspaceId,
        placement.id,
      );
      const managedPost = await this.prisma.telegramManagedPost.findFirst({
        where: { id: placement.managedPostId ?? undefined, workspaceId },
      });
      const updateData: Prisma.TelegramAdSalePlacementUpdateInput = {
        actualViews24h: metrics.actualViews24h,
        actualViews48h: metrics.actualViews48h,
        actualViewsFinal: metrics.actualViewsFinal,
        actualReactionsFinal: metrics.actualReactionsFinal,
        actualCpm: metrics.actualCpm,
      };
      const managedIdentityVerified =
        managedPost?.status === TelegramManagedPostStatus.PUBLISHED &&
        managedPost.telegramIdVerificationStatus ===
          TelegramManagedPostIdVerificationStatus.VERIFIED;
      const telegramPublishedAt = placement.telegramPost?.postDate ?? null;
      if (managedIdentityVerified) {
        updateData.status = TelegramAdPlacementStatus.PUBLISHED;
        const publishedAt =
          telegramPublishedAt ?? managedPost.publishedAt ?? new Date();
        updateData.publishedAt = publishedAt;
        updateData.plannedDeleteAt = calculateAdPlacementDeleteAt({
          scheduledAt: placement.scheduledAt,
          publishedAt,
          deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
          isPermanentSnapshot: placement.isPermanentSnapshot,
        });
        dueWorkChanged = true;
      }
      if (
        managedPost &&
        !managedIdentityVerified &&
        placement.telegramPostId != null
      ) {
        updateData.telegramPost = { disconnect: true };
      }
      if (
        managedIdentityVerified &&
        placement.telegramPostId == null &&
        managedPost.telegramMessageIds.length
      ) {
        const telegramPost = await this.prisma.telegramPost.findFirst({
          where: {
            workspaceId,
            telegramChannelId: placement.telegramChannelId,
            telegramMessageId: { in: managedPost.telegramMessageIds },
          },
          orderBy: { postDate: 'desc' },
        });
        if (telegramPost) {
          updateData.telegramPost = { connect: { id: telegramPost.id } };
        }
      }
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: updateData,
      });
    });
    if (dueWorkChanged) this.notifyAdDeletionDueWorkChanged();
    if (dueWorkChanged) {
      await this.automationFacts?.verifiedPublication(workspaceId, saleId);
    }
    return this.getSale(userId, saleId);
  }

  async saleMetrics(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const updated: Array<Record<string, unknown>> = [];
    for (const placement of sale.placements) {
      const metrics = await this.reconcilePlacementMetrics(
        workspaceId,
        placement.id,
      );
      updated.push({
        placementId: placement.id,
        ...metrics,
        actualCpm: decimalToString(metrics.actualCpm),
      });
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          actualViews24h: metrics.actualViews24h,
          actualViews48h: metrics.actualViews48h,
          actualViewsFinal: metrics.actualViewsFinal,
          actualReactionsFinal: metrics.actualReactionsFinal,
          actualCpm: metrics.actualCpm,
        },
      });
    }
    return { saleId, placements: updated };
  }

  async processDueDeletionBatch(limit = 20) {
    const now = new Date();
    const items = await this.prisma.telegramAdSalePlacement.findMany({
      where: adDeletionReadyWhere(now),
      orderBy: { plannedDeleteAt: 'asc' },
      take: Math.max(1, Math.min(100, limit)),
      select: {
        id: true,
        workspaceId: true,
        scheduledAt: true,
        publishedAt: true,
        plannedDeleteAt: true,
        deleteAfterHoursSnapshot: true,
        isPermanentSnapshot: true,
      },
    });
    let processed = 0;
    let failed = 0;
    let deferred = 0;
    for (const item of items) {
      try {
        const effectivePlannedDeleteAt = calculateAdPlacementDeleteAt({
          scheduledAt: item.scheduledAt,
          publishedAt: item.publishedAt,
          deleteAfterHoursSnapshot: item.deleteAfterHoursSnapshot,
          isPermanentSnapshot: item.isPermanentSnapshot,
        });
        if (effectivePlannedDeleteAt && effectivePlannedDeleteAt > now) {
          await this.prisma.telegramAdSalePlacement.update({
            where: { id: item.id },
            data: {
              plannedDeleteAt: effectivePlannedDeleteAt,
              lastDeletionAttemptAt: null,
              lastDeletionError: null,
            },
          });
          deferred += 1;
          continue;
        }
        await this.deletePublishedPlacement(item.workspaceId, item.id, {
          notifyScheduler: false,
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        await this.prisma.telegramAdSalePlacement.update({
          where: { id: item.id },
          data: {
            lastDeletionAttemptAt: new Date(),
            lastDeletionError:
              error instanceof Error ? error.message : 'Deletion failed',
          },
        });
      }
    }
    if (processed || failed || deferred) this.notifyAdDeletionDueWorkChanged();
    return { processed, failed };
  }

  private notifyAdDeletionDueWorkChanged() {
    notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
  }

  async reserveSale(
    userId: string,
    saleId: string,
    dto: ReserveTelegramAdSaleDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const targetPlacements = dto.placements?.length
      ? sale.placements.filter((placement) =>
          dto.placements?.some((item) => item.placementId === placement.id),
        )
      : sale.placements;
    if (!targetPlacements.length) {
      throw new BadRequestException('No placements selected for reservation');
    }

    const reserved = await this.prisma.$transaction(async (tx) => {
      this.assertSaleTransition(sale.status, TelegramAdSaleStatus.RESERVED);
      for (const placement of targetPlacements) {
        const override = dto.placements?.find(
          (item) => item.placementId === placement.id,
        );
        const scheduledAt = override?.scheduledAt
          ? new Date(override.scheduledAt)
          : placement.scheduledAt;
        await tx.telegramAdSalePlacement.update({
          where: { id: placement.id },
          data: {
            scheduledAt,
            status: TelegramAdPlacementStatus.RESERVED,
          },
        });
      }
      await tx.telegramAdSale.update({
        where: { id: saleId },
        data: { status: TelegramAdSaleStatus.RESERVED },
      });
      return tx.telegramAdSale.findUniqueOrThrow({
        where: { id: saleId },
        include: this.includeSaleRelations(),
      });
    });

    this.logger.info({
      event: 'telegram_ad_sales.slot_reserved',
      message: `Reserved sale ${saleId}`,
      metadata: {
        saleId,
        placements: targetPlacements.map((placement) => placement.id),
      },
    });

    await this.automationFacts?.scheduleChanged(workspaceId, saleId);

    return this.mapSale(reserved);
  }

  async confirmSale(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    this.assertSaleTransition(sale.status, TelegramAdSaleStatus.CONFIRMED);
    if (!sale.placements.length) {
      throw new BadRequestException('Cannot confirm sale without placements');
    }
    const confirmedSale = await this.prisma.$transaction(async (tx) => {
      await tx.telegramAdSalePlacement.updateMany({
        where: {
          workspaceId,
          telegramAdSaleId: saleId,
          status: TelegramAdPlacementStatus.RESERVED,
        },
        data: { status: TelegramAdPlacementStatus.RESERVED },
      });
      await tx.telegramAdSale.update({
        where: { id: saleId },
        data: { status: TelegramAdSaleStatus.CONFIRMED },
      });
      return tx.telegramAdSale.findUniqueOrThrow({
        where: { id: saleId },
        include: this.includeSaleRelations(),
      });
    });
    this.logger.info({
      event: 'telegram_ad_sales.sale_confirmed',
      message: `Confirmed sale ${saleId}`,
      metadata: { saleId },
    });
    return this.mapSale(confirmedSale);
  }

  async cancelSale(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    this.assertSaleTransition(sale.status, TelegramAdSaleStatus.CANCELLED);
    assertNoActiveSalePayments(sale.payments ?? []);
    const cancelledSale = await this.prisma.$transaction((tx) =>
      cancelAdSaleRecords(tx, workspaceId, saleId, this.includeSaleRelations()),
    );
    this.logger.info({
      event: 'telegram_ad_sales.sale_cancelled',
      message: `Cancelled sale ${saleId}`,
      metadata: { saleId },
    });
    await this.automationFacts?.cancelled(workspaceId, saleId);
    return this.mapSale(cancelledSale);
  }
}
