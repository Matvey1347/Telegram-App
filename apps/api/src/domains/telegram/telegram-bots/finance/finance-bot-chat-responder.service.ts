import { Injectable } from '@nestjs/common';
import { TelegramBotInteractiveReplyService } from '../../../../telegram/shared/telegram-bot-interactive-reply.service';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import { FinanceHistoryQueryDto } from './finance.dto';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceCoreService } from './finance-core.service';
import type { TelegramChatMenuButton } from '../../../../telegram/shared/telegram-bot-api.client';
import { financeCategoryLabel, t, type FinanceChatLocale } from './i18n/finance-chat-i18n';

export function financeMiniAppUrl(
  botId: string,
  base = process.env.FINANCE_MINI_APP_URL || process.env.FRONTEND_URL,
  screen?: 'accounts' | 'transactions' | 'more',
  transfer = false,
) {
  const normalized = base?.trim().replace(/\/$/u, '');
  if (!normalized) return null;
  const query = new URLSearchParams();
  if (screen) query.set('screen', screen);
  if (transfer) query.set('transfer', '1');
  const suffix = query.size ? `?${query.toString()}` : '';
  return `${normalized}/finance/${encodeURIComponent(botId)}${suffix}`;
}

export function financeChatMenuButton(botId: string, locale: FinanceChatLocale = 'en'): TelegramChatMenuButton {
  const webAppUrl = financeMiniAppUrl(botId);
  return webAppUrl
    ? { type: 'web_app', text: t(locale, 'menuOpen').replace(/^📱\s*/u, ''), webAppUrl }
    : { type: 'commands' };
}

export function financeMainMenu(botId: string, locale: FinanceChatLocale = 'en') {
  const webAppUrl = financeMiniAppUrl(botId);
  return [
    [{ text: t(locale, 'menuExpense') }, { text: t(locale, 'menuIncome') }],
    [
      { text: t(locale, 'menuOpen'), ...(webAppUrl ? { webAppUrl } : {}) },
      { text: t(locale, 'menuRecent') },
    ],
    [{ text: t(locale, 'menuAccounts') }, { text: t(locale, 'menuCategories') }],
    [{ text: t(locale, 'menuTransfer') }, { text: t(locale, 'menuSettings') }],
    [{ text: t(locale, 'menuHelp') }],
  ];
}

export function financeCategoryEmoji(name: string | null | undefined) {
  const value = name?.toLowerCase() || '';
  if (/food|coffee|кава/.test(value)) return '🍽️';
  if (/transport|fuel/.test(value)) return '🚗';
  if (/home|rent|оренд/.test(value)) return '🏠';
  if (/subscription/.test(value)) return '🔁';
  if (/shopping/.test(value)) return '🛍️';
  if (/health/.test(value)) return '💊';
  if (/entertainment/.test(value)) return '🎬';
  if (/salary/.test(value)) return '💼';
  return '🏷️';
}

function rowsOfTwo<T>(items: T[]) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

@Injectable()
export class FinanceBotChatResponderService {
  constructor(
    private readonly interactive: TelegramBotInteractiveReplyService,
    private readonly ledger: FinanceLedgerService,
    private readonly core: FinanceCoreService,
  ) {}

  proposalButtons(token: string, saveText: string, locale: FinanceChatLocale = 'en') {
    return [
      [
        { text: saveText, callbackData: `fin:save:${token}` },
        { text: t(locale, 'cancel'), callbackData: `fin:cancel:${token}` },
      ],
    ];
  }

