import { Injectable } from '@nestjs/common';
import { FinanceTransactionSource } from '@prisma/client';
import { TelegramBotInteractiveReplyService } from '../../../../telegram/shared/telegram-bot-interactive-reply.service';
import { FinanceRegularPaymentConfirmationService } from '../../consumer-finance/obligations/regular-payments/finance-regular-payment-confirmation.service';
import type { FinanceChatLocale } from '../../consumer-finance/i18n/finance-chat-i18n';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import { financeObligationCopy } from './finance-obligation-chat-copy';

type ParsedCallback = {
  regularPaymentId: string;
  expectedOccurrenceAt: string;
  expectedVersion: number;
};

export function parseFinanceRegularPaymentCallback(
  value?: string,
): ParsedCallback | null {
  const match = /^fin:rp:c:([^:]{1,40}):([0-9a-z]+):([0-9a-z]+)$/u.exec(
    value || '',
  );
  if (!match) return null;
  const expectedVersion = Number.parseInt(match[2], 36);
  const milliseconds = Number.parseInt(match[3], 36);
  const date = new Date(milliseconds);
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !Number.isSafeInteger(milliseconds) ||
    Number.isNaN(date.getTime())
  )
    return null;
  return {
    regularPaymentId: match[1],
    expectedOccurrenceAt: date.toISOString(),
    expectedVersion,
  };
}

@Injectable()
export class FinanceRegularPaymentCallbackHandler {
  constructor(
    private readonly confirmations: FinanceRegularPaymentConfirmationService,
    private readonly interactive: TelegramBotInteractiveReplyService,
  ) {}

  async handle(input: {
    context: TelegramBotApplicationContext;
    profileId: string;
    chatId: string;
    locale: FinanceChatLocale;
  }) {
    const parsed = parseFinanceRegularPaymentCallback(
      input.context.update.callback_query?.data,
    );
    if (!parsed) return false;
    const copy = financeObligationCopy(input.locale);
    try {
      const result = await this.confirmations.confirm(
        input.profileId,
        parsed.regularPaymentId,
        {
          expectedOccurrenceAt: parsed.expectedOccurrenceAt,
          expectedVersion: parsed.expectedVersion,
        },
        FinanceTransactionSource.CHAT,
      );
      await this.interactive.send(input.context.token, input.chatId, {
        text: result.duplicate ? copy.alreadyConfirmed : copy.confirmed,
      });
    } catch {
      await this.interactive.send(input.context.token, input.chatId, {
        text: copy.unavailable,
      });
    }
    return true;
  }
}
