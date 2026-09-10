import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  type TelegramBotDeliveryWriterPort,
} from '../../../telegram-bots/core/telegram-bot-delivery-writer';
import {
  FINANCE_OBLIGATION_PRESENTATION,
  type FinanceObligationPresentationPort,
} from '../finance-obligation-presentation.port';
import {
  financeObligationDeliveryTarget,
  type FinanceObligationProfile,
} from '../finance-obligation-context';
import type { FinanceRegularPaymentRow } from './finance-regular-payment-write';

@Injectable()
export class FinanceRegularPaymentDeliveryService {
  constructor(
    @Inject(TELEGRAM_BOT_DELIVERY_WRITER)
    private readonly delivery: TelegramBotDeliveryWriterPort,
    @Inject(FINANCE_OBLIGATION_PRESENTATION)
    private readonly presentation: FinanceObligationPresentationPort,
  ) {}

  async replace(
    tx: Prisma.TransactionClient,
    profile: FinanceObligationProfile,
    regularPayment: FinanceRegularPaymentRow,
  ) {
    await this.delivery.cancelPendingInTransaction(tx, {
      financeRecurringPaymentId: regularPayment.id,
    });
    if (regularPayment.status !== 'ACTIVE') return null;
    return this.schedule(tx, profile, regularPayment);
  }

  async schedule(
    tx: Prisma.TransactionClient,
    profile: FinanceObligationProfile,
    regularPayment: FinanceRegularPaymentRow,
  ) {
    const target = financeObligationDeliveryTarget(profile);
    if (!target) return null;
    const message = this.presentation.regularPaymentDue({
      botIntegrationId: profile.botIntegrationId,
      regularPaymentId: regularPayment.id,
      name: regularPayment.name,
      amount: regularPayment.amount.toString(),
      currency: regularPayment.currency,
      expectedOccurrenceAt: regularPayment.nextOccurrenceAt,
      configVersion: regularPayment.version,
      locale: target.locale,
    });
    return this.delivery.enqueueInTransaction(tx, {
      ...target,
      financeRecurringPaymentId: regularPayment.id,
      message,
      scheduledAt: regularPayment.nextOccurrenceAt,
      idempotencyKey: `finance-regular:${regularPayment.id}:${regularPayment.version}:${regularPayment.nextOccurrenceAt.toISOString()}`,
    });
  }

  notify(scheduledAt: Date) {
    this.delivery.notify(scheduledAt);
  }

  reschedule(scheduledAt?: Date) {
    if (scheduledAt) this.delivery.notify(scheduledAt);
    return this.delivery.reschedule();
  }
}
