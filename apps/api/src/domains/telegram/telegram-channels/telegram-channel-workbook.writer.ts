import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TelegramChannelWorkbookDataService } from './telegram-channel-workbook-data.service';
import { TelegramChannelWorkbookSheetWriter } from './telegram-channel-workbook-sheet.writer';
import {
  TELEGRAM_CHANNEL_EXPORT_SECTIONS,
  type TelegramChannelExportSection,
} from '@telegram-system/shared';

type WorkbookData = Awaited<
  ReturnType<TelegramChannelWorkbookDataService['load']>
>;

@Injectable()
export class TelegramChannelWorkbookWriter {
  constructor(private readonly sheets: TelegramChannelWorkbookSheetWriter) {}

  async build(
    data: WorkbookData,
    requestedSections?: TelegramChannelExportSection[],
  ) {
    const selectedSections = new Set(
      (requestedSections || TELEGRAM_CHANNEL_EXPORT_SECTIONS).filter((section) =>
        TELEGRAM_CHANNEL_EXPORT_SECTIONS.includes(section),
      ),
    );
    const {
      audience,
      financialSummary,
      firstPost,
      lastPost,
      firstDaily,
      lastDaily,
      firstStatsPoint,
      lastStatsPoint,
      firstAudienceSnapshot,
      lastAudienceSnapshot,
      posts,
      postSnapshots,
      dailyStats,
      statsPoints,
      statsSnapshots,
      audienceSnapshots,
      inviteLinks,
      inviteLinkSnapshots,
      promos,
      campaigns,
      mutualPromotionParticipants,
      adSales,
      transactions,
      channel,
    } = data;
    const telegramDates = [
      firstPost?.postDate,
      lastPost?.postDate,
      firstDaily?.date,
      lastDaily?.date,
      firstStatsPoint?.date,
      lastStatsPoint?.date,
      firstAudienceSnapshot?.collectedAt,
      lastAudienceSnapshot?.collectedAt,
    ].filter(Boolean) as Date[];
    const tgFrom =
      telegramDates.length > 0
        ? new Date(Math.min(...telegramDates.map((date) => date.getTime())))
        : null;
    const tgTo =
      telegramDates.length > 0
        ? new Date(Math.max(...telegramDates.map((date) => date.getTime())))
        : null;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Telegram System';
    workbook.created = new Date();
    workbook.modified = new Date();
    this.sheets.addKeyValueSheet(workbook, 'Overview', [
      ['Channel', channel.title],
      ['Username', channel.username ? `@${channel.username}` : null],
      ['Telegram chat id', channel.telegramChatId],
      ['System period from', channel.createdAt],
      ['System period to', new Date()],
      ['Telegram data period from', tgFrom],
      ['Telegram data period to', tgTo],
      [
        'Period note',
        `Channel is in system from ${this.sheets.dateOnly(channel.createdAt) || '-'}; Telegram data in this export from ${this.sheets.dateOnly(tgFrom) || '-'} to ${this.sheets.dateOnly(tgTo) || '-'}.`,
      ],
      ['Exported at', new Date()],
      ['Posts exported', posts.length],
      ['Promos exported', promos.length],
      ['Campaigns exported', campaigns.length],
      ['Invite links exported', inviteLinks.length],
    ]);
    this.sheets.addKeyValueSheet(workbook, 'Channel Settings', [
      ['ID', channel.id],
      ['Title', channel.title],
      ['Description', channel.description],
      ['Language', channel.language],
      ['Niche', channel.niche],
      ['Invite link', channel.inviteLink],
      ['Photo URL', channel.photoUrl],
      ['Source type', channel.sourceType],
      ['Current subscribers', channel.currentSubscribersCount],
      ['Seed subscribers', channel.seedSubscribersCount],
      ['Known fake subscribers', channel.knownFakeSubscribersCount],
      ['Own views per post', channel.ownViewsPerPost],
      ['Own reactions per post', channel.ownReactionsPerPost],
      ['Active subscribers window', channel.activeSubscribersWindow],
      ['Subscriber base quality', channel.subscriberBaseQuality],
      ['Data quality notes', channel.dataQualityNotes],
      ['Target CPA from', channel.targetCpaFrom],
      ['Target CPA to', channel.targetCpa],
      ['Acceptable CPA from', channel.acceptableCpaFrom],
      ['Acceptable CPA to', channel.acceptableCpa],
      ['Stop CPA from', channel.stopCpaFrom],
      ['Stop CPA to', channel.stopCpa],
      ['Last public sync', channel.lastPublicSyncedAt],
      ['Created at', channel.createdAt],
      ['Updated at', channel.updatedAt],
    ]);
    this.sheets.addKeyValueSheet(workbook, 'Calculated Metrics', [
      ...Object.entries(audience).map(
        ([key, value]) => [`audience.${key}`, value] as [string, unknown],
      ),
      ...Object.entries(financialSummary).map(
        ([key, value]) => [`finance.${key}`, value] as [string, unknown],
      ),
    ]);
    this.sheets.addTableSheet(
      workbook,
      'Posts',
      [
        { header: 'Post date', key: 'postDate', width: 22 },
        { header: 'Message ID', key: 'telegramMessageId', width: 16 },
        { header: 'Text', key: 'text', width: 80 },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Comments', key: 'commentsCount' },
        { header: 'Channel own views per post', key: 'channelOwnViews' },
        { header: 'Manual own views', key: 'manualOwnViews' },
        { header: 'Adjusted views', key: 'adjustedViews' },
        {
          header: 'Channel own reactions per post',
          key: 'channelOwnReactions',
        },
        { header: 'Manual own reactions', key: 'manualOwnReactions' },
        { header: 'Adjusted reactions', key: 'adjustedReactions' },
        { header: 'Exclude from analytics', key: 'excludeFromAnalytics' },
        { header: 'Reactions JSON', key: 'reactions', width: 50 },
        { header: 'Raw message JSON', key: 'rawMessage', width: 80 },
      ],
      posts.map((post) => ({
        ...post,
        channelOwnViews: channel.ownViewsPerPost,
        channelOwnReactions: channel.ownReactionsPerPost,
        adjustedViews: Math.max(
          0,
          Number(post.viewsCount || 0) -
            Number(channel.ownViewsPerPost || 0) -
            Number(post.manualOwnViews || 0),
        ),
        adjustedReactions: Math.max(
          0,
          Number(post.reactionsCount || 0) -
            Number(channel.ownReactionsPerPost || 0) -
            Number(post.manualOwnReactions || 0),
        ),
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'Post Metric Snapshots',
      [
        { header: 'Collected at', key: 'collectedAt', width: 22 },
        { header: 'Message ID', key: 'telegramMessageId' },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Comments', key: 'commentsCount' },
        { header: 'Reactions JSON', key: 'reactions', width: 60 },
      ],
      postSnapshots.map((snapshot: any) => ({
        ...snapshot,
        telegramMessageId: snapshot.telegramPost?.telegramMessageId,
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'Daily Stats',
      [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Subscribers', key: 'subscribersCount' },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Left', key: 'leftCount' },
        { header: 'Net growth', key: 'netGrowthCount' },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      dailyStats,
    );
    this.sheets.addTableSheet(
      workbook,
      'Stats Points',
      [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Metric', key: 'metric' },
        { header: 'Series', key: 'series' },
        { header: 'Series label', key: 'seriesLabel' },
        { header: 'Graph type', key: 'graphType' },
        { header: 'Value', key: 'value' },
        { header: 'Latest synced at', key: 'latestSyncedAt', width: 22 },
      ],
      statsPoints,
    );
    this.sheets.addTableSheet(
      workbook,
      'Stats Snapshots',
      [
        { header: 'Snapshot date', key: 'snapshotDate', width: 16 },
        { header: 'Synced at', key: 'syncedAt', width: 22 },
        { header: 'Available fields', key: 'availableFields', width: 40 },
        { header: 'Warnings', key: 'warnings', width: 40 },
        { header: 'Normalized stats JSON', key: 'normalizedStats', width: 80 },
        { header: 'Raw stats JSON', key: 'rawStats', width: 80 },
      ],
      statsSnapshots,
    );
    this.sheets.addTableSheet(
      workbook,
      'Audience Snapshots',
      [
        { header: 'Collected at', key: 'collectedAt', width: 22 },
        { header: 'Subscribers', key: 'subscribersCount' },
        { header: 'Effective subscribers', key: 'effectiveSubscribersCount' },
        { header: 'Active subscribers', key: 'activeSubscribersEstimate' },
        {
          header: 'Capped active subscribers',
          key: 'cappedActiveSubscribersEstimate',
        },
        { header: 'View rate', key: 'viewRate' },
        { header: 'Raw view rate', key: 'rawViewRate' },
        { header: 'Capped view rate', key: 'cappedViewRate' },
        { header: 'Avg views raw', key: 'avgViewsRaw' },
        { header: 'Avg views adjusted', key: 'avgViewsAdjusted' },
        { header: 'Avg reactions raw', key: 'avgReactionsRaw' },
        { header: 'Avg reactions adjusted', key: 'avgReactionsAdjusted' },
        { header: 'Data quality', key: 'dataQuality' },
        { header: 'Data quality reason', key: 'dataQualityReason' },
        {
          header: 'External traffic anomaly',
          key: 'hasExternalTrafficAnomaly',
        },
        {
          header: 'Subscriber base pollution',
          key: 'hasSubscriberBasePollution',
        },
        { header: 'Posts window', key: 'postsWindow' },
        { header: 'Source', key: 'source' },
      ],
      audienceSnapshots,
    );
    this.sheets.addTableSheet(
      workbook,
      'Invite Links',
      [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'URL', key: 'url', width: 60 },
        { header: 'Campaign', key: 'campaignTitle', width: 30 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Revoked', key: 'isRevoked' },
        { header: 'Expire date', key: 'expireDate', width: 22 },
        { header: 'Member limit', key: 'memberLimit' },
        { header: 'Creates join request', key: 'createsJoinRequest' },
        { header: 'Last synced at', key: 'lastSyncedAt', width: 22 },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      inviteLinks.map((link: any) => ({
        ...link,
        campaignTitle: link.adCampaign?.title,
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'Invite Link History',
      [
        { header: 'Synced at', key: 'syncedAt', width: 22 },
        { header: 'Invite link', key: 'inviteLinkName', width: 28 },
        { header: 'URL', key: 'inviteLinkUrl', width: 60 },
        { header: 'Source group', key: 'sourceGroup', width: 30 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Requested', key: 'requestedCount' },
        { header: 'Peak attributed', key: 'peakAttributedCount' },
      ],
      inviteLinkSnapshots.map((snapshot: any) => ({
        ...snapshot,
        inviteLinkName: snapshot.inviteLink?.name,
        inviteLinkUrl: snapshot.inviteLink?.url,
        sourceGroup: snapshot.inviteLink?.adCampaign?.title || 'Unattributed',
      })),
    );
    const promosSheet = this.sheets.addTableSheet(
      workbook,
      'Creatives',
      [
        { header: 'Title', key: 'title', width: 28 },
        { header: 'Status', key: 'status' },
        { header: 'Angle', key: 'angle', width: 28 },
        { header: 'Text', key: 'text', width: 90 },
        { header: 'Image data or URL', key: 'imageData', width: 60 },
        { header: 'Created at', key: 'createdAt', width: 22 },
        { header: 'Image preview', key: 'imagePreview', width: 20 },
      ],
      promos.map((promo) => ({ ...promo, imagePreview: '' })),
    );
    this.sheets.addPromoImages(workbook, promosSheet, promos);
    this.sheets.addTableSheet(
      workbook,
      'Campaigns',
      [
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Status', key: 'status' },
        { header: 'Promo', key: 'promoTitle', width: 24 },
        { header: 'Advertising sources', key: 'advertisingSources', width: 50 },
        { header: 'Hypotheses', key: 'hypotheses', width: 40 },
        { header: 'Price', key: 'price' },
        { header: 'Currency', key: 'currency' },
        { header: 'Price in primary currency', key: 'priceInPrimaryCurrency' },
        { header: 'Exchange rate to primary', key: 'exchangeRateToPrimary' },
        { header: 'Placement date', key: 'placementDate', width: 18 },
        { header: 'Started at', key: 'startedAt', width: 18 },
        { header: 'Ended at', key: 'endedAt', width: 18 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Left', key: 'leftCount' },
        { header: 'Net growth', key: 'netGrowthCount' },
        { header: 'CPA', key: 'cpa' },
        { header: 'CPM', key: 'cpm' },
        {
          header: 'Active subscribers from ad',
          key: 'activeSubscribersFromAd',
        },
        { header: 'Active CPA', key: 'activeCpa' },
        { header: 'Active rate', key: 'activeRate' },
        {
          header: 'Capped active subscribers',
          key: 'cappedActiveSubscribersFromAd',
        },
        { header: 'Capped active CPA', key: 'cappedActiveCpa' },
        { header: 'Retention 7d', key: 'retention7d' },
        { header: 'CPA status', key: 'cpaStatus' },
        { header: 'Active CPA status', key: 'activeCpaStatus' },
        { header: 'Overall status', key: 'overallStatus' },
        { header: 'Data quality', key: 'adDataQuality' },
        { header: 'Data quality reason', key: 'adDataQualityReason' },
        { header: 'View anomaly', key: 'hasViewAnomaly' },
        {
          header: 'Subscriber base pollution',
          key: 'hasSubscriberBasePollution',
        },
        { header: 'Source post URL', key: 'sourcePostUrl', width: 44 },
        { header: 'Source post views', key: 'sourcePostViews' },
        { header: 'Notes', key: 'notes', width: 60 },
        { header: 'Analytics notes', key: 'analyticsNotes', width: 60 },
        { header: 'Expense transaction ID', key: 'expenseTransactionId' },
        { header: 'Expense account', key: 'expenseAccount' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      campaigns.map((campaign: any) => ({
        ...campaign,
        promoTitle: campaign.promo?.title,
        advertisingSources: [
          ...(campaign.advertisingChannels || []).map(
            (item: any) => item.advertisingSource?.name,
          ),
          ...(campaign.advertisingTelegramChannels || []).map(
            (item: any) => item.telegramChannel?.title,
          ),
        ]
          .filter(Boolean)
          .join(', '),
        hypotheses: (campaign.hypothesisLinks || [])
          .map((item: any) => item.hypothesis?.name)
          .filter(Boolean)
          .join(', '),
        expenseTransactionId: campaign.expenseTransaction?.id,
        expenseAccount: campaign.expenseTransaction?.account?.name,
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'Mutual Promotions',
      [
        { header: 'Folder', key: 'folderTitle', width: 32 },
        { header: 'Folder status', key: 'folderStatus' },
        { header: 'Role', key: 'role' },
        { header: 'Invite link', key: 'inviteLinkUrl', width: 60 },
        { header: 'Subscribers at start', key: 'subscribersAtStart' },
        { header: 'Subscribers at end', key: 'subscribersAtEnd' },
        { header: 'Invite joined at start', key: 'inviteJoinedAtStart' },
        { header: 'Invite joined at end', key: 'inviteJoinedAtEnd' },
        { header: 'Expense transaction ID', key: 'expenseTransactionId', width: 30 },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      mutualPromotionParticipants.map((participant: any) => ({
        ...participant,
        folderTitle: participant.folder?.title,
        folderStatus: participant.folder?.status,
        inviteLinkUrl: participant.inviteLink?.url,
        expenseTransactionId: participant.expense?.id,
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'Finance Transactions',
      [
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Campaign', key: 'campaignTitle', width: 30 },
        { header: 'Type', key: 'type' },
        { header: 'Amount', key: 'amount' },
        { header: 'Currency', key: 'currency' },
        {
          header: 'Amount in primary currency',
          key: 'amountInPrimaryCurrency',
        },
        { header: 'Exchange rate to primary', key: 'exchangeRateToPrimary' },
        { header: 'Account', key: 'accountName' },
        { header: 'Category', key: 'categoryName' },
        { header: 'Member', key: 'memberName' },
        { header: 'Description', key: 'description', width: 60 },
      ],
      transactions.map((transaction: any) => ({
        ...transaction,
        campaignTitle: transaction.adCampaign?.title,
        accountName: transaction.account?.name,
        categoryName: transaction.categoryRef?.name || transaction.category,
        memberName: transaction.member?.name,
      })),
    );
    const advertisers = new Map<string, any>();
    for (const sale of adSales) {
      if (sale.advertiser) advertisers.set(sale.advertiser.id, sale.advertiser);
    }
    this.sheets.addTableSheet(
      workbook,
      'CRM Clients',
      [
        { header: 'Name', key: 'displayName', width: 28 },
        { header: 'Company', key: 'companyName', width: 28 },
        { header: 'Telegram', key: 'telegramUsername' },
        { header: 'Phone', key: 'phone' },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Stage', key: 'stage' },
        { header: 'Tags', key: 'tags', width: 36 },
        { header: 'Total sales', key: 'totalSalesCount' },
        { header: 'Completed sales', key: 'completedSalesCount' },
        { header: 'Total revenue (primary)', key: 'totalRevenueInPrimaryCurrency' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      [...advertisers.values()].map((advertiser) => ({
        ...advertiser,
        tags: advertiser.tags.map((assignment: any) => assignment.tag.name).join(', '),
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'CRM Deals',
      [
        { header: 'Deal', key: 'title', width: 32 },
        { header: 'Client', key: 'advertiserName', width: 28 },
        { header: 'Status', key: 'status' },
        { header: 'CRM stage', key: 'crmDealStage' },
        { header: 'Origin', key: 'origin' },
        { header: 'Currency', key: 'settlementCurrency' },
        { header: 'Channel amount', key: 'channelAmount' },
        { header: 'Expected close', key: 'expectedCloseAt', width: 22 },
        { header: 'Next action', key: 'nextActionAt', width: 22 },
        { header: 'Notes', key: 'notes', width: 60 },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      adSales.map((sale: any) => ({
        ...sale,
        title: sale.title || sale.advertiserName,
        advertiserName: sale.advertiser?.displayName || sale.advertiserName,
        channelAmount: sale.placements.reduce(
          (total: number, placement: any) => total + Number(placement.agreedPrice || 0),
          0,
        ),
      })),
    );
    this.sheets.addTableSheet(
      workbook,
      'CRM Placement Posts',
      [
        { header: 'Deal', key: 'dealTitle', width: 32 },
        { header: 'Client', key: 'clientName', width: 28 },
        { header: 'Scheduled at', key: 'scheduledAt', width: 22 },
        { header: 'Status', key: 'status' },
        { header: 'Agreed price', key: 'agreedPrice' },
        { header: 'Currency', key: 'currency' },
        { header: 'Telegram message ID', key: 'telegramMessageId' },
        { header: 'Published at', key: 'publishedAt', width: 22 },
        { header: 'Views final', key: 'actualViewsFinal' },
        { header: 'Reactions final', key: 'actualReactionsFinal' },
        { header: 'Managed post status', key: 'managedPostStatus' },
      ],
      adSales.flatMap((sale: any) => sale.placements.map((placement: any) => ({
        ...placement,
        dealTitle: sale.title || sale.advertiserName,
        clientName: sale.advertiser?.displayName || sale.advertiserName,
        telegramMessageId: placement.telegramPost?.telegramMessageId,
        managedPostStatus: placement.managedPost?.status,
      }))),
    );
    this.sheets.addTableSheet(
      workbook,
      'CRM Payments',
      [
        { header: 'Deal', key: 'dealTitle', width: 32 },
        { header: 'Client', key: 'clientName', width: 28 },
        { header: 'Paid at', key: 'paidAt', width: 22 },
        { header: 'Status', key: 'status' },
        { header: 'Amount', key: 'amount' },
        { header: 'Currency', key: 'currency' },
        { header: 'Allocated to channel', key: 'channelAllocation' },
        { header: 'Account', key: 'accountName' },
        { header: 'Transaction ID', key: 'transactionId', width: 30 },
        { header: 'Notes', key: 'notes', width: 60 },
      ],
      adSales.flatMap((sale: any) => sale.payments.map((payment: any) => ({
        ...payment,
        dealTitle: sale.title || sale.advertiserName,
        clientName: sale.advertiser?.displayName || sale.advertiserName,
        channelAllocation: payment.allocations.reduce(
          (total: number, allocation: any) => total + Number(allocation.amount || 0),
          0,
        ),
        accountName: payment.account?.name,
        transactionId: payment.transaction?.id,
      }))),
    );
    this.sheets.addTableSheet(
      workbook,
      'Data Sources',
      [
        { header: 'Type', key: 'dataType' },
        { header: 'Source type', key: 'sourceType' },
        { header: 'Source display name', key: 'sourceDisplayName', width: 30 },
        { header: 'Status', key: 'status' },
        { header: 'Last synced at', key: 'lastSyncedAt', width: 22 },
        { header: 'Error', key: 'errorMessage', width: 50 },
        { header: 'Metadata JSON', key: 'metadata', width: 70 },
      ],
      channel.dataSources,
    );
    this.sheets.addTableSheet(
      workbook,
      'Source Access',
      [
        { header: 'Source type', key: 'sourceType' },
        { header: 'Source display name', key: 'sourceDisplayName', width: 30 },
        { header: 'Role', key: 'role' },
        { header: 'Can view stats', key: 'canViewStats' },
        { header: 'Can view members', key: 'canViewMembers' },
        { header: 'Can view invite links', key: 'canViewInviteLinks' },
        { header: 'Can post messages', key: 'canPostMessages' },
        { header: 'Last checked at', key: 'lastCheckedAt', width: 22 },
      ],
      channel.sourceAccesses,
    );
    this.sheets.addTableSheet(
      workbook,
      'Admin Links',
      [
        { header: 'Source', key: 'source' },
        { header: 'Account label', key: 'accountLabel', width: 24 },
        { header: 'Username', key: 'username' },
        { header: 'First name', key: 'firstName' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      channel.adminLinks.map((link: any) => ({
        ...link,
        accountLabel: link.telegramUserAccountIntegration?.label,
        username: link.telegramUserAccountIntegration?.username,
        firstName: link.telegramUserAccountIntegration?.firstName,
      })),
    );
    const sheetsBySection: Record<TelegramChannelExportSection, string[]> = {
      channel_profile: ['Overview', 'Channel Settings', 'Data Sources', 'Source Access', 'Admin Links'],
      ads: ['Creatives', 'Campaigns', 'Mutual Promotions'],
      crm: ['CRM Clients', 'CRM Deals', 'CRM Placement Posts', 'CRM Payments'],
      finance: ['Finance Transactions'],
      channel_stats: ['Calculated Metrics', 'Posts', 'Post Metric Snapshots'],
      channel_dynamics: ['Daily Stats', 'Stats Points', 'Stats Snapshots', 'Audience Snapshots'],
      traffic_attribution: ['Invite Links', 'Invite Link History'],
    };
    for (const section of TELEGRAM_CHANNEL_EXPORT_SECTIONS) {
      if (selectedSections.has(section)) continue;
      for (const name of sheetsBySection[section]) {
        const worksheet = workbook.getWorksheet(name);
        if (worksheet) workbook.removeWorksheet(worksheet.id);
      }
    }
    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer)
      ? rawBuffer
      : Buffer.from(rawBuffer);
    const filename = `${this.sheets.safeFileName(channel.username || channel.title)}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer, filename };
  }
}
