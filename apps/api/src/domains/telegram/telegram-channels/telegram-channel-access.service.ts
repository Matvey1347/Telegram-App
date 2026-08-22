import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import {
  isProductionEnvironment,
  telegramBotRuntimeEnvironmentName,
} from '../../../config/deployment-config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '../../../telegram/shared/telegram-bot-api.client';
import { type ResolvedTelegramEntity } from '../../../telegram/shared/telegram-import.helpers';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { buildStableTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import {
  TELEGRAM_SYSTEM_BOT_SOURCE_ID,
  TelegramSourceAccessService,
} from '../../../telegram/shared/telegram-source-access.service';
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

  public async refreshSystemBotPublishingAccess(
    workspaceId: string,
    channel: {
      id: string;
      purchaseTransactionId?: string | null;
      username: string | null;
      telegramChatId: string | null;
    },
  ) {
    const token = this.systemBotConfig?.token;
    if (!token) throw new BadRequestException('System bot is not configured');
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
          'The system bot is not an administrator of this channel yet. Add it in Telegram and grant permission to post messages, then check again.',
        );
      }
      throw error;
    }
    const normalized = this.sourceAccessService.normalizeBotPermissions(member);
    if (!normalized.permissions.canPostMessages) {
      throw new BadRequestException(
        'The system bot is an administrator but cannot post messages. Grant it permission to post messages in Telegram, then check again.',
      );
    }
    await this.sourceAccessService.upsertAccess({
      workspaceId,
      channelId: channel.id,
      sourceId: TELEGRAM_SYSTEM_BOT_SOURCE_ID,
      sourceType: TelegramSourceType.BOT,
      role: normalized.role,
      permissions: normalized.permissions,
      rawPermissions: member,
    });
  }

  public async botTokenForSource(workspaceId: string, sourceId: string) {
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
  ) {
    if (!info || !info.telegramChatId) return null;
    return this.prisma.telegramChannel.update({
      where: { id: channelId, workspaceId },
      data: this.channelIdentityPatch(info),
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
    const username = this.telegramChannelsSupportService.normalizeUsername(
      channel.username,
    );
    if (username) return `@${username}`;
    const chatId = this.telegramChannelsSupportService.normalizeChatId(
      channel.telegramChatId,
    );
    return chatId ? `-100${chatId}` : null;
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
    const linkedAdmin = requestedAccountId
      ? null
      : await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: { createdAt: 'asc' },
        });
    const accountId =
      requestedAccountId || linkedAdmin?.telegramUserAccountIntegrationId;
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

  public accountCredentials(account: {
    apiId: string;
    apiHashEncrypted: string;
    apiHashIv: string;
    apiHashAuthTag: string;
    sessionEncrypted: string | null;
    sessionIv: string | null;
    sessionAuthTag: string | null;
  }) {
    return {
      apiId: account.apiId,
      apiHash: this.encryptionService.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      }),
      session: this.encryptionService.decrypt({
        encrypted: account.sessionEncrypted || '',
        iv: account.sessionIv || '',
        authTag: account.sessionAuthTag || '',
      }),
    };
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
