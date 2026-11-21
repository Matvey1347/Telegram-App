import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { FinanceCategoriesService } from '../../finance/finance-categories/finance-categories.service';
import {
  AdCampaignAnalyticsInputDto,
  AdCampaignQueryDto,
  CreateAdCampaignDto,
  UpdateAdCampaignDto,
} from './dto';
import { AdCampaignAnalyticsService } from './ad-campaign-analytics.service';
import { AdCampaignListReadService } from './ad-campaign-list-read.service';
import { GrowthInviteLinkReservationService } from '../invite-link-reservation.service';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import {
  normalizeSelectionIds,
  resolveCampaignCustomTitleTemplate,
  renderCampaignTitleTemplate,
  ensureAdvertisingSources,
  generateCampaignTitle,
} from './ad-campaign-advertising-sources';
import {
  selectedPromoIds,
  selectedInviteLinkIds,
  ensurePromosBelongToChannel,
  replaceCampaignInviteLinks,
  replaceCampaignTrackingInviteLinks,
  resolveTrackingInviteLinks,
  trackingInviteLinks,
} from './ad-campaign-link-selection';
import { AdCampaignPromoStorage } from './ad-campaign-promo-storage';
import {
  AdCampaignInviteLinkRead,
  type AdCampaignInviteLinkRefreshProgress,
} from './ad-campaign-invite-link-read';
import { AdCampaignAdmissionViewRead } from './ad-campaign-admission-view-read';
import { AdCampaignDetailRead } from './ad-campaign-detail-read';
import { campaignPerformanceSummary } from './ad-campaign-performance-summary';

export type { AdCampaignInviteLinkRefreshProgress } from './ad-campaign-invite-link-read';

@Injectable()
export class AdCampaignsService {
  private readonly promoStorage: AdCampaignPromoStorage;
  private readonly admissionRead: AdCampaignAdmissionViewRead;
  private readonly linkRead: AdCampaignInviteLinkRead;
  private readonly detailRead: AdCampaignDetailRead;

