import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import type { AiGateway } from '../../../operations/ai/ai-gateway';
import type { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import type { TelegramLeadCrmLinker } from './lead-crm-linker.service';
import { TelegramLeadAnalysisService } from './lead-analysis.service';
import { TelegramLeadReconciliationService } from './lead-reconciliation.service';
import { expireLeadAnalysisClaims } from './lead-analysis-claim';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import { TelegramLeadHistoryJobService } from './lead-history-job.service';
import type { TelegramLeadHistoryWorker } from './lead-history-worker.service';

const url = process.env.LEAD_EXECUTOR_TEST_DATABASE_URL;
const isolated = url ? describe : describe.skip;
isolated(
  'source action executes persisted lead queue (isolated PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let executor: TelegramLeadAnalysisExecutor;
    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
    });
    afterAll(async () => {
      executor?.onApplicationShutdown();
      await prisma.$disconnect();
    });
    it('persists and reads advertisers with and without contacts, without repeat AI', async () => {
      await prisma.workspace.create({ data: { id: 'w', name: 'Isolated' } });
      await prisma.telegramUserAccountIntegration.create({
        data: {
          id: 'account',
          workspaceId: 'w',
          label: 'mock',
          apiId: '0',
          apiHashEncrypted: 'x',
          apiHashIv: 'x',
          apiHashAuthTag: 'x',
        },
      });
      await prisma.telegramLeadSource.create({
        data: {
          id: 'source',
          workspaceId: 'w',
          type: 'TELEGRAM_CHANNEL',
          normalizedKey: 'telegram:username:source_channel',
          channelId: '12345',
          username: 'source_channel',
          title: 'Source',
          accountId: 'account',
          processingReference: 'policy:test',
          monitoringState: 'ACTIVE',
          monitoringActorUserId: 'actor',
        },
      });
      const texts = [
        'Project Alpha course contact us @business_contact',
        'Project Beta course with no contact',
      ];
      for (let i = 0; i < texts.length; i++)
        await prisma.telegramLeadObservation.create({
          data: {
            id: `o${i}`,
            workspaceId: 'w',
            sourceId: 'source',
            externalMessageId: String(i + 1),
            messageUrl: `https://t.me/source_channel/${i + 1}`,
            publishedAt: new Date(),
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            text: texts[i],
            links: [],
            contentHash: `hash${i}`,
            metadataComplete: true,
          },
        });
      const grants = JSON.stringify([
        {
          workspaceId: 'w',
          sourceKey: 'telegram:username:source_channel',
          accountId: 'account',
          channelId: '12345',
          reference: 'policy:test',
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
      const auth = {
        require: jest.fn().mockResolvedValue({ workspaceId: 'w' }),
        refresh: jest.fn().mockResolvedValue(undefined),
      } as unknown as WorkspaceAuthorizationService;
      const db = prisma as PrismaService;
      const policy = new TelegramLeadPolicy(db, auth, config);
      const read = new TelegramLeadReadService(db, policy);
      const candidates = new TelegramLeadCandidateService(
        db,
        policy,
        read,
        {} as TelegramLeadCrmLinker,
      );
      const execute = jest.fn(
        async (request: { category: string; businessObjectId: string }) => {
          const i = request.businessObjectId === 'o0' ? 0 : 1;
          return {
            operation: {
              id: `mock-${request.category}-${i}`,
              status: 'SUCCEEDED',
            },
            replayed: false,
            result:
              request.category === 'LEAD_AD_CLASSIFICATION'
                ? {
                    classification: 'ADVERTISEMENT',
                    commercialIntent: true,
                    niche: '',
                    offerType: '',
                    hasContact: i === 0,
                    relevance: 'POSSIBLE',
                    confidence: 1,
                    risks: [],
                    evidence: ['e1'],
                  }
                : {
                    projectName: i === 0 ? 'Project Alpha' : 'Project Beta',
                    productName: '',
                    contacts:
                      i === 0
                        ? [
                            {
                              type: 'TELEGRAM',
                              value: '@business_contact',
                              role: 'SALES_CONTACT',
                              evidence: '@business_contact',
                            },
                          ]
                        : [],
                    warnings: [],
                  },
          };
        },
      );
      const analysis = new TelegramLeadAnalysisService(
        db,
        policy,
        { execute } as unknown as AiGateway,
        candidates,
      );
      const reconciliation = new TelegramLeadReconciliationService(db, policy);
      const moduleRef = {
        registerRequestByContextId: jest.fn(),
        resolve: jest.fn(async (provider) =>
          provider === TelegramLeadAnalysisService
            ? analysis
            : provider === TelegramLeadPolicy
              ? policy
              : provider === TelegramLeadCandidateService
                ? candidates
                : reconciliation,
        ),
      } as unknown as ModuleRef;
      executor = new TelegramLeadAnalysisExecutor(db, moduleRef, config);
      const history = new TelegramLeadHistoryJobService(
        db,
        policy,
        { wake: jest.fn() } as unknown as TelegramLeadHistoryWorker,
        {
          liveAccountIds: () => ['account'],
        } as unknown as TelegramCrmRuntimeManager,
        reconciliation,
        executor,
      );
      await history.start('actor', 'source');
      for (let i = 0; i < 200; i++) {
        if (
          (await prisma.telegramLeadAnalysisQueue.count({
            where: { workspaceId: 'w', status: 'COMPLETED' },
          })) === 2
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const queued = await prisma.telegramLeadAnalysisQueue.findMany({
        where: { workspaceId: 'w' },
        orderBy: { observationId: 'asc' },
      });
      expect(queued.map((q) => q.status)).toEqual(['COMPLETED', 'COMPLETED']);
      const rows = await prisma.telegramLeadObservation.findMany({
        where: { workspaceId: 'w' },
        orderBy: { id: 'asc' },
      });
      expect(rows.every((row) => row.candidateId)).toBe(true);
      const views = await Promise.all(
        rows.map((row) => read.candidate('actor', row.candidateId!)),
      );
      expect(views.map((view) => view.title)).toEqual([
        'Project Alpha',
        'Project Beta',
      ]);
      expect(views[1].contacts).toEqual([]);
      expect(execute).toHaveBeenCalledTimes(4);
      await history.start('actor', 'source');
      await executor.runSource({
        userId: 'actor',
        workspaceId: 'w',
        sourceId: 'source',
      });
      expect(
        await prisma.telegramLeadCandidate.count({
          where: { workspaceId: 'w' },
        }),
      ).toBe(2);
      expect(execute).toHaveBeenCalledTimes(4);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await prisma.telegramLeadObservation.create({
        data: {
          id: 'o2',
          workspaceId: 'w',
          sourceId: 'source',
          externalMessageId: '3',
          publishedAt: new Date(),
          observedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          text: 'Project Gamma advert',
          links: [],
          contentHash: 'hash2',
          metadataComplete: true,
        },
      });
      await prisma.telegramLeadAnalysisQueue.create({
        data: {
          id: 'q2',
          workspaceId: 'w',
          sourceId: 'source',
          observationId: 'o2',
          contentHash: 'hash2',
          bindingRevision: 0,
          actorUserId: 'actor',
        },
      });
      let proceed!: () => void;
      let started!: () => void;
      const begun = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        proceed = resolve;
      });
      execute.mockImplementationOnce(async () => {
        started();
        await gate;
        return {
          operation: { id: 'late', status: 'SUCCEEDED' },
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
      const running = executor.runSource({
        userId: 'actor',
        workspaceId: 'w',
        sourceId: 'source',
      });
      await begun;
      await prisma.$executeRaw`UPDATE "TelegramLeadAnalysisQueue" SET "claimUntil"=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id='q2'`;
      expect(await expireLeadAnalysisClaims(db, 'w', 'source')).toBe(1);
      proceed();
      await running;
      expect(
        (
          await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
            where: { id: 'q2' },
          })
        ).status,
      ).toBe('UNKNOWN');
      const late = await prisma.telegramLeadObservation.findUniqueOrThrow({
        where: { id: 'o2' },
      });
      expect(late.classification).toBeNull();
      expect(late.candidateId).toBeNull();
      expect(
        await prisma.telegramLeadCandidate.count({
          where: { workspaceId: 'w' },
        }),
      ).toBe(2);
    });
  },
);
