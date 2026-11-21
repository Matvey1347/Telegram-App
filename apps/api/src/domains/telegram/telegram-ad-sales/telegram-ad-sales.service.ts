import { TelegramCrmLegacyAuthorizationService } from '../telegram-crm/telegram-crm-legacy-authorization.service';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { type TelegramAdSalePublicationDeletionProgress } from '@telegram-system/shared';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
} from '@prisma/client';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { FinanceCategoriesService } from '../../finance/finance-categories/finance-categories.service';
import { TelegramManagedPostCommandService } from '../telegram-channels/telegram-managed-post-command.service';
import { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
import { TelegramManagedPostMoveService } from '../telegram-channels/telegram-managed-post-move.service';
import { TelegramManagedPostRemoteSyncService } from '../telegram-channels/telegram-managed-post-remote-sync.service';
import { TelegramPostGroupsService } from '../telegram-channels/telegram-post-groups.service';
import { TelegramChannelAccessService } from '../telegram-channels/telegram-channel-access.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
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
  TelegramAdvertisersQueryDto,
  UpdateTelegramAdChannelPricingDto,
  UpdateTelegramAdSalesMemberPreferencesDto,
  UpdateTelegramAdSalePaymentDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
  UpdateTelegramAdPolicyDto,
  UpdateTelegramAdProductDto,
  UpdateTelegramAdSaleDto,
  UpdateTelegramAdSalePlacementDto,
  VoidTelegramAdSalePaymentDto,
} from './dto';
import { TelegramAdSalesPricingReader } from './telegram-ad-sales-pricing-reader';
import { TelegramAdSalesAvailabilityReader } from './telegram-ad-sales-availability-reader';
import { TelegramAdSalesInventoryReader } from './telegram-ad-sales-inventory-reader';
import { AdSalesAnalyticsDatasetParams, TelegramAdSalesAnalyticsDatasetReader } from './telegram-ad-sales-analytics-dataset-reader';
import { TelegramAdSalesSaleReadService } from './telegram-ad-sales-sale-read.service';
import { hydrateManagedTelegramPosts } from './telegram-ad-sales-managed-post-metrics';
import { TelegramCrmInternalNotificationProjector } from '../telegram-crm/telegram-crm-internal-notification-projector.service';
import { TelegramCrmPurchaseFolderSyncService } from '../telegram-crm/telegram-crm-purchase-folder-sync.service';
import { TelegramAdSaleBotNotificationService } from './telegram-ad-sale-bot-notification.service';
import * as saleProjections from './telegram-ad-sales-sale-projections';
import * as advertiserIdentity from './telegram-ad-sales-advertiser-identity';
import * as catalogAndPolicy from './telegram-ad-sales-catalog-and-policy';
import * as quotingAndAvailability from './telegram-ad-sales-quoting-and-availability';
import * as inventorySnapshots from './telegram-ad-sales-inventory-snapshots';
import * as performanceAnalytics from './telegram-ad-sales-performance-analytics';
import * as advertiserManagement from './telegram-ad-sales-advertiser-management';
import * as saleRecords from './telegram-ad-sales-sale-records';
import * as placementEditing from './telegram-ad-sales-placement-editing';
import * as payments from './telegram-ad-sales-payments';
import * as publicationLifecycle from './telegram-ad-sales-publication-lifecycle';
import * as placementDeletion from './telegram-ad-sales-placement-deletion';

