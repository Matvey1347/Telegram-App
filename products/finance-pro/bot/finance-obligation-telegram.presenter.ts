import { Injectable } from '@nestjs/common';
import type { FinanceObligationPresentationPort } from '../../consumer-finance/obligations/finance-obligation-presentation.port';
import { financeMiniAppUrl } from '../../consumer-finance/telegram-presentation/finance-telegram-menu';
import { financeObligationCopy } from './finance-obligation-chat-copy';

export function financeRegularPaymentConfirmCallback(
  regularPaymentId: string,
  occurrence: Date,
  configVersion: number,
) {
  return `fin:rp:c:${regularPaymentId}:${configVersion.toString(36)}:${occurrence.getTime().toString(36)}`;
}

@Injectable()
export class FinanceObligationTelegramPresenter implements FinanceObligationPresentationPort {
  debtDue(input: Parameters<FinanceObligationPresentationPort['debtDue']>[0]) {
    const copy = financeObligationCopy(input.locale);
    const webAppUrl = financeMiniAppUrl(
      input.botIntegrationId,
      undefined,
      'debts',
    );
    return {
      text: copy.debtDue(input.debtName, input.amount, input.currency),
      ...(webAppUrl
        ? { inlineButtons: [[{ text: copy.openDebts, webAppUrl }]] }
        : {}),
    };
  }

  regularPaymentDue(
    input: Parameters<
      FinanceObligationPresentationPort['regularPaymentDue']
    >[0],
  ) {
    const copy = financeObligationCopy(input.locale);
    const regularPaymentsUrl = financeMiniAppUrl(
      input.botIntegrationId,
      undefined,
      'regular-payments',
    );
    const changeAmountUrl = regularPaymentsUrl
      ? (() => {
          const url = new URL(regularPaymentsUrl);
          url.searchParams.set('regularPaymentId', input.regularPaymentId);
          url.searchParams.set(
            'occurrenceAt',
            input.expectedOccurrenceAt.toISOString(),
          );
          url.searchParams.set('configVersion', String(input.configVersion));
          return url.toString();
        })()
      : null;
    return {
      text: copy.regularDue(input.name, input.amount, input.currency),
      inlineButtons: [
        [
          {
            text: copy.confirm,
            callbackData: financeRegularPaymentConfirmCallback(
              input.regularPaymentId,
              input.expectedOccurrenceAt,
              input.configVersion,
            ),
          },
          ...(changeAmountUrl
            ? [{ text: copy.changeAmount, webAppUrl: changeAmountUrl }]
            : []),
        ],
        ...(regularPaymentsUrl
          ? [
              [
                {
                  text: copy.openRegularPayments,
                  webAppUrl: regularPaymentsUrl,
                },
              ],
            ]
          : []),
      ],
    };
  }
}
