import { Injectable, Logger } from '@nestjs/common';
import { TelegramChannelSourceRole, TelegramSourceType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import {
  TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
  TELEGRAM_SYSTEM_BOT_SOURCE_ID,
  TelegramSourceAccessService,
  type TelegramSourcePermissions,
} from '../../../telegram/shared/telegram-source-access.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { compactSystemBotInlineKeyboard } from './telegram-system-bot-inline-keyboard';
import { formatSystemBotDate } from './telegram-system-bot-menu';

type MembershipUpdate = {
  chat?: {
    id?: number | string;
    type?: string;
    title?: string;
    username?: string;
  };
  old_chat_member?: {
    status?: string;
    user?: { id?: number | string };
    [key: string]: unknown;
  };
  new_chat_member?: {
    status?: string;
    user?: { id?: number | string };
    [key: string]: unknown;
  };
};

@Injectable()
export class TelegramSystemBotChannelAccessService {
  private readonly logger = new Logger(
    TelegramSystemBotChannelAccessService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: TelegramBotApiClient,
    private readonly config: TelegramSystemBotConfigService,
    private readonly sourceAccess: TelegramSourceAccessService,
  ) {}

  async list(chatId: string, workspaceId: string) {
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        adminLinks: { some: {} },
      },
      orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        username: true,
        photoUrl: true,
        isActive: true,
        currentSubscribersCount: true,
      },
    });
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: channels.length
        ? `📢 Own channels: ${channels.length}\nChoose a channel for details.`
        : '📢 No own channels in this workspace.',
      reply_markup: {
        inline_keyboard: compactSystemBotInlineKeyboard(
          channels.map((channel) => ({
            text: `${channel.isActive ? '🟢' : '⚪'} ${channel.title}`,
            callback_data: `channel:view:${channel.id}`,
          })),
          { columns: 2, limit: 100 },
        ),
      },
    });
  }

  async detail(
    chatId: string,
    workspaceId: string,
    channelId: string,
    timezone: string,
  ) {
    const channel = await this.requireChannel(workspaceId, channelId);
    const text = [
      `📢 ${channel.title}`,
      channel.username ? `@${channel.username.replace(/^@/, '')}` : null,
      channel.telegramChatId ? `ID: ${channel.telegramChatId}` : null,
      `Status: ${channel.isActive ? 'active' : 'inactive'}`,
      `Access: ${channel.accessMode}`,
      channel.currentSubscribersCount != null
        ? `👥 ${channel.currentSubscribersCount.toLocaleString()} subscribers`
        : null,
      `🕒 Last sync: ${formatSystemBotDate(channel.lastPublicSyncedAt, timezone)}`,
    ]
      .filter(Boolean)
      .join('\n');
    const payload = {
      chat_id: chatId,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🤖 Check bot access',
              callback_data: `channel:access:${channel.id}`,
            },
            {
              text: '🔄 Sync',
              callback_data: `channel:sync:${channel.id}`,
            },
          ],
        ],
      },
    };
    return channel.photoUrl
      ? this.api.sendPhoto(this.config.token!, {
          ...payload,
          photo: channel.photoUrl,
          caption: text,
        })
      : this.api.sendMessage(this.config.token!, { ...payload, text });
  }

  async auditAndSend(chatId: string, workspaceId: string, channelId: string) {
    const channel = await this.requireChannel(workspaceId, channelId);
    const chatReference = this.chatReference(channel);
    const results = await Promise.all(
      this.config.auditCredentials().map(async (credential) => {
        if (!credential.token)
          return {
            environment: credential.environment,
            error: 'not configured',
          };
        try {
          const bot = await this.api.getMe(credential.token);
          const raw = await this.api.getChatMember(
            credential.token,
            chatReference,
            String(bot.id),
          );
          const access = this.sourceAccess.normalizeBotPermissions(raw);
          if (credential.selected) {
            await this.persistAccess(channel, access, raw);
          }
          return {
            environment: credential.environment,
            username: bot.username || credential.username,
            ...access,
          };
        } catch (error) {
          return {
            environment: credential.environment,
            error: sanitizeOperationalError(error, 'access check failed'),
          };
        }
      }),
    );
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: [
        `🤖 Bot access: ${channel.title}`,
        ...results.map((result) => {
          if ('error' in result)
            return `${result.environment}: ⚠️ ${result.error}`;
          return `${result.environment}${result.username ? ` (@${result.username})` : ''}: ${result.role}\n${this.permissionText(result.permissions)}`;
        }),
      ].join('\n\n'),
    });
  }

  async handleMyChatMember(update: MembershipUpdate) {
    const token = this.config.token;
    if (!token || update.chat?.type !== 'channel' || !update.chat.id) return;
    const bot = await this.api.getMe(token);
    if (String(update.new_chat_member?.user?.id) !== String(bot.id)) return;
    const oldAccess = this.sourceAccess.normalizeBotPermissions(
      update.old_chat_member,
    );
    const newAccess = this.sourceAccess.normalizeBotPermissions(
      update.new_chat_member,
    );
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        archivedAt: null,
        OR: [
          { telegramChatId: String(update.chat.id) },
          ...(update.chat.username
            ? [{ username: update.chat.username.replace(/^@/, '') }]
            : []),
        ],
      },
      select: { id: true, workspaceId: true, title: true },
    });
    for (const channel of channels) {
      await this.persistAccess(
        channel,
        newAccess,
        update.new_chat_member || {},
      );
    }
    const newlyAdmin =
      this.isAdmin(newAccess.role) && !this.isAdmin(oldAccess.role);
    if (!newlyAdmin || channels.length === 0) return;
    for (const channel of channels) {
      await this.notifyWorkspace(channel, newAccess.permissions);
    }
  }

  private async requireChannel(workspaceId: string, channelId: string) {
    return this.prisma.telegramChannel.findFirstOrThrow({
      where: { id: channelId, workspaceId, archivedAt: null },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        username: true,
        telegramChatId: true,
        accessMode: true,
        photoUrl: true,
        isActive: true,
        currentSubscribersCount: true,
        lastPublicSyncedAt: true,
      },
    });
  }

  private chatReference(channel: {
    telegramChatId: string | null;
    username: string | null;
  }) {
    if (channel.telegramChatId) return channel.telegramChatId;
    if (channel.username) return `@${channel.username.replace(/^@/, '')}`;
    throw new Error('Channel has no Telegram identifier');
  }

  private persistAccess(
    channel: { id: string; workspaceId: string },
    access: {
      role: TelegramChannelSourceRole;
      permissions: TelegramSourcePermissions;
    },
    raw: Record<string, unknown>,
  ) {
    return this.sourceAccess.upsertAccess({
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      sourceId:
        this.config.environment === 'PRODUCTION'
          ? TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID
          : TELEGRAM_SYSTEM_BOT_SOURCE_ID,
      sourceType: TelegramSourceType.BOT,
      role: access.role,
      permissions: access.permissions,
      rawPermissions: raw,
    });
  }

  private isAdmin(role: TelegramChannelSourceRole) {
    return (
      role === TelegramChannelSourceRole.ADMIN ||
      role === TelegramChannelSourceRole.OWNER
    );
  }

  private permissionText(permissions: TelegramSourcePermissions) {
    const values = [
      ['post', permissions.canPostMessages],
      ['edit', permissions.canEditMessages],
      ['delete', permissions.canDeleteMessages],
      ['invite', permissions.canInviteUsers],
      ['invite links', permissions.canManageInviteLinks],
    ];
    return values
      .map(([name, allowed]) => `${allowed ? '✅' : '❌'} ${name}`)
      .join(' · ');
  }

  private async notifyWorkspace(
    channel: { workspaceId: string; title: string },
    permissions: TelegramSourcePermissions,
  ) {
    const connections = await this.prisma.telegramSystemBotConnection.findMany({
      where: {
        enabled: true,
        disconnectedAt: null,
        user: { memberships: { some: { workspaceId: channel.workspaceId } } },
      },
      select: { telegramChatId: true },
    });
    await Promise.all(
      connections.map((connection) =>
        this.api
          .sendMessage(this.config.token!, {
            chat_id: connection.telegramChatId,
            text: `✅ System Bot is now an administrator in ${channel.title}.\n${this.permissionText(permissions)}`,
          })
          .catch((error) =>
            this.logger.warn(
              `Could not notify a System Bot connection: ${sanitizeOperationalError(error)}`,
            ),
          ),
      ),
    );
  }
}
