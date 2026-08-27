import { Injectable } from '@nestjs/common';
import { TELEGRAM_BOT_ACTION_TEXT } from '../../../telegram/shared/telegram-bot-action-buttons';
import { TransactionType } from '@prisma/client';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { TelegramSystemBotFinanceService } from './telegram-system-bot-finance.service';
import type { TelegramSystemBotFinanceResult } from './telegram-system-bot-finance-flow';

@Injectable()
export class TelegramSystemBotFinanceHandlerService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly finance: TelegramSystemBotFinanceService,
  ) {}

  menu(chatId: string, messageId?: number) {
    return this.render(chatId, messageId, {
      chat_id: chatId,
      text: '💰 Finance — choose an action:',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🟢 ＋ Income', callback_data: 'finance:begin:income' },
            { text: '🔴 − Expense', callback_data: 'finance:begin:expense' },
          ],
          [
            {
              text: '💳 Accounts and balances',
              callback_data: 'finance:accounts',
            },
          ],
          [{ text: '↔ Transfer', callback_data: 'finance:begin:transfer' }],
        ],
      },
    });
  }

  async callback(input: {
    chatId: string;
    connectionId: string;
    userId: string;
    workspaceId: string;
    callback: string;
    messageId?: number;
  }) {
    const { chatId, connectionId, userId, workspaceId, callback, messageId } =
      input;
    if (callback === 'finance' || callback === 'finance:menu')
      return this.menu(chatId, messageId);
    if (callback === 'finance:accounts') {
      const accounts = await this.finance.accountsSummary(userId, workspaceId);
      return this.render(chatId, messageId, {
        chat_id: chatId,
        text: accounts.length
          ? [
              'Accounts and balances',
              ...accounts.map(
                (account) =>
                  `${account.emoji} ${account.name}: ${this.amount(account.balance)} ${account.currency}`,
              ),
            ].join('\n')
          : 'No accounts in this workspace.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '↔ Transfer', callback_data: 'finance:begin:transfer' }],
            [{ text: '← Finance', callback_data: 'finance:menu' }],
          ],
        },
      });
    }
    if (
      callback === 'finance:begin:income' ||
      callback === 'finance:begin:expense'
    ) {
      const result = await this.finance.beginTransaction({
        connectionId,
        userId,
        workspaceId,
        type:
          callback === 'finance:begin:income'
            ? TransactionType.income
            : TransactionType.expense,
        controlMessageId: messageId,
      });
      return this.sendResult(chatId, result, messageId);
    }
    if (callback === 'finance:begin:transfer') {
      return this.sendResult(
        chatId,
        await this.finance.beginTransfer({
          connectionId,
          userId,
          workspaceId,
          controlMessageId: messageId,
        }),
        messageId,
      );
    }
    const choice = /^finance:(account|category|from|to):([^:]+):(\d+)$/.exec(
      callback,
    );
    if (choice) {
      return this.sendResult(
        chatId,
        await this.finance.choose({
          connectionId,
          userId,
          kind: choice[1] as 'account' | 'category' | 'from' | 'to',
          draftId: choice[2],
          index: Number(choice[3]),
        }),
        messageId,
      );
    }
    const confirm = /^finance:confirm:([^:]+)$/.exec(callback);
    if (confirm) {
      return this.sendResult(
        chatId,
        await this.finance.confirm({
          connectionId,
          userId,
          draftId: confirm[1],
        }),
        messageId,
      );
    }
    const cancel = /^finance:cancel:([^:]+)$/.exec(callback);
    if (cancel) {
      return this.sendResult(
        chatId,
        await this.finance.cancel(connectionId, cancel[1]),
        messageId,
      );
    }
    return this.menu(chatId, messageId);
  }

  async pendingInput(input: {
    chatId: string;
    connectionId: string;
    userId: string;
    workspaceId: string;
    text: string;
    inputMessageId?: number;
  }) {
    const result = await this.finance.submitInput(input);
    if (!result) return null;
    if (input.inputMessageId) {
      await this.api
        .deleteMessage(this.config.token!, {
          chat_id: input.chatId,
          message_id: input.inputMessageId,
        })
        .catch(() => undefined);
    }
    return this.sendResult(input.chatId, result);
  }

  private sendResult(
    chatId: string,
    result: TelegramSystemBotFinanceResult,
    fallbackMessageId?: number,
  ) {
    const messageId = result.controlMessageId ?? fallbackMessageId;
    if (
      result.kind === 'ACCOUNT' ||
      result.kind === 'CATEGORY' ||
      result.kind === 'TRANSFER_FROM' ||
      result.kind === 'TRANSFER_TO'
    ) {
      return this.render(chatId, messageId, {
        chat_id: chatId,
        text: result.text,
        reply_markup: {
          inline_keyboard: [
            ...this.compactRows(result.buttons),
            [
              {
                text: TELEGRAM_BOT_ACTION_TEXT.cancel,
                callback_data: `finance:cancel:${this.draftId(result.buttons)}`,
              },
            ],
          ],
        },
      });
    }
    if (result.kind === 'INPUT') {
      return this.render(chatId, messageId, {
        chat_id: chatId,
        text: result.text,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: TELEGRAM_BOT_ACTION_TEXT.cancel,
                callback_data: `finance:cancel:${result.draftId}`,
              },
            ],
          ],
        },
      });
    }
    if (result.kind === 'CONFIRM') {
      const draftId = result.callbackData.slice('finance:confirm:'.length);
      return this.render(chatId, messageId, {
        chat_id: chatId,
        text: result.text,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: TELEGRAM_BOT_ACTION_TEXT.confirm,
                callback_data: result.callbackData,
              },
              {
                text: TELEGRAM_BOT_ACTION_TEXT.cancel,
                callback_data: `finance:cancel:${draftId}`,
              },
            ],
          ],
        },
      });
    }
    const text =
      result.kind === 'COMPLETED'
        ? result.operation === 'transfer'
          ? 'Transfer recorded.'
          : 'Transaction recorded.'
        : result.kind === 'DUPLICATE'
          ? 'This finance action was already processed.'
          : result.kind === 'CANCELLED'
            ? 'Finance action cancelled.'
            : 'Create the required active accounts and categories first.';
    return this.render(chatId, messageId, {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: '← Finance', callback_data: 'finance:menu' }],
        ],
      },
    });
  }

  private draftId(buttons: Array<{ callback_data: string }>) {
    return buttons[0]?.callback_data.split(':')[2] ?? 'expired';
  }

  private amount(value: number) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private compactRows<T extends { text: string }>(buttons: T[]): T[][] {
    const rows: T[][] = [];
    for (let index = 0; index < buttons.length; ) {
      const remaining = buttons.slice(index, index + 3);
      const columns =
        remaining.length === 3 &&
        remaining.every((button) => button.text.length <= 18)
          ? 3
          : 2;
      rows.push(buttons.slice(index, index + columns));
      index += columns;
    }
    return rows;
  }

  private render(
    chatId: string,
    messageId: number | undefined,
    payload: Parameters<TelegramBotApiClient['sendMessage']>[1],
  ) {
    if (messageId) {
      return this.api.editMessageText(this.config.token!, {
        ...payload,
        chat_id: chatId,
        message_id: messageId,
      });
    }
    return this.api.sendMessage(this.config.token!, payload);
  }
}
