import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Subject } from 'rxjs';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import type { AiGateway } from '../../../operations/ai/ai-gateway';
import type { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';
import type { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import type { TelegramLeadCrmLinker } from './lead-crm-linker.service';
import { TelegramLeadAnalysisService } from './lead-analysis.service';
import { TelegramLeadReconciliationService } from './lead-reconciliation.service';
import { TelegramLeadIngestService } from './lead-ingest.service';
import { TelegramLeadTransportService } from './lead-transport.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import { TelegramLeadHistoryWorker } from './lead-history-worker.service';
import { TelegramLeadHistoryJobService } from './lead-history-job.service';
import { extractLeadTargetEvidence } from './lead-advertised-targets';
import { leadTransportSnapshot } from './lead-transport-snapshot';

const url = process.env.LEAD_EXECUTOR_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'history to analysis pipeline (isolated PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let worker: TelegramLeadHistoryWorker;
    let executor: TelegramLeadAnalysisExecutor;
    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
    });
    afterAll(async () => {
      worker?.onApplicationShutdown();
      executor?.onApplicationShutdown();
      await prisma.$disconnect();
    });
    it('drains 100 posts across history pages, isolates UNKNOWN and recovers after restart', async () => {
      const db = prisma as PrismaService;
      await prisma.workspace.create({
        data: { id: 'pipeline-w', name: 'Mock pipeline' },
      });
      await prisma.telegramUserAccountIntegration.create({
        data: {
          id: 'pipeline-account',
          workspaceId: 'pipeline-w',
          label: 'mock',
          apiId: '0',
          apiHashEncrypted: 'x',
          apiHashIv: 'x',
          apiHashAuthTag: 'x',
        },
      });
      const source = await prisma.telegramLeadSource.create({
        data: {
          id: 'pipeline-source',
          workspaceId: 'pipeline-w',
          type: 'TELEGRAM_CHANNEL',
          normalizedKey: 'telegram:username:pipeline_source',
          channelId: '123456',
          username: 'pipeline_source',
          title: 'Source',
          accessType: 'SUBSCRIBED_CHANNEL',
          accountId: 'pipeline-account',
          processingReference: 'policy:test',
          monitoringState: 'ACTIVE',
          monitoringActorUserId: 'actor',
        },
      });
      let grants = JSON.stringify([
        {
          workspaceId: 'pipeline-w',
          sourceKey: source.normalizedKey,
          accountId: 'pipeline-account',
          channelId: '123456',
          reference: 'policy:test',
          ingest: true,
          ai: true,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      const originalGrants = grants;
      const config = {
        get: (key: string) =>
          key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
            ? 'true'
            : key === 'INTERNAL_LEAD_DISCOVERY_GRANTS'
              ? grants
              : undefined,
      } as ConfigService;
      const auth = {
        require: jest.fn().mockResolvedValue({ workspaceId: 'pipeline-w' }),
        refresh: jest.fn().mockResolvedValue(undefined),
      } as unknown as WorkspaceAuthorizationService;
      const policy = new TelegramLeadPolicy(db, auth, config);
      const read = new TelegramLeadReadService(db, policy);
      const candidates = new TelegramLeadCandidateService(
        db,
        policy,
        read,
        {} as TelegramLeadCrmLinker,
      );
      const calls: string[] = [];
      const gateway = {
        execute: jest.fn(
          async (req: { category: string; businessObjectId: string }) => {
            calls.push(req.category);
            const row = await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: req.businessObjectId },
            });
            if (row.text === 'Unknown paid outcome')
              return {
                operation: { id: 'unknown', status: 'UNKNOWN' },
                replayed: false,
              };
            const advert = row.text.startsWith('Project ');
            return {
              operation: {
                id: `mock-${row.id}-${req.category}`,
                status: 'SUCCEEDED',
              },
              replayed: false,
              result:
                req.category === 'LEAD_AD_CLASSIFICATION'
                  ? {
                      classification: row.text.includes('взаимопиар')
                        ? 'MUTUAL_PROMOTION'
                        : advert
                          ? 'ADVERTISEMENT'
                          : 'ORGANIC_CONTENT',
                      commercialIntent: advert,
                      niche: '',
                      offerType: '',
                      hasContact: false,
                      relevance: 'POSSIBLE',
                      confidence: 1,
                      risks: [],
                      evidence: advert ? ['e1'] : [],
                    }
                  : {
                      projectName: row.text.includes('Alpha')
                        ? 'Project Alpha'
                        : 'Project Beta',
                      productName: '',
                      contacts: [],
                      warnings: [],
                    },
            };
          },
        ),
      };
      const analysis = new TelegramLeadAnalysisService(
        db,
        policy,
        gateway as unknown as AiGateway,
        candidates,
      );
      const reconciliation = new TelegramLeadReconciliationService(db, policy);
      const ingest = new TelegramLeadIngestService(db, policy);
      const texts = [
        ...Array(90).fill('Ordinary repeated text'),
        'Project Alpha advert',
        'Project Alpha advert',
        'Project Beta advert',
        'Ambiguous post',
        'Unknown paid outcome',
        ...Array(5).fill('Missing metadata'),
      ];
      let pageIndex = 0;
      let scanError: unknown;
      const transport = {
        scan: jest.fn(
          async (
            userId: string,
            sourceId: string,
            input: { historyLeaseToken: string },
          ) => {
            const page = pageIndex++;
            const slice = texts.slice(page * 50, page * 50 + 50);
            const now = new Date();
            const items = slice.map((text, i) => ({
              externalMessageId: String(page * 50 + i + 1),
              text,
              publishedAt: new Date(
                now.getTime() - (page * 50 + i) * 1000,
              ).toISOString(),
              messageUrl: `https://t.me/pipeline_source/${page * 50 + i + 1}`,
            }));
            const complete = Object.fromEntries(
              items.map((item) => [
                item.externalMessageId,
                item.text !== 'Missing metadata',
              ]),
            );
            const result = await ingest
              .ingest(userId, sourceId, items, {
                historyLeaseToken: input.historyLeaseToken,
                expectedTransport: leadTransportSnapshot(source),
                postMetadataComplete: complete,
                postMetadataTextOnly: complete,
                postTargetEvidence: Object.fromEntries(
                  items.map((item) => [
                    item.externalMessageId,
                    extractLeadTargetEvidence(item.text),
                  ]),
                ),
              })
              .catch((error: unknown) => {
                scanError = error;
                throw error;
              });
            return {
              ...result,
              hasMore: page === 0,
              nextBeforeId: page === 0 ? 50 : null,
              reachedCutoff: false,
              historySourceSnapshot: leadTransportSnapshot(source),
            };
          },
        ),
      };
      const moduleRef = {
        registerRequestByContextId: jest.fn(),
        resolve: jest.fn(async (provider) =>
          provider === TelegramLeadPolicy
            ? policy
            : provider === TelegramLeadCandidateService
              ? candidates
              : provider === TelegramLeadAnalysisService
                ? analysis
                : provider === TelegramLeadTransportService
                  ? transport
                  : reconciliation,
        ),
      } as unknown as ModuleRef;
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      const events = {
        stream: new Subject(),
      } as unknown as TelegramLeadTransportEvents;
      worker = new TelegramLeadHistoryWorker(
        db,
        moduleRef,
        events,
        config,
        executor,
      );
      let history = new TelegramLeadHistoryJobService(
        db,
        policy,
        worker,
        {
          liveAccountIds: () => ['pipeline-account'],
        } as unknown as TelegramCrmRuntimeManager,
        reconciliation,
        executor,
      );
      await history.start('actor', source.id);
      for (let i = 0; i < 2000; i++) {
        const job = await prisma.telegramLeadHistoryJob.findFirst({
          where: { sourceId: source.id },
        });
        const done = await prisma.telegramLeadAnalysisQueue.count({
          where: {
            sourceId: source.id,
            status: {
              in: ['COMPLETED', 'UNKNOWN', 'FAILED', 'NEEDS_METADATA'],
            },
          },
        });
        if (job?.status === 'FAILED')
          throw scanError ?? new Error(`History failed: ${job.lastErrorCode}`);
        if (job?.status === 'COMPLETED' && done === 100) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const queued = await prisma.telegramLeadAnalysisQueue.findMany({
        where: { sourceId: source.id },
      });
      const count = (decision: string) =>
        queued.filter((row) => row.prefilterDecision === decision).length;
      expect(transport.scan).toHaveBeenCalledTimes(2);
      expect(queued).toHaveLength(100);
      expect(count('SAFE_SKIP')).toBe(90);
      expect(count('NEEDS_AI')).toBe(5);
      expect(count('NEEDS_METADATA')).toBe(5);
      const missing = queued.find(
        (row) => row.prefilterDecision === 'NEEDS_METADATA',
      )!;
      expect(
        (await read.observation('actor', missing.observationId))
          .processingStatus,
      ).toBe('MANUAL_REVIEW_METADATA');
      expect(queued.filter((row) => row.status === 'UNKNOWN')).toHaveLength(1);
      expect(queued.filter((row) => row.status === 'FAILED')).toHaveLength(0);
      expect(gateway.execute).toHaveBeenCalledTimes(7);
      expect(
        await prisma.telegramLeadCandidate.count({
          where: { workspaceId: 'pipeline-w' },
        }),
      ).toBe(2);
      executor.onApplicationShutdown();
      const pending = await prisma.telegramLeadObservation.create({
        data: {
          id: 'restart-observation',
          workspaceId: 'pipeline-w',
          sourceId: source.id,
          externalMessageId: '101',
          publishedAt: new Date(),
          observedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          text: 'Ordinary repeated text',
          links: [],
          contentHash: 'restart-hash',
          targetEvidence: [],
          metadataComplete: true,
          metadataTextOnly: true,
        },
      });
      await prisma.telegramLeadAnalysisQueue.create({
        data: {
          id: 'restart-queue',
          workspaceId: 'pipeline-w',
          sourceId: source.id,
          observationId: pending.id,
          contentHash: pending.contentHash,
          bindingRevision: source.bindingRevision,
          actorUserId: 'actor',
        },
      });
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      history = new TelegramLeadHistoryJobService(db, policy, worker, { liveAccountIds: () => ['pipeline-account'] } as unknown as TelegramCrmRuntimeManager, reconciliation, executor);
      await executor.onApplicationBootstrap();
      for (let i = 0; i < 300; i++) {
        if (
          (
            await prisma.telegramLeadAnalysisQueue.findUnique({
              where: { id: 'restart-queue' },
            })
          )?.status === 'COMPLETED'
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'restart-queue' },
          })
        ).status,
      ).toBe('COMPLETED');
      expect(gateway.execute).toHaveBeenCalledTimes(7);

      const addPending = async (id: string, text: string, order: number) => {
        await prisma.telegramLeadObservation.create({
          data: {
            id,
            workspaceId: 'pipeline-w',
            sourceId: source.id,
            externalMessageId: id,
            publishedAt: new Date(),
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            text,
            links: [],
            contentHash: `hash-${id}`,
            metadataComplete: true,
            metadataTextOnly: !text.includes('@'),
            targetEvidence: extractLeadTargetEvidence(text),
          },
        });
        await prisma.telegramLeadAnalysisQueue.create({
          data: {
            id: `q-${id}`,
            workspaceId: 'pipeline-w',
            sourceId: source.id,
            observationId: id,
            contentHash: `hash-${id}`,
            bindingRevision: source.bindingRevision,
            actorUserId: 'actor',
            createdAt: new Date(Date.now() + order),
          },
        });
      };
      await addPending('pause-observation', 'Project Pause advert', -2000);
      await addPending('pause-following', 'A different ambiguous project offer', -1000);
      let release!: () => void;
      let called!: () => void;
      const started = new Promise<void>((resolve) => {
        called = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      gateway.execute.mockImplementationOnce(async () => {
        called();
        await gate;
        return {
          operation: { id: 'pause-mock', status: 'SUCCEEDED' },
          replayed: false,
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
        };
      });
      const work = {
        userId: 'actor',
        workspaceId: 'pipeline-w',
        sourceId: source.id,
      };
      const running = executor.runSource(work);
      await started;
      const callCountAtPause = gateway.execute.mock.calls.length;
      expect((await history.progress('actor', source.id)).analysis.running).toBe(1);
      await history.pause('actor', source.id);
      release();
      await running;
      expect(gateway.execute).toHaveBeenCalledTimes(callCountAtPause);
      const pausedProgress = await history.progress('actor', source.id);
      expect(pausedProgress.analysisEnabled).toBe(false);
      expect(pausedProgress.collection?.status).toBe('COMPLETED');
      expect(pausedProgress.analysis.waiting).toBeGreaterThan(0);
      const paused = await prisma.telegramLeadObservation.findUniqueOrThrow({
        where: { id: 'pause-observation' },
      });
      expect(paused.classification).toBeNull();
      expect(paused.candidateId).toBeNull();
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-pause-observation' },
          })
        ).status,
      ).toBe('UNKNOWN');

      await history.resume('actor', source.id);
      for (let i = 0; i < 300; i++) {
        if ((await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({ where: { id: 'q-pause-following' } })).status === 'COMPLETED') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect((await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({ where: { id: 'q-pause-following' } })).status).toBe('COMPLETED');
      executor.onApplicationShutdown();
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      await addPending('budget-observation', 'Project Budget advert', -2000);
      await addPending('after-budget', 'Project After advert', -1000);
      const callsBeforeBudget = gateway.execute.mock.calls.length;
      gateway.execute.mockRejectedValueOnce(
        new ConflictException('AI_BUDGET_EXHAUSTED'),
      );
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadAutoConfig.findUniqueOrThrow({
            where: {
              sourceId_workspaceId: {
                sourceId: source.id,
                workspaceId: 'pipeline-w',
              },
            },
          })
        ).enabled,
      ).toBe(false);
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-budget-observation' },
          })
        ).status,
      ).toBe('FAILED');
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q-after-budget' },
          })
        ).status,
      ).toBe('WAIT_AUTH_RECHECK');
      expect(gateway.execute).toHaveBeenCalledTimes(callsBeforeBudget + 1);
      await reconciliation.setEnabled('actor', source.id, true);
      grants = '[]';
      await expect(executor.runSource(work)).rejects.toThrow();
      expect(gateway.execute).toHaveBeenCalledTimes(callsBeforeBudget + 1);

      const target = await prisma.telegramLeadSource.create({
        data: {
          id: 'target-b',
          workspaceId: 'pipeline-w',
          type: 'TELEGRAM_CHANNEL',
          normalizedKey: 'telegram:username:target_channel',
          channelId: '98765',
          username: 'target_channel',
          title: 'Project Beta',
          accountId: 'pipeline-account',
          accessType: 'SUBSCRIBED_CHANNEL',
          processingReference: 'policy:target',
          monitoringState: 'ACTIVE',
          monitoringActorUserId: 'actor',
        },
      });
      grants = JSON.stringify([
        ...JSON.parse(originalGrants),
        {
          workspaceId: 'pipeline-w',
          sourceKey: target.normalizedKey,
          accountId: 'pipeline-account',
          channelId: target.channelId,
          reference: 'policy:target',
          ingest: true,
          ai: true,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      await prisma.telegramLeadAnalysisQueue.update({
        where: { id: 'q-after-budget' },
        data: { status: 'NEEDS_METADATA' },
      });
      const aiCallsBeforeAmbiguous = gateway.execute.mock.calls.length;
      await addPending(
        'target-ad',
        'Project Beta реклама подписывайтесь @target_channel',
        -2000,
      );
      await addPending(
        'target-vp',
        'Project Beta взаимопиар подписывайтесь @target_channel',
        -1000,
      );
      await executor.runSource(work);
      expect(gateway.execute).toHaveBeenCalledTimes(aiCallsBeforeAmbiguous + 4);
      const targetRows = await prisma.telegramLeadAnalysisQueue.findMany({
        where: { id: { in: ['q-target-ad', 'q-target-vp'] } },
        orderBy: { id: 'asc' },
      });
      expect(targetRows.map((row) => row.prefilterDecision)).toEqual([
        'LIKELY_AD',
        'LIKELY_VP',
      ]);
      expect(
        targetRows.every((row) =>
          JSON.stringify(row.prefilterTargets).includes('98765'),
        ),
      ).toBe(true);
      expect(targetRows.map((row) => row.status)).toEqual([
        'COMPLETED',
        'COMPLETED',
      ]);
      const targetPosts = await prisma.telegramLeadObservation.findMany({
        where: { id: { in: ['target-ad', 'target-vp'] } },
      });
      expect(targetPosts[0].candidateId).toBeTruthy();
      expect(targetPosts[0].candidateId).toBe(targetPosts[1].candidateId);
      const targetCandidate = await read.candidate(
        'actor',
        targetPosts[0].candidateId!,
      );
      expect(targetCandidate.title).toBe('Project Beta');
      const directed = await prisma.telegramLeadPromotion.findUniqueOrThrow({
        where: {
          workspaceId_observationId: {
            workspaceId: 'pipeline-w',
            observationId: 'target-ad',
          },
        },
      });
      expect(directed).toMatchObject({
        sourceChannelId: '123456',
        targetChannelId: '98765',
        verificationStatus: 'PROMOTION_VERIFIED',
        pairedObservationId: null,
      });
      expect(
        (await read.observation('actor', 'target-ad')).promotion?.status,
      ).toBe('AD');
      expect(
        (await read.observation('actor', 'target-vp')).promotion?.status,
      ).toBe('POSSIBLE_VP');
      const paidCallsBeforeDeterministic = gateway.execute.mock.calls.length;
      await addPending(
        'explicit-ad',
        '#реклама подписывайтесь @target_channel',
        -1000,
      );
      await executor.runSource(work);
      const explicit = await prisma.telegramLeadObservation.findUniqueOrThrow({
        where: { id: 'explicit-ad' },
        include: { analysisQueue: true },
      });
      expect(explicit.analysisQueue[0].prefilterDecision).toBe('LIKELY_AD');
      expect(explicit.candidateId).toBe(targetPosts[0].candidateId);
      expect(gateway.execute).toHaveBeenCalledTimes(
        paidCallsBeforeDeterministic,
      );
      await prisma.telegramLeadObservation.update({
        where: { id: explicit.id },
        data: { candidateId: null },
      });
      await prisma.telegramLeadAnalysisQueue.update({
        where: { id: explicit.analysisQueue[0].id },
        data: { status: 'WAIT_AUTH_RECHECK' },
      });
      await executor.runSource(work);
      expect(
        (
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: explicit.id },
          })
        ).candidateId,
      ).toBe(targetPosts[0].candidateId);
      expect(gateway.execute).toHaveBeenCalledTimes(
        paidCallsBeforeDeterministic,
      );
      const hiddenText = 'Project Beta реклама подписывайтесь';
      const metadataBase = {
        complete: true,
        incompleteReasons: [],
        entityUrls: [] as string[],
        inlineButtonUrls: [] as string[],
        mentions: [] as string[],
        hasForwardMetadata: false,
        forwardChannelId: null,
        hasMedia: false,
        mediaType: null,
      };
      const hidden = extractLeadTargetEvidence(hiddenText, {
        ...metadataBase,
        entityUrls: ['https://t.me/target_channel'],
        textUrls: ['https://t.me/target_channel'],
      });
      const button = extractLeadTargetEvidence(hiddenText, {
        ...metadataBase,
        inlineButtonUrls: ['https://t.me/target_channel'],
      });
      await ingest.ingest(
        'actor',
        source.id,
        [
          {
            externalMessageId: '201',
            text: hiddenText,
            publishedAt: new Date().toISOString(),
          },
          {
            externalMessageId: '202',
            text: hiddenText,
            publishedAt: new Date().toISOString(),
          },
        ],
        {
          postMetadataComplete: { '201': true, '202': true },
          postMetadataTextOnly: { '201': false, '202': false },
          postTargetEvidence: { '201': hidden, '202': button },
        },
      );
      await executor.runSource(work);
      const hiddenPosts = await prisma.telegramLeadObservation.findMany({
        where: {
          sourceId: source.id,
          externalMessageId: { in: ['201', '202'] },
        },
        orderBy: { externalMessageId: 'asc' },
        include: { analysisQueue: true },
      });
      expect(
        hiddenPosts.map((row) => row.analysisQueue[0].prefilterDecision),
      ).toEqual(['LIKELY_AD', 'LIKELY_AD']);
      expect(hiddenPosts[0].candidateId).toBe(targetPosts[0].candidateId);
      expect(hiddenPosts[1].candidateId).toBe(targetPosts[0].candidateId);
      expect(JSON.stringify(hiddenPosts[0].targetEvidence)).toContain(
        'TEXT_URL',
      );
      expect(
        JSON.stringify(
          (await read.observation('actor', hiddenPosts[0].id)).targetEvidence,
        ),
      ).toContain('TEXT_URL');
      expect(JSON.stringify(hiddenPosts[1].targetEvidence)).toContain(
        'INLINE_BUTTON',
      );

      await reconciliation.setEnabled('actor', target.id, true);
      const ingestTarget = async (id: string, text: string, at: Date) => {
        await ingest.ingest(
          'actor',
          target.id,
          [
            {
              externalMessageId: id,
              text,
              publishedAt: at.toISOString(),
              messageUrl: `https://t.me/target_channel/${id}`,
            },
          ],
          {
            postMetadataComplete: { [id]: true },
            postMetadataTextOnly: { [id]: false },
            postTargetEvidence: { [id]: extractLeadTargetEvidence(text) },
          },
        );
        await executor.runSource({
          userId: 'actor',
          workspaceId: 'pipeline-w',
          sourceId: target.id,
        });
        return prisma.telegramLeadObservation.findFirstOrThrow({
          where: {
            workspaceId: 'pipeline-w',
            sourceId: target.id,
            externalMessageId: id,
          },
        });
      };
      const paidBeforePair = gateway.execute.mock.calls.length;
      const outside = await ingestTarget(
        '301',
        '#реклама подписывайтесь @pipeline_source',
        new Date(Date.now() - 8 * 86400000),
      );
      expect(
        (await read.observation('actor', outside.id)).promotion?.status,
      ).toBe('AD');
      const reverse = await ingestTarget(
        '302',
        '#реклама подписывайтесь @pipeline_source',
        new Date(),
      );
      const reverseView = await read.observation('actor', reverse.id);
      expect(reverseView.promotion?.status).toBe(
        'RECIPROCAL_PROMOTION_EVIDENCED',
      );
      const matchedId = reverseView.promotion!.reciprocal!.observationId;
      const matchedView = await read.observation('actor', matchedId);
      expect(matchedView.promotion?.status).toBe(
        'RECIPROCAL_PROMOTION_EVIDENCED',
      );
      expect(matchedView.promotion?.reciprocal?.observationId).toBe(reverse.id);
      expect(matchedView.promotion?.reciprocal?.messageUrl).toBe(
        'https://t.me/target_channel/302',
      );
      expect(matchedView.promotion?.reciprocal?.publishedAt).toBe(
        reverse.publishedAt.toISOString(),
      );
      const activeGrants = grants;
      grants = '[]';
      expect((await read.observation('actor', matchedId)).promotion).toBeNull();
      grants = activeGrants;
      expect(gateway.execute).toHaveBeenCalledTimes(paidBeforePair);
      const edges = await prisma.telegramLeadPromotion.count({
        where: { workspaceId: 'pipeline-w' },
      });
      await executor.runSource({
        userId: 'actor',
        workspaceId: 'pipeline-w',
        sourceId: target.id,
      });
      expect(
        await prisma.telegramLeadPromotion.count({
          where: { workspaceId: 'pipeline-w' },
        }),
      ).toBe(edges);
      const catalog = await ingestTarget(
        '303',
        '#реклама подборка каналов подписывайтесь @pipeline_source',
        new Date(),
      );
      expect(
        await prisma.telegramLeadPromotion.findUnique({
          where: {
            workspaceId_observationId: {
              workspaceId: 'pipeline-w',
              observationId: catalog.id,
            },
          },
        }),
      ).toBeNull();
      const article = await ingestTarget(
        '304',
        'Статья о канале @pipeline_source',
        new Date(),
      );
      expect(
        await prisma.telegramLeadPromotion.findUnique({
          where: {
            workspaceId_observationId: {
              workspaceId: 'pipeline-w',
              observationId: article.id,
            },
          },
        }),
      ).toBeNull();
      // Earlier cases deliberately leave unpaired A→B evidence within the
      // pairing window. Remove only those fixtures so this concurrency case
      // has exactly one eligible reverse observation regardless of lock order.
      await prisma.telegramLeadPromotion.deleteMany({
        where: {
          workspaceId: 'pipeline-w',
          observationId: { in: ['target-ad', 'target-vp'] },
          pairedObservationId: null,
        },
      });
      const sharedCreative =
        '#реклама подписывайтесь @pipeline_source @target_channel';
      const sharedAt = new Date();
      const createShared = async (sourceId: string, externalId: string) => {
        await ingest.ingest(
          'actor',
          sourceId,
          [
            {
              externalMessageId: externalId,
              text: sharedCreative,
              publishedAt: sharedAt.toISOString(),
            },
          ],
          {
            postMetadataComplete: { [externalId]: true },
            postMetadataTextOnly: { [externalId]: false },
            postTargetEvidence: {
              [externalId]: extractLeadTargetEvidence(sharedCreative),
            },
          },
        );
      };
      await createShared(source.id, '401');
      await createShared(target.id, '402');
      const secondExecutor = new TelegramLeadAnalysisExecutor(
        db,
        moduleRef,
        config,
      );
      const callsBeforeShared = gateway.execute.mock.calls.length;
      await Promise.all([
        executor.runSource(work),
        secondExecutor.runSource({ ...work, sourceId: target.id }),
      ]);
      secondExecutor.onApplicationShutdown();
      const sharedPosts = await prisma.telegramLeadObservation.findMany({
        where: {
          workspaceId: 'pipeline-w',
          externalMessageId: { in: ['401', '402'] },
        },
        orderBy: { externalMessageId: 'asc' },
      });
      const firstShared = await read.observation('actor', sharedPosts[0].id);
      const secondShared = await read.observation('actor', sharedPosts[1].id);
      expect(firstShared.promotion?.status).toBe(
        'RECIPROCAL_PROMOTION_EVIDENCED',
      );
      expect(firstShared.promotion?.reciprocal?.observationId).toBe(
        sharedPosts[1].id,
      );
      expect(secondShared.promotion?.reciprocal?.observationId).toBe(
        sharedPosts[0].id,
      );
      expect(gateway.execute).toHaveBeenCalledTimes(callsBeforeShared);
      expect(
        await prisma.telegramLeadPromotion.count({
          where: {
            workspaceId: 'pipeline-w',
            observationId: { in: sharedPosts.map((row) => row.id) },
          },
        }),
      ).toBe(2);
      await prisma.telegramLeadSource.update({
        where: { id: target.id },
        data: { username: 'changed_binding_username' },
      });
      expect((await read.observation('actor', matchedId)).promotion).toBeNull();
      expect(
        (await read.observation('actor', reverse.id)).promotion,
      ).toBeNull();
    }, 30000);
  },
);