  batchPreview(
    items: Array<{
      payload: {
        type: 'INCOME' | 'EXPENSE';
        amount: string;
        currency: string;
        description: string | null;
      };
      accountName: string;
      categoryName: string | null;
    }>,
    locale: FinanceChatLocale = 'en',
  ) {
    return items
      .map(
        (item, index) => t(locale, 'batchItem', {
          index: index + 1,
          type: `${item.payload.type === 'EXPENSE' ? '💸' : '💰'} ${t(locale, item.payload.type === 'EXPENSE' ? 'expense' : 'incomeLabel')}`,
          amount: item.payload.amount,
          currency: item.payload.currency,
          category: `${financeCategoryEmoji(item.categoryName)} ${item.categoryName || t(locale, 'other')}`,
          account: item.accountName,
          description: item.payload.description || t(locale, 'notProvided'),
        }),
      )
      .join('\n\n');
  }

  async sendSafe(
    context: TelegramBotApplicationContext,
    userId: string,
    chatId: string,
    text: string,
    idempotencyKey: string,
  ) {
    await this.interactive.send(context.token, chatId, { text });
  }

  async sendMainMenu(
    context: TelegramBotApplicationContext,
    userId: string,
    chatId: string,
    locale: FinanceChatLocale = 'en',
  ) {
    await this.interactive.send(context.token, chatId, {
      text: t(locale, 'welcome'),
      replyKeyboard: financeMainMenu(context.bot.id, locale),
    });
  }

  async sendFinanceCta(
    context: TelegramBotApplicationContext,
    userId: string,
    chatId: string,
    idempotencyKey: string,
    locale: FinanceChatLocale = 'en',
  ) {
    await this.interactive.send(context.token, chatId, {
      text: financeMiniAppUrl(context.bot.id)
        ? t(locale, 'openFinance') : t(locale, 'noMiniApp'),
      replyKeyboard: financeMainMenu(context.bot.id, locale),
    });
  }

  async sendRecentTransactions(
    context: TelegramBotApplicationContext,
    userId: string,
    profileId: string,
    chatId: string,
    locale: FinanceChatLocale = 'en',
  ) {
    try {
      const history = await this.ledger.history(
        profileId,
        Object.assign(new FinanceHistoryQueryDto(), { limit: 5 }),
      );
      const text = history.items.length
        ? `${t(locale, 'recentTitle')}\n\n${history.items.map((item) => `${item.type === 'EXPENSE' ? '−' : '+'}${item.amount} ${item.currency} · ${financeCategoryEmoji(item.category?.name)} ${item.category?.name || t(locale, 'other')}\n🏦 ${item.account.name}${item.description ? ` · ${item.description}` : ''}`).join('\n\n')}`
        : t(locale, 'noTransactions');
      await this.sendSafe(
        context,
        userId,
        chatId,
        text,
        `finance-recent:${context.updateLogId}`,
      );
    } catch {
      await this.sendSafe(
        context,
        userId,
        chatId,
        t(locale, 'recentError'),
        `finance-recent-error:${context.updateLogId}`,
      );
    }
  }

  async sendAccounts(
    context: TelegramBotApplicationContext,
    userId: string,
    profileId: string,
    chatId: string,
    locale: FinanceChatLocale = 'en',
  ) {
    try {
      const accounts = await this.ledger.accounts(profileId);
      const active = accounts.filter((account) => !account.archivedAt);
      const text = active.length
        ? `${t(locale, 'accountsTitle')}\n\n${active.slice(0, 8).map((account) => `${account.name}\n${account.balance} ${account.currency}`).join('\n\n')}`
        : t(locale, 'noAccounts');
      await this.interactive.send(context.token, chatId, {
        text,
        inlineButtons: [
          [{ text: t(locale, 'addAccount'), callbackData: 'fin:flow:start-account' }],
          ...rowsOfTwo(active.slice(0, 8).map((account) => ({ text: `✏️ ${account.name}`, callbackData: `fin:flow:edit-account:${account.id}` }))),
          ...(financeMiniAppUrl(context.bot.id, undefined, 'accounts') ? [[{ text: t(locale, 'manageInFinance'), webAppUrl: financeMiniAppUrl(context.bot.id, undefined, 'accounts')! }]] : []),
        ],
        replyKeyboard: financeMainMenu(context.bot.id, locale),
      });
    } catch {
      await this.sendSafe(
        context,
        userId,
        chatId,
        t(locale, 'accountsError'),
        `finance-accounts-error:${context.updateLogId}`,
      );
    }
  }

