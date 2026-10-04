import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { financeAccountAllocationLockKey } from '../assets/finance-asset-locks';

type AccountArchivePrisma = Pick<
  Prisma.TransactionClient,
  | '$executeRaw'
  | '$queryRaw'
  | 'financeAccount'
  | 'financeDebt'
  | 'financeRecurringPayment'
>;

export async function assertFinanceAccountArchivable(
  prisma: Pick<PrismaService, 'financeDebt' | 'financeRecurringPayment'>,
  profileId: string,
  accountId: string,
) {
  const [openDebts, liveRegularPayments] = await Promise.all([
    prisma.financeDebt.count({
      where: { profileId, accountId, status: 'OPEN' },
    }),
    prisma.financeRecurringPayment.count({
      where: { profileId, accountId, status: { not: 'CANCELED' } },
    }),
  ]);
  if (openDebts || liveRegularPayments)
    throw new ConflictException(
      'Account is used by an open debt or regular payment',
    );
}

export async function archiveFinanceAccount(
  prisma: PrismaService,
  profileId: string,
  accountId: string,
) {
  return prisma.$transaction(async (tx) => {
    const client = tx as AccountArchivePrisma;
    await client.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${financeAccountAllocationLockKey(profileId, accountId)}, 0))`,
    );
    const account = await client.financeAccount.findFirst({
      where: { id: accountId, profileId, archivedAt: null },
      select: { id: true },
    });
    if (!account) return null;
    await assertFinanceAccountArchivable(client, profileId, account.id);
    const rows = await client.$queryRaw<Array<{ allocated: Prisma.Decimal }>>(
      Prisma.sql`
        SELECT COALESCE(SUM(CASE
          WHEN kind = 'ALLOCATE' THEN amount
          WHEN kind = 'RELEASE' THEN -amount
          ELSE 0
        END), 0) AS allocated
        FROM "FinanceSavingsMovement"
        WHERE "profileId" = ${profileId} AND "accountId" = ${accountId}`,
    );
    if (new Prisma.Decimal(rows[0]?.allocated || 0).gt(0))
      throw new ConflictException(
        'Release savings allocations before archiving this account',
      );
    return client.financeAccount.update({
      where: { id: account.id },
      data: { archivedAt: new Date() },
      select: { id: true },
    });
  });
}

export async function assertFinanceCategoryArchivable(
  prisma: PrismaService,
  profileId: string,
  categoryId: string,
) {
  const liveRegularPayments = await prisma.financeRecurringPayment.count({
    where: { profileId, categoryId, status: { not: 'CANCELED' } },
  });
  if (liveRegularPayments)
    throw new ConflictException('Category is used by a regular payment');
}
