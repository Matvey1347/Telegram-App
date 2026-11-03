import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';

const url = process.env.LEAD_ACCEPTANCE_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'targeted acceptance with isolated PostgreSQL',
  () => {
    it('processes only the selected source and preserves foreign queues and AI state across restart and replay', async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const db = prisma as PrismaService;
      const workspaceId = 'acceptance-workspace',
        actor = 'acceptance-actor',
        account = 'acceptance-account';
      try {
        await prisma.workspace.create({
          data: { id: workspaceId, name: 'Synthetic' },
        });
        await prisma.telegramUserAccountIntegration.create({
          data: {
            id: account,
            workspaceId,
            label: 'mock',
            apiId: '0',
            apiHashEncrypted: 'x',
            apiHashIv: 'x',
            apiHashAuthTag: 'x',
          },
        });
        for (const [i, id] of ['acceptance-source', 'other-source'].entries()) {
          await prisma.telegramLeadSource.create({
            data: {
              id,
              workspaceId,
              type: 'TELEGRAM_CHANNEL',
              normalizedKey: `telegram:username:source_${i}`,
              username: `source_${i}`,
              channelId: String(111 + i),
              title: 'Source',
              accountId: account,
              accessType: 'SUBSCRIBED_CHANNEL',
              processingReference: 'policy:test',
              monitoringState: 'ACTIVE',
              monitoringActorUserId: actor,
            },
          });
          await prisma.telegramLeadAutoConfig.create({
            data: { sourceId: id, workspaceId, enabled: true },
          });
        }
        const source = await prisma.telegramLeadSource.findUniqueOrThrow({
          where: { id: 'acceptance-source' },
        });
        const policy = {
          recheckAi: jest.fn().mockResolvedValue(source),
          assertProcessing: jest.fn(),
          granted: jest.fn().mockReturnValue(true),
        } as unknown as TelegramLeadPolicy;
        const candidates = new TelegramLeadCandidateService(
          db,
          policy,
          {} as never,
          {} as never,
        );
        const analysis = { analyzeAutomatically: jest.fn() };
        const config = {
          get: (key: string) =>
            key === 'INTERNAL_LEAD_DISCOVERY_RECOVERY_MODE'
              ? 'manual'
              : key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
                ? 'true'
                : undefined,
        };
        const executor = new TelegramLeadAnalysisExecutor(
          db,
          {} as never,
          config as never,
        );
        const reconcile = jest
          .fn()
          .mockRejectedValue(new Error('must not reconcile'));
        Object.defineProperty(executor, 'services', {
          value: jest.fn().mockResolvedValue({
            policy,
            candidates,
            analysis,
            runtime: {},
            reconciliation: { reconcilePage: reconcile },
          }),
        });
        const items = [
          {
            id: 'chosen',
            sourceId: 'acceptance-source',
            status: 'NEEDS_METADATA',
            text: 'Розпродаж. Ціна 100 грн. Замовити @sales_manager https://shop.example/',
          },
          {
            id: 'ai-unknown',
            sourceId: 'acceptance-source',
            status: 'WAIT_AUTH_RECHECK',
            text: 'unknown',
          },
          {
            id: 'other-work',
            sourceId: 'other-source',
            status: 'WAIT_AUTH_RECHECK',
            text: 'other',
          },
        ];
        for (const [i, item] of items.entries()) {
          const obs = await prisma.telegramLeadObservation.create({
            data: {
              id: item.id,
              workspaceId,
              sourceId: item.sourceId,
              externalMessageId: String(i + 1),
              messageUrl: `https://t.me/source_0/${i + 1}`,
              publishedAt: new Date(),
              observedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
              text: item.text,
              links: [],
              contentHash: `hash-${i}`,
              metadataComplete: false,
              textMetadataComplete: false,
              mediaPresent: true,
              targetEvidence:
                i === 0
                  ? [
                      {
                        kind: 'PUBLIC_URL',
                        value: 'https://shop.example/',
                        origin: 'TEXT',
                        confidence: 'UNVERIFIED',
                      },
                      {
                        kind: 'TELEGRAM_USERNAME',
                        value: 'sales_manager',
                        origin: 'MENTION',
                        confidence: 'UNVERIFIED',
                      },
                    ]
                  : [],
            },
          });
          await prisma.telegramLeadAnalysisQueue.create({
            data: {
              id: `queue-${item.id}`,
              workspaceId,
              sourceId: item.sourceId,
              observationId: item.id,
              contentHash: obs.contentHash,
              bindingRevision: 0,
              actorUserId: actor,
              status: item.status,
            },
          });
        }
        const ai = await prisma.aiOperation.create({
          data: {
            workspaceId,
            operationId: 'old-operation',
            actorUserId: actor,
            category: 'LEAD_AD_CLASSIFICATION',
            provider: 'test',
            model: 'test',
            mode: 'MANUAL',
            fingerprint: 'test',
            status: 'UNKNOWN',
            pricingStatus: 'ESTIMATED',
            reservedCost: '0.4',
            businessObjectId: 'ai-unknown',
            configurationSnapshot: {},
            pricingSnapshot: {},
            deadlineAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await prisma.aiOperationResult.create({
          data: {
            operationDbId: ai.id,
            version: 'test',
            output: { synthetic: true },
          },
        });
        await prisma.aiBudgetPeriod.create({
          data: {
            workspaceId,
            scope: 'WORKSPACE',
            period: 'DAILY',
            periodStart: new Date('2026-01-01'),
            periodEnd: new Date('2027-01-01'),
            reserved: '0.4',
          },
        });
        const beforeOther =
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-other-work' },
          });
        const beforeAi = await prisma.aiOperation.findUniqueOrThrow({
          where: { id: ai.id },
        });
        const beforeUnknownQueue =
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-ai-unknown' },
          });
        const beforeBudget = await prisma.aiBudgetPeriod.findFirstOrThrow({
          where: { workspaceId },
        });
        await executor.onApplicationBootstrap();
        executor.wake({ workspaceId, sourceId: 'other-source', userId: actor });
        const work = {
          workspaceId,
          sourceId: 'acceptance-source',
          userId: actor,
        };
        const first = await executor.runSelected(work, [
          'chosen',
          'ai-unknown',
          'other-work',
        ]);
        expect(first.results.map((x) => x.outcome)).toEqual([
          'processed',
          'skipped',
          'skipped',
        ]);
        const saved = await prisma.telegramLeadObservation.findUniqueOrThrow({
          where: { id: 'chosen' },
        });
        expect(saved.candidateId).not.toBeNull();
        const candidate = await prisma.telegramLeadCandidate.findUniqueOrThrow({
          where: { id: saved.candidateId! },
        });
        expect(candidate.contacts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              value: '@sales_manager',
              role: 'SALES_CONTACT',
              confirmed: false,
              evidenceUrl: 'https://t.me/source_0/1',
            }),
          ]),
        );
        const second = await executor.runSelected(work, ['chosen']);
        expect(second.results[0]).toMatchObject({
          outcome: 'skipped',
          candidateId: saved.candidateId,
        });
        expect(
          await prisma.telegramLeadCandidate.count({ where: { workspaceId } }),
        ).toBe(1);
        expect(
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-other-work' },
          }),
        ).toEqual(beforeOther);
        expect(
          await prisma.aiOperation.findUniqueOrThrow({ where: { id: ai.id } }),
        ).toEqual(beforeAi);
        expect(
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-ai-unknown' },
          }),
        ).toEqual(beforeUnknownQueue);
        expect(
          await prisma.aiOperationResult.count({
            where: { operationDbId: ai.id },
          }),
        ).toBe(1);
        expect(
          await prisma.aiBudgetPeriod.findFirstOrThrow({
            where: { workspaceId },
          }),
        ).toEqual(beforeBudget);
        expect(analysis.analyzeAutomatically).not.toHaveBeenCalled();
        expect(reconcile).not.toHaveBeenCalled();
        await prisma.telegramLeadAnalysisQueue.update({
          where: { id: 'queue-ai-unknown' },
          data: {
            status: 'RUNNING',
            claimToken: 'existing',
            claimUntil: new Date(Date.now() - 1000),
          },
        });
        const beforeRunning =
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-ai-unknown' },
          });
        await executor.runSelected(work, ['ai-unknown']);
        expect(
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-ai-unknown' },
          }),
        ).toEqual(beforeRunning);
        const scope = {
          get: (key: string) =>
            key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
              ? 'true'
              : key === 'INTERNAL_LEAD_DISCOVERY_SOURCE_ALLOWLIST'
                ? 'acceptance-source'
                : undefined,
        };
        const scoped = new TelegramLeadAnalysisExecutor(
          db,
          {} as never,
          scope as never,
        );
        const drain = jest.fn().mockResolvedValue(false);
        Object.defineProperty(scoped, 'runSource', { value: drain });
        await scoped.onApplicationBootstrap();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(drain).toHaveBeenCalledTimes(1);
        expect(drain).toHaveBeenCalledWith({
          workspaceId,
          sourceId: 'acceptance-source',
          userId: actor,
        });
        expect(
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'queue-other-work' },
          }),
        ).toEqual(beforeOther);
        scoped.onApplicationShutdown();
        executor.onApplicationShutdown();
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
