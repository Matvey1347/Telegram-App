import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  assertFinanceIdempotency,
  financeRequestFingerprint,
} from '../assets/finance-asset-idempotency';
import { FinanceLedgerService } from '../ledger/finance-ledger.service';
import {
  financeRateDateForWrite,
  type FinanceProfileContext,
} from '../ledger/finance-transaction-valuation';
import type { FinanceInvestmentCashFlowDto } from './finance-investment.dto';
import { FinanceInvestmentReadService } from './finance-investment-read.service';
import { FinanceInvestmentValuationService } from './finance-investment-valuation.service';
import {
  financeInvestmentCashFlowSelect,
  financeInvestmentCashFlowView,
} from './finance-investment-view';

@Injectable()
export class FinanceInvestmentCashFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
    private readonly reads: FinanceInvestmentReadService,
    private readonly valuation: FinanceInvestmentValuationService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async record(
    profileId: string,
    investmentId: string,
    input: FinanceInvestmentCashFlowDto,
  ) {
    const amount = this.positive(input.amount, 'Cash flow amount');
    const fingerprint = financeRequestFingerprint({
      investmentId,
      ...input,
      amount: amount.toString(),
    });
    const duplicate = await this.prisma.financeInvestmentCashFlow.findUnique({
      where: {
        profileId_idempotencyKey: {
          profileId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { ...financeInvestmentCashFlowSelect, requestFingerprint: true },
    });
    if (duplicate) {
      assertFinanceIdempotency(duplicate.requestFingerprint, fingerprint);
      return this.mutation(profileId, duplicate, true);
    }
    const prepared = await this.prepare(profileId, investmentId, input);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.valuation.lock(tx, profileId, investmentId);
      const concurrentDuplicate = await tx.financeInvestmentCashFlow.findUnique(
        {
          where: {
            profileId_idempotencyKey: {
              profileId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: {
            ...financeInvestmentCashFlowSelect,
            requestFingerprint: true,
          },
        },
      );
      if (concurrentDuplicate) {
        assertFinanceIdempotency(
          concurrentDuplicate.requestFingerprint,
          fingerprint,
        );
        return { row: concurrentDuplicate, duplicate: true };
      }
      return {
        row: await this.writeInTransaction(
          tx,
          prepared,
          input,
          amount,
          fingerprint,
        ),
        duplicate: false,
      };
    });
    return this.mutation(profileId, result.row, result.duplicate);
  }

  async prepare(
    profileId: string,
    investmentId: string,
    input: FinanceInvestmentCashFlowDto,
  ) {
    const [profile, investment, account] = await Promise.all([
      this.ledger.profileContext(profileId),
      this.prisma.financeInvestment.findFirst({
        where: { id: investmentId, profileId },
        select: {
          id: true,
          name: true,
          currency: true,
          status: true,
          startedAt: true,
        },
      }),
      this.prisma.financeAccount.findFirst({
        where: { id: input.accountId, profileId, archivedAt: null },
        select: { id: true, currency: true },
      }),
    ]);
    if (!investment) throw new NotFoundException('Investment not found');
    if (!account) throw new NotFoundException('Finance account not found');
    if (investment.status !== 'ACTIVE')
      throw new ConflictException('Only active investments accept cash flows');
    const occurredAt = new Date(input.occurredAt);
    if (occurredAt < investment.startedAt)
      throw new BadRequestException('Cash flow cannot precede the investment');
    const [rates, investmentRate] = await Promise.all([
      this.ledger.prepareTransactionRateSource(profile, [
        { currency: account.currency, occurredAt: input.occurredAt },
      ]),
      this.exchangeRate(
        profile,
        account.currency,
        investment.currency,
        occurredAt,
      ),
    ]);
    return { profile, investment, account, rates, investmentRate };
  }

  async writeInTransaction(
    tx: Prisma.TransactionClient,
    prepared: Awaited<ReturnType<FinanceInvestmentCashFlowService['prepare']>>,
    input: FinanceInvestmentCashFlowDto,
    amount: Prisma.Decimal,
    requestFingerprint: string,
  ) {
    await this.valuation.lock(tx, prepared.profile.id, prepared.investment.id);
    const lockedInvestment = await tx.financeInvestment.findFirst({
      where: {
        id: prepared.investment.id,
        profileId: prepared.profile.id,
        status: 'ACTIVE',
      },
      select: { name: true, startedAt: true },
    });
    if (!lockedInvestment)
      throw new ConflictException('Only active investments accept cash flows');
    if (new Date(input.occurredAt) < lockedInvestment.startedAt)
      throw new BadRequestException('Cash flow cannot precede the investment');
    const transactionInput = {
      accountId: prepared.account.id,
      type:
        input.kind === 'CONTRIBUTION'
          ? ('EXPENSE' as const)
          : ('INCOME' as const),
      amount: amount.toString(),
      description: input.note?.trim() || lockedInvestment.name,
      occurredAt: input.occurredAt,
    };
    const context = await this.ledger.prepareTransactionWriteContext(
      tx,
      prepared.profile.id,
      [transactionInput],
      prepared.rates,
    );
    const transaction = await this.ledger.createTransactionInTransaction(
      tx,
      prepared.profile,
      transactionInput,
      'MINI_APP',
      undefined,
      context,
      {
        suppressMerchantMapping: true,
        purpose:
          input.kind === 'CONTRIBUTION'
            ? 'INVESTMENT_CONTRIBUTION'
            : 'INVESTMENT_RETURN',
      },
    );
    const baseAmount = amount
      .mul(prepared.investmentRate.rate)
      .toDecimalPlaces(8);
    const usdAmount = new Prisma.Decimal(transaction.valuationSnapshot!.amount);
    const created = await tx.financeInvestmentCashFlow.create({
      data: {
        profileId: prepared.profile.id,
        investmentId: prepared.investment.id,
        accountId: prepared.account.id,
        transactionId: transaction.id,
        kind: input.kind,
        amountInInvestmentCurrency: baseAmount,
        exchangeRateToInvestment: prepared.investmentRate.rate,
        investmentRateAt: prepared.investmentRate.rateAt,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        occurredAt: new Date(input.occurredAt),
        note: input.note?.trim() || null,
      },
      select: financeInvestmentCashFlowSelect,
    });
    const invested = input.kind === 'CONTRIBUTION';
    const changed = await tx.financeInvestment.updateMany({
      where: {
        id: prepared.investment.id,
        profileId: prepared.profile.id,
        status: 'ACTIVE',
      },
      data: {
        ...(invested
          ? {
              totalInvested: { increment: baseAmount },
              totalInvestedInValuationCurrency: { increment: usdAmount },
            }
          : {
              totalReturned: { increment: baseAmount },
              totalReturnedInValuationCurrency: { increment: usdAmount },
            }),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('Investment changed concurrently');
    return created;
  }

  private async mutation(
    profileId: string,
    row: Parameters<typeof financeInvestmentCashFlowView>[0],
    duplicate: boolean,
  ) {
    const cashFlow = financeInvestmentCashFlowView(row);
    return {
      investment: await this.reads.investment(profileId, row.investmentId),
      cashFlow,
      transaction: cashFlow.transaction,
      account: await this.ledger.account(profileId, row.accountId),
      duplicate,
    };
  }

  private async exchangeRate(
    profile: FinanceProfileContext,
    from: string,
    to: string,
    occurredAt: Date,
  ) {
    if (from === to) return { rate: new Prisma.Decimal(1), rateAt: occurredAt };
    if (!this.conversion || !profile.workspaceId)
      throw new BadRequestException({
        code: 'RATE_UNAVAILABLE',
        message: 'Exchange rate is unavailable',
      });
    const result = await this.conversion.getRateMetadata(
      from,
      to,
      profile.workspaceId,
      financeRateDateForWrite(occurredAt),
    );
    if (!result.available)
      throw new BadRequestException({
        code: result.code,
        message: result.message,
      });
    return { rate: new Prisma.Decimal(result.rate), rateAt: result.rateAt };
  }

  positive(value: string, field: string) {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || !amount.isPositive())
      throw new BadRequestException(`${field} must be positive`);
    return amount;
  }
}
