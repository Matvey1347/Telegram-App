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

const url = process.env.LEAD_LOAD_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'synthetic history pipeline load (isolated PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let worker: TelegramLeadHistoryWorker;
    let executor: TelegramLeadAnalysisExecutor;
    let sqlCount = 0;
    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
        log: [{ emit: 'event', level: 'query' }],
      });
      (
        prisma as unknown as {
          $on: (name: 'query', callback: () => void) => void;
        }
      ).$on('query', () => {
        sqlCount++;
      });
    });
    afterAll(async () => {
      worker?.onApplicationShutdown();
      executor?.onApplicationShutdown();
      await prisma.$disconnect();
    });
    it('processes 1000 synthetic posts with bounded mock AI', async () => {
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
        ...Array(800).fill('Ordinary repeated text'),
        ...Array(100).fill('Project Alpha advert'),
        ...Array.from({ length: 100 }, (_, i) => `Organic synthetic item ${i}`),
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
              hasMore: (page + 1) * 50 < texts.length,
              nextBeforeId:
                (page + 1) * 50 < texts.length ? 10000 - page * 50 : null,
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
      const history = new TelegramLeadHistoryJobService(
        db,
        policy,
        worker,
        {
          liveAccountIds: () => ['pipeline-account'],
        } as unknown as TelegramCrmRuntimeManager,
        reconciliation,
        executor,
      );
      sqlCount = 0;
      const started = performance.now();
      let statusReads = 0;
      await history.start('actor', source.id);
      for (let i = 0; i < 3000; i++) {
        statusReads += 2;
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
        if (job?.status === 'COMPLETED' && done === 1000) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const elapsedMs = Math.round(performance.now() - started);
      const measuredSql = sqlCount;
      const counts = await prisma.telegramLeadAnalysisQueue.groupBy({
        by: ['status', 'prefilterDecision'],
        where: { sourceId: source.id },
        _count: { _all: true },
      });
      const sizes = await prisma.$queryRaw<
        Array<{ table_name: string; total_bytes: bigint }>
      >`SELECT relname AS table_name, pg_total_relation_size(oid) AS total_bytes FROM pg_class WHERE relname IN ('TelegramLeadObservation', 'TelegramLeadAnalysisQueue', 'TelegramLeadCandidate', 'TelegramLeadHistoryJob', 'TelegramLeadAutoConfig') AND relkind='r' ORDER BY relname`;
      const rows = await prisma.telegramLeadObservation.count({
        where: { sourceId: source.id },
      });
      expect(rows).toBe(1000);
      expect(counts.reduce((sum, item) => sum + item._count._all, 0)).toBe(
        1000,
      );
      expect(counts.every((item) => item.status === 'COMPLETED')).toBe(true);
      expect(transport.scan).toHaveBeenCalledTimes(20);
      expect(
        await prisma.telegramLeadCandidate.count({
          where: { workspaceId: 'pipeline-w' },
        }),
      ).toBe(1);
      console.log(
        'MOCK_LOAD_METRICS',
        JSON.stringify({
          observations: rows,
          pages: pageIndex,
          elapsedMs,
          sqlQueriesIncludingHarness: measuredSql,
          harnessStatusReads: statusReads,
          providerCalls: gateway.execute.mock.calls.length,
          queue: counts,
          tableBytes: Object.fromEntries(
            sizes.map((item) => [item.table_name, Number(item.total_bytes)]),
          ),
        }),
      );
    }, 180000);
  },
);
