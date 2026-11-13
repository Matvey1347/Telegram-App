import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  TelegramManagedPostSendJournalService,
  managedPostSendPayloadHash,
  type ManagedPostSendInput,
} from './telegram-managed-post-send-journal.service';
import { TelegramManagedPostDeliveryDispatcherService } from './telegram-managed-post-delivery-dispatcher.service';
import {
  deliverTelegramManagedPostViaBot,
  type TelegramBotDeliveryOperation,
} from './telegram-managed-post-bot-delivery';

// Explicit opt-in only. This suite never reads deployment configuration or starts Nest workers.
const connectionString = process.env.PUBLICATION_TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration('Publication durable ownership with real PostgreSQL', () => {
  let db: PrismaClient;
  let secondDb: PrismaClient;
  let workspaceId: string;
  let userId: string;
  let channelId: string;
  let postId: string;
  let journal: TelegramManagedPostSendJournalService;
  let secondJournal: TelegramManagedPostSendJournalService;

  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      !['postgresql:', 'postgres:'].includes(target.protocol)
    ) {
      throw new Error(
        'Publication PostgreSQL tests require an explicitly configured localhost database',
      );
    }
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connectionString! }),
    });
    secondDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connectionString! }),
    });
    await Promise.all([db.$connect(), secondDb.$connect()]);
    journal = new TelegramManagedPostSendJournalService(db as never);
    secondJournal = new TelegramManagedPostSendJournalService(
      secondDb as never,
    );
  });

  beforeEach(async () => {
    const fixtureId = randomUUID();
    const user = await db.user.create({
      data: {
        email: `publication-${fixtureId}@example.invalid`,
        name: 'Publication integration fixture',
        passwordHash: 'unusable-test-fixture',
      },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Publication fixture ${fixtureId}` },
    });
    workspaceId = workspace.id;
    const member = await db.workspaceMember.create({
      data: { workspaceId, userId, role: 'admin' },
    });
    const channel = await db.telegramChannel.create({
      data: {
        workspaceId,
        title: 'Isolated test channel',
        autoSyncEnabled: false,
        assignedMemberId: member.id,
      },
    });
    channelId = channel.id;
    const post = await db.telegramManagedPost.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        assignedMemberId: member.id,
        title: 'Scheduled test publication',
        text: 'Integration fixture only',
        status: 'SCHEDULED',
        scheduleMode: 'LOCAL',
        scheduledAt: new Date(Date.now() - 1000),
      },
    });
    postId = post.id;
  });

  afterEach(async () => {
    // Child records include a Restrict membership FK, so remove posts before their workspace.
    if (postId)
      await db.telegramManagedPost.deleteMany({
        where: { id: postId, workspaceId },
      });
    if (workspaceId)
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => {
    await Promise.all([db?.$disconnect(), secondDb?.$disconnect()]);
  });

  function input(ordinal = 0): ManagedPostSendInput {
    return {
      postId,
      workspaceId,
      channelId,
      sourceType: 'BOT',
      sourceId: 'test-source-no-credentials',
      ordinal,
      payloadHash: managedPostSendPayloadHash({
        ordinal,
        text: 'Integration fixture only',
      }),
    };
  }
  async function eventually(assertion: () => Promise<void>) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw lastError;
  }

  it('allows only one of two independent database clients to claim an operation', async () => {
    const outcomes = await Promise.allSettled([
      journal.begin(input()),
      secondJournal.begin(input()),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const rows = await db.telegramManagedPostSendOperation.findMany({
      where: { postId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'STARTED', attemptCount: 1 });
  });

  it('does not resend after Telegram accepted a request but the response was lost', async () => {
    const remote = jest.fn(async () => {
      throw new Error('Simulated lost response after remote acceptance');
    });
    await expect(
      journal.runOperation(input(), remote, () => ['1001']),
    ).rejects.toThrow('lost response');
    const persisted =
      await db.telegramManagedPostSendOperation.findUniqueOrThrow({
        where: { postId_ordinal: { postId, ordinal: 0 } },
      });
    expect(persisted.status).toBe('UNKNOWN');
    await expect(
      secondJournal.runOperation(input(), remote, () => ['1001']),
    ).rejects.toThrow('outcome is unknown');
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('resumes a rate-limited follow-up without repeating its acknowledged prefix', async () => {
    const operations: TelegramBotDeliveryOperation[] = [0, 1].map(
      (ordinal) => ({
        method: 'sendMessage',
        body: { text: `Integration part ${ordinal}` },
        expectedMessageCount: 1,
        messageIds: (result) => [(result as { id: string }).id],
      }),
    );
    let rateLimited = true;
    const remote = jest.fn(
      async (_method: string, body: Record<string, unknown>) => {
        if (body.text === 'Integration part 1' && rateLimited)
          throw {
            explicitRejected: true,
            errorCode: 429,
            retryAfterSeconds: 1,
          };
        return { id: body.text === 'Integration part 0' ? '1001' : '1002' };
      },
    );
    const deliver = async (prefix: string[]) =>
      deliverTelegramManagedPostViaBot({
        operations,
        journaledMessageIds: prefix,
        call: remote,
        executeOperation: (operation, ordinal) =>
          journal.runOperation(
            {
              ...input(ordinal),
              payloadHash: managedPostSendPayloadHash({
                method: operation.method,
                body: operation.body,
              }),
            },
            () => remote(operation.method, operation.body),
            operation.messageIds,
          ),
        persist: async (messageIds) => {
          await db.telegramManagedPost.update({
            where: { id: postId },
            data: { telegramMessageIds: messageIds },
          });
        },
      });
    await expect(deliver([])).rejects.toMatchObject({ errorCode: 429 });
    await expect(deliver(['1001'])).rejects.toThrow('retry is not due');
    const partial = await db.telegramManagedPost.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(partial.telegramMessageIds).toEqual(['1001']);
    await db.telegramManagedPostSendOperation.update({
      where: { postId_ordinal: { postId, ordinal: 1 } },
      data: { retryAt: new Date(Date.now() - 1) },
    });
    rateLimited = false;
    await expect(deliver(partial.telegramMessageIds)).resolves.toEqual([
      '1001',
      '1002',
    ]);
    expect(
      remote.mock.calls.filter(
        ([, body]) => body.text === 'Integration part 0',
      ),
    ).toHaveLength(1);
    expect(
      await db.telegramManagedPostSendOperation.count({
        where: { postId, status: 'ACKED' },
      }),
    ).toBe(2);
  });

  it('fences two dispatcher instances so exactly one publishes a post', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let completed = false;
    const remote = jest.fn(async () => {
      await gate;
      return ['1003'];
    });
    const publisher = {
      publishManagedPost: jest.fn(async () => {
        const ids = await journal.runOperation(
          input(),
          remote,
          (value) => value,
        );
        await db.telegramManagedPost.update({
          where: { id: postId },
          data: {
            status: 'PUBLISHED',
            telegramMessageIds: ids,
            publishedAt: new Date(),
          },
        });
        completed = true;
      }),
    };
    const moduleRef = {
      resolve: jest
        .fn()
        .mockRejectedValue(new Error('No reconciliation expected')),
    };
    const dispatchers = [
      new TelegramManagedPostDeliveryDispatcherService(
        db as never,
        publisher as never,
        journal,
        moduleRef as never,
      ),
      new TelegramManagedPostDeliveryDispatcherService(
        secondDb as never,
        publisher as never,
        secondJournal,
        moduleRef as never,
      ),
    ];
    try {
      const claims = await Promise.all(
        dispatchers.map((dispatcher) =>
          dispatcher.dispatch({
            id: postId,
            workspaceId,
            telegramChannelId: channelId,
          }),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      await eventually(async () => {
        expect(remote).toHaveBeenCalledTimes(1);
      });
    } finally {
      release();
    }
    await eventually(async () => {
      const post = await db.telegramManagedPost.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(completed).toBe(true);
      expect(post).toMatchObject({
        status: 'PUBLISHED',
        deliveryClaimOwner: null,
        telegramMessageIds: ['1003'],
      });
    });
    expect(publisher.publishManagedPost).toHaveBeenCalledTimes(1);
    expect(moduleRef.resolve).not.toHaveBeenCalled();
  });
});
