import { Injectable } from '@nestjs/common';
import type { FinanceObligationPresentationPort } from '@consumer-finance/api/obligations/finance-obligation-presentation.port';
import { financeMiniAppUrl } from '@consumer-finance/api/telegram-presentation/finance-telegram-menu';
import { financeObligationCopy } from '@consumer-finance/bot/finance-obligation-chat-copy';

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
    const settlementUrl = webAppUrl
      ? (() => {
          const url = new URL(webAppUrl);
          url.searchParams.set('debtId', input.debtId);
          return url.toString();
        })()
      : null;
    return {
      text: copy.debtDue(input.debtName, input.amount, input.currency),
      ...(settlementUrl
        ? { inlineButtons: [[{ text: copy.openDebts, webAppUrl: settlementUrl }]] }
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
    const confirmationUrl = regularPaymentsUrl
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
            ...(confirmationUrl ? { webAppUrl: confirmationUrl } : {
              callbackData: financeRegularPaymentConfirmCallback(
                input.regularPaymentId,
                input.expectedOccurrenceAt,
                input.configVersion,
              ),
            }),
          },
          ...(confirmationUrl
            ? [{ text: copy.changeAmount, webAppUrl: confirmationUrl }]
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