  private readonly listReadService: AdCampaignListReadService;

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private financeCategoriesService: FinanceCategoriesService,
    private campaignAnalyticsService: AdCampaignAnalyticsService,
    private inviteReservation: GrowthInviteLinkReservationService = new GrowthInviteLinkReservationService(),
    inviteLinkRegistration?: TelegramInviteLinkRegistrationService,
  ) {
    this.listReadService = new AdCampaignListReadService(
      prisma,
      workspaceService,
    );
    this.promoStorage = new AdCampaignPromoStorage(prisma);
    this.admissionRead = new AdCampaignAdmissionViewRead(prisma);
    this.linkRead = new AdCampaignInviteLinkRead(
      prisma,
      inviteLinkRegistration,
    );
    this.detailRead = new AdCampaignDetailRead(
      prisma,
      this.promoStorage,
      this.admissionRead,
    );
  }

  private analyticsInputData(dto: Partial<AdCampaignAnalyticsInputDto>) {
    return {
      subscribersBefore: dto.subscribersBefore,
      avgViewsBefore: dto.avgViewsBefore,
      avgReactionsBefore: dto.avgReactionsBefore,
      subscribersAfter24h: dto.subscribersAfter24h,
      subscribersAfter48h: dto.subscribersAfter48h,
      subscribersAfter72h: dto.subscribersAfter72h,
      subscribersAfter7d: dto.subscribersAfter7d,
      subscribersAfter30d: dto.subscribersAfter30d,
      avgViewsAfter: dto.avgViewsAfter,
      avgReactionsAfter: dto.avgReactionsAfter,
      clicksAfter: dto.clicksAfter,
      analyticsNotes: dto.analyticsNotes,
      excludeFromAnalytics: dto.excludeFromAnalytics,
    };
  }

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  async refreshInviteLinkData(
    userId: string,
    id: string,
    onProgress?: (
      item: AdCampaignInviteLinkRefreshProgress,
      current: number,
      total: number,
    ) => void,
    signal?: AbortSignal,
  ) {
    const workspaceId = await this.workspace(userId);
    return this.linkRead.refreshInviteLinkData(
      workspaceId,
      userId,
      id,
      onProgress,
      signal,
    );
  }

  private async ensureInviteLinksBelongToChannel(
    tx: any,
    workspaceId: string,
    inviteLinkIds: string[],
    telegramChannelId: string,
    currentCampaignId?: string,
  ) {
    return this.inviteReservation.assertAvailableForAds(
      tx,
      workspaceId,
      inviteLinkIds,
      telegramChannelId,
      currentCampaignId,
    );
  }

  private async resolveRateToPrimary(
    tx: any,
    workspaceId: string,
    fromCurrency: string,
    primaryCurrency: string,
  ) {
    if (fromCurrency === primaryCurrency) return 1;

    const direct = await tx.exchangeRate.findFirst({
      where: {
        baseCurrency: fromCurrency,
        targetCurrency: primaryCurrency,
      },
      orderBy: { date: 'desc' },
    });
    if (direct?.rate) return Number(direct.rate);

    const inverse = await tx.exchangeRate.findFirst({
      where: {
        baseCurrency: primaryCurrency,
        targetCurrency: fromCurrency,
      },
      orderBy: { date: 'desc' },
    });
    if (inverse?.rate) return 1 / Number(inverse.rate);

    throw new BadRequestException(
      `No exchange rate from ${fromCurrency} to ${primaryCurrency}`,
    );
  }

  private async syncExpenseTransaction(
    tx: any,
    workspaceId: string,
    campaign: any,
    accountId?: string,
  ) {
    const account = await tx.account.findFirst({
      where: { id: accountId || campaign.accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');

    const description = `Telegram ad campaign: ${campaign.title}`;
    const date = campaign.placementDate || campaign.startedAt || new Date();
    await this.financeCategoriesService.ensureSystemCategories(workspaceId, tx);
    const advertisingCategory = await tx.transactionCategory.findFirst({
      where: { workspaceId, type: 'expense', key: 'advertising' },
    });
    if (!advertisingCategory)
      throw new NotFoundException('Advertising transaction category not found');

    const payload = {
      workspaceId,
      accountId: account.id,
      adCampaignId: campaign.id,
      type: 'expense' as const,
      category: advertisingCategory.name,
      categoryId: advertisingCategory.id,
      memberId: null,
      assignedMemberId: campaign.assignedMemberId,
      amount: campaign.price,
      currency: campaign.currency,
      exchangeRateToPrimary: campaign.exchangeRateToPrimary,
      amountInPrimaryCurrency: campaign.priceInPrimaryCurrency,
      date,
      description,
    };

    // The unique relation is both provenance and the idempotency boundary.
    await tx.transaction.upsert({
      where: { adCampaignId: campaign.id },
      update: payload,
      create: payload,
    });
  }

  async findAll(userId: string, query: AdCampaignQueryDto = {}) {
    return this.listReadService.findAll(userId, query);
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    return this.detailRead.findOne(workspaceId, id);
  }

  async admissionViewAnalytics(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    return this.admissionRead.admissionViewAnalytics(workspaceId, id);
  }

  async inviteLinkHistory(userId: string, id: string, limit = 120) {
    const workspaceId = await this.workspace(userId);
    return this.linkRead.inviteLinkHistory(workspaceId, id, limit);
  }

  async create(userId: string, dto: CreateAdCampaignDto) {
    const promoIds = selectedPromoIds(dto);
    const inviteLinkIds = selectedInviteLinkIds(dto);
    const botInviteLinkIds = normalizeSelectionIds(dto.botInviteLinkIds || []);
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    await ensurePromosBelongToChannel(
      this.prisma,
      workspaceId,
      promoIds,
      dto.telegramChannelId,
    );

    const campaign = await this.prisma.$transaction(
      async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');
        const price = Number(dto.price ?? 0);
        const account = dto.accountId
          ? await tx.account.findFirst({
              where: { id: dto.accountId, workspaceId },
            })
          : null;
        if (dto.accountId && !account)
          throw new NotFoundException('Account not found');
        if (price > 0 && !account) {
          throw new BadRequestException(
            'Select an account before setting a campaign cost',
          );
        }

        await this.ensureInviteLinksBelongToChannel(
          tx,
          workspaceId,
          inviteLinkIds,
          dto.telegramChannelId,
        );
        const currency = account?.currency ?? workspace.primaryCurrency;
        const exchangeRateToPrimary = account
          ? await this.resolveRateToPrimary(
              tx,
              workspaceId,
              account.currency,
              workspace.primaryCurrency,
            )
          : 1;
        const placementDate = dto.date ? new Date(dto.date) : new Date();
        const advertisingSources = await ensureAdvertisingSources(
          tx,
          workspaceId,
          dto.telegramChannelId,
          dto.advertisingChannelIds || [],
        );
        const rawAdvertisingSourceIds = dto.advertisingChannelIds || [];
        const generatedTitle = await generateCampaignTitle(
          tx,
          workspaceId,
          placementDate,
          promoIds,
          rawAdvertisingSourceIds,
        );
        const customTitleTemplate = resolveCampaignCustomTitleTemplate(
          dto.customTitle,
        );
        const row = await (tx.adCampaign as any).create({
          data: {
            workspaceId,
            telegramChannelId: dto.telegramChannelId,
            promoId: promoIds[0] || null,
            telegramInviteLinkId: inviteLinkIds[0] || null,
            title: customTitleTemplate
              ? renderCampaignTitleTemplate(customTitleTemplate, placementDate)
              : generatedTitle,
            customTitleTemplate,
            status: 'planned',
            price,
            currency,
            exchangeRateToPrimary,
            priceInPrimaryCurrency: price * exchangeRateToPrimary,
            accountId: account?.id ?? null,
            placementDate,
            endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
            notes: dto.notes,
            assignedMemberId,
            createdByUserId: userId,
            ...this.analyticsInputData(dto),
          },
        });

        await this.promoStorage.replaceCampaignPromos(tx, row.id, promoIds);
        await replaceCampaignInviteLinks(
          tx,
          workspaceId,
          row.id,
          inviteLinkIds,
        );
        const trackingInviteLinkIds =
          dto.trackingChannelIds !== undefined
            ? await resolveTrackingInviteLinks(
                tx,
                workspaceId,
                dto.trackingChannelIds,
                dto.trackingLinkKind || 'BOT',
                dto.telegramChannelId,
              )
            : botInviteLinkIds;
        await replaceCampaignTrackingInviteLinks(
          tx,
          workspaceId,
          row.id,
          trackingInviteLinkIds,
          dto.trackingLinkKind || 'BOT',
        );

        if (advertisingSources.channelIds.length) {
          await (tx as any).adCampaignTelegramChannelPlacement.createMany({
            data: advertisingSources.channelIds.map((id) => ({
              adCampaignId: row.id,
              telegramChannelId: id,
            })),
            skipDuplicates: true,
          });
        }
        if (advertisingSources.sourceIds.length) {
          await (tx as any).adCampaignAdvertisingChannel.createMany({
            data: advertisingSources.sourceIds.map((id) => ({
              adCampaignId: row.id,
              advertisingSourceId: id,
            })),
            skipDuplicates: true,
          });
        }

        if (account && price > 0) {
          await this.syncExpenseTransaction(tx, workspaceId, row, account.id);
        }
        return row;
      },
      { timeout: 15_000 },
    );

    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      campaign.id,
    );
    return this.findOne(userId, campaign.id);
  }

  async update(userId: string, id: string, dto: UpdateAdCampaignDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Campaign not found');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;

    const hasPromoSelection =
      dto.promoIds !== undefined || dto.promoId !== undefined;
    const hasInviteLinkSelection =
      dto.inviteLinkIds !== undefined || dto.telegramInviteLinkId !== undefined;
    const hasBotInviteLinkSelection =
      dto.botInviteLinkIds !== undefined ||
      dto.trackingChannelIds !== undefined;
    const existingPromoLinks =
      (await this.promoStorage.hasCampaignPromoStorage())
        ? await (this.prisma as any).adCampaignPromo.findMany({
            where: { adCampaignId: id },
            select: { promoId: true },
          })
        : [];
    const existingPromoIds = normalizeSelectionIds([
      existing.promoId,
      ...existingPromoLinks.map((item: any) => item.promoId),
    ]);
    const existingInviteLinkIds = normalizeSelectionIds(
      (
        await this.prisma.telegramInviteLink.findMany({
          where: { workspaceId, adCampaignId: id },
          select: { id: true },
        })
      )
        .map((link) => link.id)
        .concat(existing.telegramInviteLinkId || []),
    );
    const nextPromoIds = hasPromoSelection
      ? selectedPromoIds(dto)
      : existingPromoIds;
    const nextInviteLinkIds = hasInviteLinkSelection
      ? selectedInviteLinkIds(dto)
      : existingInviteLinkIds;
    const nextOwnTelegramChannelId =
      dto.telegramChannelId ?? existing.telegramChannelId;

    if (nextPromoIds.length) {
      await ensurePromosBelongToChannel(
        this.prisma,
        workspaceId,
        nextPromoIds,
        nextOwnTelegramChannelId,
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const price = dto.price ?? Number(existing.price);
        const accountId = dto.accountId ?? existing.accountId;
        const account = accountId
          ? await tx.account.findFirst({
              where: { id: accountId, workspaceId },
            })
          : null;
        if (accountId && !account)
          throw new NotFoundException('Account not found');
        if (price > 0 && !account) {
          throw new BadRequestException(
            'Select an account before setting a campaign cost',
          );
        }
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');
        const currency =
          account?.currency ?? existing.currency ?? workspace.primaryCurrency;
        const exchangeRateToPrimary = account
          ? await this.resolveRateToPrimary(
              tx,
              workspaceId,
              account.currency,
              workspace.primaryCurrency,
            )
          : Number(existing.exchangeRateToPrimary) || 1;
        const nextPlacementDate = dto.date
          ? new Date(dto.date)
          : existing.placementDate || new Date();
        await this.ensureInviteLinksBelongToChannel(
          tx,
          workspaceId,
          nextInviteLinkIds,
          nextOwnTelegramChannelId,
          id,
        );
        const rawNextAdvertisingChannelIds = dto.advertisingChannelIds ?? [
          ...(
            await (tx as any).adCampaignTelegramChannelPlacement.findMany({
              where: { adCampaignId: id },
              select: { telegramChannelId: true },
            })
          ).map((x: any) => `channel:${x.telegramChannelId}`),
          ...(
            await (tx as any).adCampaignAdvertisingChannel.findMany({
              where: { adCampaignId: id },
              select: { advertisingSourceId: true },
            })
          ).map((x: any) => `source:${x.advertisingSourceId}`),
        ];
        const nextAdvertisingSources = await ensureAdvertisingSources(
          tx,
          workspaceId,
          nextOwnTelegramChannelId,
          rawNextAdvertisingChannelIds,
        );
        const generatedTitle = await generateCampaignTitle(
          tx,
          workspaceId,
          nextPlacementDate,
          nextPromoIds,
          [
            ...nextAdvertisingSources.channelIds.map(
              (sourceId) => `channel:${sourceId}`,
            ),
            ...nextAdvertisingSources.sourceIds.map(
              (sourceId) => `source:${sourceId}`,
            ),
          ],
        );
        const customTitleTemplate =
          dto.customTitle === undefined
            ? (existing as any).customTitleTemplate
            : resolveCampaignCustomTitleTemplate(dto.customTitle);

        const row = await (tx.adCampaign as any).update({
          where: { id },
          data: {
            title: customTitleTemplate
              ? renderCampaignTitleTemplate(
                  customTitleTemplate,
                  nextPlacementDate,
                )
              : generatedTitle,
            customTitleTemplate,
            telegramChannelId: dto.telegramChannelId,
            promoId: nextPromoIds[0] || null,
            telegramInviteLinkId: nextInviteLinkIds[0] || null,
            price,
            currency,
            exchangeRateToPrimary,
            priceInPrimaryCurrency: price * exchangeRateToPrimary,
            accountId: account?.id ?? null,
            placementDate: dto.date ? new Date(dto.date) : undefined,
            endedAt:
              dto.endedAt === undefined
                ? undefined
                : dto.endedAt
                  ? new Date(dto.endedAt)
                  : null,
            notes: dto.notes,
            assignedMemberId,
            ...this.analyticsInputData(dto),
          },
        });

        if (hasPromoSelection) {
          await this.promoStorage.replaceCampaignPromos(tx, id, nextPromoIds);
        }

        if (hasInviteLinkSelection) {
          await replaceCampaignInviteLinks(
            tx,
            workspaceId,
            id,
            nextInviteLinkIds,
          );
        }
        if (hasBotInviteLinkSelection) {
          const trackingInviteLinkIds =
            dto.trackingChannelIds !== undefined
              ? await resolveTrackingInviteLinks(
                  tx,
                  workspaceId,
                  dto.trackingChannelIds,
                  dto.trackingLinkKind || 'BOT',
                  nextOwnTelegramChannelId,
                )
              : normalizeSelectionIds(dto.botInviteLinkIds || []);
          await replaceCampaignTrackingInviteLinks(
            tx,
            workspaceId,
            id,
            trackingInviteLinkIds,
            dto.trackingLinkKind || 'BOT',
          );
        }

        if (dto.advertisingChannelIds) {
          await (tx as any).adCampaignTelegramChannelPlacement.deleteMany({
            where: { adCampaignId: id },
          });
          await (tx as any).adCampaignAdvertisingChannel.deleteMany({
            where: { adCampaignId: id },
          });
          await (tx as any).adCampaignTelegramChannelPlacement.createMany({
            data: nextAdvertisingSources.channelIds.map((sourceId) => ({
              adCampaignId: id,
              telegramChannelId: sourceId,
            })),
            skipDuplicates: true,
          });
          await (tx as any).adCampaignAdvertisingChannel.createMany({
            data: nextAdvertisingSources.sourceIds.map((sourceId) => ({
              adCampaignId: id,
              advertisingSourceId: sourceId,
            })),
            skipDuplicates: true,
          });
        }

        if (account && price > 0) {
          await this.syncExpenseTransaction(tx, workspaceId, row, account.id);
        } else {
          await tx.transaction.deleteMany({
            where: { workspaceId, adCampaignId: id },
          });
        }
      },
      { timeout: 15_000 },
    );

    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      id,
    );
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);
    return this.prisma.$transaction(async (tx) => {
      // This direct unique relation is assigned only to generated expenses.
      await tx.transaction.deleteMany({
        where: { workspaceId: campaign.workspaceId, adCampaignId: id },
      });
      return tx.adCampaign.delete({
        where: { id },
      });
    });
  }

  async analytics(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);
    return {
      campaignId: campaign.id,
      promoInviteLinkId: campaign.telegramInviteLinkId,
      ownTelegramChannel: campaign.telegramChannel,
      advertisingChannels: campaign.advertisingChannels,
      isMixedAttribution: campaign.isMixedAttribution,
      ...campaign.analytics,
    };
  }

  async trackingInviteLinks(userId: string) {
    const workspaceId = await this.workspace(userId);
    return trackingInviteLinks(this.prisma, workspaceId);
  }

  async updateAnalyticsInput(
    userId: string,
    id: string,
    dto: AdCampaignAnalyticsInputDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Campaign not found');
    await (this.prisma.adCampaign as any).update({
      where: { id },
      data: this.analyticsInputData(dto),
    });
    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      id,
    );
    return this.findOne(userId, id);
  }

  async recalculateAnalytics(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      id,
    );
    return this.findOne(userId, id);
  }

  async analyticsSummary(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const campaign: any = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return this.campaignAnalyticsService.summary(campaign);
  }

  async performanceSummary(userId: string, query: any = {}) {
    const workspaceId = await this.workspace(userId);
    return campaignPerformanceSummary(this.prisma, workspaceId, query);
  }
}