@Injectable()
export class TelegramAdSalesService {
  private readonly operations: TelegramAdSalesOperations;
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
    private readonly telegramManagedPostMoveService: TelegramManagedPostMoveService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramBotApiClient: TelegramBotApiClient,
    private readonly botConfirmation: TelegramAdSaleBotNotificationService,
    @Optional()
    private readonly notificationProjector?: TelegramCrmInternalNotificationProjector,
    @Optional()
    private readonly purchaseFolderSync?: TelegramCrmPurchaseFolderSyncService,
    @Optional()
    private readonly crmAuthorization?: TelegramCrmLegacyAuthorizationService,
  ) {
    this.operations = this.createOperations();
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
    return catalogAndPolicy.mapProduct(this.operations, product);
  }
  private mapPolicy(policy: any) {
    return catalogAndPolicy.mapPolicy(this.operations, policy);
  }
  private mapSnapshot(snapshot: any) {
    return catalogAndPolicy.mapSnapshot(this.operations, snapshot);
  }
  private mapPlacement(placement: any) {
    return saleProjections.mapPlacement(this.operations, placement);
  }
  private mapPayment(payment: any) {
    return saleProjections.mapPayment(this.operations, payment);
  }
  private mapSale(sale: any) {
    return saleProjections.mapSale(this.operations, sale);
  }
  private normalizeTelegramUsername(value?: string | null) {
    return advertiserIdentity.normalizeTelegramUsername(this.operations, value);
  }
  private normalizePhone(value?: string | null) {
    return advertiserIdentity.normalizePhone(this.operations, value);
  }
  private normalizeEmail(value?: string | null) {
    return advertiserIdentity.normalizeEmail(this.operations, value);
  }
  private normalizeWebsite(value?: string | null) {
    return advertiserIdentity.normalizeWebsite(this.operations, value);
  }
  private normalizeContactValue(type: TelegramAdvertiserContactType, value?: string | null) {
    return advertiserIdentity.normalizeContactValue(this.operations, type, value);
  }
  private mapAdvertiserContact(contact: any) {
    return advertiserIdentity.mapAdvertiserContact(this.operations, contact);
  }
  private mapAdvertiserActivity(activity: any) {
    return advertiserIdentity.mapAdvertiserActivity(this.operations, activity);
  }
  private mapAdvertiserTask(task: any) {
    return advertiserIdentity.mapAdvertiserTask(this.operations, task);
  }
  private mapAdvertiser(settings: any) {
    return advertiserIdentity.mapAdvertiser(this.operations, settings);
  }
  private policyDefaults(timezone: string) {
    return catalogAndPolicy.policyDefaults(this.operations, timezone);
  }
  private mapAdSalesMemberPreferences(preferences: any) {
    return catalogAndPolicy.mapAdSalesMemberPreferences(this.operations, preferences);
  }
  private resolveWorkspaceTimezone(workspaceId: string) {
    return catalogAndPolicy.resolveWorkspaceTimezone(this.operations, workspaceId);
  }
  private resolvePolicy(workspaceId: string, channelId: string, timezone = 'UTC') {
    return catalogAndPolicy.resolvePolicy(this.operations, workspaceId, channelId, timezone);
  }
  getChannelBaseline(userId: string, channelId: string) {
    return catalogAndPolicy.getChannelBaseline(this.operations, userId, channelId);
  }
  getChannelSetup(userId: string, channelId: string) {
    return catalogAndPolicy.getChannelSetup(this.operations, userId, channelId);
  }
  updateChannelPricing(userId: string, channelId: string, dto: UpdateTelegramAdChannelPricingDto) {
    return catalogAndPolicy.updateChannelPricing(this.operations, userId, channelId, dto);
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
      include: {
        managedPost: { select: { status: true, scheduledAt: true } },
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
    return saleProjections.includeSaleRelations(this.operations);
  }
  private paymentStatusFromTotals(totalPaid: Prisma.Decimal, totalAgreed: Prisma.Decimal) {
    return saleProjections.paymentStatusFromTotals(this.operations, totalPaid, totalAgreed);
  }
  private advertiserInclude() {
    return advertiserIdentity.advertiserInclude(this.operations);
  }
  private getAdvertiser(workspaceId: string, advertiserId: string) {
    return advertiserIdentity.getAdvertiser(this.operations, workspaceId, advertiserId);
  }
  private createAdvertiserActivity(workspaceId: string, advertiserId: string, payload: {
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
    }) {
    return advertiserIdentity.createAdvertiserActivity(this.operations, workspaceId, advertiserId, payload);
  }
  recalculateAdvertiserStats(workspaceId: string, advertiserId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return advertiserIdentity.recalculateAdvertiserStats(this.operations, workspaceId, advertiserId, tx);
  }
  private resolveAdvertiserForSale(workspaceId: string, userId: string, dto: CreateTelegramAdSaleDto | UpdateTelegramAdSaleDto, assignedMemberId?: string | null) {
    return advertiserIdentity.resolveAdvertiserForSale(this.operations, workspaceId, userId, dto, assignedMemberId);
  }
  private linkAdvertiserToMatchingCrmPeer(workspaceId: string, advertiserId: string, username: string | null | undefined) {
    return advertiserIdentity.linkAdvertiserToMatchingCrmPeer(this.operations, workspaceId, advertiserId, username);
  }
  private appendPlacementFinancials(placement: any) {
    return saleProjections.appendPlacementFinancials(this.operations, placement);
  }
  private buildSaleSummary(sale: any) {
    return saleProjections.buildSaleSummary(this.operations, sale);
  }
  private getSaleDetails(workspaceId: string, id: string) {
    return saleProjections.getSaleDetails(this.operations, workspaceId, id);
  }
  private analyticsRange(query?: TelegramAdAnalyticsQueryDto) {
    return performanceAnalytics.analyticsRange(this.operations, query);
  }
  private inventorySlotsForChannels(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    return performanceAnalytics.inventorySlotsForChannels(this.operations, params);
  }
  private summarizeInventory(slots: Awaited<
      ReturnType<TelegramAdSalesInventoryReader['slotsForChannels']>
    >) {
    return performanceAnalytics.summarizeInventory(this.operations, slots);
  }
  private adAnalyticsDataset(params: AdSalesAnalyticsDatasetParams) {
    return performanceAnalytics.adAnalyticsDataset(this.operations, params);
  }
  private analyticsChannelIds(query: TelegramAdAnalyticsQueryDto) {
    return performanceAnalytics.analyticsChannelIds(this.operations, query);
  }
  private startOfUtcDay(value: Date) {
    return performanceAnalytics.startOfUtcDay(this.operations, value);
  }
  private endOfUtcDay(value: Date) {
    return performanceAnalytics.endOfUtcDay(this.operations, value);
  }
  private listDatesInRange(from: Date, to: Date) {
    return performanceAnalytics.listDatesInRange(this.operations, from, to);
  }
  private resolveAnalyticsChannelIds(params: {
    workspaceId: string;
    channelId?: string;
    networkId?: string;
    networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
  }) {
    return inventorySnapshots.resolveAnalyticsChannelIds(this.operations, params);
  }
  private buildInventorySnapshotForDate(params: {
    workspaceId: string;
    channelId: string;
    date: Date;
    force?: boolean;
  }) {
    return inventorySnapshots.buildInventorySnapshotForDate(this.operations, params);
  }
  private saveInventorySnapshot(snapshot: Awaited<
      ReturnType<TelegramAdSalesService['buildInventorySnapshotForDate']>
    >, options?: { force?: boolean }) {
    return inventorySnapshots.saveInventorySnapshot(this.operations, snapshot, options);
  }
  private loadInventorySnapshots(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    return inventorySnapshots.loadInventorySnapshots(this.operations, params);
  }
  private aggregateInventorySnapshots(items: Array<any>) {
    return inventorySnapshots.aggregateInventorySnapshots(this.operations, items);
  }
  listProducts(userId: string, query: TelegramAdProductsQueryDto) {
    return catalogAndPolicy.listProducts(this.operations, userId, query);
  }
  listChannelProducts(userId: string, channelId: string) {
    return catalogAndPolicy.listChannelProducts(this.operations, userId, channelId);
  }
  listProductsByChannels(userId: string, requestedChannelIds: string[]) {
    return catalogAndPolicy.listProductsByChannels(this.operations, userId, requestedChannelIds);
  }
  createProduct(userId: string, channelId: string, dto: CreateTelegramAdProductDto) {
    return catalogAndPolicy.createProduct(this.operations, userId, channelId, dto);
  }
  updateProduct(userId: string, id: string, dto: UpdateTelegramAdProductDto) {
    return catalogAndPolicy.updateProduct(this.operations, userId, id, dto);
  }
  deactivateProduct(userId: string, id: string) {
    return catalogAndPolicy.deactivateProduct(this.operations, userId, id);
  }
  getAdSalesMemberPreferences(userId: string) {
    return catalogAndPolicy.getAdSalesMemberPreferences(this.operations, userId);
  }
  updateAdSalesMemberPreferences(userId: string, dto: UpdateTelegramAdSalesMemberPreferencesDto) {
    return catalogAndPolicy.updateAdSalesMemberPreferences(this.operations, userId, dto);
  }
  getPolicy(userId: string, channelId: string) {
    return catalogAndPolicy.getPolicy(this.operations, userId, channelId);
  }
  upsertPolicy(userId: string, channelId: string, dto: UpdateTelegramAdPolicyDto) {
    return catalogAndPolicy.upsertPolicy(this.operations, userId, channelId, dto);
  }
  recommendPolicy(userId: string, channelId: string, dto: RecommendTelegramAdPolicyDto) {
    return catalogAndPolicy.recommendPolicy(this.operations, userId, channelId, dto);
  }
  createQuote(userId: string, dto: CreateTelegramAdQuoteDto) {
    return quotingAndAvailability.createQuote(this.operations, userId, dto);
  }
  priceHistory(userId: string, channelId: string, query: TelegramAdPriceHistoryQueryDto) {
    return quotingAndAvailability.priceHistory(this.operations, userId, channelId, query);
  }
  availability(userId: string, dto: TelegramAdAvailabilityQueryDto) {
    return quotingAndAvailability.availability(this.operations, userId, dto);
  }
  analyticsSummary(userId: string, query: TelegramAdAnalyticsQueryDto) {
    return performanceAnalytics.analyticsSummary(this.operations, userId, query);
  }
  channelAnalytics(userId: string, channelId: string, query: TelegramAdAnalyticsQueryDto) {
    return performanceAnalytics.channelAnalytics(this.operations, userId, channelId, query);
  }
  analyticsOverview(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    return performanceAnalytics.analyticsOverview(this.operations, userId, query);
  }
  networkAnalytics(userId: string, networkId: string, query: TelegramAdNetworkAnalyticsQueryDto) {
    return performanceAnalytics.networkAnalytics(this.operations, userId, networkId, query);
  }
  revenueSeries(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    return performanceAnalytics.revenueSeries(this.operations, userId, query);
  }
  pricingSeries(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    return performanceAnalytics.pricingSeries(this.operations, userId, query);
  }
  inventoryAnalytics(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    return performanceAnalytics.inventoryAnalytics(this.operations, userId, query);
  }
  analyticsAlerts(userId: string, query: TelegramAdAlertsQueryDto) {
    return performanceAnalytics.analyticsAlerts(this.operations, userId, query);
  }
  listAdvertisers(userId: string, query: TelegramAdvertisersQueryDto) {
    return advertiserManagement.listAdvertisers(this.operations, userId, query);
  }
  advertiserSearch(userId: string, query: TelegramAdvertiserSearchDto, ownerMemberId?: string) {
    return advertiserManagement.advertiserSearch(this.operations, userId, query, ownerMemberId);
  }
  getAdvertiserDetails(userId: string, advertiserId: string) {
    return advertiserManagement.getAdvertiserDetails(this.operations, userId, advertiserId);
  }
  createAdvertiser(userId: string, dto: CreateTelegramAdvertiserDto) {
    return advertiserManagement.createAdvertiser(this.operations, userId, dto);
  }
  updateAdvertiser(userId: string, advertiserId: string, dto: UpdateTelegramAdvertiserDto) {
    return advertiserManagement.updateAdvertiser(this.operations, userId, advertiserId, dto);
  }
  archiveAdvertiser(userId: string, advertiserId: string) {
    return advertiserManagement.archiveAdvertiser(this.operations, userId, advertiserId);
  }
  restoreAdvertiser(userId: string, advertiserId: string) {
    return advertiserManagement.restoreAdvertiser(this.operations, userId, advertiserId);
  }
  addAdvertiserContact(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserContactDto) {
    return advertiserManagement.addAdvertiserContact(this.operations, userId, advertiserId, dto);
  }
  updateAdvertiserContact(userId: string, advertiserId: string, contactId: string, dto: UpdateTelegramAdvertiserContactDto) {
    return advertiserManagement.updateAdvertiserContact(this.operations, userId, advertiserId, contactId, dto);
  }
  deleteAdvertiserContact(userId: string, advertiserId: string, contactId: string) {
    return advertiserManagement.deleteAdvertiserContact(this.operations, userId, advertiserId, contactId);
  }
  setPrimaryAdvertiserContact(userId: string, advertiserId: string, contactId: string) {
    return advertiserManagement.setPrimaryAdvertiserContact(this.operations, userId, advertiserId, contactId);
  }
  listAdvertiserActivities(userId: string, advertiserId: string, query: TelegramAdvertiserActivitiesQueryDto) {
    return advertiserManagement.listAdvertiserActivities(this.operations, userId, advertiserId, query);
  }
  createAdvertiserActivityEntry(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserActivityDto) {
    return advertiserManagement.createAdvertiserActivityEntry(this.operations, userId, advertiserId, dto);
  }
  createAdvertiserNote(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserActivityDto) {
    return advertiserManagement.createAdvertiserNote(this.operations, userId, advertiserId, dto);
  }
  rebuildInventorySnapshots(userId: string, dto: TelegramAdInventoryRebuildDto) {
    return inventorySnapshots.rebuildInventorySnapshots(this.operations, userId, dto);
  }
  priceFillCorrelation(userId: string, query: TelegramAdPriceFillCorrelationQueryDto) {
    return inventorySnapshots.priceFillCorrelation(this.operations, userId, query);
  }
  revenueScenario(userId: string, dto: TelegramAdRevenueScenarioDto) {
    return performanceAnalytics.revenueScenario(this.operations, userId, dto);
  }
  inventoryDetails(userId: string, query: TelegramAdInventoryDetailsQueryDto) {
    return performanceAnalytics.inventoryDetails(this.operations, userId, query);
  }
  listSales(userId: string, query: TelegramAdSalesQueryDto) {
    return saleRecords.listSales(this.operations, userId, query);
  }
  getSale(userId: string, id: string) {
    return saleRecords.getSale(this.operations, userId, id);
  }
  createSale(userId: string, dto: CreateTelegramAdSaleDto) {
    return saleRecords.createSale(this.operations, userId, dto);
  }
  updateSale(userId: string, id: string, dto: UpdateTelegramAdSaleDto) {
    return saleRecords.updateSale(this.operations, userId, id, dto);
  }
  deleteSale(userId: string, id: string) {
    return saleRecords.deleteSale(this.operations, userId, id);
  }
  addPlacement(userId: string, saleId: string, dto: CreateTelegramAdSalePlacementDto) {
    return placementEditing.addPlacement(this.operations, userId, saleId, dto);
  }
  updatePlacement(userId: string, saleId: string, placementId: string, dto: UpdateTelegramAdSalePlacementDto) {
    return placementEditing.updatePlacement(this.operations, userId, saleId, placementId, dto);
  }
  createPayment(userId: string, saleId: string, dto: CreateTelegramAdSalePaymentDto) {
    return payments.createPayment(this.operations, userId, saleId, dto);
  }
  listPayments(userId: string, saleId: string) {
    return payments.listPayments(this.operations, userId, saleId);
  }
  updatePayment(userId: string, saleId: string, paymentId: string, dto: UpdateTelegramAdSalePaymentDto) {
    return payments.updatePayment(this.operations, userId, saleId, paymentId, dto);
  }
  voidPayment(userId: string, saleId: string, paymentId: string, dto: VoidTelegramAdSalePaymentDto) {
    return payments.voidPayment(this.operations, userId, saleId, paymentId, dto);
  }
  createManagedPostFromPlacement(userId: string, saleId: string, placementId: string, dto: CreatePlacementManagedPostDto) {
    return placementEditing.createManagedPostFromPlacement(this.operations, userId, saleId, placementId, dto);
  }
  attachManagedPost(userId: string, saleId: string, placementId: string, dto: AttachPlacementManagedPostDto) {
    return placementEditing.attachManagedPost(this.operations, userId, saleId, placementId, dto);
  }
  detachManagedPost(userId: string, saleId: string, placementId: string) {
    return placementEditing.detachManagedPost(this.operations, userId, saleId, placementId);
  }
  private assertSaleTransition(from: TelegramAdSaleStatus, to: TelegramAdSaleStatus) {
    return publicationLifecycle.assertSaleTransition(this.operations, from, to);
  }
  private assertPlacementTransition(from: TelegramAdPlacementStatus, to: TelegramAdPlacementStatus) {
    return publicationLifecycle.assertPlacementTransition(this.operations, from, to);
  }
  schedulePlacement(userId: string, saleId: string, placementId: string, dto: SchedulePlacementDto) {
    return publicationLifecycle.schedulePlacement(this.operations, userId, saleId, placementId, dto);
  }
  recreateScheduledPostsViaBot(userId: string, saleId: string) {
    return publicationLifecycle.recreateScheduledPostsViaBot(this.operations, userId, saleId);
  }
  scheduleSale(userId: string, saleId: string, dto: ScheduleSaleDto) {
    return publicationLifecycle.scheduleSale(this.operations, userId, saleId, dto);
  }
  publishPlacement(userId: string, saleId: string, placementId: string, dto: PublishPlacementDto) {
    return publicationLifecycle.publishPlacement(this.operations, userId, saleId, placementId, dto);
  }
  reconcilePublishedPlacement(userId: string, saleId: string, placementId: string) {
    return publicationLifecycle.reconcilePublishedPlacement(this.operations, userId, saleId, placementId);
  }
  reschedulePlacement(userId: string, saleId: string, placementId: string, dto: ReschedulePlacementDto) {
    return publicationLifecycle.reschedulePlacement(this.operations, userId, saleId, placementId, dto);
  }
  cancelPlacement(userId: string, saleId: string, placementId: string, _dto: CancelPlacementDto) {
    return publicationLifecycle.cancelPlacement(this.operations, userId, saleId, placementId, _dto);
  }
  cancelSalePublications(userId: string, saleId: string, onProgress?: (
      item: TelegramAdSalePublicationDeletionProgress,
      current: number,
      total: number,
    ) => void, signal?: AbortSignal) {
    return publicationLifecycle.cancelSalePublications(this.operations, userId, saleId, onProgress, signal);
  }
  completePermanentPlacement(userId: string, saleId: string, placementId: string, _dto: CompletePermanentPlacementDto) {
    return publicationLifecycle.completePermanentPlacement(this.operations, userId, saleId, placementId, _dto);
  }
  private reconcilePlacementMetrics(workspaceId: string, placementId: string) {
    return publicationLifecycle.reconcilePlacementMetrics(this.operations, workspaceId, placementId);
  }
  private deletePublishedPlacement(workspaceId: string, placementId: string, options: { notifyScheduler?: boolean } = {}) {
    return placementDeletion.deletePublishedPlacement(this.operations, workspaceId, placementId, options);
  }
  private deletePlacementMessagesWithMtproto(workspaceId: string, channel: {
      telegramChatId: string | null;
      username: string | null;
      telegramAccessHash: string | null;
    }, sourceId: string, messageIds: string[]) {
    return placementDeletion.deletePlacementMessagesWithMtproto(this.operations, workspaceId, channel, sourceId, messageIds);
  }
  retryDeletion(userId: string, saleId: string, placementId: string, _dto: RetryPlacementDeletionDto) {
    return placementDeletion.retryDeletion(this.operations, userId, saleId, placementId, _dto);
  }
  reconcileSale(userId: string, saleId: string) {
    return publicationLifecycle.reconcileSale(this.operations, userId, saleId);
  }
  saleMetrics(userId: string, saleId: string) {
    return publicationLifecycle.saleMetrics(this.operations, userId, saleId);
  }
  processDueDeletionBatch(limit = 20) {
    return placementDeletion.processDueDeletionBatch(this.operations, limit);
  }
  private notifyAdDeletionDueWorkChanged() {
    return placementDeletion.notifyAdDeletionDueWorkChanged(this.operations);
  }
  reserveSale(userId: string, saleId: string, dto: ReserveTelegramAdSaleDto) {
    return saleRecords.reserveSale(this.operations, userId, saleId, dto);
  }
  confirmSale(userId: string, saleId: string) {
    return saleRecords.confirmSale(this.operations, userId, saleId);
  }
  cancelSale(userId: string, saleId: string) {
    return saleRecords.cancelSale(this.operations, userId, saleId);
  }

  private createOperations() {
    const service = this;
    return {
      adAnalyticsDataset: (...args: Parameters<TelegramAdSalesService['adAnalyticsDataset']>) => service.adAnalyticsDataset(...args),
      advertiserInclude: (...args: Parameters<TelegramAdSalesService['advertiserInclude']>) => service.advertiserInclude(...args),
      aggregateInventorySnapshots: (...args: Parameters<TelegramAdSalesService['aggregateInventorySnapshots']>) => service.aggregateInventorySnapshots(...args),
      analyticsChannelIds: (...args: Parameters<TelegramAdSalesService['analyticsChannelIds']>) => service.analyticsChannelIds(...args),
      get analyticsDatasetReader() { return service.analyticsDatasetReader; },
      analyticsRange: (...args: Parameters<TelegramAdSalesService['analyticsRange']>) => service.analyticsRange(...args),
      appendPlacementFinancials: (...args: Parameters<TelegramAdSalesService['appendPlacementFinancials']>) => service.appendPlacementFinancials(...args),
      assertPlacementTransition: (...args: Parameters<TelegramAdSalesService['assertPlacementTransition']>) => service.assertPlacementTransition(...args),
      assertSaleTransition: (...args: Parameters<TelegramAdSalesService['assertSaleTransition']>) => service.assertSaleTransition(...args),
      availabilityCacheKey: (...args: Parameters<TelegramAdSalesService['availabilityCacheKey']>) => service.availabilityCacheKey(...args),
      get availabilityReader() { return service.availabilityReader; },
      get botConfirmation() { return service.botConfirmation; },
      buildInventorySnapshotForDate: (...args: Parameters<TelegramAdSalesService['buildInventorySnapshotForDate']>) => service.buildInventorySnapshotForDate(...args),
      buildSaleSummary: (...args: Parameters<TelegramAdSalesService['buildSaleSummary']>) => service.buildSaleSummary(...args),
      cancelSale: (...args: Parameters<TelegramAdSalesService['cancelSale']>) => service.cancelSale(...args),
      createAdvertiserActivity: (...args: Parameters<TelegramAdSalesService['createAdvertiserActivity']>) => service.createAdvertiserActivity(...args),
      createAdvertiserActivityEntry: (...args: Parameters<TelegramAdSalesService['createAdvertiserActivityEntry']>) => service.createAdvertiserActivityEntry(...args),
      get crmAuthorization() { return service.crmAuthorization; },
      deletePlacementMessagesWithMtproto: (...args: Parameters<TelegramAdSalesService['deletePlacementMessagesWithMtproto']>) => service.deletePlacementMessagesWithMtproto(...args),
      deletePublishedPlacement: (...args: Parameters<TelegramAdSalesService['deletePublishedPlacement']>) => service.deletePublishedPlacement(...args),
      get encryptionService() { return service.encryptionService; },
      endOfUtcDay: (...args: Parameters<TelegramAdSalesService['endOfUtcDay']>) => service.endOfUtcDay(...args),
      ensurePlacementBelongsToSale: (...args: Parameters<TelegramAdSalesService['ensurePlacementBelongsToSale']>) => service.ensurePlacementBelongsToSale(...args),
      findWorkspaceChannel: (...args: Parameters<TelegramAdSalesService['findWorkspaceChannel']>) => service.findWorkspaceChannel(...args),
      findWorkspaceNetwork: (...args: Parameters<TelegramAdSalesService['findWorkspaceNetwork']>) => service.findWorkspaceNetwork(...args),
      getAdvertiser: (...args: Parameters<TelegramAdSalesService['getAdvertiser']>) => service.getAdvertiser(...args),
      getChannelBaseline: (...args: Parameters<TelegramAdSalesService['getChannelBaseline']>) => service.getChannelBaseline(...args),
      getPolicy: (...args: Parameters<TelegramAdSalesService['getPolicy']>) => service.getPolicy(...args),
      getSale: (...args: Parameters<TelegramAdSalesService['getSale']>) => service.getSale(...args),
      getSaleDetails: (...args: Parameters<TelegramAdSalesService['getSaleDetails']>) => service.getSaleDetails(...args),
      includeSaleRelations: (...args: Parameters<TelegramAdSalesService['includeSaleRelations']>) => service.includeSaleRelations(...args),
      invalidateAvailabilityCache: (...args: Parameters<TelegramAdSalesService['invalidateAvailabilityCache']>) => service.invalidateAvailabilityCache(...args),
      inventoryAnalytics: (...args: Parameters<TelegramAdSalesService['inventoryAnalytics']>) => service.inventoryAnalytics(...args),
      get inventoryReader() { return service.inventoryReader; },
      inventorySlotsForChannels: (...args: Parameters<TelegramAdSalesService['inventorySlotsForChannels']>) => service.inventorySlotsForChannels(...args),
      linkAdvertiserToMatchingCrmPeer: (...args: Parameters<TelegramAdSalesService['linkAdvertiserToMatchingCrmPeer']>) => service.linkAdvertiserToMatchingCrmPeer(...args),
      listChannelProducts: (...args: Parameters<TelegramAdSalesService['listChannelProducts']>) => service.listChannelProducts(...args),
      listDatesInRange: (...args: Parameters<TelegramAdSalesService['listDatesInRange']>) => service.listDatesInRange(...args),
      loadInventorySnapshots: (...args: Parameters<TelegramAdSalesService['loadInventorySnapshots']>) => service.loadInventorySnapshots(...args),
      get logger() { return service.logger; },
      mapAdSalesMemberPreferences: (...args: Parameters<TelegramAdSalesService['mapAdSalesMemberPreferences']>) => service.mapAdSalesMemberPreferences(...args),
      mapAdvertiser: (...args: Parameters<TelegramAdSalesService['mapAdvertiser']>) => service.mapAdvertiser(...args),
      mapAdvertiserActivity: (...args: Parameters<TelegramAdSalesService['mapAdvertiserActivity']>) => service.mapAdvertiserActivity(...args),
      mapAdvertiserContact: (...args: Parameters<TelegramAdSalesService['mapAdvertiserContact']>) => service.mapAdvertiserContact(...args),
      mapAdvertiserTask: (...args: Parameters<TelegramAdSalesService['mapAdvertiserTask']>) => service.mapAdvertiserTask(...args),
      mapPayment: (...args: Parameters<TelegramAdSalesService['mapPayment']>) => service.mapPayment(...args),
      mapPlacement: (...args: Parameters<TelegramAdSalesService['mapPlacement']>) => service.mapPlacement(...args),
      mapPolicy: (...args: Parameters<TelegramAdSalesService['mapPolicy']>) => service.mapPolicy(...args),
      mapProduct: (...args: Parameters<TelegramAdSalesService['mapProduct']>) => service.mapProduct(...args),
      mapSale: (...args: Parameters<TelegramAdSalesService['mapSale']>) => service.mapSale(...args),
      mapSnapshot: (...args: Parameters<TelegramAdSalesService['mapSnapshot']>) => service.mapSnapshot(...args),
      get mtprotoClient() { return service.mtprotoClient; },
      normalizeContactValue: (...args: Parameters<TelegramAdSalesService['normalizeContactValue']>) => service.normalizeContactValue(...args),
      normalizeEmail: (...args: Parameters<TelegramAdSalesService['normalizeEmail']>) => service.normalizeEmail(...args),
      normalizePhone: (...args: Parameters<TelegramAdSalesService['normalizePhone']>) => service.normalizePhone(...args),
      normalizeTelegramUsername: (...args: Parameters<TelegramAdSalesService['normalizeTelegramUsername']>) => service.normalizeTelegramUsername(...args),
      normalizeWebsite: (...args: Parameters<TelegramAdSalesService['normalizeWebsite']>) => service.normalizeWebsite(...args),
      get notificationProjector() { return service.notificationProjector; },
      notifyAdDeletionDueWorkChanged: (...args: Parameters<TelegramAdSalesService['notifyAdDeletionDueWorkChanged']>) => service.notifyAdDeletionDueWorkChanged(...args),
      paymentStatusFromTotals: (...args: Parameters<TelegramAdSalesService['paymentStatusFromTotals']>) => service.paymentStatusFromTotals(...args),
      policyDefaults: (...args: Parameters<TelegramAdSalesService['policyDefaults']>) => service.policyDefaults(...args),
      get pricingReader() { return service.pricingReader; },
      get prisma() { return service.prisma; },
      publishPlacement: (...args: Parameters<TelegramAdSalesService['publishPlacement']>) => service.publishPlacement(...args),
      get purchaseFolderSync() { return service.purchaseFolderSync; },
      recalculateAdvertiserStats: (...args: Parameters<TelegramAdSalesService['recalculateAdvertiserStats']>) => service.recalculateAdvertiserStats(...args),
      reconcilePlacementMetrics: (...args: Parameters<TelegramAdSalesService['reconcilePlacementMetrics']>) => service.reconcilePlacementMetrics(...args),
      resolveAdvertiserForSale: (...args: Parameters<TelegramAdSalesService['resolveAdvertiserForSale']>) => service.resolveAdvertiserForSale(...args),
      resolveAnalyticsChannelIds: (...args: Parameters<TelegramAdSalesService['resolveAnalyticsChannelIds']>) => service.resolveAnalyticsChannelIds(...args),
      resolvePolicy: (...args: Parameters<TelegramAdSalesService['resolvePolicy']>) => service.resolvePolicy(...args),
      resolveRateToPrimary: (...args: Parameters<TelegramAdSalesService['resolveRateToPrimary']>) => service.resolveRateToPrimary(...args),
      resolveSystemCategory: (...args: Parameters<TelegramAdSalesService['resolveSystemCategory']>) => service.resolveSystemCategory(...args),
      resolveWorkspaceTimezone: (...args: Parameters<TelegramAdSalesService['resolveWorkspaceTimezone']>) => service.resolveWorkspaceTimezone(...args),
      get responseCache() { return service.responseCache; },
      get saleReadService() { return service.saleReadService; },
      saveInventorySnapshot: (...args: Parameters<TelegramAdSalesService['saveInventorySnapshot']>) => service.saveInventorySnapshot(...args),
      schedulePlacement: (...args: Parameters<TelegramAdSalesService['schedulePlacement']>) => service.schedulePlacement(...args),
      get sourceAccessService() { return service.sourceAccessService; },
      startOfUtcDay: (...args: Parameters<TelegramAdSalesService['startOfUtcDay']>) => service.startOfUtcDay(...args),
      summarizeInventory: (...args: Parameters<TelegramAdSalesService['summarizeInventory']>) => service.summarizeInventory(...args),
      get telegramBotApiClient() { return service.telegramBotApiClient; },
      get telegramChannelAccessService() { return service.telegramChannelAccessService; },
      get telegramManagedPostCommandService() { return service.telegramManagedPostCommandService; },
      get telegramManagedPostMoveService() { return service.telegramManagedPostMoveService; },
      get telegramManagedPostPublicationService() {
        return service.telegramManagedPostPublicationService;
      },
      get telegramManagedPostRemoteSyncService() {
        return service.telegramManagedPostRemoteSyncService;
      },
      get telegramPostGroupsService() { return service.telegramPostGroupsService; },
      workspace: (...args: Parameters<TelegramAdSalesService['workspace']>) => service.workspace(...args),
      get workspaceService() { return service.workspaceService; },
    };
  }
}

export type TelegramAdSalesOperations = ReturnType<TelegramAdSalesService['createOperations']>;
