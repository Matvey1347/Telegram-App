import { selectManagedPostPublishingSource } from './managed-post-publishing-source';
import { telegramAccountCredentials, type EncryptedTelegramAccountCredentials } from '@api/telegram/shared/mtproto/telegram-account-credentials';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramChannelSourceRole,
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import type { TelegramChannelSystemBotConnection } from '@telegram-system/shared';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import {
  isProductionEnvironment,
  telegramBotRuntimeEnvironmentName,
} from '../../../config/deployment-config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '@api/telegram/shared/bot/telegram-bot-api.client';
import { type ResolvedTelegramEntity } from '@api/telegram/shared/imports/telegram-import.helpers';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { buildStableTelegramPostUrl } from '@api/telegram/shared/imports/telegram-post-url';
import {
  TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
  TELEGRAM_SYSTEM_BOT_SOURCE_ID,
  TelegramSourceAccessService,
} from '@api/telegram/shared/imports/telegram-source-access.service';
import { TelegramSystemBotConfigService } from '../telegram-system-bot/telegram-system-bot-config.service';
import { TELEGRAM_ACCOUNT_CAPABILITY_CONFIG } from '../telegram-user-accounts/telegram-capability.config';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { ManagedPostSyncMessage } from './telegram-channels.internal';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';

