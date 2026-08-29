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
import {
  SYSTEM_BOT_HELP_TEXT,
  systemBotMenuPayload,
} from './telegram-system-bot-menu';
import { compactSystemBotInlineKeyboard } from './telegram-system-bot-inline-keyboard';
import { TelegramSystemBotChannelAccessService } from './telegram-system-bot-channel-access.service';
import { TelegramSystemBotWorkspaceFlowService } from './telegram-system-bot-workspace-flow.service';
import {
  resolveSystemBotAction,
  systemBotWorkflowScope,
  type SystemBotAuthorizedConnection,
  type TelegramSystemBotAction,
  type TelegramSystemBotUpdate,
} from './telegram-system-bot-action-context';

export type { TelegramSystemBotUpdate } from './telegram-system-bot-action-context';

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
    if (!this.config.token) return;
    const action = resolveSystemBotAction(update);
    if (!action) return;
    const { actor, telegramUserId, chatId, command, callback } = action;
    if (action.callbackQueryId) {
      await this.api.answerCallbackQuery(this.config.token, {
        callback_query_id: action.callbackQueryId,
      });
    }
    if (command === '/help') return this.help(chatId);
    if (command?.startsWith('/start'))
      return this.start(telegramUserId, chatId, actor, command);
    this.sendTyping(chatId);
    try {
      const connection =
        await this.connections.requireEnabledConnection(telegramUserId);
      if (
        callback?.startsWith('workspace:') &&
        !['workspace:new', 'workspace:edit'].includes(callback)
      ) {
        const switched = await this.connections.switchWorkspace(
          connection,
          callback.slice('workspace:'.length),
        );
        return this.workspaceMenu(chatId, switched, action.callbackMessageId);
      }
      if (command === '/workspace' || callback === 'workspace')
        return this.workspaceMenu(chatId, connection);
      const workspace =
        await this.connections.requireCurrentWorkspace(connection);
      const workflowScope = systemBotWorkflowScope(
        chatId,
        connection,
        workspace,
      );
      if (callback === 'workspace:new')
        return this.workspaceFlow?.beginCreate(
          workflowScope,
          action.callbackMessageId,
        );
      if (callback === 'workspace:edit')
        return this.workspaceFlow?.beginEdit(
          workflowScope,
          workspace.workspace.name,
          action.callbackMessageId,
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
          return this.workspaceMenu(chatId, connection, result.messageId);
        return result;
      }
      if (command === '/sync' || callback === 'sync')
        return this.sync(chatId, connection.userId, workspace.workspaceId);
      if (callback?.startsWith('channel:sync:'))
        return this.syncChannel(
          chatId,
          connection.userId,
          workspace.workspaceId,
          connection.telegramUserId,
          callback.slice('channel:sync:'.length),
        );
      if (callback?.startsWith('channel:view:'))
        return this.channelAccess?.detail(
          chatId,
          workspace.workspaceId,
          callback.slice('channel:view:'.length),
          workspace.workspace.timezone,
        );
      if (callback?.startsWith('channel:access:'))
        return this.channelAccess?.auditAndSend(
          chatId,
          workspace.workspaceId,
          callback.slice('channel:access:'.length),
        );
      if (command === '/stats' || callback === 'stats')
        return this.stats(
          chatId,
          workspace.workspaceId,
          workspace.workspace.name,
        );
      if (command === '/finance' || callback === 'finance')
        return this.finance.menu(chatId);
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
          action.callbackMessageId,
        );
      if (callback?.startsWith('finance:'))
        return this.finance.callback({
          chatId,
          connectionId: connection.id,
          userId: connection.userId,
          workspaceId: workspace.workspaceId,
          callback,
          messageId: action.callbackMessageId,
        });
      if (command === '/channels' || callback === 'channels')
        return this.channelAccess?.list(chatId, workspace.workspaceId);
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
          chatId,
          connectionId: connection.id,
          userId: connection.userId,
          workspaceId: workspace.workspaceId,
          text: update.message.text,
          inputMessageId: update.message.message_id,
        });
        if (financeResult) return financeResult;
      }
      return this.sendMenu(chatId, workspace.workspace);
    } catch (error) {
      this.logger.warn(
        `System bot action denied or failed: ${sanitizeOperationalError(error)}`,
      );
      return this.api.sendMessage(this.config.token, {
        chat_id: chatId,
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
    actor: TelegramSystemBotAction['actor'],
    command: string,
  ) {
    const connection = await this.connections
      .requireEnabledConnection(telegramUserId)
      .catch(() => null);
    if (connection) {
      if (command === '/start ad_sale' && this.adSaleFlow) {
        const workspace =
          await this.connections.requireCurrentWorkspace(connection);
        return this.adSaleFlow.begin(
          systemBotWorkflowScope(chatId, connection, workspace),
        );
      }
      if (command === '/start post' && this.postFlow) {
        const workspace =
          await this.connections.requireCurrentWorkspace(connection);
        return this.postFlow.begin(
          systemBotWorkflowScope(chatId, connection, workspace),
        );
      }
      const adSalePostMatch = /^\/start ad_post_([A-Za-z0-9_-]+)$/.exec(
        command,
      );
      if (adSalePostMatch && this.postFlow) {
        const workspace =
          await this.connections.requireCurrentWorkspace(connection);
        return this.postFlow.resumeAdSaleImport(
          systemBotWorkflowScope(chatId, connection, workspace),
          adSalePostMatch[1],
        );
      }
      const workspaces =
        await this.connections.workspacesForConnection(connection);
      if (workspaces.length > 1)
        return this.workspaceMenu(chatId, connection, undefined, workspaces);
      if (workspaces[0]?.selected) return this.sendMenu(chatId, workspaces[0]);
      return this.menu(chatId, connection);
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

  private async menu(
    chatId: string,
    connection: string | SystemBotAuthorizedConnection,
  ) {
    const workspace =
      await this.connections.requireCurrentWorkspace(connection);
    return this.sendMenu(chatId, workspace.workspace);
  }

  private sendMenu(
    chatId: string,
    workspace: Parameters<typeof systemBotMenuPayload>[0],
  ) {
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      ...systemBotMenuPayload(workspace),
    });
  }

  private sendTyping(chatId: string) {
    try {
      void this.api
        .sendChatAction(this.config.token!, chatId, 'typing')
        .catch(() => undefined);
    } catch {
      // Telegram feedback is cosmetic; synchronous client failures are safe.
    }
  }

  private async help(chatId: string) {
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: SYSTEM_BOT_HELP_TEXT,
    });
  }

  private async workspaceMenu(
    chatId: string,
    connection: string | SystemBotAuthorizedConnection,
    messageId?: number,
    resolvedWorkspaces?: Awaited<
      ReturnType<TelegramSystemBotConnectionsService['workspacesForConnection']>
    >,
  ) {
    const workspaces =
      resolvedWorkspaces ??
      (await this.connections.workspacesForConnection(connection));
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
