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
import type {
  FinanceInvestmentCashFlowDto,
  FinanceInvestmentCloseDto,
  FinanceInvestmentInputDto,
  FinanceInvestmentUpdateDto,
  FinanceInvestmentValuationDto,
} from './finance-investment.dto';
import { FinanceInvestmentReadService } from './finance-investment-read.service';
import {
  financeInvestmentCashFlowSelect,
  financeInvestmentCashFlowView,
  financeInvestmentValuationSelect,
  financeInvestmentValuationView,
} from './finance-investment-view';
import { FinanceInvestmentValuationService } from './finance-investment-valuation.service';
import { FinanceInvestmentCashFlowService } from './finance-investment-cash-flow.service';

type InvestmentWriteRow = {
  currency: string;
  status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  startedAt: Date;
  currentValuationAt: Date | null;
};
type InvestmentListQuery = Parameters<FinanceInvestmentReadService['list']>[1];
type InvestmentCashFlowQuery = Parameters<
  FinanceInvestmentReadService['cashFlows']
>[2];
type InvestmentValuationQuery = Parameters<
  FinanceInvestmentReadService['valuations']
>[2];

@Injectable()
export class FinanceInvestmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
    private readonly reads: FinanceInvestmentReadService,
    private readonly valuationWriter: FinanceInvestmentValuationService,
    private readonly cashFlowWriter: FinanceInvestmentCashFlowService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  list(profileId: string, query: InvestmentListQuery) {
    return this.reads.list(profileId, query);
  }
  detail(profileId: string, id: string) {
    return this.reads.detail(profileId, id);
  }
  cashFlows(profileId: string, id: string, query: InvestmentCashFlowQuery) {
    return this.reads.cashFlows(profileId, id, query);
  }
  valuations(profileId: string, id: string, query: InvestmentValuationQuery) {
    return this.reads.valuations(profileId, id, query);
  }

  async create(profileId: string, input: FinanceInvestmentInputDto) {
    const row = await this.prisma.financeInvestment.create({
      data: {
        profileId,
        name: input.name.trim(),
        description: this.note(input.description),
        type: input.type,
        currency: input.currency.toUpperCase(),
        startedAt: new Date(input.startedAt),
      },
      select: { id: true },
    });
    return this.reads.investment(profileId, row.id);
  }

  async update(
    profileId: string,
    id: string,
    input: FinanceInvestmentUpdateDto,
  ) {
    const startedAt = new Date(input.startedAt);
    await this.prisma.$transaction(async (tx) => {
      await this.valuationWriter.lock(tx, profileId, id);
      const [existing, firstCashFlow, firstValuation] = await Promise.all([
        tx.financeInvestment.findFirst({
          where: { id, profileId },
          select: { status: true, version: true, closedAt: true },
        }),
        tx.financeInvestmentCashFlow.findFirst({
          where: { profileId, investmentId: id },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: { occurredAt: true },
        }),
        tx.financeInvestmentValuation.findFirst({
          where: { profileId, investmentId: id },
          orderBy: [{ valuedAt: 'asc' }, { id: 'asc' }],
          select: { valuedAt: true },
        }),
      ]);
      if (!existing) throw new NotFoundException('Investment not found');
      if (existing.status === 'ARCHIVED')
        throw new ConflictException('Archived investment cannot be changed');
      const firstHistoryAt = [
        firstCashFlow?.occurredAt,
        firstValuation?.valuedAt,
        existing.closedAt,
      ]
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => left.getTime() - right.getTime())[0];
      if (firstHistoryAt && startedAt > firstHistoryAt)
        throw new BadRequestException(
          'Investment start cannot follow its existing history',
        );
      const changed = await tx.financeInvestment.updateMany({
        where: {
          id,
          profileId,
          status: existing.status,
          version: existing.version,
        },
        data: {
          name: input.name.trim(),
          description: this.note(input.description),
          type: input.type,
          startedAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Investment changed concurrently');
    });
    return this.reads.investment(profileId, id);
  }

  async recordCashFlow(
    profileId: string,
    investmentId: string,
    input: FinanceInvestmentCashFlowDto,
  ) {
    return this.cashFlowWriter.record(profileId, investmentId, input);
  }

  async recordValuation(
    profileId: string,
    investmentId: string,
    input: FinanceInvestmentValuationDto,
  ) {
    return this.valuationWriter.record(profileId, investmentId, input);
  }

  async close(
    profileId: string,
    investmentId: string,
    input: FinanceInvestmentCloseDto,
  ) {
    const closedAt = new Date(input.closedAt);
    const closeFingerprint = financeRequestFingerprint({
      investmentId,
      ...input,
    });
    const zeroKey = `${input.idempotencyKey}:zero`;
    const duplicate = await this.prisma.financeInvestmentValuation.findUnique({
      where: {
        profileId_idempotencyKey: { profileId, idempotencyKey: zeroKey },
      },
      select: { ...financeInvestmentValuationSelect, requestFingerprint: true },
    });
    if (duplicate) {
      assertFinanceIdempotency(duplicate.requestFingerprint, closeFingerprint);
      const cashFlow = await this.prisma.financeInvestmentCashFlow.findUnique({
        where: {
          profileId_idempotencyKey: {
            profileId,
            idempotencyKey: `${input.idempotencyKey}:return`,
          },
        },
        select: financeInvestmentCashFlowSelect,
      });
      return this.closeMutation(
        profileId,
        investmentId,
        duplicate,
        cashFlow,
        true,
      );
    }
    const investment = await this.investmentForWrite(profileId, investmentId);
    if (investment.status !== 'ACTIVE')
      throw new ConflictException('Only active investments can be closed');
    if (
      closedAt < investment.startedAt ||
      (investment.currentValuationAt &&
        closedAt < investment.currentValuationAt)
    )
      throw new BadRequestException(
        'Closing date cannot precede the investment or its current valuation',
      );
    const profile = await this.ledger.profileContext(profileId);
    const zeroRate = await financeValuationSnapshot(
      profile,
      investment.currency,
      closedAt,
      this.rateDependencies(),
    );
    const finalInput = input.finalReturn
      ? ({
          ...input.finalReturn,
          kind: 'RETURN' as const,
          occurredAt: input.closedAt,
          idempotencyKey: `${input.idempotencyKey}:return`,
        } satisfies FinanceInvestmentCashFlowDto)
      : null;
    const prepared = finalInput
      ? await this.cashFlowWriter.prepare(profileId, investmentId, finalInput)
      : null;
    const result = await this.prisma.$transaction(async (tx) => {
      await this.valuationWriter.lock(tx, profileId, investmentId);
      const concurrentDuplicate =
        await tx.financeInvestmentValuation.findUnique({
          where: {
            profileId_idempotencyKey: {
              profileId,
              idempotencyKey: zeroKey,
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
          closeFingerprint,
        );
        const cashFlow = await tx.financeInvestmentCashFlow.findUnique({
          where: {
            profileId_idempotencyKey: {
              profileId,
              idempotencyKey: `${input.idempotencyKey}:return`,
            },
          },
          select: financeInvestmentCashFlowSelect,
        });
        return {
          cashFlow,
          valuation: concurrentDuplicate,
          duplicate: true,
        };
      }
      const [lockedInvestment, latestCashFlow] = await Promise.all([
        tx.financeInvestment.findFirst({
          where: { id: investmentId, profileId },
          select: {
            status: true,
            startedAt: true,
            currentValuationAt: true,
          },
        }),
        tx.financeInvestmentCashFlow.findFirst({
          where: { profileId, investmentId },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          select: { occurredAt: true },
        }),
      ]);
      if (!lockedInvestment || lockedInvestment.status !== 'ACTIVE')
        throw new ConflictException('Only active investments can be closed');
      if (
        closedAt < lockedInvestment.startedAt ||
        (lockedInvestment.currentValuationAt &&
          closedAt < lockedInvestment.currentValuationAt) ||
        (latestCashFlow && closedAt < latestCashFlow.occurredAt)
      )
        throw new BadRequestException(
          'Closing date cannot precede the investment or its history',
        );
      const cashFlow =
        finalInput && prepared
          ? await this.cashFlowWriter.writeInTransaction(
              tx,
              prepared,
              finalInput,
              this.positive(finalInput.amount, 'Final return'),
              financeRequestFingerprint({ investmentId, ...finalInput }),
            )
          : null;
      const valuation = await this.valuationWriter.appendClosing(tx, {
        profileId,
        investmentId,
        currency: investment.currency,
        closedAt,
        idempotencyKey: zeroKey,
        requestFingerprint: closeFingerprint,
        rate: zeroRate.rate,
        rateAt: zeroRate.rateAt,
      });
      const changed = await tx.financeInvestment.updateMany({
        where: { id: investmentId, profileId, status: 'ACTIVE' },
        data: { status: 'CLOSED', closedAt, version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException('Investment changed concurrently');
      return { cashFlow, valuation, duplicate: false };
    });
    return this.closeMutation(
      profileId,
      investmentId,
      result.valuation,
      result.cashFlow,
      result.duplicate,
    );
  }

  async archive(profileId: string, investmentId: string) {
    const investment = await this.investmentForWrite(profileId, investmentId);
    if (investment.status === 'ARCHIVED')
      return this.reads.investment(profileId, investmentId);
    if (investment.status !== 'CLOSED')
      throw new ConflictException('Close the investment before archiving it');
    await this.prisma.financeInvestment.update({
      where: { id: investmentId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return this.reads.investment(profileId, investmentId);
  }

  private async investmentForWrite(
    profileId: string,
    id: string,
  ): Promise<InvestmentWriteRow> {
    const row = await this.prisma.financeInvestment.findFirst({
      where: { id, profileId },
      select: {
        currency: true,
        status: true,
        startedAt: true,
        currentValuationAt: true,
      },
    });
    if (!row) throw new NotFoundException('Investment not found');
    return row;
  }

  private rateDependencies() {
    return {
      conversion: this.conversion,
      resolveWorkspaceId: async (profileId: string) =>
        (await this.ledger.profileContext(profileId)).workspaceId,
    };
  }

  private async closeMutation(
    profileId: string,
    investmentId: string,
    valuation: Parameters<typeof financeInvestmentValuationView>[0],
    cashFlow: Parameters<typeof financeInvestmentCashFlowView>[0] | null,
    duplicate: boolean,
  ) {
    const cashFlowView = cashFlow
      ? financeInvestmentCashFlowView(cashFlow)
      : null;
    return {
      investment: await this.reads.investment(profileId, investmentId),
      cashFlow: cashFlowView,
      valuation: financeInvestmentValuationView(valuation),
      transaction: cashFlowView?.transaction || null,
      account: cashFlow
        ? await this.ledger.account(profileId, cashFlow.accountId)
        : null,
      duplicate,
    };
  }

  private positive(value: string, field: string) {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || !amount.isPositive())
      throw new BadRequestException(`${field} must be positive`);
    return amount;
  }

  private note(value?: string | null) {
    return value?.trim() || null;
  }
}
