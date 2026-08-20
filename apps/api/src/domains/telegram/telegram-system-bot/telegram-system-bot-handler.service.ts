import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { createCollapsibleReplyKeyboard } from '../../../telegram/shared/telegram-reply-keyboard';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { TelegramSystemBotConnectionsService } from './telegram-system-bot-connections.service';
import { TelegramSystemBotDomainGatewayService } from './telegram-system-bot-domain-gateway.service';
import { TelegramSystemBotFinanceHandlerService } from './telegram-system-bot-finance-handler.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import {
  renderSystemBotStats,
  systemBotEmoji,
  systemBotTaskEmoji,
} from './telegram-system-bot-presentation';

export type TelegramSystemBotUpdate = {
  update_id?: number | string;
  message?: {
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
  ) {}

  async handle(update: TelegramSystemBotUpdate) {
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
    const command = this.commandFor(update.message?.text?.trim());
    const callback = update.callback_query?.data;
    if (update.callback_query?.id) {
      await this.api.answerCallbackQuery(this.config.token, {
        callback_query_id: update.callback_query.id,
      });
    }
    if (command?.startsWith('/start'))
      return this.start(telegramUserId, safeChatId, actor);
    let loadingMessageId: number | null = null;
    try {
      try {
        const loadingMessage = await this.api.sendMessage(this.config.token, {
          chat_id: safeChatId,
          text: '⏳ Loading…',
        });
        loadingMessageId = loadingMessage?.message_id ?? null;
      } catch {
        // Loading feedback is best-effort and must not block the requested action.
      }
      const connection =
        await this.connections.requireEnabledConnection(telegramUserId);
      if (callback?.startsWith('workspace:')) {
        await this.connections.switchWorkspace(
          connection.id,
          callback.slice('workspace:'.length),
        );
        return this.menu(safeChatId, connection.id);
      }
      const workspace = await this.connections.requireCurrentWorkspace(
        connection.id,
      );
      if (command === '/help') return this.help(safeChatId);
      if (command === '/workspace' || callback === 'workspace')
        return this.workspaceMenu(safeChatId, connection.id);
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
      if (command === '/stats' || callback === 'stats')
        return this.stats(
          safeChatId,
          workspace.workspaceId,
          workspace.workspace.name,
        );
      if (command === '/tasks' || callback === 'tasks')
        return this.tasks(
          safeChatId,
          workspace.workspaceId,
          workspace.role,
          workspace.workspace.timezone,
        );
      if (callback?.startsWith('task:run:'))
        return this.runTask(
          safeChatId,
          workspace.workspaceId,
          workspace.role,
          callback.slice('task:run:'.length),
        );
      if (command === '/finance' || callback === 'finance')
        return this.finance.menu(safeChatId);
      if (callback?.startsWith('finance:'))
        return this.finance.callback({
          chatId: safeChatId,
          connectionId: connection.id,
          userId: connection.userId,
          workspaceId: workspace.workspaceId,
          callback,
        });
      if (command === '/channels' || callback === 'channels')
        return this.channels(
          safeChatId,
          workspace.workspaceId,
          connection.telegramUserId,
          workspace.workspace.timezone,
        );
      if (update.message?.text) {
        const financeResult = await this.finance.pendingInput({
          chatId: safeChatId,
          connectionId: connection.id,
          userId: connection.userId,
          workspaceId: workspace.workspaceId,
          text: update.message.text,
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
    } finally {
      if (loadingMessageId !== null) {
        await this.api
          .deleteMessage?.(this.config.token, {
            chat_id: safeChatId,
            message_id: loadingMessageId,
          })
          ?.catch(() => undefined);
      }
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
  ) {
    const connection = await this.connections
      .requireEnabledConnection(telegramUserId)
      .catch(() => null);
    if (connection) {
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
    const workspaceEmoji = systemBotEmoji(
      workspace.workspace.avatarPresentation,
      '🏢',
    );
    return {
      text: `${workspaceEmoji} Workspace: ${workspace.workspace.name}`,
      reply_markup: createCollapsibleReplyKeyboard([
          [{ text: '📢 Channels' }, { text: '📊 Statistics' }],
          [{ text: '💰 Finance' }, { text: '⏱ Scheduled Tasks' }],
          [{ text: '🏢 Switch Workspace' }],
        ], {
          inputFieldPlaceholder: 'Choose an action or send a message',
        }),
    };
  }

  private commandFor(text: string | undefined) {
    const actions: Record<string, string> = {
      Channels: '/channels',
      Statistics: '/stats',
      Finance: '/finance',
      'Scheduled Tasks': '/tasks',
      'Switch Workspace': '/workspace',
      '📢 Channels': '/channels',
      '📊 Statistics': '/stats',
      '💰 Finance': '/finance',
      '⏱ Scheduled Tasks': '/tasks',
      '🏢 Switch Workspace': '/workspace',
    };
    return text ? (actions[text] ?? text) : undefined;
  }

  private async help(chatId: string) {
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: '🤖 Use the menu button or these commands:\n📢 /channels — your managed channels\n📊 /stats — workspace statistics\n💰 /finance — record income or expense\n⏱ /tasks — scheduled tasks\n🏢 /workspace — switch workspace',
    });
  }

  private async workspaceMenu(chatId: string, connectionId: string) {
    const workspaces =
      await this.connections.workspacesForConnection(connectionId);
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: '🏢 Choose workspace:',
      reply_markup: {
        inline_keyboard: workspaces.map((workspace) => [
          {
            text: `${workspace.selected ? '✓ ' : ''}${systemBotEmoji(workspace.avatarPresentation, '🏢')} ${workspace.name}`,
            callback_data: `workspace:${workspace.id}`,
          },
        ]),
      },
    });
  }

  private async channels(
    chatId: string,
    workspaceId: string,
    telegramUserId: string,
    timezone: string,
  ) {
    const channels = await this.domain.channels(workspaceId, telegramUserId);
    const lines = channels.length
      ? channels
          .map(
            (channel) =>
              `${channel.isActive ? '🟢' : '⚪'} ${channel.photoUrl ? '🖼️' : '📢'} ${channel.title}${channel.currentSubscribersCount ? `\n👥 ${channel.currentSubscribersCount.toLocaleString()} subscribers` : ''}\n🕒 Last sync: ${this.formatDate(channel.lastPublicSyncedAt, timezone)}`,
          )
          .join('\n')
      : '📢 No channels in this workspace.';
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: lines,
      reply_markup: {
        inline_keyboard: [
          ...channels.slice(0, 8).map((channel) => [
            {
              text: `🔄 ${channel.title}`,
              callback_data: `channel:sync:${channel.id}`,
            },
          ]),
        ],
      },
    });
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
    });
  }

  private async tasks(
    chatId: string,
    workspaceId: string,
    role: Parameters<TelegramSystemBotDomainGatewayService['tasks']>[1],
    timezone = 'UTC',
  ) {
    const result = await this.domain.tasks(workspaceId, role);
    const buttons = result.items
      .filter((task) => task.canRunNow)
      .slice(0, 8)
      .map((task) => [
        {
          text: `▶️ ${systemBotTaskEmoji(task.key)} ${task.name}`,
          callback_data: `task:run:${task.key}`,
        },
      ]);
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: result.items.length
        ? result.items
            .map((task) =>
              [
                `${task.enabled ? '🟢' : '⚪'} ${systemBotTaskEmoji(task.key)} ${task.name}`,
                `🕒 Last run: ${this.formatDate(task.lastRun?.finishedAt ?? task.lastRun?.startedAt, timezone)}`,
                task.nextRunAt
                  ? `⏭ Next: ${this.formatDate(task.nextRunAt, timezone)}`
                  : null,
              ]
                .filter(Boolean)
                .join('\n'),
            )
            .join('\n')
        : '⏱ No scheduled tasks.',
      reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined,
    });
  }

  private async runTask(
    chatId: string,
    workspaceId: string,
    role: Parameters<TelegramSystemBotDomainGatewayService['tasks']>[1],
    taskKey: string,
  ) {
    const run = await this.domain.runTask(workspaceId, role, taskKey);
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: `${run?.status === 'SUCCESS' ? '✅ Completed' : '⚠️ Finished'}: ${run?.resultSummary ?? taskKey}`,
    });
  }

  private formatDate(
    value: string | Date | null | undefined,
    timezone: string,
  ) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
  }
}
