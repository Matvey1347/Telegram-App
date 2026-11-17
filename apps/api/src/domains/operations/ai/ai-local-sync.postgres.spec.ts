import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { syncAiOperation } from './ai-local-sync';
import { writeAiRollup } from './ai-rollup';

const url = process.env.AI_SYNC_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'AI sync with two isolated local PostgreSQL schemas',
  () => {
    it('serializes duplicate imports and recovers a lost local acknowledgement with exact totals', async () => {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname))
        throw Error('Local test DB required');
      const admin = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const suffix = randomUUID().replace(/-/g, '');
      const schemas = [`ai_sync_local_${suffix}`, `ai_sync_target_${suffix}`];
      const clients = schemas.map(
        (schema) =>
          new PrismaClient({
            adapter: new PrismaPg({ connectionString: url! }, { schema }),
          }),
      );
      const [local, target] = clients;
      try {
        await admin.$transaction(async (guard) => {
        await guard.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended('local-ai-snapshot', 0))");
        const blocked = await local.$queryRawUnsafe<Array<{ acquired: boolean }>>(
          "SELECT pg_try_advisory_xact_lock_shared(hashtextextended('local-ai-snapshot', 0)) AS acquired",
        );
        expect(blocked[0].acquired).toBe(false);
      });
      const released = await local.$queryRawUnsafe<Array<{ acquired: boolean }>>(
        "SELECT pg_try_advisory_xact_lock_shared(hashtextextended('local-ai-snapshot', 0)) AS acquired",
      );
      expect(released[0].acquired).toBe(true);
      for (const schema of schemas) {
          await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          for (const table of ['AiOperation', 'AiUsageDaily', 'AiBudgetPeriod'])
            await admin.$executeRawUnsafe(
              `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
            );
        }
        const row = await local.aiOperation.create({
          data: {
            workspaceId: 'synthetic-workspace',
            source: 'LOCAL_UNSYNCED',
            operationId: 'fixture-operation',
            actorUserId: 'fixture-actor',
            category: 'CONTENT',
            provider: 'OPENAI',
            model: 'fixture-model',
            mode: 'MANUAL',
            fingerprint: 'fixture',
            status: 'SUCCEEDED',
            pricingStatus: 'PRICED',
            reservedCost: '0.02',
            actualCost: '0.012345678901',
            configurationSnapshot: { nested: { real: false } },
            pricingSnapshot: {},
            createdAt: new Date('2026-10-04T12:00Z'),
            deadlineAt: new Date('2026-10-04T12:01Z'),
            expiresAt: new Date('2027-01-04'),
          },
        });
        await local.$transaction((tx) => writeAiRollup(tx, row));
        const acknowledgement = jest.spyOn(local, '$transaction');
        acknowledgement.mockRejectedValueOnce(
          new Error('simulated local connection lost'),
        );
        await expect(
          syncAiOperation(local, target, row, 'synthetic-target'),
        ).rejects.toThrow('connection lost');
        acknowledgement.mockRestore();
        expect(
          (await local.aiOperation.findUniqueOrThrow({ where: { id: row.id } }))
            .source,
        ).toBe('LOCAL_UNSYNCED');
        await Promise.all([
          syncAiOperation(local, target, row, 'synthetic-target'),
          syncAiOperation(local, target, row, 'synthetic-target'),
        ]);
        expect(await target.aiOperation.count()).toBe(1);
        const daily = await target.aiUsageDaily.aggregate({
          _sum: { knownCost: true, requests: true },
        });
        expect(daily._sum.knownCost?.toFixed(12)).toBe('0.012345678901');
        expect(daily._sum.requests).toBe(1);
        const budget = await target.aiBudgetPeriod.findUniqueOrThrow({
          where: {
            workspaceId_scope_period_periodStart: {
              workspaceId: 'synthetic-target',
              scope: 'WORKSPACE',
              period: 'DAY',
              periodStart: new Date('2026-10-04'),
            },
          },
        });
        expect(budget.spent.toFixed(12)).toBe('0.012345678901');
        expect(
          (await local.aiOperation.findUniqueOrThrow({ where: { id: row.id } }))
            .source,
        ).toBe('LOCAL_SYNCED');
      } finally {
        await Promise.all(clients.map((client) => client.$disconnect()));
        for (const schema of schemas)
          await admin.$executeRawUnsafe(
            `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
          );
        await admin.$disconnect();
      }
    });
  },
);
