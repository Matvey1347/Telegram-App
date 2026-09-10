import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertFinanceIdempotency } from '../assets/finance-asset-idempotency';
import {
  financeAccountAllocationLockKey,
  financeTransferSavingsLinkLockKey,
} from '../assets/finance-asset-locks';
import { financeSavingsMovementSelect } from './finance-savings-view';

type AllocationRow = {
  accountBalance: Prisma.Decimal;
  accountAllocated: Prisma.Decimal;
  goalAllocated: Prisma.Decimal;
};

@Injectable()
export class FinanceSavingsAllocationService {
  async lock(
    tx: Prisma.TransactionClient,
    profileId: string,
    accountId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${financeAccountAllocationLockKey(profileId, accountId)}, 0))`,
    );
  }

  async lockTransfer(
    tx: Prisma.TransactionClient,
    profileId: string,
    transferId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${financeTransferSavingsLinkLockKey(profileId, transferId)}, 0))`,
    );
  }

  async duplicate(
    tx: Prisma.TransactionClient,
    profileId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ) {
    const movement = await tx.financeSavingsMovement.findUnique({
      where: {
        profileId_idempotencyKey: { profileId, idempotencyKey },
      },
      select: {
        ...financeSavingsMovementSelect,
        requestFingerprint: true,
      },
    });
    if (!movement) return null;
    assertFinanceIdempotency(movement.requestFingerprint, requestFingerprint);
    return movement;
  }

  async validateTransfer(
    tx: Prisma.TransactionClient,
    input: {
      profileId: string;
      accountId: string;
      currency: string;
      kind: 'ALLOCATE' | 'RELEASE';
      amount: Prisma.Decimal;
      transferId?: string;
    },
  ) {
    if (!input.transferId) return;
    const transfer = await tx.financeTransfer.findFirst({
      where: {
        id: input.transferId,
        profileId: input.profileId,
        deletedAt: null,
      },
      select: {
        fromAccountId: true,
        toAccountId: true,
        fromAmount: true,
        toAmount: true,
        fromCurrency: true,
        toCurrency: true,
        _count: { select: { savingsMovements: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Finance transfer not found');
    const valid =
      input.kind === 'ALLOCATE'
        ? transfer.toAccountId === input.accountId &&
          transfer.toCurrency === input.currency &&
          transfer.toAmount.gte(input.amount)
        : transfer.fromAccountId === input.accountId &&
          transfer.fromCurrency === input.currency &&
          transfer.fromAmount.gte(input.amount);
    if (!valid)
      throw new BadRequestException('Transfer does not match this allocation');
    if (transfer._count.savingsMovements)
      throw new ConflictException(
        'Transfer is already linked to a savings movement',
      );
  }

  async state(
    tx: Prisma.TransactionClient,
    profileId: string,
    accountId: string,
    goalId: string,
  ) {
    const rows = await tx.$queryRaw<AllocationRow[]>(Prisma.sql`
      WITH signed AS (
        SELECT "accountId", "toGoalId" AS "goalId", amount
        FROM "FinanceSavingsMovement" WHERE "profileId" = ${profileId} AND "toGoalId" IS NOT NULL
        UNION ALL
        SELECT "accountId", "fromGoalId" AS "goalId", -amount
        FROM "FinanceSavingsMovement" WHERE "profileId" = ${profileId} AND "fromGoalId" IS NOT NULL
      )
      SELECT
        a."openingBalance"
          + COALESCE((SELECT SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE -t.amount END)
              FROM "FinanceTransaction" t WHERE t."profileId" = ${profileId}
                AND t."accountId" = a.id AND t."deletedAt" IS NULL), 0)
          - COALESCE((SELECT SUM(f."fromAmount") FROM "FinanceTransfer" f
              WHERE f."profileId" = ${profileId} AND f."fromAccountId" = a.id AND f."deletedAt" IS NULL), 0)
          + COALESCE((SELECT SUM(f."toAmount") FROM "FinanceTransfer" f
              WHERE f."profileId" = ${profileId} AND f."toAccountId" = a.id AND f."deletedAt" IS NULL), 0)
          AS "accountBalance",
        COALESCE((SELECT SUM(amount) FROM signed WHERE "accountId" = a.id), 0) AS "accountAllocated",
        COALESCE((SELECT SUM(amount) FROM signed WHERE "accountId" = a.id AND "goalId" = ${goalId}), 0) AS "goalAllocated"
      FROM "FinanceAccount" a WHERE a.id = ${accountId} AND a."profileId" = ${profileId}`);
    if (!rows[0]) throw new NotFoundException('Finance account not found');
    return {
      accountBalance: new Prisma.Decimal(rows[0].accountBalance),
      accountAllocated: new Prisma.Decimal(rows[0].accountAllocated),
      goalAllocated: new Prisma.Decimal(rows[0].goalAllocated),
    };
  }
}
