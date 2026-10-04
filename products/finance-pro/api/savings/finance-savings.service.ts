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
  FinanceSavingsAllocationDto,
  FinanceSavingsGoalInputDto,
  FinanceSavingsReallocationDto,
} from './finance-savings.dto';
import { FinanceSavingsReadService } from './finance-savings-read.service';
import {
  financeSavingsMovementSelect,
  financeSavingsMovementView,
} from './finance-savings-view';
import { FinanceSavingsAllocationService } from './finance-savings-allocation.service';
import {
  assertFinanceSavingsMovementStatus,
  assertFinanceSavingsReallocationStatus,
} from './finance-savings-rules';
import { FinanceSavingsGoalService } from './finance-savings-goal.service';

@Injectable()
export class FinanceSavingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
    private readonly reads: FinanceSavingsReadService,
    private readonly allocations: FinanceSavingsAllocationService,
    private readonly goalWriter: FinanceSavingsGoalService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  list(
    profileId: string,
    query: Parameters<FinanceSavingsReadService['list']>[1],
  ) {
    return this.reads.list(profileId, query);
  }
  goal(profileId: string, id: string) {
    return this.reads.goal(profileId, id);
  }
  history(
    profileId: string,
    id: string,
    query: Parameters<FinanceSavingsReadService['history']>[2],
  ) {
    return this.reads.history(profileId, id, query);
  }
  summary(profileId: string) {
    return this.reads.summary(profileId);
  }

  async create(profileId: string, input: FinanceSavingsGoalInputDto) {
    return this.goalWriter.create(profileId, input);
  }

  async update(
    profileId: string,
    id: string,
    input: FinanceSavingsGoalInputDto,
  ) {
    return this.goalWriter.update(profileId, id, input);
  }

  allocate(
    profileId: string,
    goalId: string,
    input: FinanceSavingsAllocationDto,
  ) {
    return this.writeMovement(profileId, 'ALLOCATE', goalId, input);
  }

  release(
    profileId: string,
    goalId: string,
    input: FinanceSavingsAllocationDto,
  ) {
    return this.writeMovement(profileId, 'RELEASE', goalId, input);
  }

  async reallocate(profileId: string, input: FinanceSavingsReallocationDto) {
    if (input.fromGoalId === input.toGoalId)
      throw new BadRequestException('Savings goals must be different');
    const amount = this.positive(input.amount, 'Allocation amount');
    const occurredAt = new Date(input.occurredAt);
    const fingerprint = financeRequestFingerprint({
      ...input,
      amount: amount.toString(),
    });
    const duplicate = await this.duplicate(
      profileId,
      input.idempotencyKey,
      fingerprint,
    );
    if (duplicate) return this.mutation(profileId, duplicate, true);
    const [profile, account, goals] = await Promise.all([
      this.ledger.profileContext(profileId),
      this.prisma.financeAccount.findFirst({
        where: { id: input.accountId, profileId, archivedAt: null },
        select: { id: true, currency: true },
      }),
      this.prisma.financeSavingsGoal.findMany({
        where: { profileId, id: { in: [input.fromGoalId, input.toGoalId] } },
        select: { id: true, currency: true, status: true, version: true },
      }),
    ]);
    if (!account) throw new NotFoundException('Finance account not found');
    if (goals.length !== 2)
      throw new NotFoundException('Savings goal not found');
    const source = goals.find((goal) => goal.id === input.fromGoalId)!;
    const destination = goals.find((goal) => goal.id === input.toGoalId)!;
    assertFinanceSavingsReallocationStatus(source.status, destination.status);
    if (goals.some((goal) => goal.currency !== account.currency))
      throw new BadRequestException('Goal and account currencies must match');
    const valuation = await financeValuationSnapshot(
      profile,
      account.currency,
      occurredAt,
      this.rateDependencies(),
    );
    const result = await this.prisma.$transaction(async (tx) => {
      await this.allocations.lock(tx, profileId, account.id);
      await this.assertActiveAccount(tx, profileId, account.id);
      const concurrentDuplicate = await this.allocations.duplicate(
        tx,
        profileId,
        input.idempotencyKey,
        fingerprint,
      );
      if (concurrentDuplicate)
        return { movement: concurrentDuplicate, duplicate: true };
      const allocation = await this.allocations.state(
        tx,
        profileId,
        account.id,
        input.fromGoalId,
      );
      if (allocation.goalAllocated.lt(amount))
        throw new ConflictException('Savings allocation is insufficient');
      for (const goal of goals) {
        const delta = goal.id === input.fromGoalId ? amount.neg() : amount;
        const changed = await tx.financeSavingsGoal.updateMany({
          where: {
            id: goal.id,
            profileId,
            status: goal.status,
            version: goal.version,
          },
          data: {
            currentAllocated: { increment: delta },
            linkedAllocated: { increment: delta },
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Savings goal changed concurrently');
      }
      const movement = await tx.financeSavingsMovement.create({
        data: {
          profileId,
          accountId: account.id,
          fromGoalId: input.fromGoalId,
          toGoalId: input.toGoalId,
          kind: 'REALLOCATE',
          amount,
          currency: account.currency,
          valuationCurrency: 'USD',
          amountInValuationCurrency: amount.mul(valuation.rate),
          exchangeRateToValuation: valuation.rate,
          valuationRateAt: valuation.rateAt,
          occurredAt,
          note: this.note(input.note),
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        },
        select: financeSavingsMovementSelect,
      });
      return { movement, duplicate: false };
    });
    return this.mutation(profileId, result.movement, result.duplicate);
  }

  complete(profileId: string, id: string) {
    return this.goalWriter.complete(profileId, id);
  }

  async archive(profileId: string, id: string) {
    return this.goalWriter.archive(profileId, id);
  }

  private async writeMovement(
    profileId: string,
    kind: 'ALLOCATE' | 'RELEASE',
    goalId: string,
    input: FinanceSavingsAllocationDto,
  ) {
    const amount = this.positive(input.amount, 'Allocation amount');
    const occurredAt = new Date(input.occurredAt);
    const fingerprint = financeRequestFingerprint({
      kind,
      goalId,
      ...input,
      amount: amount.toString(),
    });
    const duplicate = await this.duplicate(
      profileId,
      input.idempotencyKey,
      fingerprint,
    );
    if (duplicate) return this.mutation(profileId, duplicate, true);
    const [profile, account, goal] = await Promise.all([
      this.ledger.profileContext(profileId),
      this.prisma.financeAccount.findFirst({
        where: { id: input.accountId, profileId, archivedAt: null },
        select: { id: true, currency: true },
      }),
      this.prisma.financeSavingsGoal.findFirst({
        where: { id: goalId, profileId },
        select: { id: true, currency: true, status: true, version: true },
      }),
    ]);
    if (!account) throw new NotFoundException('Finance account not found');
    if (!goal) throw new NotFoundException('Savings goal not found');
    assertFinanceSavingsMovementStatus(kind, goal.status);
    if (goal.currency !== account.currency)
      throw new BadRequestException('Goal and account currencies must match');
    const valuation = await financeValuationSnapshot(
      profile,
      account.currency,
      occurredAt,
      this.rateDependencies(),
    );
    const result = await this.prisma.$transaction(async (tx) => {
      await this.allocations.lock(tx, profileId, account.id);
      await this.assertActiveAccount(tx, profileId, account.id);
      const concurrentDuplicate = await this.allocations.duplicate(
        tx,
        profileId,
        input.idempotencyKey,
        fingerprint,
      );
      if (concurrentDuplicate)
        return { movement: concurrentDuplicate, duplicate: true };
      if (input.linkedTransferId) {
        await this.allocations.lockTransfer(
          tx,
          profileId,
          input.linkedTransferId,
        );
        await this.allocations.validateTransfer(tx, {
          profileId,
          accountId: account.id,
          currency: account.currency,
          kind,
          amount,
          transferId: input.linkedTransferId,
        });
      }
      const allocation = await this.allocations.state(
        tx,
        profileId,
        account.id,
        goal.id,
      );
      if (
        kind === 'ALLOCATE' &&
        allocation.accountBalance.minus(allocation.accountAllocated).lt(amount)
      )
        throw new ConflictException('Account balance is already allocated');
      if (kind === 'RELEASE' && allocation.goalAllocated.lt(amount))
        throw new ConflictException('Savings allocation is insufficient');
      const delta = kind === 'ALLOCATE' ? amount : amount.neg();
      const changed = await tx.financeSavingsGoal.updateMany({
        where: {
          id: goal.id,
          profileId,
          status: goal.status,
          version: goal.version,
        },
        data: {
          currentAllocated: { increment: delta },
          linkedAllocated: { increment: delta },
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Savings goal changed concurrently');
      const movement = await tx.financeSavingsMovement.create({
        data: {
          profileId,
          accountId: account.id,
          ...(kind === 'ALLOCATE'
            ? { toGoalId: goal.id }
            : { fromGoalId: goal.id }),
          kind,
          amount,
          currency: account.currency,
          valuationCurrency: 'USD',
          amountInValuationCurrency: amount.mul(valuation.rate),
          exchangeRateToValuation: valuation.rate,
          valuationRateAt: valuation.rateAt,
          occurredAt,
          note: this.note(input.note),
          linkedTransferId: input.linkedTransferId || null,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        },
        select: financeSavingsMovementSelect,
      });
      return { movement, duplicate: false };
    });
    return this.mutation(profileId, result.movement, result.duplicate);
  }

  private async duplicate(profileId: string, key: string, fingerprint: string) {
    const movement = await this.prisma.financeSavingsMovement.findUnique({
      where: { profileId_idempotencyKey: { profileId, idempotencyKey: key } },
      select: { ...financeSavingsMovementSelect, requestFingerprint: true },
    });
    if (!movement) return null;
    assertFinanceIdempotency(movement.requestFingerprint, fingerprint);
    return movement;
  }

  private async mutation(
    profileId: string,
    movement: Parameters<typeof financeSavingsMovementView>[0],
    duplicate: boolean,
  ) {
    const ids = [movement.fromGoalId, movement.toGoalId].filter(
      Boolean,
    ) as string[];
    return {
      goals: await this.reads.goals(profileId, ids),
      movement: financeSavingsMovementView(movement),
      duplicate,
    };
  }

  private rateDependencies() {
    return {
      conversion: this.conversion,
      resolveWorkspaceId: async (profileId: string) =>
        (await this.ledger.profileContext(profileId)).workspaceId,
    };
  }

  private async assertActiveAccount(
    tx: Prisma.TransactionClient,
    profileId: string,
    accountId: string,
  ) {
    const account = await tx.financeAccount.findFirst({
      where: { id: accountId, profileId, archivedAt: null },
      select: { id: true },
    });
    if (!account) throw new ConflictException('Finance account was archived');
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
