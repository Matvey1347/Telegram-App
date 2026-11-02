import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';

const url = process.env.LEAD_SAVED_EVIDENCE_TEST_DATABASE_URL;
const path = process.env.LEAD_SAVED_EVIDENCE_FIXTURE;
type SavedPost = {
  channelId: string;
  externalMessageId: string;
  messageUrl: string | null;
  publishedAt: string;
  text: string;
  links: Prisma.InputJsonValue | null;
  targetEvidence: Prisma.InputJsonValue | null;
  metadataComplete: boolean;
  textMetadataComplete: boolean | null;
  mediaPresent: boolean | null;
};
(url && path ? describe : describe.skip)(
  'saved evidence on isolated PostgreSQL',
  () => {
    it('drains saved posts without AI, retaining source evidence', async () => {
      const rows = JSON.parse(readFileSync(path!, 'utf8')) as SavedPost[];
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const db = prisma as PrismaService;
      const workspaceId = 'saved-evidence-workspace',
        sourceId = 'saved-evidence-source',
        actor = 'saved-evidence-actor';
      try {
        await prisma.workspace.create({
          data: { id: workspaceId, name: 'Local saved evidence' },
        });
        await prisma.telegramUserAccountIntegration.create({
          data: {
            id: 'saved-evidence-account',
            workspaceId,
            label: 'disabled',
            apiId: '0',
            apiHashEncrypted: 'x',
            apiHashIv: 'x',
            apiHashAuthTag: 'x',
          },
        });
        const source = await prisma.telegramLeadSource.create({
          data: {
            id: sourceId,
            workspaceId,
            type: 'TELEGRAM_CHANNEL',
            normalizedKey: 'telegram:username:local_source',
            username: 'psycho_ukraina',
            channelId: String(rows[0].channelId),
            title: 'Local source',
            accountId: 'saved-evidence-account',
            accessType: 'SUBSCRIBED_CHANNEL',
            processingReference: 'policy:test',
            monitoringState: 'ACTIVE',
            monitoringActorUserId: actor,
          },
        });
        await prisma.telegramLeadAutoConfig.create({
          data: { workspaceId, sourceId, enabled: true },
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
        const executor = new TelegramLeadAnalysisExecutor(
          db,
          {} as never,
          {} as never,
        );
        Object.defineProperty(executor, 'services', {
          value: jest.fn().mockResolvedValue({
            policy,
            candidates,
            analysis,
            runtime: {
              withLiveAccountHandle: jest
                .fn()
                .mockRejectedValue(new Error('CONTROLLED_ADAPTER_OFFLINE')),
            },
            reconciliation: {
              reconcilePage: jest
                .fn()
                .mockResolvedValue({ blocked: false, complete: true }),
            },
          }),
        });
        for (const [i, row] of rows.entries()) {
          const id = `saved-post-${i}`,
            contentHash = `saved-hash-${i}`;
          await prisma.telegramLeadObservation.create({
            data: {
              id,
              workspaceId,
              sourceId,
              externalMessageId: String(row.externalMessageId),
              messageUrl: row.messageUrl,
              publishedAt: new Date(row.publishedAt),
              observedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
              text: row.text,
              links: row.links ?? [],
              contentHash,
              metadataComplete: row.metadataComplete,
              textMetadataComplete: row.textMetadataComplete,
              mediaPresent: row.mediaPresent,
              targetEvidence: row.targetEvidence ?? [],
            },
          });
          await prisma.telegramLeadAnalysisQueue.create({
            data: {
              id: `saved-queue-${i}`,
              workspaceId,
              sourceId,
              observationId: id,
              contentHash,
              bindingRevision: 0,
              actorUserId: actor,
            },
          });
        }
        for (let i = 0; i < Math.ceil(rows.length / 50) + 1; i++)
          await executor.runSource({ workspaceId, sourceId, userId: actor });
        const queue = await prisma.telegramLeadAnalysisQueue.groupBy({
          by: ['prefilterDecision', 'status'],
          where: { workspaceId },
          _count: true,
        });
        const found = await prisma.telegramLeadCandidate.findMany({
          where: { workspaceId },
          select: { id: true, identityKey: true, contacts: true, risks: true },
        });
        const observations = await prisma.telegramLeadObservation.count({
          where: { workspaceId, candidateId: { not: null } },
        });
        const business = found.filter(
          (c) =>
            Array.isArray(c.contacts) &&
            c.contacts.some(
              (x) =>
                x &&
                typeof x === 'object' &&
                !Array.isArray(x) &&
                x.role === 'SALES_CONTACT',
            ),
        ).length;
        const points = found.filter(
          (c) =>
            Array.isArray(c.contacts) &&
            c.contacts.some(
              (x) =>
                x &&
                typeof x === 'object' &&
                !Array.isArray(x) &&
                x.role === 'ADVERTISED_DESTINATION',
            ),
        ).length;
        const unresolved = found.filter((c) =>
          c.identityKey?.startsWith('unresolved-observation:'),
        ).length;
        const aiOperations = await prisma.aiOperation.count({
          where: { workspaceId },
        });
        console.log(
          'SAVED_EVIDENCE_METRICS',
          JSON.stringify({
            posts: rows.length,
            queue,
            candidates: found.length,
            observationsLinked: observations,
            business,
            points,
            unresolved,
            duplicatesCollapsed: observations - found.length,
            aiOperations,
          }),
        );
        expect(analysis.analyzeAutomatically).not.toHaveBeenCalled();
        expect(aiOperations).toBe(0);
        expect(queue.some((x) => x.prefilterDecision === 'LIKELY_AD')).toBe(
          true,
        );
        expect(found.length).toBeGreaterThan(0);
        expect(
          await prisma.telegramLeadAnalysisQueue.count({
            where: { workspaceId, status: 'FAILED' },
          }),
        ).toBe(0);
        executor.onApplicationShutdown();
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
