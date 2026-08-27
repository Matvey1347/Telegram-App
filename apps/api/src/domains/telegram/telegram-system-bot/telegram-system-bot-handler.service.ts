import { Injectable, Logger, Optional } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { TelegramSystemBotConnectionsService } from './telegram-system-bot-connections.service';
import { TelegramSystemBotDomainGatewayService } from './telegram-system-bot-domain-gateway.service';
import { TelegramSystemBotFinanceHandlerService } from './telegram-system-bot-finance-handler.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import {
  renderSystemBotStats,
  systemBotEmoji,
} from './telegram-system-bot-presentation';
import { TelegramSystemBotPostFlowService } from './telegram-system-bot-post-flow.service';
import { TelegramSystemBotAdSaleFlowService } from './telegram-system-bot-ad-sale-flow.service';
import { TelegramSystemBotPostsService } from './telegram-system-bot-posts.service';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import {
  SYSTEM_BOT_HELP_TEXT,
  systemBotCommandFor,
  systemBotMenuPayload,
} from './telegram-system-bot-menu';
import { compactSystemBotInlineKeyboard } from './telegram-system-bot-inline-keyboard';
import { TelegramSystemBotChannelAccessService } from './telegram-system-bot-channel-access.service';
import { TelegramSystemBotWorkspaceFlowService } from './telegram-system-bot-workspace-flow.service';

export type TelegramSystemBotUpdate = {
  update_id?: number | string;
  message?: TelegramSystemBotIncomingMessage & {
    chat?: { id?: number | string; type?: string };
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number | string };
    message?: {
      chat?: { id?: number | string; type?: string };
      message_id?: number;
    };
  };
  my_chat_member?: {
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
};

