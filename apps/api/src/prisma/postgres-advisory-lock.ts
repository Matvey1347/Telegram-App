import { Prisma } from '@prisma/client';

type AdvisoryLockClient = Pick<Prisma.TransactionClient, '$executeRaw'>;

/**
 * Uses executeRaw because pg_advisory_xact_lock returns PostgreSQL `void`,
 * which Prisma's query result decoder cannot deserialize.
 */
export async function acquirePostgresTransactionLock(
  tx: AdvisoryLockClient,
  key: string,
) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}
