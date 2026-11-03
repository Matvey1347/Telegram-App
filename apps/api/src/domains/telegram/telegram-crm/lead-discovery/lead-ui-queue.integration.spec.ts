import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TelegramLeadPreparationQueueService } from './lead-preparation-queue.service';
import { TelegramLeadReadService } from './lead-read.service';

const url = process.env.LEAD_ACCEPTANCE_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.includes('test'))
)
  throw new Error('This test requires a local test database');
(url ? describe : describe.skip)('Lead UI queue on isolated PostgreSQL', () => {
  it('filters before pagination, counts all matching rows and isolates workspaces', async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const workspaceId = 'lead-ui-test',
      other = 'lead-ui-other';
    const context = {
      prisma: db,
      policy: { access: () => Promise.resolve({ workspaceId }) },
      enabled: () => false,
      scorePolicy: () => ({ version: 'test' }),
    };
    const auth = {
      can: () => Promise.resolve(true),
      scope: () => Promise.resolve({}),
    };
    const service = new TelegramLeadPreparationQueueService(
      context as never,
      auth as never,
      {} as never,
    );
    try {
      await db.workspace.createMany({
        data: [
          { id: workspaceId, name: 'test' },
          { id: other, name: 'other' },
        ],
      });
      for (const [w, count] of [
        [workspaceId, 60],
        [other, 3],
      ] as const) {
        for (let i = 0; i < count; i++)
          await db.telegramLeadCandidate.create({
            data: {
              id: `${w}-${String(i).padStart(3, '0')}`,
              workspaceId: w,
              title: `Project ${i}`,
              contacts:
                i % 2
                  ? [
                      {
                        type: 'TELEGRAM',
                        value: '@ads_contact',
                        role: 'SALES_CONTACT',
                        purpose: 'CONTACT_FOR_ADS',
                        evidence: 'profile',
                      },
                    ]
                  : [
                      {
                        type: 'WEBSITE',
                        value: 'https://example.org',
                        role: 'ADVERTISED_DESTINATION',
                        evidence: 'button',
                      },
                    ],
              risks: [],
              reviewHistory: [],
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
      }
      const first = await service.list('actor', {
        contactCategory: 'BUSINESS_CONTACT_FOUND',
        limit: 10,
      });
      expect(first.total).toBe(30);
      expect(first.items).toHaveLength(10);
      expect(first.hasMore).toBe(true);
      const second = await service.list('actor', {
        contactCategory: 'BUSINESS_CONTACT_FOUND',
        limit: 10,
        cursor: first.nextCursor!,
      });
      expect(second.total).toBe(30);
      expect(second.items).toHaveLength(10);
      expect(
        second.items.every(
          (item) => !first.items.some((row) => row.id === item.id),
        ),
      ).toBe(true);
      const searched = await service.list('actor', {
        contactCategory: 'CONTACT_POINT_ONLY',
        search: 'Project 2',
        limit: 50,
      });
      expect(
        searched.items.every(
          (item) =>
            item.workspaceId === workspaceId &&
            item.title.includes('Project 2'),
        ),
      ).toBe(true);
      expect(searched.total).toBe(6);
      expect(
        (await service.list('actor', { contactCategory: 'TARGET_UNRESOLVED' }))
          .total,
      ).toBe(0);
      await db.telegramLeadCandidate.create({
        data: {
          id: 'unresolved-candidate',
          workspaceId,
          title: 'Unresolved',
          contacts: [
            {
              type: 'TELEGRAM',
              value: '@order_person',
              role: 'SALES_CONTACT',
              purpose: 'PROJECT_CONTACT',
              evidence: 'order',
            },
          ],
          risks: ['UNRESOLVED_PROJECT'],
          reviewHistory: [],
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await db.telegramLeadCandidate.create({
        data: {
          id: 'unknown-candidate',
          workspaceId,
          title: 'Unverified bot',
          contacts: [
            {
              type: 'TELEGRAM',
              value: '@sales_bot',
              role: 'SALES_CONTACT',
              purpose: 'CONTACT_FOR_ADS',
              evidence: 'button',
            },
          ],
          risks: [],
          reviewHistory: [],
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(
        (
          await service.list('actor', { contactCategory: 'TARGET_UNRESOLVED' })
        ).items.map((item) => item.id),
      ).toEqual(['unresolved-candidate']);
      expect(
        (
          await service.list('actor', { contactCategory: 'CONTACT_NOT_FOUND' })
        ).items.map((item) => item.id),
      ).toEqual(['unknown-candidate']);
      await db.telegramLeadSource.create({
        data: {
          id: 'ui-source',
          workspaceId,
          type: 'TELEGRAM_CHANNEL',
          normalizedKey: 'telegram:ui-source',
          title: 'Source',
          accessType: 'ACCOUNT',
          processingReference: 'test',
          monitoringActorUserId: 'actor',
          bindingRevision: 2,
        },
      });
      await db.telegramLeadObservation.create({
        data: {
          id: 'ui-observation',
          workspaceId,
          sourceId: 'ui-source',
          externalMessageId: '123',
          publishedAt: new Date(),
          observedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          text: 'test',
          links: [],
          contentHash: 'current',
        },
      });
      for (const [id, hash, revision, decision] of [
        ['current', 'current', 2, 'LIKELY_VP'],
        ['stale-hash', 'stale', 2, 'LIKELY_AD'],
        ['stale-binding', 'current', 1, 'LIKELY_AD'],
      ] as const) {
        await db.telegramLeadAnalysisQueue.create({
          data: {
            id,
            workspaceId,
            sourceId: 'ui-source',
            observationId: 'ui-observation',
            contentHash: hash,
            bindingRevision: revision,
            actorUserId: 'actor',
            prefilterDecision: decision,
          },
        });
      }
      const observation = await db.telegramLeadObservation.findFirstOrThrow({
        where: { id: 'ui-observation' },
        include: {
          source: {
            select: {
              id: true,
              title: true,
              url: true,
              monitoringState: true,
              lastErrorCode: true,
              bindingRevision: true,
            },
          },
        },
      });
      const reader = new TelegramLeadReadService(db as never, {} as never);
      const [view] = await reader.observations([observation]);
      expect(view.prefilterDecision).toBe('LIKELY_VP');
      expect(view.classification).toBeNull();
    } finally {
      await db.workspace.deleteMany({
        where: { id: { in: [workspaceId, other] } },
      });
      await db.$disconnect();
    }
  });
});
