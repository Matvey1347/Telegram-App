import { Injectable } from '@nestjs/common';
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

  menu(chatId: string) {
    return this.api.sendMessage(this.config.token!, {
      chat_id: chatId,
      text: 'Finance — choose an action:',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '💳 Accounts and balances',
              callback_data: 'finance:accounts',
            },
          ],
          [
            { text: '＋ Income', callback_data: 'finance:begin:income' },
            { text: '− Expense', callback_data: 'finance:begin:expense' },
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
  }) {
    const { chatId, connectionId, userId, workspaceId, callback } = input;
    if (callback === 'finance' || callback === 'finance:menu')
      return this.menu(chatId);
    if (callback === 'finance:accounts') {
      const accounts = await this.finance.accountsSummary(userId, workspaceId);
      return this.api.sendMessage(this.config.token!, {
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
      });
      return this.sendResult(chatId, result);
    }
    if (callback === 'finance:begin:transfer') {
      return this.sendResult(
        chatId,
        await this.finance.beginTransfer({ connectionId, userId, workspaceId }),
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
      );
    }
    const cancel = /^finance:cancel:([^:]+)$/.exec(callback);
    if (cancel) {
      return this.sendResult(
        chatId,
        await this.finance.cancel(connectionId, cancel[1]),
      );
    }
    return this.menu(chatId);
  }

  async pendingInput(input: {
    chatId: string;
    connectionId: string;
    userId: string;
    workspaceId: string;
    text: string;
  }) {
    const result = await this.finance.submitInput(input);
    return result ? this.sendResult(input.chatId, result) : null;
  }

  private sendResult(chatId: string, result: TelegramSystemBotFinanceResult) {
    if (
      result.kind === 'ACCOUNT' ||
      result.kind === 'CATEGORY' ||
      result.kind === 'TRANSFER_FROM' ||
      result.kind === 'TRANSFER_TO'
    ) {
      return this.api.sendMessage(this.config.token!, {
        chat_id: chatId,
        text: result.text,
        reply_markup: {
          inline_keyboard: [
            ...result.buttons.map((button) => [button]),
            [
              {
                text: 'Cancel',
                callback_data: `finance:cancel:${this.draftId(result.buttons)}`,
              },
            ],
          ],
        },
      });
    }
    if (result.kind === 'INPUT') {
      return this.api.sendMessage(this.config.token!, {
        chat_id: chatId,
        text: result.text,
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Enter amount and description',
        },
      });
    }
    if (result.kind === 'CONFIRM') {
      const draftId = result.callbackData.slice('finance:confirm:'.length);
      return this.api.sendMessage(this.config.token!, {
        chat_id: chatId,
        text: result.text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm', callback_data: result.callbackData },
              { text: 'Cancel', callback_data: `finance:cancel:${draftId}` },
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
    return this.api.sendMessage(this.config.token!, {
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
}
