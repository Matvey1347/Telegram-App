import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceTransactionSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { FinanceLedgerService } from '../../ledger/finance-ledger.service';
import {
  financeTransactionSelect,
  financeTransactionView,
} from '../../ledger/finance-transaction-view';
import type {
  FinanceApplyOccurrenceAmountDto,
  FinanceRegularPaymentConfirmDto,
} from '../finance-obligation.dto';
import { financeObligationProfile } from '../finance-obligation-context';
import { nextFinanceOccurrence } from '../finance-obligation-date';
import {
  financeRegularPaymentOccurrenceSelect,
  financeRegularPaymentOccurrenceView,
  financeRegularPaymentSelect,
  financeRegularPaymentView,
} from '../finance-obligation-view';
import { FinanceRegularPaymentDeliveryService } from './finance-regular-payment-delivery.service';
import { financeRegularPaymentRevisionData } from './finance-regular-payment-write';

@Injectable()
export class FinanceRegularPaymentConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
    private readonly deliveries: FinanceRegularPaymentDeliveryService,
  ) {}

  async confirm(
    profileId: string,
    id: string,
    input: FinanceRegularPaymentConfirmDto,
    source: FinanceTransactionSource = FinanceTransactionSource.MINI_APP,
  ) {
    const expectedOccurrenceAt = new Date(input.expectedOccurrenceAt);
    if (Number.isNaN(expectedOccurrenceAt.getTime()))
      throw new BadRequestException('Expected occurrence is invalid');
    const profileContext = await this.ledger.profileContext(profileId);
    const now = new Date();
    const preflight = await this.prisma.financeRecurringPayment.findFirst({
      where: { id, profileId },
      select: {
        status: true,
        currency: true,
        nextOccurrenceAt: true,
        version: true,
      },
    });
    if (!preflight)
      throw new NotFoundException('Finance regular payment not found');
    const rates =
      preflight.status === 'ACTIVE' &&
      preflight.version === input.expectedVersion &&
      preflight.nextOccurrenceAt.getTime() === expectedOccurrenceAt.getTime()
        ? await this.ledger.prepareTransactionRateSource(profileContext, [
            {
              currency: preflight.currency,
              occurredAt: now.toISOString(),
            },
          ])
        : null;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const regularPayment = await tx.financeRecurringPayment.findFirst({
          where: { id, profileId },
          select: financeRegularPaymentSelect,
        });
        if (!regularPayment)
          throw new NotFoundException('Finance regular payment not found');
        if (
          regularPayment.nextOccurrenceAt.getTime() !==
          expectedOccurrenceAt.getTime()
        ) {
          const duplicate = await this.duplicateInTransaction(
            tx,
            profileId,
            regularPayment,
            expectedOccurrenceAt,
          );
          if (duplicate)
            return {
              value: duplicate,
              scheduledAt: undefined,
              reschedule: false,
            };
          throw new ConflictException('Regular payment occurrence has changed');
        }
        if (regularPayment.version !== input.expectedVersion)
          throw new ConflictException('Regular payment version has changed');
        if (regularPayment.status !== 'ACTIVE')
          throw new ConflictException('Regular payment is not active');
        const paidAmount = input.amount
          ? new Prisma.Decimal(input.amount)
          : regularPayment.amount;
        if (!paidAmount.isFinite() || !paidAmount.isPositive())
          throw new BadRequestException('Paid amount must be positive');
        if (!rates)
          throw new ConflictException('Regular payment occurrence has changed');
        const transactionInput = {
          accountId: regularPayment.accountId,
          categoryId: regularPayment.categoryId ?? undefined,
          type: 'EXPENSE' as const,
          amount: paidAmount.toString(),
          description: regularPayment.name,
          necessity: regularPayment.necessity,
          occurredAt: now.toISOString(),
        };
        const writeContext = await this.ledger.prepareTransactionWriteContext(
          tx,
          profileContext.id,
          [transactionInput],
          rates,
        );
        const transaction = await this.ledger.createTransactionInTransaction(
          tx,
          profileContext,
          transactionInput,
          source,
          undefined,
          writeContext,
          { suppressMerchantMapping: true },
        );
        const occurrence = await tx.financeRecurringPaymentOccurrence.create({
          data: {
            profileId,
            recurringPaymentId: regularPayment.id,
            transactionId: transaction.id,
            configVersion: regularPayment.version,
            scheduledFor: expectedOccurrenceAt,
            scheduledAmount: regularPayment.amount,
            paidAmount,
            currency: regularPayment.currency,
          },
          select: financeRegularPaymentOccurrenceSelect,
        });
        const nextOccurrenceAt = nextFinanceOccurrence({
          current: expectedOccurrenceAt,
          recurrence: regularPayment.recurrence,
          anchorDay: regularPayment.anchorDay,
          anchorMonth: regularPayment.anchorMonth,
          timezone: regularPayment.scheduleTimezone,
        });
        const claimed = await tx.financeRecurringPayment.updateMany({
          where: {
            id,
            profileId,
            status: 'ACTIVE',
            version: regularPayment.version,
            nextOccurrenceAt: expectedOccurrenceAt,
          },
          data: { nextOccurrenceAt, version: { increment: 1 } },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Regular payment occurrence has changed');
        const advanced = await tx.financeRecurringPayment.findUniqueOrThrow({
          where: { id },
          select: financeRegularPaymentSelect,
        });
        const profile = await financeObligationProfile(tx, profileId);
        const delivery = await this.deliveries.replace(tx, profile, advanced);
        return {
          value: {
            regularPayment: financeRegularPaymentView(
              advanced,
              profile.timezone,
              now,
            ),
            occurrence: financeRegularPaymentOccurrenceView(occurrence),
            transaction,
            duplicate: false,
            futureAmountUpdateRequired: !paidAmount.equals(
              regularPayment.amount,
            ),
          },
          scheduledAt: delivery?.scheduledAt,
          reschedule: true,
        };
      });
      if (result.reschedule) {
        if (result.scheduledAt)
          await this.deliveries.reschedule(result.scheduledAt);
        else await this.deliveries.reschedule();
      }
      return result.value;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.duplicate(
          profileId,
          id,
          expectedOccurrenceAt,
        );
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }

  async applyFutureAmount(
    profileId: string,
    id: string,
    occurrenceId: string,
    input: FinanceApplyOccurrenceAmountDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const regularPayment = await tx.financeRecurringPayment.findFirst({
        where: { id, profileId },
        select: financeRegularPaymentSelect,
      });
      if (!regularPayment)
        throw new NotFoundException('Finance regular payment not found');
      const occurrence = await tx.financeRecurringPaymentOccurrence.findFirst({
        where: { id: occurrenceId, recurringPaymentId: id, profileId },
        select: financeRegularPaymentOccurrenceSelect,
      });
      if (!occurrence)
        throw new NotFoundException('Regular payment occurrence not found');
      const profile = await financeObligationProfile(tx, profileId);
      if (occurrence.futureAmountAppliedAt)
        return {
          value: financeRegularPaymentView(regularPayment, profile.timezone),
          scheduledAt: undefined,
          changed: false,
        };
      if (regularPayment.version !== input.expectedVersion)
        throw new ConflictException('Regular payment version has changed');
      if (regularPayment.amount.equals(occurrence.paidAmount))
        return {
          value: financeRegularPaymentView(regularPayment, profile.timezone),
          scheduledAt: undefined,
          changed: false,
        };
      const claimed = await tx.financeRecurringPayment.updateMany({
        where: { id, profileId, version: input.expectedVersion },
        data: {
          amount: occurrence.paidAmount,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Regular payment version has changed');
      const occurrenceClaim =
        await tx.financeRecurringPaymentOccurrence.updateMany({
          where: { id: occurrenceId, futureAmountAppliedAt: null },
          data: { futureAmountAppliedAt: new Date() },
        });
      if (occurrenceClaim.count !== 1)
        throw new ConflictException('Occurrence amount was already applied');
      const updated = await tx.financeRecurringPayment.findUniqueOrThrow({
        where: { id },
        select: financeRegularPaymentSelect,
      });
      await tx.financeRecurringPaymentRevision.create({
        data: financeRegularPaymentRevisionData(updated, 'AMOUNT_APPLIED'),
      });
      const delivery = await this.deliveries.replace(tx, profile, updated);
      return {
        value: financeRegularPaymentView(updated, profile.timezone),
        scheduledAt: delivery?.scheduledAt,
        changed: true,
      };
    });
    if (result.changed) {
      if (result.scheduledAt)
        await this.deliveries.reschedule(result.scheduledAt);
      else await this.deliveries.reschedule();
    }
    return result.value;
  }

  private async duplicate(
    profileId: string,
    id: string,
    expectedOccurrenceAt: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const regularPayment = await tx.financeRecurringPayment.findFirst({
        where: { id, profileId },
        select: financeRegularPaymentSelect,
      });
      if (!regularPayment) return null;
      return this.duplicateInTransaction(
        tx,
        profileId,
        regularPayment,
        expectedOccurrenceAt,
      );
    });
  }

  private async duplicateInTransaction(
    tx: Prisma.TransactionClient,
    profileId: string,
    regularPayment: Prisma.FinanceRecurringPaymentGetPayload<{
      select: typeof financeRegularPaymentSelect;
    }>,
    expectedOccurrenceAt: Date,
  ) {
    const occurrence = await tx.financeRecurringPaymentOccurrence.findUnique({
      where: {
        recurringPaymentId_scheduledFor: {
          recurringPaymentId: regularPayment.id,
          scheduledFor: expectedOccurrenceAt,
        },
      },
      select: financeRegularPaymentOccurrenceSelect,
    });
    if (!occurrence) return null;
    const [transaction, profile] = await Promise.all([
      tx.financeTransaction.findUnique({
        where: { id: occurrence.transactionId, profileId },
        select: financeTransactionSelect,
      }),
      tx.financeProfile.findUnique({
        where: { id: profileId },
        select: { timezone: true },
      }),
    ]);
    if (!transaction || !profile)
      throw new ConflictException('Confirmed occurrence is incomplete');
    return {
      regularPayment: financeRegularPaymentView(
        regularPayment,
        profile.timezone,
      ),
      occurrence: financeRegularPaymentOccurrenceView(occurrence),
      transaction: financeTransactionView(transaction),
      duplicate: true,
      futureAmountUpdateRequired:
        !occurrence.futureAmountAppliedAt &&
        !regularPayment.amount.equals(occurrence.paidAmount),
    };
  }
}