  async sendCategories(
    context: TelegramBotApplicationContext,
    userId: string,
    profileId: string,
    chatId: string,
    locale: FinanceChatLocale = 'en',
  ) {
    try {
      const active = (await this.core.categories(profileId)).filter(
        (category) => !category.archivedAt,
      );
      const visible = active.slice(0, 20);
      const list = (type: 'EXPENSE' | 'INCOME') =>
        visible
          .filter((category) => category.type === type)
          .map((category) => `${financeCategoryEmoji(category.name)} ${financeCategoryLabel(locale, category.key, category.name)}`)
          .join(' · ');
      const text = active.length
        ? `${t(locale, 'categoriesTitle')}\n\n${t(locale, 'expenses')}\n${list('EXPENSE') || t(locale, 'none')}\n\n${t(locale, 'income')}\n${list('INCOME') || t(locale, 'none')}`
        : t(locale, 'noCategories');
      await this.interactive.send(context.token, chatId, {
        text,
        inlineButtons: [
          [{ text: t(locale, 'addCategory'), callbackData: 'fin:flow:start-category' }],
          ...active.slice(0, 8).map((category) => {
            const label = financeCategoryLabel(locale, category.key, category.name);
            return [
              { text: `${category.type === 'EXPENSE' ? '💸' : '💰'} ${label}`, callbackData: `fin:flow:edit-category:${category.id}` },
              { text: `🗄 ${t(locale, 'archive')}`, callbackData: `fin:flow:archive-category:${category.id}` },
            ];
          }),
          ...(financeMiniAppUrl(context.bot.id, undefined, 'more') ? [[{ text: t(locale, 'manageInFinance'), webAppUrl: financeMiniAppUrl(context.bot.id, undefined, 'more')! }]] : []),
        ],
        replyKeyboard: financeMainMenu(context.bot.id, locale),
      });
    } catch {
      await this.sendSafe(
        context, userId, chatId,
        t(locale, 'categoriesError'),
        `finance-categories-error:${context.updateLogId}`,
      );
    }
  }

  async sendTransfer(
    context: TelegramBotApplicationContext,
    userId: string,
    profileId: string,
    chatId: string,
    locale: FinanceChatLocale = 'en',
    accountCount = 0,
  ) {
    const missing = Math.max(0, 2 - accountCount);
    const text = `${t(locale, 'transfer')}\n\n${t(locale, 'transferMissingAccounts', { count: missing })}`;
    const accountsUrl = financeMiniAppUrl(context.bot.id, undefined, 'accounts');
    await this.interactive.send(context.token, chatId, {
      text,
      inlineButtons: [
        [{ text: t(locale, 'addAccount'), callbackData: 'fin:flow:start-account' }],
        ...(accountsUrl ? [[{ text: t(locale, 'manageAccounts'), webAppUrl: accountsUrl }]] : []),
      ],
      replyKeyboard: financeMainMenu(context.bot.id, locale),
    });
  }

  async sendSettings(
    context: TelegramBotApplicationContext,
    chatId: string,
    locale: FinanceChatLocale,
    defaultCurrency: string,
  ) {
    const settingsUrl = financeMiniAppUrl(context.bot.id, undefined, 'more');
    await this.interactive.send(context.token, chatId, {
      text: t(locale, 'settingsSummary', { currency: defaultCurrency }),
      inlineButtons: [
        [{ text: t(locale, 'changeLanguage'), callbackData: 'fin:flow:start-language' }],
        ...(settingsUrl ? [[{ text: t(locale, 'fullSettings'), webAppUrl: settingsUrl }, { text: t(locale, 'subscription'), webAppUrl: settingsUrl }]] : []),
      ],
    });
  }

}
