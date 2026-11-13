import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { TelegramAiPostingStructureService } from './telegram-ai-posting-structure.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';

const databaseUrl = process.env.AI_POSTING_TEST_DATABASE_URL ?? '';
const isDisposableLocalDatabase = (() => {
  try {
    const url = new URL(databaseUrl);
    return (
      url.hostname === '127.0.0.1' && url.pathname === '/codex_ai_posting_test'
    );
  } catch {
    return false;
  }
})();

(isDisposableLocalDatabase ? describe : describe.skip)(
  'TelegramAiPostingStructureService with disposable PostgreSQL',
  () => {
    let prisma: PrismaClient;
    let userId: string;
    let workspaceId: string;
    let memberId: string;
    let channelId: string;
    let service: TelegramAiPostingStructureService;

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
      const user = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          passwordHash: 'test',
          name: 'Test',
        },
      });
      userId = user.id;
      const workspace = await prisma.workspace.create({
        data: { name: 'Disposable test' },
      });
      workspaceId = workspace.id;
      const member = await prisma.workspaceMember.create({
        data: { workspaceId, userId },
      });
      memberId = member.id;
      const channel = await prisma.telegramChannel.create({
        data: { workspaceId, title: 'Test channel' },
      });
      channelId = channel.id;
      const workspaceService = {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue({ id: memberId, workspaceId }),
      };
      const gateway = {
        execute: jest.fn().mockResolvedValue({
          operation: { status: 'SUCCEEDED' },
          result: {
            reply: JSON.stringify({
              groups: [
                { name: 'Advice', description: 'Practical advice' },
                'advice',
              ],
              hypotheses: [
                { name: 'Habits', description: 'Test habit-focused posts' },
              ],
            }),
          },
        }),
      };
      service = new TelegramAiPostingStructureService(
        prisma as never,
        workspaceService as never,
        gateway as never,
      );
    });

    afterAll(async () => {
      if (!prisma) return;
      if (!workspaceId || !userId) {
        await prisma.$disconnect();
        return;
      }
      await prisma.telegramAiPostingGeneration.deleteMany({
        where: { workspaceId },
      });
      await prisma.telegramManagedPost.deleteMany({ where: { workspaceId } });
      await prisma.telegramAiPostingTestRun.deleteMany({
        where: { workspaceId },
      });
      await prisma.telegramAiPostingSettings.deleteMany({
        where: { workspaceId },
      });
      await prisma.postGroup.deleteMany({ where: { workspaceId } });
      await prisma.telegramContentHypothesis.deleteMany({
        where: { workspaceId },
      });
      await prisma.telegramChannel.deleteMany({ where: { workspaceId } });
      await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it('creates real channel records and deduplicates names', async () => {
      await expect(
        service.generate(userId, channelId, 'Channel about habits', 'en'),
      ).resolves.toEqual({ groups: ['Advice'], hypotheses: ['Habits'] });
      expect(
        await prisma.postGroup.count({
          where: { workspaceId, telegramChannelId: channelId, title: 'Advice' },
        }),
      ).toBe(1);
      expect(
        await prisma.telegramContentHypothesis.count({
          where: { workspaceId, telegramChannelId: channelId, name: 'Habits' },
        }),
      ).toBe(1);
      expect(
        await prisma.postGroup.findFirst({
          where: { workspaceId, telegramChannelId: channelId, title: 'Advice' },
          select: { description: true },
        }),
      ).toEqual({ description: 'Practical advice' });
      expect(
        await prisma.telegramContentHypothesis.findFirst({
          where: { workspaceId, telegramChannelId: channelId, name: 'Habits' },
          select: { description: true },
        }),
      ).toEqual({ description: 'Test habit-focused posts' });
    });

    it('serializes concurrent automatic creation and reuses the same records', async () => {
      const input = {
        workspaceId,
        channelId,
        memberId,
        format: 'Concurrent group',
        category: 'Concurrent hypothesis',
        allowGroups: true,
        allowHypotheses: true,
      };
      const results = await Promise.all([
        prisma.$transaction((tx) => service.resolveForDraft(tx, input)),
        prisma.$transaction((tx) => service.resolveForDraft(tx, input)),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(
        await prisma.postGroup.count({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            title: input.format,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.telegramContentHypothesis.count({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            name: input.category,
          },
        }),
      ).toBe(1);
    });

    it('saves an approved draft and links newly created records atomically', async () => {
      await prisma.telegramAiPostingSettings.create({
        data: {
          workspaceId,
          telegramChannelId: channelId,
          configuration: {
            allowCreateGroups: true,
            allowCreateHypotheses: true,
          },
        },
      });
      const publication = {
        topic: 'Topic',
        title: 'Title',
        text: 'Text',
        imagePrompt: '',
        imageUrl: null,
        imageSourceId: null,
        format: 'Generated group',
        category: 'Generated hypothesis',
        reviewNotes: [],
        costs: { planning: '0', text: '0', image: '0', review: '0' },
        operations: [],
        ideaSources: [],
        status: 'APPROVED',
        rejectionReason: null,
        savedPostId: null,
      };
      const run = await prisma.telegramAiPostingTestRun.create({
        data: {
          workspaceId,
          telegramChannelId: channelId,
          requestedCount: 1,
          settingsVersion: 1,
          status: 'COMPLETED',
          publications: [publication],
          failures: [],
          operations: [],
          feedback: [],
        },
      });
      const workspaceService = {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue(workspaceId),
      };
      const posts = {
        prepareManagedPostCreate: jest.fn(
          (
            _userId: string,
            _channelId: string,
            input: { title: string; text: string },
          ) =>
            Promise.resolve({
              workspaceId,
              channelId,
              assignedMemberId: memberId,
              title: input.title,
              text: input.text,
            }),
        ),
        createManagedPostRecord: (
          tx: Prisma.TransactionClient,
          input: { groupId?: string | null; title: string; text: string },
        ) =>
          tx.telegramManagedPost.create({
            data: {
              workspaceId,
              telegramChannelId: channelId,
              assignedMemberId: memberId,
              title: input.title,
              text: input.text,
              groupId: input.groupId,
            },
          }),
      };
      const testRuns = new TelegramAiPostingTestRunService(
        prisma as never,
        workspaceService as never,
        {} as never,
        posts as never,
        { createManagedPostRevision: jest.fn() } as never,
        {} as never,
        service,
      );
      await testRuns.reviewPublication(userId, channelId, run.id, 0, 1, 'save');
      const post = await prisma.telegramManagedPost.findFirstOrThrow({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          title: publication.title,
        },
        include: {
          group: true,
          contentHypotheses: { include: { hypothesis: true } },
        },
      });
      expect(post.group?.title).toBe('Generated group');
      expect(
        post.contentHypotheses.map((item) => item.hypothesis.name),
      ).toEqual(['Generated hypothesis']);

      await prisma.telegramAiPostingSettings.update({
        where: { telegramChannelId: channelId },
        data: {
          configuration: {
            allowCreateGroups: false,
            allowCreateHypotheses: false,
            formats: ['Advice'],
            categories: ['Habits'],
          },
        },
      });
      const second = {
        ...publication,
        title: 'Existing records',
        format: 'Advice',
        category: 'Habits',
      };
      const secondRun = await prisma.telegramAiPostingTestRun.create({
        data: {
          workspaceId,
          telegramChannelId: channelId,
          requestedCount: 1,
          settingsVersion: 1,
          status: 'COMPLETED',
          publications: [second],
          failures: [],
          operations: [],
          feedback: [],
        },
      });
      await testRuns.reviewPublication(
        userId,
        channelId,
        secondRun.id,
        0,
        1,
        'save',
      );
      const secondPost = await prisma.telegramManagedPost.findFirstOrThrow({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          title: second.title,
        },
        include: {
          group: true,
          contentHypotheses: { include: { hypothesis: true } },
        },
      });
      expect(secondPost.group?.title).toBe('Advice');
      expect(
        secondPost.contentHypotheses.map((item) => item.hypothesis.name),
      ).toEqual(['Habits']);
    });
  },
);
