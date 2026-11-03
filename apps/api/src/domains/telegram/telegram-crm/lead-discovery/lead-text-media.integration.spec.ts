import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import {
  claimLeadAnalysis,
  finishLeadAnalysisClaim,
} from './lead-analysis-claim';
import { routeLeadAnalysis } from './lead-analysis-routing';
import type { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';

const url = process.env.LEAD_METADATA_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'text and media routing with PostgreSQL',
  () => {
    it('keeps positive text, uncertain media, missing entities, and workspace isolation distinct', async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const db = prisma as unknown as PrismaService;
      try {
        const workspaceId = 'text-media-workspace',
          sourceId = 'text-media-source',
          actor = 'text-media-actor';
        await prisma.workspace.create({
          data: { id: workspaceId, name: 'Synthetic routing' },
        });
        await prisma.telegramUserAccountIntegration.create({
          data: {
            id: 'text-media-account',
            workspaceId,
            label: 'test',
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
            normalizedKey: 'telegram:username:source_test',
            username: 'source_test',
            channelId: '111',
            title: 'Source',
            accountId: 'text-media-account',
            accessType: 'SUBSCRIBED_CHANNEL',
            processingReference: 'policy:test',
            monitoringState: 'ACTIVE',
            monitoringActorUserId: actor,
          },
        });
        await prisma.telegramLeadSource.create({
          data: {
            id: 'text-media-target',
            workspaceId,
            type: 'TELEGRAM_CHANNEL',
            normalizedKey: 'telegram:username:target_test',
            username: 'target_test',
            channelId: '222',
            title: 'Target',
            accountId: 'text-media-account',
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
        const samples = [
          {
            text: '#реклама подписывайтесь @target_test',
            complete: true,
            result: 'LIKELY_AD',
            evidence: [
              {
                kind: 'TELEGRAM_USERNAME',
                value: 'target_test',
                origin: 'MENTION',
                confidence: 'UNVERIFIED',
              },
            ],
          },
          {
            text: 'Реклама подписывайтесь @target_test',
            complete: true,
            result: 'LIKELY_AD',
            evidence: [
              {
                kind: 'TELEGRAM_USERNAME',
                value: 'target_test',
                origin: 'MENTION',
                confidence: 'UNVERIFIED',
              },
            ],
          },
          {
            text: 'Обычный текст',
            complete: true,
            result: 'NEEDS_MEDIA_ANALYSIS',
            evidence: [],
          },
          {
            text: '',
            complete: true,
            result: 'NEEDS_MEDIA_ANALYSIS',
            evidence: [],
          },
          {
            text: '#реклама подписывайтесь @target_test',
            complete: false,
            result: 'NEEDS_METADATA',
            evidence: [],
          },
          {
            text: 'Розпродаж. Ціна 100 грн. Замовити https://independent.example/',
            complete: false,
            result: 'LIKELY_AD',
            evidence: [
              {
                kind: 'PUBLIC_URL',
                value: 'https://independent.example/',
                origin: 'TEXT',
                confidence: 'UNVERIFIED',
              },
            ],
          },
          {
            text: 'Розпродаж. Ціна 200 грн. Замовити https://independent.example/',
            complete: true,
            result: 'LIKELY_AD',
            evidence: [
              {
                kind: 'PUBLIC_URL',
                value: 'https://independent.example/',
                origin: 'TEXT',
                confidence: 'UNVERIFIED',
              },
            ],
          },
          {
            text: 'Розпродаж. Ціна 200 грн. Замовити @shop_manager',
            complete: true,
            result: 'LIKELY_AD',
            evidence: [
              {
                kind: 'TELEGRAM_USERNAME',
                value: 'shop_manager',
                origin: 'MENTION',
                confidence: 'UNVERIFIED',
              },
            ],
          },
        ];
        let firstProvisionalCandidate: string | undefined;
        for (const [index, sample] of samples.entries()) {
          const observation = await prisma.telegramLeadObservation.create({
            data: {
              id: `text-media-observation-${index}`,
              workspaceId,
              sourceId,
              externalMessageId: String(index + 1),
              messageUrl: `https://t.me/source_test/${index + 1}`,
              publishedAt: new Date(),
              observedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
              text: sample.text,
              links: [],
              contentHash: `hash-${index}`,
              metadataComplete: false,
              metadataTextOnly: false,
              textMetadataComplete: sample.complete,
              mediaPresent: true,
              targetEvidence: sample.evidence,
            },
          });
          await prisma.telegramLeadAnalysisQueue.create({
            data: {
              id: `text-media-queue-${index}`,
              workspaceId,
              sourceId,
              observationId: observation.id,
              contentHash: observation.contentHash,
              bindingRevision: source.bindingRevision,
              actorUserId: actor,
            },
          });
          const claim = await claimLeadAnalysis(
            db,
            workspaceId,
            sourceId,
            60_000,
          );
          expect(claim).not.toBeNull();
          const result = await routeLeadAnalysis(db, policy, claim!);
          expect(result.decision).toBe(sample.result);
          if (index === 0)
            expect(result.deterministicTitle).toBe('@target_test');
          else expect(result.deterministicTitle).toBeNull();
          if (index === 1 || index === 5 || index === 6) {
            expect(result.mediaUnanalyzed).toBe(true);
            const stored =
              await prisma.telegramLeadObservation.findUniqueOrThrow({
                where: { id: observation.id },
              });
            expect(stored.processingStatus).toBe('MANUAL_REVIEW_TEXT');
            expect(stored.classification).toBeNull();
            const queue =
              await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
                where: { id: claim!.id },
              });
            if (index === 5 || index === 6)
              expect(queue.prefilterTargets).toEqual(sample.evidence);
          }
          if (index === 5 || index === 6) {
            expect(result.textCandidate).not.toBeNull();
            const candidates = new TelegramLeadCandidateService(
              db,
              policy,
              {} as never,
              {} as never,
            );
            const id = await candidates.materialCandidate(
              workspaceId,
              actor,
              observation.id,
              result.textCandidate!,
              observation.contentHash,
              'ai',
              true,
              result.sourceSnapshot,
              claim!,
              result.textCandidate!.title,
            );
            const saved = await prisma.telegramLeadCandidate.findUniqueOrThrow({
              where: { id },
            });
            if (index === 5) firstProvisionalCandidate = id;
            else expect(id).toBe(firstProvisionalCandidate);
            expect(saved.contacts).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  role: 'ADVERTISED_DESTINATION',
                  confirmed: false,
                  evidenceUrl: observation.messageUrl,
                }),
              ]),
            );
            expect(saved.reviewStatus).toBe('PENDING');
            expect(
              await candidates.materialCandidate(
                workspaceId,
                actor,
                observation.id,
                result.textCandidate!,
                observation.contentHash,
                'ai',
                true,
                result.sourceSnapshot,
                claim!,
                result.textCandidate!.title,
              ),
            ).toBe(id);
          }
          if (index === 7) {
            const stored =
              await prisma.telegramLeadObservation.findUniqueOrThrow({
                where: { id: observation.id },
              });
            expect(stored.candidateId).toBeNull();
            expect(stored.extraction).toMatchObject({
              projectName: '',
              warnings: ['UNRESOLVED_PROJECT', 'MANUAL_REVIEW_REQUIRED'],
              contacts: [
                expect.objectContaining({
                  value: '@shop_manager',
                  role: 'SALES_CONTACT',
                  confirmed: false,
                  evidenceUrl: observation.messageUrl,
                }),
              ],
            });
          }
          await finishLeadAnalysisClaim(
            db,
            claim!,
            result.decision === 'NEEDS_METADATA'
              ? 'NEEDS_METADATA'
              : index === 1 || index === 5 || index === 6 || index === 7
                ? 'NEEDS_REVIEW'
                : result.decision === 'NEEDS_MEDIA_ANALYSIS'
                  ? 'NEEDS_MEDIA_ANALYSIS'
                  : 'COMPLETED',
          );
        }
        expect(await prisma.aiOperation.count({ where: { workspaceId } })).toBe(
          0,
        );
        expect(
          await prisma.telegramLeadCandidate.count({ where: { workspaceId } }),
        ).toBe(1);
        await expect(
          routeLeadAnalysis(db, policy, {
            id: 'foreign',
            workspaceId: 'another-workspace',
            sourceId,
            observationId: 'foreign-observation',
            contentHash: 'x',
            bindingRevision: source.bindingRevision,
            actorUserId: actor,
            claimToken: 'foreign',
          }),
        ).rejects.toThrow('LEAD_SOURCE_CHANGED');
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