@Injectable()
export class TelegramSystemBotHandlerService {
  private readonly logger = new Logger(TelegramSystemBotHandlerService.name);
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly connections: TelegramSystemBotConnectionsService,
    private readonly domain: TelegramSystemBotDomainGatewayService,
    private readonly finance: TelegramSystemBotFinanceHandlerService,
    @Optional()
    private readonly postFlow?: TelegramSystemBotPostFlowService,
    @Optional()
    private readonly adSaleFlow?: TelegramSystemBotAdSaleFlowService,
    @Optional()
    private readonly posts?: TelegramSystemBotPostsService,
    @Optional()
    private readonly channelAccess?: TelegramSystemBotChannelAccessService,
    @Optional()
    private readonly workspaceFlow?: TelegramSystemBotWorkspaceFlowService,
  ) {}

  async handle(update: TelegramSystemBotUpdate) {
    if (update.my_chat_member)
      return this.channelAccess?.handleMyChatMember(update.my_chat_member);
    const actor = update.message?.from ?? update.callback_query?.from;
    const chatId =
      update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (!actor?.id || !chatId || !this.config.token) return;
    const telegramUserId = String(actor.id);
    const safeChatId = String(chatId);
    const chatType =
      update.message?.chat?.type ?? update.callback_query?.message?.chat?.type;
    // Link tokens and workspace data must never be emitted into groups. Telegram
    // private bot chats are bound to the actor's own user id.
    if (chatType !== 'private' || safeChatId !== telegramUserId) return;
    const command = systemBotCommandFor(update.message?.text?.trim());
    const callback = update.callback_query?.data;
    if (update.callback_query?.id) {
      await this.api.answerCallbackQuery(this.config.token, {
        callback_query_id: update.callback_query.id,
      });
    }
    if (command?.startsWith('/start'))
      return this.start(telegramUserId, safeChatId, actor, command);
    try {
      try {
        await this.api.sendChatAction(this.config.token, safeChatId, 'typing');
      } catch {
        // Native feedback is best-effort and must not block the action.
      }
      const connection =
        await this.connections.requireEnabledConnection(telegramUserId);
      if (
        callback?.startsWith('workspace:') &&
        !['workspace:new', 'workspace:edit'].includes(callback)
      ) {
        await this.connections.switchWorkspace(
          connection.id,
          callback.slice('workspace:'.length),
        );
        return this.workspaceMenu(
          safeChatId,
          connection.id,
          update.callback_query?.message?.message_id,
        );
      }
      const workspace = await this.connections.requireCurrentWorkspace(
        connection.id,
      );
      const workflowScope = {
        chatId: safeChatId,
        connectionId: connection.id,
        userId: connection.userId,
        telegramUserId: connection.telegramUserId,
        workspaceId: workspace.workspaceId,
        timezone: workspace.workspace.timezone,
      };
      if (command === '/help') return this.help(safeChatId);
      if (command === '/workspace' || callback === 'workspace')
        return this.workspaceMenu(safeChatId, connection.id);
      if (callback === 'workspace:new')
        return this.workspaceFlow?.beginCreate(
          workflowScope,
          update.callback_query?.message?.message_id,
        );
      if (callback === 'workspace:edit')
        return this.workspaceFlow?.beginEdit(
          workflowScope,
          workspace.workspace.name,
          update.callback_query?.message?.message_id,
          workspace.workspace.avatarIcon?.type === 'image'
            ? workspace.workspace.avatarIcon.imageUrl
              ? `image:${workspace.workspace.avatarIcon.imageUrl}`
              : undefined
            : (workspace.workspace.avatarIcon?.emoji ?? undefined),
        );
      if (callback && this.workspaceFlow?.isCallback(callback)) {
        const result = await this.workspaceFlow.callback(
          workflowScope,
          callback,
        );
        if (this.workspaceFlow.isWorkspaceMenuNavigation(result))
          return this.workspaceMenu(
            safeChatId,
            connection.id,
            result.messageId,
          );
        return result;
      }
      if (command === '/sync' || callback === 'sync')
        return this.sync(safeChatId, connection.userId, workspace.workspaceId);
      if (callback?.startsWith('channel:sync:'))
        return this.syncChannel(
          safeChatId,
          connection.userId,
          workspace.workspaceId,
          connection.telegramUserId,
          callback.slice('channel:sync:'.length),
        );
      if (callback?.startsWith('channel:view:'))
        return this.channelAccess?.detail(
          safeChatId,
          workspace.workspaceId,
          callback.slice('channel:view:'.length),
          workspace.workspace.timezone,
        );
      if (callback?.startsWith('channel:access:'))
        return this.channelAccess?.auditAndSend(
          safeChatId,
          workspace.workspaceId,
          callback.slice('channel:access:'.length),
        );
      if (command === '/stats' || callback === 'stats')
        return this.stats(
          safeChatId,
          workspace.workspaceId,
          workspace.workspace.name,
        );
      if (command === '/finance' || callback === 'finance')
        return this.finance.menu(safeChatId);
      if (command === '/posts') return this.posts?.open(workflowScope);
      if (command === '/post' || callback === 'post')
        return this.postFlow?.begin(workflowScope);
      if (command === '/adsale' || callback === 'adsale')
        return this.adSaleFlow?.begin(workflowScope);
      if (callback && this.postFlow?.isCallback(callback))
        return this.postFlow.callback(workflowScope, callback);
      if (callback && this.adSaleFlow?.isCallback(callback))
        return this.adSaleFlow.callback(workflowScope, callback);
      if (callback === 'posts:new') return this.postFlow?.begin(workflowScope);
      if (callback && this.posts?.isCallback(callback))
        return this.posts.callback(
          workflowScope,
          callback,
          update.callback_query?.message?.message_id,
        );
      if (callback?.startsWith('finance:'))
        return this.finance.callback({
          chatId: safeChatId,
          connectionId: connection.id,
          userId: connection.userId,
          workspaceId: workspace.workspaceId,
          callback,
          messageId: update.callback_query?.message?.message_id,
        });
      if (command === '/channels' || callback === 'channels')
        return this.channelAccess?.list(safeChatId, workspace.workspaceId);
      if (update.message) {
        const workspaceResult = await this.workspaceFlow?.input(
          workflowScope,
          update.message,
        );
        if (workspaceResult) return workspaceResult;
        const postResult = await this.postFlow?.input(
          workflowScope,
          update.message,
        );
        if (postResult) return postResult;
        const adSaleResult = await this.adSaleFlow?.input(
          workflowScope,
          update.message,
        );
        if (adSaleResult) return adSaleResult;
      }
      if (update.message?.text) {
        const financeResult = await this.finance.pendingInput({
          chatId: safeChatId,
          connectionId: connection.id,
          userId: connection.userId,
          workspaceId: workspace.workspaceId,
          text: update.message.text,
          inputMessageId: update.message.message_id,
        });
        if (financeResult) return financeResult;
      }
      return this.menu(safeChatId, connection.id);
    } catch (error) {
      this.logger.warn(
        `System bot action denied or failed: ${sanitizeOperationalError(error)}`,
      );
      return this.api.sendMessage(this.config.token, {
        chat_id: safeChatId,
        text: '⚠️ This action is not available. Reconnect your account or select an accessible workspace.',
      });
    }
  }

  async sendTaskNotification(input: { chatId: string; text: string }) {
    if (!this.config.token) return { status: 'NOT_CONFIGURED' as const };
    await this.api.sendMessage(this.config.token, {
      chat_id: input.chatId,
      text: `🔔 ${input.text}`,
    });
    return { status: 'SENT' as const };
  }

  async completeConnection(input: {
    chatId: string;
    messageId: number | null;
    connectionId: string;
  }) {
    if (!this.config.token) return;
    if (input.messageId !== null) {
      try {
        await this.api.deleteMessage(this.config.token, {
          chat_id: input.chatId,
          message_id: input.messageId,
        });
      } catch (error) {
        this.logger.warn(
          `Could not remove the System Bot connection message: ${sanitizeOperationalError(error)}`,
        );
        try {
          await this.api.editMessageText(this.config.token, {
            chat_id: input.chatId,
            message_id: input.messageId,
            text: '✅ Telegram System is connected. Opening the menu below.',
            reply_markup: { inline_keyboard: [] },
          });
        } catch (editError) {
          this.logger.warn(
            `Could not close the System Bot connection message: ${sanitizeOperationalError(editError)}`,
          );
        }
      }
    }
    await this.menu(input.chatId, input.connectionId);
  }

  private async start(
    telegramUserId: string,
    chatId: string,
    actor: NonNullable<TelegramSystemBotUpdate['message']>['from'],
    command: string,
  ) {
    const connection = await this.connections
      .requireEnabledConnection(telegramUserId)
      .catch(() => null);
    if (connection) {
      if (command === '/start ad_sale' && this.adSaleFlow) {
        const workspace = await this.connections.requireCurrentWorkspace(
          connection.id,
        );
        return this.adSaleFlow.begin({
          chatId,
          connectionId: connection.id,
          userId: connection.userId,
          telegramUserId: connection.telegramUserId,
          workspaceId: workspace.workspaceId,
          timezone: workspace.workspace.timezone,
        });
      }
      if (command === '/start post' && this.postFlow) {
        const workspace = await this.connections.requireCurrentWorkspace(
          connection.id,
        );
        return this.postFlow.begin({
          chatId,
          connectionId: connection.id,
          userId: connection.userId,
          telegramUserId: connection.telegramUserId,
          workspaceId: workspace.workspaceId,
          timezone: workspace.workspace.timezone,
        });
      }
      const adSalePostMatch = /^\/start ad_post_([A-Za-z0-9_-]+)$/.exec(
        command,
      );
      if (adSalePostMatch && this.postFlow) {
        const workspace = await this.connections.requireCurrentWorkspace(
          connection.id,
        );
        return this.postFlow.resumeAdSaleImport(
          {
            chatId,
            connectionId: connection.id,
            userId: connection.userId,
            telegramUserId: connection.telegramUserId,
            workspaceId: workspace.workspaceId,
            timezone: workspace.workspace.timezone,
          },
          adSalePostMatch[1],
        );
      }
      const workspaces = await this.connections.workspacesForConnection(
        connection.id,
      );
      if (workspaces.length > 1) {
        return this.workspaceMenu(chatId, connection.id);
      }
      return this.menu(chatId, connection.id);
    }
    try {
      const link = await this.connections.createLink({
        telegramUserId,
        telegramChatId: chatId,
        username: actor?.username,
        firstName: actor?.first_name,
        lastName: actor?.last_name,
      });
      const message = await this.api.sendMessage(this.config.token!, {
        chat_id: chatId,
        text: '🔗 Connect Telegram System to continue. The secure link expires in 10 minutes.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Connect Telegram System', url: link.url }],
          ],
        },
      });
      await this.connections.storeLinkMessage(link.id, message.message_id);
      return message;
    } catch (error) {
      this.logger.warn(
        `System bot linking is unavailable: ${sanitizeOperationalError(error)}`,
      );
      return this.api.sendMessage(this.config.token!, {
        chat_id: chatId,
        text: '⚠️ Telegram System connection is not available right now.',
      });
    }
  }

  private async menu(chatId: string, connectionId: string) {
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      ...(await this.menuPayload(connectionId)),
    });
  }

  private async menuPayload(connectionId: string) {
    const workspace =
      await this.connections.requireCurrentWorkspace(connectionId);
    return systemBotMenuPayload(workspace.workspace);
  }

  private async help(chatId: string) {
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: SYSTEM_BOT_HELP_TEXT,
    });
  }

  private async workspaceMenu(
    chatId: string,
    connectionId: string,
    messageId?: number,
  ) {
    const workspaces =
      await this.connections.workspacesForConnection(connectionId);
    const payload = {
      chat_id: chatId,
      text: '🏢 Choose workspace:',
      reply_markup: {
        inline_keyboard: [
          ...compactSystemBotInlineKeyboard(
            workspaces.map((workspace) => {
              const customEmojiId =
                workspace.avatarPresentation?.type === 'unicode'
                  ? workspace.avatarPresentation.telegramCustomEmojiId
                  : null;
              return {
                text: `${customEmojiId ? '' : `${systemBotEmoji(workspace.avatarPresentation, '🏢')} `}${workspace.name}${workspace.selected ? ' ✓' : ''}`,
                callback_data: `workspace:${workspace.id}`,
                ...(customEmojiId
                  ? { icon_custom_emoji_id: customEmojiId }
                  : {}),
              };
            }),
          ),
          [
            { text: '➕ Add workspace', callback_data: 'workspace:new' },
            { text: '✏️ Edit current', callback_data: 'workspace:edit' },
          ],
        ],
      },
    };
    if (messageId)
      return this.api.editMessageText(this.config.token!, {
        ...payload,
        message_id: messageId,
      });
    return this.api.sendMessage(this.config.token!, payload);
  }

  private async sync(chatId: string, userId: string, workspaceId: string) {
    const result = await this.domain.syncAll(workspaceId, userId);
    const failures = result.failures
      .slice(0, 3)
      .map((failure) => `${failure.channelTitle}: ${failure.reason}`);
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: [
        '✅ Sync completed',
        `🏢 Workspace: ${result.workspaceName}`,
        `📢 Channels: ${result.total}`,
        `✅ Successful: ${result.successful}`,
        `❌ Failed: ${result.failed}`,
        result.skipped ? `⏭ Skipped: ${result.skipped}` : null,
        `⏱ Duration: ${Math.max(1, Math.round(result.durationMs / 1000))}s`,
        ...failures.map((failure) => `⚠️ ${failure}`),
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  private async syncChannel(
    chatId: string,
    userId: string,
    workspaceId: string,
    telegramUserId: string,
    channelId: string,
  ) {
    const startedAt = Date.now();
    const result = await this.domain.syncChannel(
      userId,
      workspaceId,
      telegramUserId,
      channelId,
    );
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: `${result.status === 'success' ? '✅' : '⚠️'} Sync ${result.status === 'success' ? 'completed' : 'finished'}\n⏱ Duration: ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
    });
  }

  private async stats(
    chatId: string,
    workspaceId: string,
    workspaceName: string,
  ) {
    const summary = await this.domain.stats(workspaceId);
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: renderSystemBotStats(workspaceName, summary),
      parse_mode: 'HTML',
    });
  }
}