@Injectable()
export class TelegramChannelAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly identityService: TelegramManagedPostIdentityService,
    private readonly botApiClient: TelegramBotApiClient,
    private readonly systemBotConfig: TelegramSystemBotConfigService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
  ) {}

  async checkInlineButtonPublishingAccess(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true, username: true, telegramChatId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    await this.refreshSystemBotPublishingAccess(workspaceId, channel);
    return this.sourceAccessService.publishingCapabilitiesForChannel(
      workspaceId,
      channelId,
    );
  }

  async checkProductionSystemBotPublishingAccess(
    userId: string,
    channelId: string,
  ): Promise<TelegramChannelSystemBotConnection> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true, username: true, telegramChatId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const token = this.systemBotConfig.productionToken;
    if (!token) {
      return this.systemBotConnectionResult({ status: 'NOT_CONFIGURED' });
    }

    const bot = await this.botApiClient.getMe(token);
    const botUsername = bot.username || this.systemBotConfig.productionUsername;
    const chatId = this.botChatId(channel);
    if (!chatId) {
      await this.recordMissingProductionSystemBotAccess(
        workspaceId,
        channel.id,
        {
          status: 'channel_reference_missing',
        },
      );
      return this.systemBotConnectionResult({
        status: 'NOT_CONNECTED',
        botUsername,
        checked: true,
      });
    }

    let member: Record<string, unknown>;
    try {
      member = await this.botApiClient.getChatMember(
        token,
        chatId,
        String(bot.id),
      );
    } catch (error) {
      if (
        !(error instanceof TelegramBotApiError) ||
        error.kind === 'TRANSIENT'
      ) {
        throw error;
      }
      await this.recordMissingProductionSystemBotAccess(
        workspaceId,
        channel.id,
        {
          status: 'not_connected',
        },
      );
      return this.systemBotConnectionResult({
        status: 'NOT_CONNECTED',
        botUsername,
        checked: true,
      });
    }

    const normalized = this.sourceAccessService.normalizeBotPermissions(member);
    await this.sourceAccessService.upsertAccess({
      workspaceId,
      channelId: channel.id,
      sourceId: TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
      sourceType: TelegramSourceType.BOT,
      role: normalized.role,
      permissions: normalized.permissions,
      rawPermissions: member,
    });
    return this.systemBotConnectionResult({
      status: normalized.permissions.canPostMessages
        ? 'CONNECTED'
        : 'MISSING_POST_PERMISSION',
      botUsername,
      checked: true,
    });
  }

  private recordMissingProductionSystemBotAccess(
    workspaceId: string,
    channelId: string,
    rawPermissions: Record<string, unknown>,
  ) {
    return this.sourceAccessService.upsertAccess({
      workspaceId,
      channelId,
      sourceId: TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
      sourceType: TelegramSourceType.BOT,
      role: TelegramChannelSourceRole.UNKNOWN,
      permissions: this.sourceAccessService.emptyPermissions(),
      rawPermissions,
    });
  }

  private systemBotConnectionResult({
    status,
    botUsername = null,
    checked = false,
  }: {
    status: TelegramChannelSystemBotConnection['status'];
    botUsername?: string | null;
    checked?: boolean;
  }): TelegramChannelSystemBotConnection {
    return {
      connected: status === 'CONNECTED',
      status,
      botUsername: botUsername?.replace(/^@/, '') || null,
      lastCheckedAt: checked ? new Date().toISOString() : null,
      requiredPermission: 'POST_MESSAGES',
    };
  }

  async checkProductionBotPublishingAccess(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true, title: true, username: true, telegramChatId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    await this.refreshProductionBotPublishingAccess(workspaceId, channel);
  }

  public refreshProductionBotPublishingAccess(
    workspaceId: string,
    channel: {
      id: string;
      title?: string | null;
      username: string | null;
      telegramChatId: string | null;
    },
  ) {
    return this.refreshBotPublishingAccess(
      workspaceId,
      channel,
      this.systemBotConfig.productionToken,
      TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
      'production bot',
    );
  }

  public async refreshSystemBotPublishingAccess(
    workspaceId: string,
    channel: {
      id: string;
      purchaseTransactionId?: string | null;
      username: string | null;
      telegramChatId: string | null;
    },
  ) {
    return this.refreshBotPublishingAccess(
      workspaceId,
      channel,
      this.systemBotConfig.token,
      TELEGRAM_SYSTEM_BOT_SOURCE_ID,
      'system bot',
    );
  }

  private async refreshBotPublishingAccess(
    workspaceId: string,
    channel: {
      id: string;
      title?: string | null;
      username: string | null;
      telegramChatId: string | null;
    },
    token: string | null,
    sourceId: string,
    botLabel: string,
  ) {
    const channelLabel =
      channel.title?.trim() || channel.username || channel.id;
    if (!token) throw new BadRequestException(`${botLabel} is not configured`);
    const bot = await this.botApiClient.getMe(token);
    if (!bot.id) throw new BadRequestException('System bot is unavailable');
    const chatId = this.botChatId(channel);
    if (!chatId)
      throw new BadRequestException('Channel has no Telegram chat id');
    let member: Record<string, unknown>;
    try {
      member = await this.botApiClient.getChatMember(
        token,
        chatId,
        String(bot.id),
      );
    } catch (error) {
      if (error instanceof TelegramBotApiError) {
        throw new BadRequestException(
          `The ${botLabel} is not an administrator of channel “${channelLabel}”. Add it in Telegram and grant permission to post messages, then check again.`,
        );
      }
      throw error;
    }
    const normalized = this.sourceAccessService.normalizeBotPermissions(member);
    if (!normalized.permissions.canPostMessages) {
      throw new BadRequestException(
        `The ${botLabel} cannot post messages in channel “${channelLabel}”. Grant it permission to post messages in Telegram, then check again.`,
      );
    }
    await this.sourceAccessService.upsertAccess({
      workspaceId,
      channelId: channel.id,
      sourceId,
      sourceType: TelegramSourceType.BOT,
      role: normalized.role,
      permissions: normalized.permissions,
      rawPermissions: member,
    });
  }

  public async botTokenForSource(workspaceId: string, sourceId: string) {
    if (sourceId === TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID) {
      if (!this.isProductionDeliveryRuntime()) {
        throw new BadRequestException(
          'Production bot delivery is available only in the production runtime',
        );
      }
      const token = this.systemBotConfig.productionToken;
      if (!token)
        throw new BadRequestException('Production bot is not configured');
      return token;
    }
    if (sourceId === TELEGRAM_SYSTEM_BOT_SOURCE_ID) {
      const token = this.systemBotConfig?.token;
      if (!token) throw new BadRequestException('System bot is not configured');
      return token;
    }
    const environment =
      telegramBotRuntimeEnvironmentName() === 'LOCAL'
        ? 'LOCAL'
        : telegramBotRuntimeEnvironmentName() === 'PRODUCTION' ||
            isProductionEnvironment()
          ? 'PRODUCTION'
          : null;
    const bot = environment
      ? await this.prisma.telegramBotRuntimeInstance.findFirst({
          where: {
            botIntegrationId: sourceId,
            workspaceId,
            environment,
            runtimeStatus: 'ACTIVE',
            botIntegration: { isActive: true },
          },
        })
      : null;
    if (!bot) throw new BadRequestException('Telegram bot is not connected');
    return this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
  }

  /** Durable scheduled delivery belongs only to the always-on production API. */
  public isProductionDeliveryRuntime() {
    const runtime = telegramBotRuntimeEnvironmentName();
    return runtime ? runtime === 'PRODUCTION' : isProductionEnvironment();
  }

  public channelRef(channel: {
    username: string | null;
    telegramChatId: string | null;
  }) {
    if (channel.telegramChatId) return channel.telegramChatId;
    if (channel.username) {
      return channel.username.startsWith('@')
        ? channel.username
        : `@${channel.username}`;
    }
    return null;
  }

  public mtprotoChannelReference(channel: {
    username: string | null;
    telegramChatId: string | null;
    inviteLink?: string | null;
    telegramAccessHash?: string | null;
  }) {
    return {
      username: channel.username,
      telegramChatId: channel.telegramChatId,
      inviteLink: channel.inviteLink || null,
      telegramAccessHash: channel.telegramAccessHash || null,
    };
  }

  public fallbackAccessMode(channel: {
    username?: string | null;
    inviteLink?: string | null;
    requiresJoinRequest?: boolean | null;
  }):
    | 'PUBLIC'
    | 'PRIVATE'
    | 'PRIVATE_INVITE'
    | 'PRIVATE_JOIN_REQUEST'
    | 'UNKNOWN' {
    if (channel.username) return 'PUBLIC';
    if (channel.requiresJoinRequest) return 'PRIVATE_JOIN_REQUEST';
    if (channel.inviteLink) return 'PRIVATE_INVITE';
    return 'UNKNOWN';
  }

  public channelIdentityPatch(info: ResolvedTelegramEntity) {
    return {
      title: info.title,
      username: this.telegramChannelsSupportService.normalizeUsername(
        info.username,
      ),
      telegramChatId: info.telegramChatId || null,
      inviteLink: info.inviteLink || undefined,
      description: info.description,
      currentSubscribersCount: info.participantsCount,
      ...(info.pendingJoinRequestsCount == null
        ? {}
        : { pendingJoinRequestsCount: info.pendingJoinRequestsCount }),
      photoUrl: info.photoUrl,
      accessMode:
        info.accessMode ||
        this.fallbackAccessMode({
          username: info.username,
          inviteLink: info.inviteLink,
          requiresJoinRequest: info.requiresJoinRequest,
        }),
      requiresJoinRequest: Boolean(info.requiresJoinRequest),
      telegramAccessHash: info.telegramAccessHash || null,
      lastEntityResolvedAt: new Date(),
    };
  }

  public async persistResolvedChannelIdentity(
    workspaceId: string,
    channelId: string,

    info?: ResolvedTelegramEntity | null,
    expectedChatId?: string | null,
  ) {
    if (!info?.telegramChatId) return null;
    if (expectedChatId &&
      this.telegramChannelsSupportService.normalizeChatId(info.telegramChatId) !==
      this.telegramChannelsSupportService.normalizeChatId(expectedChatId))
      throw new BadRequestException('Resolved Telegram channel ID differs from the stored channel');

    return this.prisma.telegramChannel.update({
      where: { id: channelId, workspaceId, telegramChatId: expectedChatId },
      data: { ...this.channelIdentityPatch(info), ...(expectedChatId ? { telegramChatId: expectedChatId } : {}) },
    });
  }

  public telegramMessageUrl(
    channel: { telegramChatId: string | null },
    messageId: string,
  ) {
    return buildStableTelegramPostUrl({
      telegramChatId: channel.telegramChatId,
      messageId,
    });
  }

  public botChatId(channel: {
    username: string | null;
    telegramChatId: string | null;
  }) {
    const chatId = this.telegramChannelsSupportService.normalizeChatId(
      channel.telegramChatId,
    );
    if (chatId) return `-100${chatId}`;
    const username = this.telegramChannelsSupportService.normalizeUsername(
      channel.username,
    );
    return username ? `@${username}` : null;
  }

  public primaryTelegramMessageId(params: {
    messageIds: string[];
    imageCount?: number | null;
  }) {
    const { messageIds, imageCount } = params;
    if (!messageIds.length) return null;
    if ((imageCount ?? 0) > 1) {
      return messageIds[Math.min((imageCount ?? 1) - 1, messageIds.length - 1)];
    }
    return messageIds[0];
  }

  public telegramMessageUrlsForPost(
    channel: { username: string | null; telegramChatId: string | null },
    messageIds: string[],
    imageCount = 0,
  ) {
    const urls = messageIds.flatMap((id) => {
      const url = this.telegramMessageUrl(channel, id);
      return url ? [url] : [];
    });
    const primaryId = this.primaryTelegramMessageId({ messageIds, imageCount });
    const primaryUrl = primaryId
      ? this.telegramMessageUrl(channel, primaryId)
      : null;
    if (!primaryUrl) return urls;
    return [primaryUrl, ...urls.filter((url) => url !== primaryUrl)];
  }

  public normalizedPlainText(value: string) {
    return this.identityService.normalizedPlainText(value);
  }

  public findMatchingRecentPublishedMessage(
    post: {
      title: string;
      text: string | null;
      publishMode: string | null;
    },
    recentPublished: ManagedPostSyncMessage[],
  ) {
    return this.identityService.findLegacyPublishedIdentity(
      post,
      recentPublished,
    );
  }

  public appendFollowupTextMessageForImagesThenText(
    publishMode: string | null,
    messages: ManagedPostSyncMessage[],
    recentPublished: ManagedPostSyncMessage[],
  ) {
    if (
      publishMode !== 'IMAGES_THEN_TEXT' ||
      messages.length !== 1 ||
      !messages[0]?.hasMedia
    ) {
      return messages;
    }
    const mediaMessage = messages[0];
    const followup = recentPublished
      .filter(
        (candidate) =>
          !candidate.hasMedia &&
          candidate.date === mediaMessage.date &&
          Number(candidate.id) > Number(mediaMessage.id),
      )
      .sort((left, right) => Number(left.id) - Number(right.id))[0];
    return followup ? [mediaMessage, followup] : messages;
  }

  public async connectedAccount(
    workspaceId: string,
    channelId: string,
    requestedAccountId?: string,
  ) {
    const accountId = requestedAccountId ?? await this.bestMtprotoAccountId(
      workspaceId, channelId, TelegramChannelDataType.POSTS,
    );
    if (!accountId) {
      throw new BadRequestException(
        'No connected Telegram user account selected for MTProto sync',
      );
    }
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account || account.status !== TelegramUserAccountStatus.connected) {
      throw new BadRequestException('Telegram user account is not connected');
    }
    return account;
  }

  public async connectedRecoveryAccount(
    workspaceId: string,
    channelId: string,
  ) {
    const sources = await this.sourceAccessService.sourcesForChannel(
      workspaceId,
      channelId,
    );
    const source = selectManagedPostPublishingSource(sources, {
      requiresBotApi: false,
    });
    if (source?.sourceType !== TelegramSourceType.MTPROTO)
      throw new BadRequestException('No MTProto recovery source is available');
    return this.connectedAccount(workspaceId, channelId, source.sourceId);
  }

  public sourceDisplayName(account: {
    label: string;
    username: string | null;
    firstName: string | null;
    phoneMasked?: string | null;
  }) {
    return account.username
      ? `@${account.username}`
      : account.firstName ||
          account.label ||
          account.phoneMasked ||
          'MTProto account';
  }

  public capabilityTtlMs() {
    return TELEGRAM_ACCOUNT_CAPABILITY_CONFIG.ttlHours * 60 * 60 * 1000;
  }

  public isCapabilityStale(value?: Date | null) {
    if (!value) return true;
    return Date.now() - value.getTime() > this.capabilityTtlMs();
  }

  public async bestMtprotoAccountId(
    workspaceId: string,
    channelId: string,
    dataType: TelegramChannelDataType,
  ) {
    const best = await this.sourceAccessService.bestMtprotoSource(
      workspaceId,
      channelId,
      dataType,
    );
    return best?.sourceId;
  }

  async verifiedSyncAccount(
    workspaceId: string,
    channel: { id: string; telegramChatId: string | null; username: string | null },
    dataType: TelegramChannelDataType,
    requestedAccountId?: string,
    accessReads = new Map<string, Promise<ResolvedTelegramEntity>>(),
  ) {
    const sources = (await this.sourceAccessService.sourcesForChannel(workspaceId, channel.id))
      .filter((source) => source.sourceType === TelegramSourceType.MTPROTO);
    const permission = dataType === TelegramChannelDataType.INVITE_LINKS ? 'canManageInviteLinks' :
      dataType === TelegramChannelDataType.STATS ? 'canViewStats' : undefined;
    const score = (source: (typeof sources)[number]) =>
      this.sourceAccessService.scoreSource(source, dataType) +
      (permission && source.permissions[permission] ? 200 : 0);
    const candidates = requestedAccountId ? [requestedAccountId] :
      sources.sort((a, b) => score(b) - score(a)).slice(0, 3).map((source) => source.sourceId);
    for (const id of candidates) {
      try {
        const account = await this.connectedAccount(workspaceId, channel.id, id);
        let observed = accessReads.get(id);
        const needsAccessWrite = !observed;
        if (!observed) {
          observed = this.mtprotoClient.getPublicChannelInfo({
            ...this.accountCredentials(account), channel: this.mtprotoChannelReference(channel),
            accessOnly: true,
          });
          accessReads.set(id, observed);
        }
        const info = await observed;
        if (info.kind !== 'channel' || (channel.telegramChatId &&
          this.telegramChannelsSupportService.normalizeChatId(info.telegramChatId) !==
          this.telegramChannelsSupportService.normalizeChatId(channel.telegramChatId))) continue;
        const rawPermissions = { isCreator: Boolean(info.isCreator), adminRights: info.adminRights ?? null, canViewStats: info.canViewStats ?? null };
        const access = this.sourceAccessService.normalizeMtprotoPermissions(rawPermissions);
        const prior = sources.find((source) => source.sourceId === id);
        if (needsAccessWrite && (prior?.role !== access.role ||
          Object.entries(access.permissions).some(([key, value]) => prior.permissions[key] !== value))) {
          await this.sourceAccessService.upsertAccess({
            workspaceId, channelId: channel.id, sourceId: id, sourceType: TelegramSourceType.MTPROTO,
            ...access, rawPermissions,
          });
        }
        if (dataType === TelegramChannelDataType.INVITE_LINKS && !access.permissions.canManageInviteLinks) continue;
        if (dataType === TelegramChannelDataType.STATS && info.canViewStats !== true) continue;
        return account;
      } catch {
        // A failed lookup does not prove access was revoked.
      }
    }
    throw new BadRequestException(`No connected Telegram account verified for ${dataType}`);
  }

  public accountCredentials(account: EncryptedTelegramAccountCredentials) {
    return telegramAccountCredentials(this.encryptionService, account);
  }

  public async refreshMtprotoAccountCapabilities(account: {
    id: string;
    label: string;
    apiId: string;
    apiHashEncrypted: string;
    apiHashIv: string;
    apiHashAuthTag: string;
    sessionEncrypted: string | null;
    sessionIv: string | null;
    sessionAuthTag: string | null;
  }) {
    const profile = await this.mtprotoClient.getAccountProfile(
      this.accountCredentials(account),
    );
    return this.prisma.telegramUserAccountIntegration.update({
      where: { id: account.id },
      data: {
        telegramUserId: profile.id,
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        photoUrl: profile.photoUrl ?? null,
        nameColor: profile.nameColor ?? null,
        label:
          (profile.username &&
            `@${String(profile.username).replace('@', '')}`) ||
          profile.firstName ||
          account.label,
        isPremium: profile.capabilities.isPremium,
        premiumCheckedAt: new Date(profile.capabilities.checkedAt),
        captionLengthMax: profile.capabilities.captionLengthMax,
        messageLengthMax: profile.capabilities.messageLengthMax,
        premiumCapabilities: {
          maxUploadFileSizeMb: profile.capabilities.maxUploadFileSizeMb,
          supportsCustomEmoji: profile.capabilities.supportsCustomEmoji,
          limitsSource: profile.capabilities.limitsSource,
        },
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
      },
    });
  }
}
