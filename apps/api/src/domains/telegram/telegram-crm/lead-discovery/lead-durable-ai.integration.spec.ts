import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import {
  AiAdmissionService,
  type AiExecutionRequest,
} from '../../../operations/ai/ai-admission.service';
import { AiSettlementService } from '../../../operations/ai/ai-settlement.service';
import { AiGateway } from '../../../operations/ai/ai-gateway';
import { AiLocalConcurrency } from '../../../operations/ai/ai-local-concurrency';
import { AiModelRegistry } from '../../../operations/ai/ai-model-registry';
import type {
  AiProvider,
  AiProviderOutcome,
} from '../../../operations/ai/ai-provider';
import { AiUsageRetentionService } from '../../../operations/ai/ai-usage-retention.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import type { TelegramLeadCrmLinker } from './lead-crm-linker.service';
import { TelegramLeadAnalysisService } from './lead-analysis.service';
import { TelegramLeadReconciliationService } from './lead-reconciliation.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import { TelegramLeadHistoryJobService } from './lead-history-job.service';
import { expireLeadAnalysisClaims } from './lead-analysis-claim';

const url = process.env.LEAD_EXECUTOR_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'durable lead AI results (isolated PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let executor: TelegramLeadAnalysisExecutor;
    let second: TelegramLeadAnalysisExecutor | undefined;
    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
    });
    afterAll(async () => {
      executor?.onApplicationShutdown();
      second?.onApplicationShutdown();
      await prisma.$disconnect();
    });
    it('replays a paid result after crash without another provider call or charge', async () => {
      const db = prisma as PrismaService;
      await prisma.workspace.create({
        data: { id: 'durable-w', name: 'Mock AI' },
      });
      await prisma.telegramUserAccountIntegration.create({
        data: {
          id: 'durable-account',
          workspaceId: 'durable-w',
          label: 'mock',
          apiId: '0',
          apiHashEncrypted: 'x',
          apiHashIv: 'x',
          apiHashAuthTag: 'x',
        },
      });
      const source = await prisma.telegramLeadSource.create({
        data: {
          id: 'durable-source',
          workspaceId: 'durable-w',
          type: 'TELEGRAM_CHANNEL',
          normalizedKey: 'telegram:username:durable_channel',
          channelId: '12345',
          username: 'durable_channel',
          title: 'Mock',
          accountId: 'durable-account',
          accessType: 'SUBSCRIBED_CHANNEL',
          processingReference: 'policy:durable',
          monitoringState: 'ACTIVE',
          monitoringActorUserId: 'actor',
        },
      });
      await prisma.telegramLeadAutoConfig.create({
        data: { sourceId: source.id, workspaceId: 'durable-w', enabled: true },
      });
      await prisma.aiWorkspaceConfig.create({
        data: {
          workspaceId: 'durable-w',
          enabled: true,
          automaticEnabled: true,
          dailyBudget: '10',
          monthlyBudget: '10',
          maxRequestCost: '1',
        },
      });
      for (const category of [
        'LEAD_AD_CLASSIFICATION',
        'LEAD_CONTACT_EXTRACTION',
      ])
        await prisma.aiCategoryConfig.create({
          data: {
            workspaceId: 'durable-w',
            category,
            modelId: 'gpt-6-luna',
            enabled: true,
            automaticEnabled: true,
            maxInputTokens: 8000,
            maxOutputTokens: 1000,
            timeoutMs: 30000,
            concurrencyLimit: 2,
            dailyBudget: '10',
            monthlyBudget: '10',
            maxRequestCost: '1',
          },
        });
      let grants = JSON.stringify([
        {
          workspaceId: 'durable-w',
          sourceKey: source.normalizedKey,
          accountId: source.accountId,
          channelId: source.channelId,
          reference: source.processingReference,
          ingest: true,
          ai: true,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      const config = {
        get: (key: string) =>
          key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
            ? 'true'
            : key === 'INTERNAL_LEAD_DISCOVERY_GRANTS'
              ? grants
              : undefined,
      } as ConfigService;
      const authorization = {
        require: jest.fn().mockResolvedValue({ workspaceId: 'durable-w' }),
        refresh: jest.fn().mockResolvedValue(undefined),
      } as unknown as WorkspaceAuthorizationService;
      const policy = new TelegramLeadPolicy(db, authorization, config);
      const read = new TelegramLeadReadService(db, policy);
      const candidates = new TelegramLeadCandidateService(
        db,
        policy,
        read,
        {} as TelegramLeadCrmLinker,
      );
      const registry = new AiModelRegistry();
      const admission = new AiAdmissionService(db, registry, {
        enabled: true,
        configured: true,
      } as never);
      const settlement = new AiSettlementService(db, authorization);
      const usage = {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 150,
      };
      let unknownMode = false;
      const provider = {
        execute: jest.fn(
          async (
            _input: string,
            cfg: { category: string },
          ): Promise<AiProviderOutcome> => ({
            result:
              cfg.category === 'LEAD_AD_CLASSIFICATION'
                ? {
                    classification: 'ADVERTISEMENT',
                    commercialIntent: true,
                    niche: '',
                    offerType: '',
                    hasContact: false,
                    relevance: 'POSSIBLE',
                    confidence: 1,
                    risks: [],
                    evidence: ['e1'],
                  }
                : {
                    projectName: 'Project Apollo',
                    productName: '',
                    contacts: [],
                    warnings: [],
                  },
            usage: unknownMode ? null : usage,
            errorCategory: null,
            generationStarted: true,
            providerModel: 'gpt-6-luna',
            providerRequestId: 'mock-request',
          }),
        ),
      };
      const gateway = new AiGateway(
        authorization,
        admission,
        new AiLocalConcurrency(),
        provider as unknown as AiProvider,
        settlement,
      );
      let crash = true;
      const requests: AiExecutionRequest[] = [];
      const wrapped = {
        execute: async (request: AiExecutionRequest) => {
          requests.push(request);
          const response = await gateway.execute(request);
          if (crash && request.category === 'LEAD_CONTACT_EXTRACTION') {
            crash = false;
            throw new Error('mock process failure after settlement');
          }
          return response;
        },
        replay: (request: AiExecutionRequest) => gateway.replay(request),
      } as unknown as AiGateway;
      const analysis = new TelegramLeadAnalysisService(
        db,
        policy,
        wrapped,
        candidates,
      );
      const reconciliation = new TelegramLeadReconciliationService(db, policy);
      const moduleRef = {
        registerRequestByContextId: jest.fn(),
        resolve: jest.fn(async (providerClass) =>
          providerClass === TelegramLeadPolicy
            ? policy
            : providerClass === TelegramLeadAnalysisService
              ? analysis
              : providerClass === TelegramLeadCandidateService
                ? candidates
                : reconciliation,
        ),
      } as unknown as ModuleRef;
      const work = {
        userId: 'actor',
        workspaceId: 'durable-w',
        sourceId: source.id,
      };
      const insert = async (id: string, text: string) => {
        await prisma.telegramLeadObservation.create({
          data: {
            id,
            workspaceId: 'durable-w',
            sourceId: source.id,
            externalMessageId: id,
            publishedAt: new Date(),
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            text,
            links: [],
            contentHash: `hash-${id}`,
            metadataComplete: true,
            metadataTextOnly: true,
            targetEvidence: [],
          },
        });
        await prisma.telegramLeadAnalysisQueue.create({
          data: {
            id: `q-${id}`,
            workspaceId: 'durable-w',
            sourceId: source.id,
            observationId: id,
            contentHash: `hash-${id}`,
            bindingRevision: source.bindingRevision,
            actorUserId: 'actor',
          },
        });
      };
      await insert('durable-observation', 'Project Apollo advertising offer');
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-durable-observation' },
          })
        ).status,
      ).toBe('UNKNOWN');
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: 'durable-observation' },
          })
        ).candidateId,
      ).toBeNull();
      const operations = await prisma.aiOperation.findMany({
        where: { workspaceId: 'durable-w' },
        include: { durableResult: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(operations).toHaveLength(2);
      expect(
        operations.every(
          (row) =>
            row.status === 'SUCCEEDED' &&
            row.durableResult?.version === 'lead-discovery-v1',
        ),
      ).toBe(true);
      expect(provider.execute).toHaveBeenCalledTimes(2);
      const before = (
        await prisma.aiBudgetPeriod.findMany({
          where: { workspaceId: 'durable-w' },
          orderBy: [{ scope: 'asc' }, { period: 'asc' }],
        })
      ).map((row) => [
        row.scope,
        row.period,
        row.spent.toString(),
        row.reserved.toString(),
      ]);
      const replay = await gateway.execute(requests[1]);
      expect(replay.replayed).toBe(true);
      expect(replay.result).toMatchObject({ projectName: 'Project Apollo' });
      await expect(
        gateway.replay({
          ...requests[1],
          input: requests[1].input + ' changed',
        }),
      ).rejects.toThrow('AI_REPLAY_UNAVAILABLE');
      await expect(
        gateway.replay({ ...requests[1], userId: 'other-actor' }),
      ).rejects.toThrow('AI_REPLAY_UNAVAILABLE');
      expect(provider.execute).toHaveBeenCalledTimes(2);
      // A revoked grant prevents business replay even though the result is durable.
      const validGrants = grants;
      grants = '[]';
      await expect(executor.runSource(work)).rejects.toThrow();
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: 'durable-observation' },
          })
        ).candidateId,
      ).toBeNull();
      grants = validGrants;
      executor.onApplicationShutdown();
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      second = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      await Promise.all([
        executor.onApplicationBootstrap(),
        second.runSource(work),
      ]);
      for (let i = 0; i < 300; i++) {
        if (
          (
            await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
              where: { id: 'q-durable-observation' },
            })
          ).status === 'COMPLETED'
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const restored = await prisma.telegramLeadObservation.findUniqueOrThrow({
        where: { id: 'durable-observation' },
      });
      expect(restored.candidateId).toBeTruthy();
      expect((await read.candidate('actor', restored.candidateId!)).title).toBe(
        'Project Apollo',
      );
      expect(
        await prisma.telegramLeadCandidate.count({
          where: { workspaceId: 'durable-w' },
        }),
      ).toBe(1);
      expect(provider.execute).toHaveBeenCalledTimes(2);
      const after = (
        await prisma.aiBudgetPeriod.findMany({
          where: { workspaceId: 'durable-w' },
          orderBy: [{ scope: 'asc' }, { period: 'asc' }],
        })
      ).map((row) => [
        row.scope,
        row.period,
        row.spent.toString(),
        row.reserved.toString(),
      ]);
      expect(after).toEqual(before);
      // Uncertain provider outcome remains UNKNOWN and is never dispatched twice.
      await insert(
        'unknown-observation',
        'Project Uncertain advertising offer',
      );
      unknownMode = true;
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-unknown-observation' },
          })
        ).status,
      ).toBe('UNKNOWN');
      const calls = provider.execute.mock.calls.length;
      await executor.runSource(work);
      expect(provider.execute).toHaveBeenCalledTimes(calls);
      // Expired UNKNOWN receipts survive financial retention, while output expires.
      const unknownOp = await prisma.aiOperation.findFirstOrThrow({
        where: {
          workspaceId: 'durable-w',
          businessObjectId: 'unknown-observation',
        },
      });
      expect(
        await prisma.aiOperationResult.findUnique({
          where: { operationDbId: unknownOp.id },
        }),
      ).not.toBeNull();
      await prisma.aiOperation.update({
        where: { id: unknownOp.id },
        data: { expiresAt: new Date(0) },
      });
      await new AiUsageRetentionService(db).cleanup();
      expect(
        await prisma.aiOperation.findUnique({ where: { id: unknownOp.id } }),
      ).not.toBeNull();
      expect(
        await prisma.aiOperationResult.findUnique({
          where: { operationDbId: unknownOp.id },
        }),
      ).toBeNull();
      // Provider returned, but settlement failed before committing either output or charge.
      unknownMode = false;
      await insert('no-save', 'Project Apollo unsaved response');
      const beforeRollback = await prisma.aiBudgetPeriod.findFirstOrThrow({
        where: { workspaceId: 'durable-w', scope: 'WORKSPACE', period: 'DAY' },
      });
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "mock_fail_ai_settlement"() RETURNS trigger AS $$ BEGIN IF NEW."businessObjectId"='no-save' AND NEW.status='SUCCEEDED' THEN RAISE EXCEPTION 'mock settlement failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "mock_fail_ai_settlement_trigger" BEFORE UPDATE ON "AiOperation" FOR EACH ROW EXECUTE FUNCTION "mock_fail_ai_settlement"()`,
      );
      await executor.runSource(work);
      const noSave = await prisma.aiOperation.findFirstOrThrow({
        where: { workspaceId: 'durable-w', businessObjectId: 'no-save' },
        include: { durableResult: true },
      });
      expect(noSave.status).toBe('RUNNING');
      expect(noSave.durableResult).toBeNull();
      const afterRollback = await prisma.aiBudgetPeriod.findFirstOrThrow({
        where: { workspaceId: 'durable-w', scope: 'WORKSPACE', period: 'DAY' },
      });
      expect(afterRollback.spent.eq(beforeRollback.spent)).toBe(true);
      expect(
        afterRollback.reserved.eq(
          beforeRollback.reserved.add(noSave.reservedCost),
        ),
      ).toBe(true);
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-no-save' },
          })
        ).status,
      ).toBe('UNKNOWN');
      const afterNoSave = provider.execute.mock.calls.length;
      await executor.runSource(work);
      expect(provider.execute).toHaveBeenCalledTimes(afterNoSave);
      // An expired owner cannot apply a late response; a new owner can replay it.
      await insert('late-response', 'Project Apollo late response');
      let started!: () => void;
      let release!: () => void;
      const begun = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      provider.execute.mockImplementationOnce(async () => {
        started();
        await gate;
        return {
          result: {
            classification: 'ADVERTISEMENT',
            commercialIntent: true,
            niche: '',
            offerType: '',
            hasContact: false,
            relevance: 'POSSIBLE',
            confidence: 1,
            risks: [],
            evidence: ['e1'],
          },
          usage,
          errorCategory: null,
          generationStarted: true,
          providerModel: 'gpt-6-luna',
          providerRequestId: 'mock-late',
        };
      });
      const pending = executor.runSource(work);
      await begun;
      await prisma.$executeRaw`UPDATE "TelegramLeadAnalysisQueue" SET "claimUntil"=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id='q-late-response'`;
      expect(await expireLeadAnalysisClaims(db, 'durable-w', source.id)).toBe(
        1,
      );
      executor.onApplicationShutdown();
      release();
      await pending;
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: 'late-response' },
          })
        ).classification,
      ).toBeNull();
      expect(
        (
          await prisma.aiOperation.findFirstOrThrow({
            where: {
              workspaceId: 'durable-w',
              businessObjectId: 'late-response',
            },
            include: { durableResult: true },
          })
        ).durableResult,
      ).not.toBeNull();
      const afterLate = provider.execute.mock.calls.length;
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: 'late-response' },
          })
        ).candidateId,
      ).toBeTruthy();
      // Only the previously unstarted extraction runs; classification is replayed.
      expect(provider.execute).toHaveBeenCalledTimes(afterLate + 1);
      // A provider request known not to have been sent can be explicitly retried.
      await insert('not-sent', 'Project Apollo not sent');
      provider.execute.mockResolvedValueOnce({
        usage: null,
        errorCategory: 'INPUT_TOKEN_LIMIT',
        generationStarted: false,
        providerModel: null,
        providerRequestId: null,
      });
      await executor.runSource(work);
      const notSent = await prisma.telegramLeadObservation.findUniqueOrThrow({
        where: { id: 'not-sent' },
      });
      expect(notSent.classificationOperationId).toBeNull();
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-not-sent' },
          })
        ).status,
      ).toBe('FAILED');
      await executor.retrySafeFailures(work);
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: 'not-sent' },
          })
        ).candidateId,
      ).toBeTruthy();
      // Manual financial reconciliation allows a saved result to resume business work without replaying its provider call.
      await insert(
        'reconciled-observation',
        'Project Apollo reconciled result',
      );
      unknownMode = true;
      await executor.runSource(work);
      const reconciledOp = await prisma.aiOperation.findFirstOrThrow({
        where: {
          workspaceId: 'durable-w',
          businessObjectId: 'reconciled-observation',
          category: 'LEAD_AD_CLASSIFICATION',
        },
        include: { durableResult: true },
      });
      expect(reconciledOp.status).toBe('UNKNOWN');
      expect(reconciledOp.durableResult).not.toBeNull();
      const callsBeforeReconciliation = provider.execute.mock.calls.length;
      await gateway.reconcile('actor', reconciledOp.id, {
        actualCost: '0.000035',
        evidence: 'provider:mock_observation',
      });
      unknownMode = false;
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: 'reconciled-observation' },
          })
        ).candidateId,
      ).toBeTruthy();
      expect(provider.execute).toHaveBeenCalledTimes(
        callsBeforeReconciliation + 1,
      );
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-reconciled-observation' },
          })
        ).status,
      ).toBe('COMPLETED');
      // Oversized provider output is never stored or exposed as a successful result.
      const oversizedRequest = {
        ...requests[0],
        admissionGuard: undefined,
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        businessObjectId: 'oversized',
        input: 'oversized-result-test',
      };
      provider.execute.mockResolvedValueOnce({
        result: { data: 'x'.repeat(65537) },
        usage,
        errorCategory: null,
        generationStarted: true,
        providerModel: 'gpt-6-luna',
        providerRequestId: 'mock-oversized',
      });
      const oversized = await gateway.execute(oversizedRequest);
      expect(oversized.operation.status).toBe('UNKNOWN');
      expect(oversized.result).toBeUndefined();
      const oversizedOp = await prisma.aiOperation.findUniqueOrThrow({
        where: {
          workspaceId_operationId: {
            workspaceId: 'durable-w',
            operationId: oversizedRequest.operationId,
          },
        },
        include: { durableResult: true },
      });
      expect(oversizedOp.durableResult).toBeNull();
      const beforeReplay = provider.execute.mock.calls.length;
      expect((await gateway.execute(oversizedRequest)).operation.status).toBe(
        'UNKNOWN',
      );
      expect(provider.execute).toHaveBeenCalledTimes(beforeReplay);

      // A verified saved response becomes replayable after explicit financial reconciliation.
      unknownMode = true;
      const reconcileRequest = {
        ...requests[0],
        admissionGuard: undefined,
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        businessObjectId: 'manual-reconcile',
        input: 'manual-reconcile-test',
      };
      const unsettled = await gateway.execute(reconcileRequest);
      expect(unsettled.operation.status).toBe('UNKNOWN');
      expect(unsettled.result).toBeUndefined();
      const beforeManual = provider.execute.mock.calls.length;
      expect((await gateway.replay(reconcileRequest)).result).toBeUndefined();
      await gateway.reconcile('actor', unsettled.operation.id, {
        actualCost: '0.000035',
        evidence: 'provider:mock_receipt',
      });
      const reconciled = await gateway.replay(reconcileRequest);
      expect(reconciled.operation.status).toBe('RECONCILED');
      expect(reconciled.result).toMatchObject({
        classification: 'ADVERTISEMENT',
      });
      expect(provider.execute).toHaveBeenCalledTimes(beforeManual);

      const mismatchedRequest = {
        ...requests[0],
        admissionGuard: undefined,
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        businessObjectId: 'wrong-model',
        input: 'wrong-model-test',
      };
      provider.execute.mockResolvedValueOnce({
        result: { classification: 'ADVERTISEMENT' },
        usage: null,
        errorCategory: null,
        generationStarted: true,
        providerModel: 'different-model',
        providerRequestId: 'mock-wrong-model',
      });
      const mismatched = await gateway.execute(mismatchedRequest);
      expect(mismatched.operation.status).toBe('UNKNOWN');
      await gateway.reconcile('actor', mismatched.operation.id, {
        actualCost: '0.000035',
        evidence: 'provider:mock_model',
      });
      const callsAfterMismatch = provider.execute.mock.calls.length;
      expect((await gateway.replay(mismatchedRequest)).result).toBeUndefined();
      expect(provider.execute).toHaveBeenCalledTimes(callsAfterMismatch);

      // Two independent clients share the source-row admission/pause lock.
      const peer = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      try {
        second?.onApplicationShutdown();
        unknownMode = false;
        const peerDb = peer as PrismaService;
        const peerPolicy = new TelegramLeadPolicy(
          peerDb,
          authorization,
          config,
        );
        const peerReconciliation = new TelegramLeadReconciliationService(
          peerDb,
          peerPolicy,
        );
        const pause = () =>
          peerReconciliation.setEnabled('actor', source.id, false);
        const resume = async () => {
          await peerReconciliation.setEnabled('actor', source.id, true);
          await executor.retrySafeFailures(work);
        };
        const barrier = () => {
          let enter!: () => void, release!: () => void;
          const entered = new Promise<void>((resolve) => {
            enter = resolve;
          });
          const wait = new Promise<void>((resolve) => {
            release = resolve;
          });
          return { entered, enter, wait, release };
        };

        await pause();
        await pause();
        await insert(
          'pause-before-admission',
          'Project Apollo before admission',
        );
        const beforePause = provider.execute.mock.calls.length;
        await expect(executor.runSource(work)).rejects.toThrow();
        expect(provider.execute).toHaveBeenCalledTimes(beforePause);
        await resume();
        await resume();

        // The second instance commits pause while the first has not entered admission.
        const beforeAdmission = barrier();
        const realAdmit = admission.admit.bind(admission);
        const admitSpy = jest
          .spyOn(admission, 'admit')
          .mockImplementationOnce(async (request) => {
            beforeAdmission.enter();
            await beforeAdmission.wait;
            return realAdmit(request);
          });
        const beforeWork = executor.runSource(work);
        await beforeAdmission.entered;
        await pause();
        beforeAdmission.release();
        await beforeWork;
        admitSpy.mockRestore();
        expect(provider.execute).toHaveBeenCalledTimes(beforePause);
        expect(
          await prisma.aiOperation.count({
            where: { businessObjectId: 'pause-before-admission' },
          }),
        ).toBe(0);
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-before-admission' },
            })
          ).classificationOperationId,
        ).toBeNull();
        await resume();
        await executor.runSource(work);
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-before-admission' },
            })
          ).candidateId,
        ).toBeTruthy();
        expect(provider.execute).toHaveBeenCalledTimes(beforePause + 2);

        // Admission commits first, but provider dispatch waits until after pause.
        await insert('pause-after-admission', 'Project Apollo admitted first');
        const afterAdmission = barrier();
        const delayedAdmit = jest
          .spyOn(admission, 'admit')
          .mockImplementationOnce(async (request) => {
            const admitted = await realAdmit(request);
            afterAdmission.enter();
            await afterAdmission.wait;
            return admitted;
          });
        const afterWork = executor.runSource(work);
        await afterAdmission.entered;
        await pause();
        expect(
          await peer.aiOperation.count({
            where: {
              businessObjectId: 'pause-after-admission',
              status: 'RUNNING',
            },
          }),
        ).toBe(1);
        const progressService = new TelegramLeadHistoryJobService(
          peerDb,
          peerPolicy,
          undefined as never,
          undefined as never,
        );
        expect(
          (await progressService.progress('actor', source.id))
            .admittedAiOperations,
        ).toBeGreaterThan(0);
        const beforeDispatch = provider.execute.mock.calls.length;
        afterAdmission.release();
        await afterWork;
        delayedAdmit.mockRestore();
        expect(provider.execute).toHaveBeenCalledTimes(beforeDispatch + 1);
        expect(
          (
            await peer.aiOperation.findFirstOrThrow({
              where: { businessObjectId: 'pause-after-admission' },
              include: { durableResult: true },
            })
          ).durableResult,
        ).not.toBeNull();
        await resume();
        await executor.runSource(work);
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-after-admission' },
            })
          ).candidateId,
        ).toBeTruthy();
        expect(provider.execute).toHaveBeenCalledTimes(beforeDispatch + 2);

        // While admission owns the source lock, pause must wait for its commit.
        await insert(
          'pause-races-admission',
          'Project Apollo concurrent admission',
        );
        const insideAdmission = barrier();
        const callsBeforeRace = provider.execute.mock.calls.length;
        const simultaneous = jest
          .spyOn(admission, 'admit')
          .mockImplementationOnce((request) =>
            realAdmit({
              ...request,
              admissionGuard: async (tx) => {
                await request.admissionGuard!(tx);
                insideAdmission.enter();
                await insideAdmission.wait;
              },
            }),
          );
        const racingWork = executor.runSource(work);
        await insideAdmission.entered;
        let pauseCompleted = false;
        const racingPause = pause().then(() => {
          pauseCompleted = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(pauseCompleted).toBe(false);
        insideAdmission.release();
        await racingPause;
        await racingWork;
        simultaneous.mockRestore();
        const raceOp = await peer.aiOperation.findFirstOrThrow({
          where: { businessObjectId: 'pause-races-admission' },
          include: { durableResult: true },
        });
        expect(raceOp.durableResult).not.toBeNull();
        expect(provider.execute).toHaveBeenCalledTimes(callsBeforeRace + 1);
        const callsAfterRace = provider.execute.mock.calls.length;
        await resume();
        await executor.runSource(work);
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-races-admission' },
            })
          ).candidateId,
        ).toBeTruthy();
        expect(provider.execute).toHaveBeenCalledTimes(callsAfterRace + 1);

        // A request already in the provider is settled durably while paused.
        await insert(
          'pause-provider-running',
          'Project Apollo provider running',
        );
        const inProvider = barrier();
        const realProvider = provider.execute.getMockImplementation()!;
        provider.execute.mockImplementationOnce(async (input, cfg) => {
          inProvider.enter();
          await inProvider.wait;
          return realProvider(input, cfg);
        });
        const providerWork = executor.runSource(work);
        await inProvider.entered;
        const callsInProvider = provider.execute.mock.calls.length;
        await pause();
        inProvider.release();
        await providerWork;
        expect(provider.execute).toHaveBeenCalledTimes(callsInProvider);
        expect(
          (
            await peer.aiOperation.findFirstOrThrow({
              where: { businessObjectId: 'pause-provider-running' },
              include: { durableResult: true },
            })
          ).durableResult,
        ).not.toBeNull();
        await resume();
        await executor.runSource(work);
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-provider-running' },
            })
          ).candidateId,
        ).toBeTruthy();
        expect(provider.execute).toHaveBeenCalledTimes(callsInProvider + 1);

        // Pause after extraction settlement, before the business result is applied.
        await insert(
          'pause-after-settlement',
          'Project Apollo settled before candidate',
        );
        const settled = barrier();
        const realSettle = settlement.settle.bind(settlement);
        const settleSpy = jest
          .spyOn(settlement, 'settle')
          .mockImplementation(async (operation, outcome, version) => {
            const result = await realSettle(operation, outcome, version);
            if (
              operation.businessObjectId === 'pause-after-settlement' &&
              operation.category === 'LEAD_CONTACT_EXTRACTION'
            ) {
              settled.enter();
              await settled.wait;
            }
            return result;
          });
        const settlementWork = executor.runSource(work);
        await settled.entered;
        await pause();
        const settledCalls = provider.execute.mock.calls.length;
        settled.release();
        await settlementWork;
        settleSpy.mockRestore();
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-after-settlement' },
            })
          ).candidateId,
        ).toBeNull();
        expect(
          (
            await peer.aiOperation.findFirstOrThrow({
              where: {
                businessObjectId: 'pause-after-settlement',
                category: 'LEAD_CONTACT_EXTRACTION',
              },
              include: { durableResult: true },
            })
          ).durableResult,
        ).not.toBeNull();
        executor.onApplicationShutdown();
        executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
        await executor.onApplicationBootstrap();
        await expect(executor.runSource(work)).rejects.toThrow();
        expect(provider.execute).toHaveBeenCalledTimes(settledCalls);
        await resume();
        await executor.runSource(work);
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: 'pause-after-settlement' },
            })
          ).candidateId,
        ).toBeTruthy();
        expect(provider.execute).toHaveBeenCalledTimes(settledCalls);

        // Revocation and pause together forbid new work, including after restart.
        await insert('pause-revoked-grant', 'Project Apollo revoked grant');
        const revokeBarrier = barrier();
        const revokeSpy = jest
          .spyOn(admission, 'admit')
          .mockImplementationOnce(async (request) => {
            revokeBarrier.enter();
            await revokeBarrier.wait;
            return realAdmit(request);
          });
        const revokeWork = executor.runSource(work);
        await revokeBarrier.entered;
        const callsRevoked = provider.execute.mock.calls.length;
        grants = '[]';
        await pause();
        revokeBarrier.release();
        await revokeWork;
        revokeSpy.mockRestore();
        expect(provider.execute).toHaveBeenCalledTimes(callsRevoked);
        expect(
          await peer.aiOperation.count({
            where: { businessObjectId: 'pause-revoked-grant' },
          }),
        ).toBe(0);
        executor.onApplicationShutdown();
        executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
        await executor.onApplicationBootstrap();
        await expect(executor.runSource(work)).rejects.toThrow();
        expect(provider.execute).toHaveBeenCalledTimes(callsRevoked);
        grants = validGrants;
      } finally {
        await peer.$disconnect();
      }
    }, 30000);
  },
);
