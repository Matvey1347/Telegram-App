/* eslint-disable @typescript-eslint/require-await */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AiAdmissionService } from '../../../operations/ai/ai-admission.service';
import { AiSettlementService } from '../../../operations/ai/ai-settlement.service';
import { AiGateway } from '../../../operations/ai/ai-gateway';
import { AiLocalConcurrency } from '../../../operations/ai/ai-local-concurrency';
import { AiModelRegistry } from '../../../operations/ai/ai-model-registry';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadMediaPilotService } from './lead-media-pilot.service';
import type { PrismaService } from '../../../../prisma/prisma.service';

const url = process.env.LEAD_METADATA_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'media pilot end to end with PostgreSQL',
  () => {
    it('creates an unverified image-only candidate, replays without paying, respects uncertainty, pause and revocation', async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const workspaceId = `media-test-${randomUUID()}`,
        sourceId = `source-${randomUUID()}`,
        accountId = `account-${randomUUID()}`;
      try {
        await prisma.workspace.create({
          data: { id: workspaceId, name: 'Synthetic' },
        });
        await prisma.telegramUserAccountIntegration.create({
          data: {
            id: accountId,
            workspaceId,
            label: 'mock',
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
            normalizedKey: 'telegram:username:sample',
            username: 'sample',
            channelId: '12345',
            title: 'Sample',
            accountId,
            accessType: 'SUBSCRIBED_CHANNEL',
            processingReference: 'policy:test',
            monitoringState: 'ACTIVE',
            monitoringActorUserId: 'actor',
          },
        });
        await prisma.telegramLeadAutoConfig.create({
          data: { workspaceId, sourceId, enabled: true },
        });
        await prisma.aiWorkspaceConfig.create({
          data: {
            workspaceId,
            enabled: true,
            automaticEnabled: false,
            dailyBudget: '5',
            monthlyBudget: '5',
            maxRequestCost: '1',
          },
        });
        await prisma.aiCategoryConfig.create({
          data: {
            workspaceId,
            category: 'LEAD_AD_CLASSIFICATION',
            modelId: 'gpt-5.4-mini-2026-03-17',
            enabled: true,
            automaticEnabled: false,
            maxInputTokens: 8000,
            maxOutputTokens: 1000,
            timeoutMs: 30000,
            concurrencyLimit: 2,
            dailyBudget: '5',
            monthlyBudget: '5',
            maxRequestCost: '1',
          },
        });
        const publishedAt = new Date('2026-10-01T12:00:00Z');
        for (let i = 1; i <= 5; i++)
          await prisma.telegramLeadObservation.create({
            data: {
              id: `${workspaceId}-${i}`,
              workspaceId,
              sourceId,
              externalMessageId: String(i),
              messageUrl: `https://t.me/sample/${i}`,
              publishedAt,
              observedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
              text: `caption ${i}`,
              links: [],
              contentHash: `hash-${i}`,
              targetEvidence: [],
              metadataComplete: false,
              textMetadataComplete: true,
              mediaPresent: true,
              processingStatus: 'MANUAL_REVIEW_MEDIA',
            },
          });
        for (let i = 1; i <= 5; i++)
          await prisma.telegramLeadAnalysisQueue.create({
            data: {
              id: `${workspaceId}-queue-${i}`,
              workspaceId,
              sourceId,
              observationId: `${workspaceId}-${i}`,
              contentHash: `hash-${i}`,
              bindingRevision: source.bindingRevision,
              actorUserId: 'actor',
              status: 'NEEDS_MEDIA_ANALYSIS',
            },
          });
        let grants = JSON.stringify([
          {
            workspaceId,
            sourceKey: source.normalizedKey,
            accountId,
            channelId: source.channelId,
            reference: 'policy:test',
            ingest: true,
            ai: true,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ]);
        const auth = {
          require: jest.fn().mockResolvedValue({ workspaceId }),
          refresh: jest.fn().mockResolvedValue(undefined),
        };
        const config = {
          get: (key: string) =>
            key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
              ? 'true'
              : key === 'INTERNAL_LEAD_DISCOVERY_GRANTS'
                ? grants
                : undefined,
        };
        const db = prisma as unknown as PrismaService;
        const policy = new TelegramLeadPolicy(
          db,
          auth as never,
          config as never,
        );
        const registry = new AiModelRegistry();
        const admission = new AiAdmissionService(db, registry, {
          enabled: true,
          configured: true,
        } as never);
        const settlement = new AiSettlementService(db, auth as never);
        const provider = {
          execute: jest.fn(async (input: string) => ({
            result: ['caption 1', 'caption 5'].includes(
              (JSON.parse(input) as { caption: string }).caption,
            )
              ? {
                  classification: 'ADVERTISEMENT',
                  projectName: 'Image-only project',
                  contacts: ['@image_project'],
                  evidence: 'Sponsored offer on image',
                  confidence: 0.95,
                }
              : {
                  classification: 'UNCERTAIN',
                  projectName: '',
                  contacts: [],
                  evidence: '',
                  confidence: 0.2,
                },
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
              totalTokens: 150,
            },
            errorCategory: null,
            generationStarted: true,
            providerModel: 'gpt-5.4-mini-2026-03-17',
            providerRequestId: 'mock',
          })),
        };
        const gateway = new AiGateway(
          auth as never,
          admission,
          new AiLocalConcurrency(),
          provider as never,
          settlement,
        );
        let imageByte = 1;
        const runtime = {
          withLiveAccountHandle: jest.fn(
            async (
              _workspace: string,
              _account: string,
              fn: (handle: unknown) => Promise<unknown>,
            ) =>
              fn({
                leadDiscovery: {
                  readPhoto: async (
                    _channel: string,
                    input: { messageId: number },
                  ) => ({
                    data: Buffer.from([255, 216, 255, imageByte]),
                    mime: 'image/jpeg',
                    post: {
                      text: `caption ${input.messageId}`,
                      publishedAt,
                      editedAt: null,
                    },
                  }),
                },
              }),
          ),
        };
        const pilot = new TelegramLeadMediaPilotService(
          db,
          policy,
          runtime as never,
          gateway,
        );
        const ids = [`${workspaceId}-1`, `${workspaceId}-2`];
        const first = await pilot.run('actor', sourceId, ids);
        expect(first.results.map((r) => r.status).sort()).toEqual([
          'NEEDS_MEDIA_REVIEW',
          'REVIEW_CANDIDATE',
        ]);
        expect(
          await prisma.telegramLeadCandidate.count({
            where: {
              workspaceId,
              reviewStatus: 'PENDING',
              riskStatus: 'NEEDS_REVIEW',
            },
          }),
        ).toBe(1);
        const firstObservation =
          await prisma.telegramLeadObservation.findUniqueOrThrow({
            where: { id: ids[0] },
          });
        expect(firstObservation.candidateId).not.toBeNull();
        expect(
          (
            await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
              where: { id: `${workspaceId}-queue-1` },
            })
          ).status,
        ).toBe('COMPLETED');
        expect(
          (
            await prisma.telegramLeadAnalysisQueue.findUniqueOrThrow({
              where: { id: `${workspaceId}-queue-2` },
            })
          ).status,
        ).toBe('NEEDS_MEDIA_ANALYSIS');
        expect(firstObservation.messageUrl).toBe('https://t.me/sample/1');
        await pilot.run('actor', sourceId, ids);
        expect(provider.execute).toHaveBeenCalledTimes(2);
        imageByte = 2;
        await expect(pilot.run('actor', sourceId, [ids[0]])).rejects.toThrow(
          'AI_OPERATION_CONFLICT',
        );
        expect(provider.execute).toHaveBeenCalledTimes(2);
        imageByte = 1;
        expect(await prisma.aiOperation.count({ where: { workspaceId } })).toBe(
          2,
        );
        const saved = await pilot.results('actor', sourceId);
        expect(saved.results.filter((r) => r.vision)).toHaveLength(2);
        expect(
          saved.results.find((r) => r.observationId === ids[0]),
        ).toMatchObject({
          reviewRequired: true,
          vision: {
            projectName: 'Image-only project',
            contacts: ['@image_project'],
          },
        });
        const simultaneous = await Promise.allSettled([
          pilot.run('actor', sourceId, [`${workspaceId}-5`]),
          pilot.run('actor', sourceId, [`${workspaceId}-5`]),
        ]);
        expect(simultaneous.some((r) => r.status === 'fulfilled')).toBe(true);
        expect(provider.execute).toHaveBeenCalledTimes(3);
        expect(
          await prisma.telegramLeadCandidate.count({ where: { workspaceId } }),
        ).toBe(2);
        provider.execute.mockResolvedValueOnce({
          result: undefined,
          usage: null,
          errorCategory: 'TIMEOUT',
          generationStarted: true,
          providerModel: null,
          providerRequestId: null,
        } as never);
        await expect(
          pilot.run('actor', sourceId, [
            `${workspaceId}-3`,
            `${workspaceId}-4`,
          ]),
        ).rejects.toThrow('LEAD_MEDIA_RESULT_UNAVAILABLE');
        expect(provider.execute).toHaveBeenCalledTimes(4);
        expect(
          (await pilot.run('actor', sourceId, [`${workspaceId}-3`])).results[0]
            .status,
        ).toBe('BLOCKED');
        expect(provider.execute).toHaveBeenCalledTimes(4);
        await prisma.telegramLeadAutoConfig.update({
          where: { sourceId_workspaceId: { sourceId, workspaceId } },
          data: { enabled: false },
        });
        await expect(
          pilot.run('actor', sourceId, [`${workspaceId}-3`]),
        ).rejects.toThrow('LEAD_AUTOMATION_PAUSED');
        await prisma.telegramLeadAutoConfig.update({
          where: { sourceId_workspaceId: { sourceId, workspaceId } },
          data: { enabled: true },
        });
        provider.execute.mockImplementationOnce(async () => {
          await prisma.telegramLeadAutoConfig.update({
            where: { sourceId_workspaceId: { sourceId, workspaceId } },
            data: { enabled: false },
          });
          return {
            result: {
              classification: 'ADVERTISEMENT',
              projectName: 'Paused project',
              contacts: [],
              evidence: 'Image offer',
              confidence: 0.9,
            },
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
              totalTokens: 150,
            },
            errorCategory: null,
            generationStarted: true,
            providerModel: 'gpt-5.4-mini-2026-03-17',
            providerRequestId: 'mock',
          };
        });
        await expect(
          pilot.run('actor', sourceId, [`${workspaceId}-4`]),
        ).rejects.toThrow('LEAD_AUTOMATION_PAUSED');
        expect(
          (
            await prisma.telegramLeadObservation.findUniqueOrThrow({
              where: { id: `${workspaceId}-4` },
            })
          ).candidateId,
        ).toBeNull();
        await prisma.telegramLeadAutoConfig.update({
          where: { sourceId_workspaceId: { sourceId, workspaceId } },
          data: { enabled: true },
        });
        await pilot.run('actor', sourceId, [`${workspaceId}-4`]);
        expect(provider.execute).toHaveBeenCalledTimes(5);
        grants = '[]';
        await expect(
          pilot.run('actor', sourceId, [`${workspaceId}-3`]),
        ).rejects.toThrow('LEAD_PROCESSING_NOT_APPROVED');
        expect(provider.execute).toHaveBeenCalledTimes(5);
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
