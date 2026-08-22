import { Injectable } from '@nestjs/common';
import {
  financeCategoryLabel,
  t,
  type FinanceChatLocale,
} from '../i18n/finance-chat-i18n';
import {
  FinanceChatFlowService,
  type FinanceFlowResult,
} from './finance-chat-flow.service';
import {
  FINANCE_EMOJI_CHOICES,
  financeAccountEmoji,
  financeCategoryEmoji,
} from '../catalog/finance-entity-emoji';

type Button = { text: string; callbackData: string };

function pairs(items: Button[]) {
  const rows: Button[][] = [];
  for (let index = 0; index < items.length; index += 2)
    rows.push(items.slice(index, index + 2));
  return rows;
}

@Injectable()
export class FinanceChatFlowPresenterService {
  constructor(private readonly flows: FinanceChatFlowService) {}

  async present(
    profileId: string,
    locale: FinanceChatLocale,
    result: Extract<FinanceFlowResult, { kind: 'prompt' | 'review' }>,
  ) {
    const buttons: Button[][] = [];
    const revision = result.payload.revision;
    const callback = (action: string, id?: string) =>
      revision
        ? `fin:flow:${action}:${revision}${id ? `.${id}` : ''}`
        : `fin:flow:${action}${id ? `:${id}` : ''}`;
    if (result.kind === 'review') {
      buttons.push([
        {
          text: t(
            locale,
            result.flow === 'CATEGORY_ARCHIVE' ? 'archive' : 'confirm',
          ),
          callbackData: callback('confirm'),
        },
      ]);
    } else {
      const action = this.action(result.step);
      if (action === 'type') {
        const values = result.flow.startsWith('CATEGORY')
          ? [
              ['EXPENSE', t(locale, 'expense')],
              ['INCOME', t(locale, 'incomeLabel')],
            ]
          : [
              ['CASH', t(locale, 'cash')],
              ['CARD', t(locale, 'card')],
              ['SAVINGS', t(locale, 'savings')],
              ['OTHER', t(locale, 'other')],
            ];
        buttons.push(
          ...pairs(
            values.map(([id, text]) => ({
              text,
              callbackData: callback('type', id),
            })),
          ),
        );
      } else if (action === 'currency') {
        buttons.push(
          ...this.flows.currencyKeyboard().map((row) =>
            row.map(({ text }) => ({
              text,
              callbackData: callback('currency', text),
            })),
          ),
        );
      } else if (action === 'language') {
        buttons.push(
          [
            { text: 'Українська', callbackData: callback('language', 'uk') },
            { text: 'Русский', callbackData: callback('language', 'ru') },
          ],
          [{ text: 'English', callbackData: callback('language', 'en') }],
        );
      } else if (action === 'emoji') {
        buttons.push(
          ...pairs(
            FINANCE_EMOJI_CHOICES.map((emoji) => ({
              text: emoji,
              callbackData: callback('emoji', emoji),
            })),
          ),
        );
      } else if (action) {
        const page = result.page || 0;
        const choices =
          result.choices || (await this.flows.choices(profileId, result, page));
        const visible = choices.slice(0, 10);
        buttons.push(
          ...pairs(
            visible.map((item) => ({
              text:
                action === 'category' || action === 'parent'
                  ? `${item.emoji || financeCategoryEmoji(item.label, item.key)} ${financeCategoryLabel(locale, item.key, item.label)}`
                  : `${item.emoji ? `${item.emoji} ` : ''}${item.label}`,
              callbackData: callback(action, item.id),
            })),
          ),
        );
        if (page > 0 || choices.length > 10)
          buttons.push([
            ...(page > 0
              ? [
                  {
                    text: '←',
                    callbackData: callback('page', String(page - 1)),
                  },
                ]
              : []),
            ...(choices.length > 10
              ? [
                  {
                    text: '→',
                    callbackData: callback('page', String(page + 1)),
                  },
                ]
              : []),
          ]);
      }
      if (
        [
          'TRANSACTION_DESCRIPTION',
          'CATEGORY_PARENT',
          'TRANSFER_DESCRIPTION',
        ].includes(result.step)
      )
        buttons.push([
          { text: t(locale, 'skip'), callbackData: callback('skip') },
        ]);
    }
    if (this.canGoBack(result.step))
      buttons.push([
        { text: '←', callbackData: callback('back') },
        { text: '✕', callbackData: callback('cancel') },
      ]);
    else buttons.push([{ text: '✕', callbackData: callback('cancel') }]);
    return {
      text:
        result.kind === 'review'
          ? await this.review(profileId, locale, result)
          : this.prompt(locale, result.flow, result.step, result.payload),
      inlineButtons: buttons,
    };
  }

  completionText(
    locale: FinanceChatLocale,
    result: Extract<FinanceFlowResult, { kind: 'created' | 'updated' }>,
  ) {
    const key =
      result.flow === 'TRANSACTION_CREATE'
        ? 'transactionCreated'
        : result.flow === 'TRANSFER_CREATE'
          ? 'transferCreated'
          : result.flow === 'CATEGORY_ARCHIVE'
            ? 'categoryArchived'
            : result.flow.startsWith('CATEGORY')
              ? 'categorySaved'
              : result.flow.startsWith('ACCOUNT')
                ? 'accountSaved'
                : 'languageSaved';
    return t(locale, key);
  }

