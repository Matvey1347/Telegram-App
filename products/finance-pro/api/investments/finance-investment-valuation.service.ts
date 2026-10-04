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
import { financeValuationSnapshot } from '../ledger/finance-transaction-valuation';
import type { FinanceInvestmentValuationDto } from './finance-investment.dto';
import { FinanceInvestmentReadService } from './finance-investment-read.service';
import {
  financeInvestmentValuationSelect,
  financeInvestmentValuationView,
} from './finance-investment-view';

@Injectable()
export class FinanceInvestmentValuationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
    private readonly reads: FinanceInvestmentReadService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async lock(
    tx: Prisma.TransactionClient,
    profileId: string,
    investmentId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${profileId}:${investmentId}`}, 0))`,
    );
  }

  async record(
    profileId: string,
    investmentId: string,
    input: FinanceInvestmentValuationDto,
  ) {
    const value = new Prisma.Decimal(input.value);
    if (!value.isFinite() || value.isNegative())
      throw new BadRequestException('Investment value cannot be negative');
    const fingerprint = financeRequestFingerprint({
      investmentId,
      ...input,
      value: value.toString(),
    });
    const duplicate = await this.prisma.financeInvestmentValuation.findUnique({
      where: {
        profileId_idempotencyKey: {
          profileId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { ...financeInvestmentValuationSelect, requestFingerprint: true },
    });
    if (duplicate) {
      assertFinanceIdempotency(duplicate.requestFingerprint, fingerprint);
      return this.mutation(profileId, duplicate, true);
    }
    const [profile, investment] = await Promise.all([
      this.ledger.profileContext(profileId),
      this.prisma.financeInvestment.findFirst({
        where: { id: investmentId, profileId },
        select: { id: true, currency: true, status: true, startedAt: true },
      }),
    ]);
    if (!investment) throw new NotFoundException('Investment not found');
    if (investment.status !== 'ACTIVE')
      throw new ConflictException('Only active investments can be valued');
    const valuedAt = new Date(input.valuedAt);
    if (valuedAt < investment.startedAt)
      throw new BadRequestException('Valuation cannot precede the investment');
    const valuation = await financeValuationSnapshot(
      profile,
      investment.currency,
      valuedAt,
      {
        conversion: this.conversion,
        resolveWorkspaceId: async (id) =>
          (await this.ledger.profileContext(id)).workspaceId,
      },
    );
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, profileId, investmentId);
      const lockedInvestment = await tx.financeInvestment.findFirst({
        where: { id: investmentId, profileId, status: 'ACTIVE' },
        select: { startedAt: true },
      });
      if (!lockedInvestment)
        throw new ConflictException('Only active investments can be valued');
      if (valuedAt < lockedInvestment.startedAt)
        throw new BadRequestException(
          'Valuation cannot precede the investment',
        );
      const concurrentDuplicate =
        await tx.financeInvestmentValuation.findUnique({
          where: {
            profileId_idempotencyKey: {
              profileId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: {
            ...financeInvestmentValuationSelect,
            requestFingerprint: true,
          },
        });
      if (concurrentDuplicate) {
        assertFinanceIdempotency(
          concurrentDuplicate.requestFingerprint,
          fingerprint,
        );
        return { row: concurrentDuplicate, duplicate: true };
      }
      if (input.correctsValuationId) {
        const corrected = await tx.financeInvestmentValuation.findFirst({
          where: {
            id: input.correctsValuationId,
            profileId,
            investmentId,
            correctedBy: null,
          },
          select: { id: true },
        });
        if (!corrected)
          throw new ConflictException(
            'Valuation is missing or already corrected',
          );
      }
      const created = await tx.financeInvestmentValuation.create({
        data: {
          profileId,
          investmentId,
          value,
          currency: investment.currency,
          valuationCurrency: 'USD',
          amountInValuationCurrency: value.mul(valuation.rate),
          exchangeRateToValuation: valuation.rate,
          valuationRateAt: valuation.rateAt,
          valuedAt,
          note: input.note?.trim() || null,
          correctsValuationId: input.correctsValuationId || null,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        },
        select: financeInvestmentValuationSelect,
      });
      await this.refreshCurrent(tx, profileId, investmentId);
      return { row: created, duplicate: false };
    });
    return this.mutation(profileId, result.row, result.duplicate);
  }

  async appendClosing(
    tx: Prisma.TransactionClient,
    input: {
      profileId: string;
      investmentId: string;
      currency: string;
      closedAt: Date;
      idempotencyKey: string;
      requestFingerprint: string;
      rate: Prisma.Decimal;
      rateAt: Date;
    },
  ) {
    const valuation = await tx.financeInvestmentValuation.create({
      data: {
        profileId: input.profileId,
        investmentId: input.investmentId,
        value: 0,
        currency: input.currency,
        valuationCurrency: 'USD',
        amountInValuationCurrency: 0,
        exchangeRateToValuation: input.rate,
        valuationRateAt: input.rateAt,
        valuedAt: input.closedAt,
        note: 'Closing valuation',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
      },
      select: financeInvestmentValuationSelect,
    });
    await this.refreshCurrent(tx, input.profileId, input.investmentId);
    return valuation;
  }

  private async refreshCurrent(
    tx: Prisma.TransactionClient,
    profileId: string,
    investmentId: string,
  ) {
    const current = await tx.financeInvestmentValuation.findFirst({
      where: { profileId, investmentId, correctedBy: null },
      orderBy: [{ valuedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { value: true, amountInValuationCurrency: true, valuedAt: true },
    });
    await tx.financeInvestment.update({
      where: { id: investmentId },
      data: {
        currentValue: current?.value || 0,
        currentValueInValuationCurrency:
          current?.amountInValuationCurrency || 0,
        currentValuationAt: current?.valuedAt || null,
        version: { increment: 1 },
      },
    });
  }

  private async mutation(
    profileId: string,
    row: Parameters<typeof financeInvestmentValuationView>[0],
    duplicate: boolean,
  ) {
    return {
      investment: await this.reads.investment(profileId, row.investmentId),
      valuation: financeInvestmentValuationView(row),
      duplicate,
    };
  }
}
