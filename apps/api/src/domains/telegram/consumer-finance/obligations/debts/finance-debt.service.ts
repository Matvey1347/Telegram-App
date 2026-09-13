import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  type TelegramBotDeliveryWriterPort,
} from '../../../telegram-bots/core/telegram-bot-delivery-writer';
import { FinanceLedgerService } from '../../ledger/finance-ledger.service';
import {
  financeTransactionSelect,
  financeTransactionView,
} from '../../ledger/finance-transaction-view';
import {
  FINANCE_OBLIGATION_PRESENTATION,
  type FinanceObligationPresentationPort,
} from '../finance-obligation-presentation.port';
import type {
  FinanceDebtInputDto,
  FinanceDebtQueryDto,
  FinanceSharedExpenseInputDto,
} from '../finance-obligation.dto';
import {
  financeObligationDeliveryTarget,
  financeObligationProfile,
} from '../finance-obligation-context';
import { financeObligationDate } from '../finance-obligation-date';
import { financeDebtSelect, financeDebtView } from '../finance-obligation-view';

@Injectable()
export class FinanceDebtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
    @Inject(TELEGRAM_BOT_DELIVERY_WRITER)
    private readonly delivery: TelegramBotDeliveryWriterPort,
    @Inject(FINANCE_OBLIGATION_PRESENTATION)
    private readonly presentation: FinanceObligationPresentationPort,
  ) {}

  async list(profileId: string, query: FinanceDebtQueryDto) {
    const limit = query.limit ?? 30;
    const [profile, rows] = await Promise.all([
      this.prisma.financeProfile.findUnique({
        where: { id: profileId },
        select: { timezone: true },
      }),
      this.prisma.financeDebt.findMany({
        where: { profileId, ...(query.status ? { status: query.status } : {}) },
        select: financeDebtSelect,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        cursor: query.cursor ? { id: query.cursor } : undefined,
        skip: query.cursor ? 1 : 0,
        take: limit + 1,
      }),
    ]);
    if (!profile) throw new NotFoundException('Finance profile not found');
    const hasMore = rows.length > limit;
    const items = rows
      .slice(0, limit)
      .map((row) => financeDebtView(row, profile.timezone));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async create(profileId: string, input: FinanceDebtInputDto) {
    const amount = this.amount(input.amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const [profile, account] = await Promise.all([
        financeObligationProfile(tx, profileId),
        tx.financeAccount.findFirst({
          where: { id: input.accountId, profileId, archivedAt: null },
          select: { id: true, currency: true },
        }),
      ]);
      if (!account) throw new NotFoundException('Finance account not found');
      const dueAt = financeObligationDate(input.dueDate, profile.timezone);
      const debt = await tx.financeDebt.create({
        data: {
          profileId,
          accountId: account.id,
          direction: input.direction,
          name: this.name(input.name),
          amount,
          currency: account.currency,
          dueAt,
          scheduleTimezone: profile.timezone,
          note: this.note(input.note),
        },
        select: financeDebtSelect,
      });
      const scheduledAt = await this.schedule(tx, profile, debt);
      return {
        value: financeDebtView(debt, profile.timezone),
        scheduledAt,
      };
    });
    if (result.scheduledAt) this.delivery.notify(result.scheduledAt);
    return result.value;
  }

  async createSharedExpense(
    profileId: string,
    input: FinanceSharedExpenseInputDto,
  ) {
    const total = this.amount(input.amount);
    const ownShare = this.nonNegativeAmount(input.ownShare, 'Own share');
    const participants = input.participants.map((participant) => ({
      ...participant,
      name: this.name(participant.name),
      amountValue: this.amount(participant.amount),
    }));
    const allocated = participants.reduce(
      (sum, participant) => sum.plus(participant.amountValue),
      ownShare,
    );
    if (!allocated.equals(total))
      throw new BadRequestException(
        'Own share and participant debts must equal the paid amount',
      );

    const [profile, account] = await Promise.all([
      this.ledger.profileContext(profileId),
      this.prisma.financeAccount.findFirst({
        where: { id: input.accountId, profileId, archivedAt: null },
        select: { id: true, currency: true },
      }),
    ]);
    if (!account) throw new NotFoundException('Finance account not found');
    const rates = await this.ledger.prepareTransactionRateSource(profile, [
      { currency: account.currency, occurredAt: input.occurredAt },
    ]);
    const result = await this.prisma.$transaction(async (tx) => {
      const obligationProfile = await financeObligationProfile(tx, profileId);
      const transactionInput = {
        accountId: input.accountId,
        categoryId: input.categoryId,
        type: 'EXPENSE' as const,
        amount: total.toString(),
        economicAmount: ownShare.toString(),
        necessity: input.necessity,
        description: input.description,
        occurredAt: input.occurredAt,
      };
      const writeContext = await this.ledger.prepareTransactionWriteContext(
        tx,
        profileId,
        [transactionInput],
        rates,
      );
      const transaction = await this.ledger.createTransactionInTransaction(
        tx,
        profile,
        transactionInput,
        'MINI_APP',
        undefined,
        writeContext,
      );
      const debts: Array<ReturnType<typeof financeDebtView>> = [];
      const scheduledAt: Date[] = [];
      for (const participant of participants) {
        const debt = await tx.financeDebt.create({
          data: {
            profileId,
            accountId: account.id,
            direction: 'OWED_TO_ME',
            name: participant.name,
            amount: participant.amountValue,
            currency: account.currency,
            dueAt: financeObligationDate(
              participant.dueDate,
              obligationProfile.timezone,
            ),
            scheduleTimezone: obligationProfile.timezone,
            note: input.description?.trim() || null,
            originTransactionId: transaction.id,
          },
          select: financeDebtSelect,
        });
        const schedule = await this.schedule(tx, obligationProfile, debt);
        if (schedule) scheduledAt.push(schedule);
        debts.push(financeDebtView(debt, obligationProfile.timezone));
      }
      return { transaction, debts, scheduledAt };
    });
    const nextSchedule = result.scheduledAt.sort(
      (left, right) => left.getTime() - right.getTime(),
    )[0];
    if (nextSchedule) this.delivery.notify(nextSchedule);
    return { transaction: result.transaction, debts: result.debts };
  }

  async update(profileId: string, id: string, input: FinanceDebtInputDto) {
    const amount = this.amount(input.amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeDebt.findFirst({
        where: { id, profileId },
        select: financeDebtSelect,
      });
      if (!existing) throw new NotFoundException('Finance debt not found');
      if (existing.status !== 'OPEN')
        throw new ConflictException('Settled debt cannot be changed');
      const [profile, account] = await Promise.all([
        financeObligationProfile(tx, profileId),
        tx.financeAccount.findFirst({
          where: {
            id: input.accountId,
            profileId,
            ...(input.accountId === existing.accountId
              ? {}
              : { archivedAt: null }),
          },
          select: { id: true, currency: true },
        }),
      ]);
      if (!account) throw new NotFoundException('Finance account not found');
      const dueAt = financeObligationDate(input.dueDate, profile.timezone);
      const values = {
        direction: input.direction,
        name: this.name(input.name),
        amount,
        accountId: account.id,
        currency: account.currency,
        dueAt,
        scheduleTimezone: profile.timezone,
        note: this.note(input.note),
      };
      if (this.same(existing, values)) {
        return {
          value: financeDebtView(existing, profile.timezone),
          scheduledAt: null,
          reschedule: false,
        };
      }
      const claimed = await tx.financeDebt.updateMany({
        where: { id, profileId, status: 'OPEN', version: existing.version },
        data: { ...values, version: { increment: 1 } },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Finance debt changed concurrently');
      const debt = await tx.financeDebt.findUniqueOrThrow({
        where: { id },
        select: financeDebtSelect,
      });
      await this.delivery.cancelPendingInTransaction(tx, {
        financeDebtId: debt.id,
      });
      const scheduledAt = await this.schedule(tx, profile, debt);
      return {
        value: financeDebtView(debt, profile.timezone),
        scheduledAt,
        reschedule: true,
      };
    });
    if (result.reschedule) {
      if (result.scheduledAt) this.delivery.notify(result.scheduledAt);
      await this.delivery.reschedule();
    }
    return result.value;
  }

  async settle(profileId: string, id: string) {
    const profile = await this.ledger.profileContext(profileId);
    const now = new Date();
    const preflight = await this.prisma.financeDebt.findFirst({
      where: { id, profileId },
      select: { status: true, currency: true },
    });
    if (!preflight) throw new NotFoundException('Finance debt not found');
    const rates =
      preflight.status === 'OPEN'
        ? await this.ledger.prepareTransactionRateSource(profile, [
            {
              currency: preflight.currency,
              occurredAt: now.toISOString(),
            },
          ])
        : null;
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeDebt.findFirst({
        where: { id, profileId },
        select: financeDebtSelect,
      });
      if (!existing) throw new NotFoundException('Finance debt not found');
      if (existing.status === 'SETTLED') {
        if (!existing.settlementTransactionId)
          throw new ConflictException('Debt settlement is incomplete');
        const transaction = await tx.financeTransaction.findUnique({
          where: { id: existing.settlementTransactionId },
          select: financeTransactionSelect,
        });
        if (!transaction)
          throw new ConflictException('Debt settlement transaction is missing');
        return {
          value: {
            debt: financeDebtView(existing, profile.timezone ?? 'UTC', now),
            transaction: financeTransactionView(transaction),
            duplicate: true,
          },
          reschedule: false,
        };
      }
      const transactionInput = {
        accountId: existing.accountId,
        type:
          existing.direction === 'I_OWE'
            ? ('EXPENSE' as const)
            : ('INCOME' as const),
        amount: existing.amount.toString(),
        description: existing.name,
        occurredAt: now.toISOString(),
      };
      if (!rates)
        throw new ConflictException('Debt settlement state has changed');
      const writeContext = await this.ledger.prepareTransactionWriteContext(
        tx,
        profile.id,
        [transactionInput],
        rates,
      );
      const transaction = await this.ledger.createTransactionInTransaction(
        tx,
        profile,
        transactionInput,
        'MINI_APP',
        undefined,
        writeContext,
        {
          suppressMerchantMapping: true,
          purpose:
            existing.direction === 'I_OWE' ? 'DEBT_REPAYMENT' : 'REIMBURSEMENT',
        },
      );
      const claimed = await tx.financeDebt.updateMany({
        where: { id, profileId, status: 'OPEN', version: existing.version },
        data: {
          status: 'SETTLED',
          settledAt: now,
          settlementTransactionId: transaction.id,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Finance debt changed concurrently');
      const debt = await tx.financeDebt.findUniqueOrThrow({
        where: { id },
        select: financeDebtSelect,
      });
      await this.delivery.cancelPendingInTransaction(tx, { financeDebtId: id });
      return {
        value: {
          debt: financeDebtView(debt, profile.timezone ?? 'UTC', now),
          transaction,
          duplicate: false,
        },
        reschedule: true,
      };
    });
    if (result.reschedule) await this.delivery.reschedule();
    return result.value;
  }

  private async schedule(
    tx: Prisma.TransactionClient,
    profile: Awaited<ReturnType<typeof financeObligationProfile>>,
    debt: Prisma.FinanceDebtGetPayload<{ select: typeof financeDebtSelect }>,
  ) {
    const target = financeObligationDeliveryTarget(profile);
    if (!target) return null;
    const message = this.presentation.debtDue({
      botIntegrationId: profile.botIntegrationId,
      debtName: debt.name,
      amount: debt.amount.toString(),
      currency: debt.currency,
      locale: target.locale,
    });
    const delivery = await this.delivery.enqueueInTransaction(tx, {
      ...target,
      financeDebtId: debt.id,
      message,
      scheduledAt: debt.dueAt,
      idempotencyKey: `finance-debt:${debt.id}:${debt.version}:${debt.dueAt.toISOString()}`,
    });
    return delivery.scheduledAt;
  }

  private amount(value: string) {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || !amount.isPositive())
      throw new BadRequestException('Debt amount must be positive');
    return amount;
  }

  private nonNegativeAmount(value: string, label: string) {
    try {
      const amount = new Prisma.Decimal(value);
      if (!amount.isFinite() || amount.isNegative()) throw new Error();
      return amount;
    } catch {
      throw new BadRequestException(`${label} must be zero or positive`);
    }
  }

  private name(value: string) {
    const name = value.trim();
    if (!name) throw new BadRequestException('Debt name is required');
    return name;
  }

  private note(value?: string | null) {
    return value?.trim() || null;
  }

  private same(
    existing: Prisma.FinanceDebtGetPayload<{
      select: typeof financeDebtSelect;
    }>,
    values: {
      direction: FinanceDebtInputDto['direction'];
      name: string;
      amount: Prisma.Decimal;
      accountId: string;
      currency: string;
      dueAt: Date;
      scheduleTimezone: string;
      note: string | null;
    },
  ) {
    return (
      existing.direction === values.direction &&
      existing.name === values.name &&
      existing.amount.equals(values.amount) &&
      existing.accountId === values.accountId &&
      existing.currency === values.currency &&
      existing.dueAt.getTime() === values.dueAt.getTime() &&
      existing.scheduleTimezone === values.scheduleTimezone &&
      existing.note === values.note
    );
  }
}