  private prompt(
    locale: FinanceChatLocale,
    flow: string,
    step: string,
    payload: Record<string, string | null | undefined>,
  ) {
    const transaction =
      flow === 'TRANSACTION_CREATE'
        ? t(
            locale,
            step === 'TRANSACTION_DESCRIPTION'
              ? 'flowTransactionDescription'
              : step === 'TRANSACTION_ACCOUNT'
                ? 'flowTransactionAccount'
                : step === 'TRANSACTION_AMOUNT'
                  ? 'flowTransactionAmount'
                  : 'flowTransactionCategory',
            {
              account: payload.accountName || t(locale, 'unavailable'),
              currency: payload.accountCurrency || '',
            },
          )
        : null;
    if (transaction) return transaction;
    const keys: Record<string, Parameters<typeof t>[1]> = {
      ACCOUNT_NAME: 'flowAccountName',
      ACCOUNT_TYPE: 'flowAccountType',
      ACCOUNT_EMOJI: 'flowAccountEmoji',
      ACCOUNT_CURRENCY: 'flowAccountCurrency',
      ACCOUNT_AMOUNT: 'flowAccountBalance',
      CATEGORY_TYPE: 'flowCategoryType',
      CATEGORY_NAME: 'flowCategoryName',
      CATEGORY_EMOJI: 'flowCategoryEmoji',
      CATEGORY_PARENT: 'flowCategoryParent',
      TRANSFER_DESCRIPTION: 'flowTransferDescription',
      TRANSFER_FROM: 'flowTransferFrom',
      TRANSFER_TO: 'flowTransferTo',
      TRANSFER_AMOUNT: 'flowTransferAmount',
      SETTINGS_LANGUAGE: 'flowLanguage',
    };
    return t(locale, keys[step] || 'unavailable');
  }

  private async review(
    profileId: string,
    locale: FinanceChatLocale,
    result: Extract<FinanceFlowResult, { kind: 'review' }>,
  ) {
    const p = result.payload;
    if (result.flow === 'TRANSACTION_CREATE') {
      return t(locale, 'reviewTransaction', {
        type: t(locale, p.type === 'INCOME' ? 'incomeLabel' : 'expense'),
        amount: p.amount || '—',
        currency: p.accountCurrency || '',
        account: `${p.accountEmoji || '💰'} ${p.accountName || t(locale, 'unavailable')}`,
        category: p.categoryName
          ? `${p.categoryEmoji || financeCategoryEmoji(p.categoryName, p.categoryKey)} ${financeCategoryLabel(locale, p.categoryKey, p.categoryName)}`
          : t(locale, 'notProvided'),
        description: p.description || t(locale, 'notProvided'),
      });
    }
    const { accounts } = await this.flows.reviewLabels(profileId, p);
    const account = (id?: string | null) =>
      accounts.find((item) => item.id === id);
    if (result.flow === 'TRANSFER_CREATE') {
      const from = account(p.fromAccountId),
        to = account(p.toAccountId);
      return t(locale, 'reviewTransfer', {
        from: from?.name || t(locale, 'unavailable'),
        fromCurrency: from?.currency || '',
        to: to?.name || t(locale, 'unavailable'),
        toCurrency: to?.currency || '',
        amount: p.amount || '—',
        description: p.description || t(locale, 'notProvided'),
      });
    }
    if (result.flow === 'ACCOUNT_EDIT') {
      const selected = account(p.entityId);
      return t(locale, 'reviewAccountEdit', {
        name: `${p.emoji || financeAccountEmoji(p.type)} ${p.name || '—'}`,
        type: p.type || '—',
        currency: selected?.currency || '—',
      });
    }
    if (result.flow.startsWith('ACCOUNT'))
      return t(locale, 'reviewAccount', {
        name: `${p.emoji || financeAccountEmoji(p.type)} ${p.name || '—'}`,
        type: p.type || '—',
        currency: p.currency || account(p.entityId)?.currency || '—',
        balance: p.amount || '0',
      });
    if (result.flow === 'CATEGORY_ARCHIVE')
      return t(locale, 'reviewCategoryArchive', { name: p.name || '—' });
    if (result.flow.startsWith('CATEGORY'))
      return t(locale, 'reviewCategory', {
        name: `${p.emoji || financeCategoryEmoji(p.name)} ${p.name || '—'}`,
        type:
          p.type === 'INCOME' ? t(locale, 'incomeLabel') : t(locale, 'expense'),
      });
    return t(locale, 'reviewLanguage', { language: p.locale || '—' });
  }

  private action(step: string) {
    return (
      {
        TRANSACTION_ACCOUNT: 'account',
        TRANSACTION_CATEGORY: 'category',
        ACCOUNT_TYPE: 'type',
        ACCOUNT_EMOJI: 'emoji',
        ACCOUNT_CURRENCY: 'currency',
        CATEGORY_TYPE: 'type',
        CATEGORY_EMOJI: 'emoji',
        CATEGORY_PARENT: 'parent',
        TRANSFER_FROM: 'account',
        TRANSFER_TO: 'account',
        SETTINGS_LANGUAGE: 'language',
      } as Record<string, string>
    )[step];
  }

  private canGoBack(step: string) {
    return ![
      'TRANSACTION_ACCOUNT',
      'ACCOUNT_NAME',
      'CATEGORY_TYPE',
      'TRANSFER_DESCRIPTION',
      'SETTINGS_LANGUAGE',
    ].includes(step);
  }
}
