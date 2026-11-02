import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';

const url = process.env.LEAD_CONTACT_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'contact resolver with PostgreSQL and controlled MTProto',
  () => {
    it('creates review candidates, keeps evidence and honors revocation', async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const db = prisma as PrismaService;
      const workspaceId = 'contact-test-workspace',
        sourceId = 'contact-test-source',
        actor = 'contact-test-actor';
      try {
        await prisma.workspace.create({
          data: { id: workspaceId, name: 'Isolated contact test' },
        });
        await prisma.telegramUserAccountIntegration.create({
          data: {
            id: 'contact-test-account',
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
            normalizedKey: 'telegram:username:source_test',
            username: 'source_test',
            channelId: '111',
            title: 'Source',
            accountId: 'contact-test-account',
            accessType: 'SUBSCRIBED_CHANNEL',
            processingReference: 'policy:test',
            monitoringState: 'ACTIVE',
            monitoringActorUserId: actor,
          },
        });
        await prisma.telegramLeadAutoConfig.create({
          data: { workspaceId, sourceId, enabled: true },
        });
        const assertProcessing = jest.fn();
        const policy = {
          recheckAi: jest.fn().mockResolvedValue(source),
          assertProcessing,
          granted: jest.fn().mockReturnValue(true),
        } as unknown as TelegramLeadPolicy;
        const candidates = new TelegramLeadCandidateService(
          db,
          policy,
          {} as never,
          {} as never,
        );
        let flakyCalls = 0,
          adCalls = 0;
        const publicProfile = jest.fn((username: string) => {
          if (username === 'blocked_channel')
            return Promise.reject(new Error('CHANNEL_PRIVATE'));
          if (username === 'flaky_channel' && flakyCalls++ === 0)
            return Promise.reject(new Error('CHANNEL_PRIVATE'));
          if (username === 'ad_channel' && adCalls++ > 0)
            return Promise.reject(new Error('CHANNEL_PRIVATE'));
          return Promise.resolve({
            username,
            channelId:
              username === 'ad_channel'
                ? '202'
                : username === 'flaky_channel'
                  ? '204'
                  : '203',
            about: username === 'ad_channel' ? 'Реклама: @ad_manager' : '',
            ...(username === 'ad_channel'
              ? { pinned: { id: 17, text: 'Замовити @orders_manager' } }
              : {}),
          });
        });
        const runtime = {
          withLiveAccountHandle: jest.fn(
            async (
              _workspace: string,
              _account: string,
              cb: (handle: unknown) => Promise<unknown>,
            ) => cb({ leadDiscovery: { publicProfile } }),
          ),
        };
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
            runtime,
            analysis,
            reconciliation: {
              reconcilePage: jest
                .fn()
                .mockResolvedValue({ blocked: false, complete: true }),
            },
          }),
        });
        const items = [
          {
            target: 'service_bot',
            origin: 'INLINE_BUTTON',
            text: 'Реклама підписуйтесь',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'ad_channel',
            origin: 'TEXT_URL',
            text: 'Реклама підписуйтесь',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'quiet_channel',
            origin: 'INLINE_BUTTON',
            text: 'Реклама підписуйтесь',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'blocked_channel',
            origin: 'INLINE_BUTTON',
            text: 'Реклама підписуйтесь',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'ad_channel',
            origin: 'INLINE_BUTTON',
            text: 'Реклама підписуйтесь на новини',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'order_manager',
            origin: 'MENTION',
            text: 'Розпродаж. Ціна 200 грн. Замовити @order_manager',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'flaky_channel',
            origin: 'INLINE_BUTTON',
            text: 'Реклама підписуйтесь',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'flaky_channel',
            origin: 'TEXT_URL',
            text: 'Реклама підписуйтесь зараз',
            kind: 'TELEGRAM_USERNAME',
          },
          {
            target: 'revoked_channel',
            origin: 'INLINE_BUTTON',
            text: 'Реклама підписуйтесь',
            kind: 'TELEGRAM_USERNAME',
          },
        ];
        const ids: string[] = [];
        for (const [i, item] of items.entries()) {
          const id = `contact-post-${i}`;
          await prisma.telegramLeadObservation.create({
            data: {
              id,
              workspaceId,
              sourceId,
              externalMessageId: String(i + 1),
              messageUrl: `https://t.me/source_test/${i + 1}`,
              publishedAt: new Date(),
              observedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
              text: item.text,
              links: [],
              contentHash: `contact-hash-${i}`,
              metadataComplete: false,
              textMetadataComplete: true,
              mediaPresent: true,
              targetEvidence: [
                {
                  kind: item.kind,
                  value: item.target,
                  origin: item.origin,
                  confidence: 'UNVERIFIED',
                },
              ],
            },
          });
          await prisma.telegramLeadAnalysisQueue.create({
            data: {
              id: `contact-queue-${i}`,
              workspaceId,
              sourceId,
              observationId: id,
              contentHash: `contact-hash-${i}`,
              bindingRevision: source.bindingRevision,
              actorUserId: actor,
            },
          });
          if (i === 8)
            assertProcessing.mockImplementation(() => {
              throw new ForbiddenException('LEAD_PROCESSING_NOT_APPROVED');
            });
          await executor.runSource({ workspaceId, sourceId, userId: actor });
          const result = await prisma.telegramLeadObservation.findUniqueOrThrow(
            { where: { id } },
          );
          if (i === 8) {
            expect(result.candidateId).toBeNull();
            break;
          }
          expect(result.candidateId).not.toBeNull();
          ids.push(result.candidateId!);
        }
        expect(ids[4]).toBe(ids[1]);
        expect(ids[7]).toBe(ids[6]);
        expect(
          await prisma.telegramLeadCandidate.count({ where: { workspaceId } }),
        ).toBe(6);
        const recovered = await prisma.telegramLeadCandidate.findUniqueOrThrow({
          where: { id: ids[6] },
        });
        expect(recovered.identityKey).toBe('telegram-channel:204');
        const bot = await prisma.telegramLeadCandidate.findUniqueOrThrow({
          where: { id: ids[0] },
        });
        expect(bot.contacts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              value: '@service_bot',
              evidenceSource: 'INLINE_BUTTON',
              confirmed: false,
            }),
          ]),
        );
        const channel = await prisma.telegramLeadCandidate.findUniqueOrThrow({
          where: { id: ids[1] },
        });
        expect(channel.identityKey).toBe('telegram-channel:202');
        expect(channel.contacts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              value: '@ad_manager',
              purpose: 'CONTACT_FOR_ADS',
              evidenceUrl: 'https://t.me/ad_channel',
              confirmed: false,
            }),
            expect.objectContaining({
              value: '@orders_manager',
              purpose: 'PROJECT_CONTACT',
              evidenceUrl: 'https://t.me/ad_channel/17',
              confirmed: false,
            }),
          ]),
        );
        const quiet = await prisma.telegramLeadCandidate.findUniqueOrThrow({
          where: { id: ids[2] },
        });
        expect(quiet.contacts).toHaveLength(1);
        expect(quiet.risks).toContain('UNRESOLVED_BUSINESS_CONTACT');
        const blocked = await prisma.telegramLeadCandidate.findUniqueOrThrow({
          where: { id: ids[3] },
        });
        expect(blocked.identityKey).toBe('unverified-telegram:blocked_channel');
        const unresolved = await prisma.telegramLeadCandidate.findUniqueOrThrow(
          { where: { id: ids[5] } },
        );
        expect(unresolved.risks).toContain('UNRESOLVED_PROJECT');
        expect(unresolved.contacts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              value: '@order_manager',
              role: 'SALES_CONTACT',
              evidenceUrl: 'https://t.me/source_test/6',
              confirmed: false,
            }),
          ]),
        );
        expect(publicProfile).not.toHaveBeenCalledWith('service_bot');
        expect(publicProfile).not.toHaveBeenCalledWith('revoked_channel');
        expect(analysis.analyzeAutomatically).not.toHaveBeenCalled();
        expect(await prisma.aiOperation.count({ where: { workspaceId } })).toBe(
          0,
        );
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
