import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type AiOperation } from '@prisma/client';
import { writeAiRollup } from './ai-rollup';
import { budgetPeriods } from './ai-pricing';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';

// Identity is the existing workspace/operationId unique key, never a copied row ID.
function receipt(operation: AiOperation) {
  const { id, workspaceId, source, expiresAt, ...financialReceipt } = operation;
  void id;
  void workspaceId;
  void source;
  void expiresAt;
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  };
  return JSON.stringify(
    canonical(JSON.parse(JSON.stringify(financialReceipt))),
  );
}

export async function syncAiOperation(
  local: PrismaClient,
  production: PrismaClient,
  operation: AiOperation,
  targetWorkspaceId: string,
) {
  if (operation.source !== 'LOCAL_UNSYNCED')
    throw new Error('Expected LOCAL_UNSYNCED receipt');
  if (
    !['SUCCEEDED', 'FAILED', 'RECONCILED', 'UNKNOWN'].includes(operation.status)
  )
    throw new Error(
      'Unresolved AI operation must be settled before synchronization',
    );
  const inserted = await production.$transaction(
    async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `internal-ai:${targetWorkspaceId}`,
      );
      const existing = await tx.aiOperation.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: targetWorkspaceId,
            operationId: operation.operationId,
          },
        },
      });
      if (existing) {
        if (receipt(existing) === receipt(operation)) {
          // An existing production receipt may be an exact replay. Pin its evidence
          // so a lost local acknowledgement cannot outlive normal 90-day retention.
          if (
            existing.source === 'PRODUCTION' &&
            existing.expiresAt.getUTCFullYear() < 9999
          )
            await tx.aiOperation.update({
              where: { id: existing.id },
              data: { expiresAt: new Date('9999-01-01T00:00:00Z') },
            });
          return false;
        }
        if (!canReconcileAiReceipt(existing, operation))
          throw new Error(
            'Conflicting production AI receipt; no acknowledgement written',
          );
        await writeAiRollup(tx, existing, -1);
        await importBudgetDelta(tx, existing, -1);
        const { id, workspaceId, source, ...changes } = operation;
        void id;
        void workspaceId;
        void source;
        const updated = await tx.aiOperation.update({
          where: { id: existing.id },
          data: {
            ...changes,
            configurationSnapshot:
              changes.configurationSnapshot ?? Prisma.JsonNull,
            pricingSnapshot: changes.pricingSnapshot ?? Prisma.JsonNull,
          },
        });
        await writeAiRollup(tx, updated);
        await importBudgetDelta(tx, updated, 1);
        return false;
      }
      const { id, workspaceId, source, ...data } = operation;
      void id;
      void workspaceId;
      void source;
      const imported = await tx.aiOperation.create({
        data: {
          ...data,
          id: randomUUID(),
          workspaceId: targetWorkspaceId,
          source: 'LOCAL_SYNCED',
          configurationSnapshot: data.configurationSnapshot ?? Prisma.JsonNull,
          pricingSnapshot: data.pricingSnapshot ?? Prisma.JsonNull,
        },
      });
      await writeAiRollup(tx, imported);
      await importBudgetDelta(tx, imported, 1);
      return true;
    },
    { timeout: 30_000 },
  );
  // A lost acknowledgement is recoverable: next run verifies the receipt and skips aggregates.
  await local.$transaction(async (tx) => {
    await acquirePostgresTransactionLock(
      tx,
      `internal-ai:${operation.workspaceId}`,
    );
    const fresh = await tx.aiOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    if (fresh.source === 'LOCAL_SYNCED') return;
    if (
      fresh.source !== 'LOCAL_UNSYNCED' ||
      receipt(fresh) !== receipt(operation)
    )
      throw new Error(
        'Local receipt changed after production commit; retry after reconciliation',
      );
    await writeAiRollup(tx, fresh, -1);
    const synced = await tx.aiOperation.update({
      where: { id: fresh.id },
      data: { source: 'LOCAL_SYNCED' },
    });
    await writeAiRollup(tx, synced);
  });
  return inserted;
}

export async function resolveAiSyncWorkspace(
  local: PrismaClient,
  production: PrismaClient,
  id: string,
  mappedId = id,
) {
  const [left, right] = await Promise.all([
    local.workspace.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        members: {
          where: { role: 'owner' },
          select: { user: { select: { email: true } } },
        },
      },
    }),
    production.workspace.findUniqueOrThrow({
      where: { id: mappedId },
      select: {
        id: true,
        name: true,
        members: {
          where: { role: 'owner' },
          select: { user: { select: { email: true } } },
        },
      },
    }),
  ]);
  const owners = new Set(
    left.members.map((member) => member.user.email.toLowerCase()),
  );
  if (
    left.name !== right.name ||
    !right.members.some((member) => owners.has(member.user.email.toLowerCase()))
  )
    throw new Error(
      'Workspace identity mismatch; provide and review an explicit workspace mapping',
    );
  return right.id;
}

export const sameAiReceipt = (left: AiOperation, right: AiOperation) =>
  receipt(left) === receipt(right);

async function importBudgetDelta(
  tx: Prisma.TransactionClient,
  operation: AiOperation,
  direction: 1 | -1,
) {
  const spentDelta = (
    operation.status === 'UNKNOWN'
      ? new Prisma.Decimal(0)
      : (operation.actualCost ?? new Prisma.Decimal(0))
  ).mul(direction);
  const reservedDelta =
    operation.status === 'UNKNOWN'
      ? operation.reservedCost.mul(direction)
      : new Prisma.Decimal(0);
  const targetWorkspaceId = operation.workspaceId;
  for (const scope of [
    'WORKSPACE',
    operation.category,
    ...(operation.aiPostingChannelId
      ? [`TELEGRAM_CHANNEL:${operation.aiPostingChannelId}`]
      : []),
  ]) {
    for (const period of budgetPeriods(operation.createdAt)) {
      const key = {
        workspaceId: targetWorkspaceId,
        scope,
        period: period.period,
        periodStart: period.periodStart,
      };
      if (direction === -1) {
        await tx.aiBudgetPeriod.update({
          where: { workspaceId_scope_period_periodStart: key },
          data: {
            spent: { increment: spentDelta },
            reserved: { increment: reservedDelta },
          },
        });
        continue;
      }
      await tx.aiBudgetPeriod.upsert({
        where: { workspaceId_scope_period_periodStart: key },
        create: {
          ...key,
          periodEnd: period.periodEnd,
          spent: spentDelta,
          reserved: reservedDelta,
        },
        update: {
          spent: { increment: spentDelta },
          reserved: { increment: reservedDelta },
        },
      });
    }
  }
}

export function canReconcileAiReceipt(
  existing: AiOperation,
  operation: AiOperation,
) {
  const immutable = [
    'operationId',
    'createdAt',
    'category',
    'provider',
    'model',
    'fingerprint',
    'currency',
    'reservedCost',
    'actorUserId',
  ] as const;
  return (
    existing.source === 'LOCAL_SYNCED' &&
    existing.status === 'UNKNOWN' &&
    operation.status === 'RECONCILED' &&
    immutable.every((key) => String(existing[key]) === String(operation[key]))
  );
}
