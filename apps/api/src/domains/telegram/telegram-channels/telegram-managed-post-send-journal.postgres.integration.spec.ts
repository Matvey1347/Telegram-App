import { TelegramInviteSnapshotStore } from './telegram-invite-snapshot.store';
import { TelegramInviteSyncService } from './telegram-invite-sync.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';
import { AdCampaignInviteWindowsService } from '../../growth/ad-campaigns/ad-campaign-invite-windows.service';
import { TelegramManagedPostGroupBulkService } from './telegram-managed-post-group-bulk.service';
import { TelegramManagedPostScheduledResetService } from './telegram-managed-post-scheduled-reset.service';
import { TelegramManagedPostNativeRecoveryStore } from './telegram-managed-post-native-recovery.store';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  TelegramManagedPostSendJournalService,
  managedPostSendPayloadHash,
  type ManagedPostSendInput,
} from './telegram-managed-post-send-journal.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
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

  it('admits one native cancellation across two Prisma clients and fences a lost acknowledgement', async () => {
    const telegramChatId = '700000000';
    const scheduleAt = new Date(Date.now() + 300_000);
    const post = await db.telegramManagedPost.update({
      where: { id: postId },
      data: {
        scheduleMode: 'TELEGRAM_NATIVE',
        scheduledAt: scheduleAt,
        sourceType: 'MTPROTO',
        sourceId: 'pinned-sender',
        telegramScheduledMessageIds: ['812'],
      },
      include: { telegramChannel: true },
    });
    post.telegramChannel.telegramChatId = telegramChatId;
    const deleteScheduledPost = jest.fn(async () => { throw new Error('lost acknowledgement'); });
    const getScheduledHistory = jest.fn(async () => [{
      id: '812', date: scheduleAt.toISOString(), hasMedia: false, text: post.text,
    }]);
    const service = (client: PrismaClient) => new TelegramManagedPostPublicationService(
      client as never,
      { deleteScheduledPost, getScheduledHistory } as never,
      {} as never, {} as never,
      {
        connectedAccount: async () => ({ id: 'pinned-sender' }),
        mtprotoChannelReference: () => ({ telegramChatId }),
        accountCredentials: () => ({}),
      } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const results = await Promise.allSettled([
      service(db).cancelScheduledManagedPost(workspaceId, post),
      service(secondDb).cancelScheduledManagedPost(workspaceId, post),
    ]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(deleteScheduledPost).toHaveBeenCalledTimes(1);
    expect(getScheduledHistory).toHaveBeenCalledTimes(1);
    expect(await db.telegramManagedPost.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({
      status: 'SCHEDULED', deliveryClaimOwner: expect.stringMatching(/^native-cancel:/),
      deliveryClaimExpiresAt: new Date('9999-12-31T00:00:00Z'), telegramScheduledMessageIds: ['812'],
    });
  });

  it('protects a held claim when group publish cannot cancel the old schedule', async () => {
    const post = await db.telegramManagedPost.findUniqueOrThrow({ where: { id: postId } });
    const group = await db.postGroup.create({ data: {
      workspaceId, telegramChannelId: channelId, title: 'Test group', createdByMemberId: post.assignedMemberId,
    } });
    await db.telegramManagedPost.update({ where: { id: postId }, data: {
      groupId: group.id, telegramScheduledMessageIds: ['812'],
      deliveryClaimOwner: 'other-worker', deliveryClaimExpiresAt: new Date(Date.now() + 60_000),
    } });
    const publish = jest.fn();
    const service = new TelegramManagedPostGroupBulkService(db as never,
      { workspace: async () => workspaceId } as never, { normalizePostGroupNumbering: async () => {} } as never,
      { cancelScheduledManagedPost: async () => { throw new Error('claim held'); }, publishManagedPost: publish } as never);
    const outcome = await service.publishPostGroup(userId, group.id, {});
    expect(outcome.results[0]).toMatchObject({ action: 'FAILED', newStatus: 'SCHEDULED' });
    expect(publish).not.toHaveBeenCalled();
    expect(await secondDb.telegramManagedPost.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({
      status: 'SCHEDULED', deliveryClaimOwner: 'other-worker', telegramScheduledMessageIds: ['812'],
    });
    await db.postGroup.delete({ where: { id: group.id } });
  });

  it('keeps the native cancellation ACK across a failed reset transaction', async () => {
    const scheduledAt = new Date(Date.now() + 300_000);
    const telegramChatId = '700000001';
    await db.telegramChannel.update({ where: { id: channelId }, data: { telegramChatId } });
    await db.telegramManagedPost.update({ where: { id: postId }, data: {
      scheduleMode: 'TELEGRAM_NATIVE', scheduledAt, sourceType: 'MTPROTO', sourceId: 'original',
      telegramScheduledMessageIds: ['812'], telegramRemoteStatus: 'SCHEDULED',
    } });
    const queue = ['812', '900'];
    const deleteScheduledPost = jest.fn(async ({ messageIds }: { messageIds: string[] }) => {
      for (const id of messageIds) queue.splice(queue.indexOf(id), 1);
    });
    const publication = new TelegramManagedPostPublicationService(
      db as never, { deleteScheduledPost, getScheduledHistory: async () => queue.map((id) => ({
        id, date: scheduledAt.toISOString(), hasMedia: false, text: 'Integration fixture only',
      })) } as never, {} as never, {} as never, {
        connectedAccount: async () => ({ id: 'original' }),
        mtprotoChannelReference: () => ({ telegramChatId }), accountCredentials: () => ({}),
      } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const createManagedPostRevisions = jest.fn().mockRejectedValueOnce(new Error('DB transaction failed'));
    const service = new TelegramManagedPostScheduledResetService(
      db as never, { workspace: async () => workspaceId, invalidateTelegramChannelReadCache: () => {} } as never,
      { createManagedPostRevisions } as never, {} as never, publication, {} as never,
    );
    expect((await service.resetChannelScheduledPosts(userId, channelId, [postId])).results[0]).toMatchObject({
      status: 'FAILED', remoteDeletedCount: 1,
    });
    expect(await secondDb.telegramManagedPost.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({
      status: 'SCHEDULED', deliveryClaimOwner: expect.stringMatching(/^native-cancel-acked:/),
    });
    expect((await service.resetChannelScheduledPosts(userId, channelId, [postId, 'outside'])).results).toMatchObject([
      { status: 'DRAFTED' }, { status: 'SKIPPED' },
    ]);
    expect(deleteScheduledPost).toHaveBeenCalledTimes(1);
    expect(queue).toEqual(['900']);
  });

  it('prevents an older window result from overwriting a newer attempt or an ABA configuration', async () => {
    const campaign = await db.adCampaign.create({ data: {
      workspaceId, telegramChannelId: channelId, title: 'Window fixture', currency: 'USD',
      price: 1, priceInPrimaryCurrency: 1, exchangeRateToPrimary: 1,
    } });
    const link = await db.telegramInviteLink.create({ data: {
      workspaceId, telegramChannelId: channelId, adCampaignId: campaign.id,
      name: 'Window fixture', url: 'https://example.invalid/' + randomUUID(),
    } });
    const old = await db.adCampaignInviteLinkWindow.create({ data: {
      adCampaignId: campaign.id, inviteLinkId: link.id, fromDate: '2025-05-09', timezone: 'UTC',
    } });
    const workspaces = { resolveWorkspaceIdForUser: async () => workspaceId };
    function hold() {
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const wait = new Promise<void>((resolve) => { release = resolve; });
      const service = new AdCampaignInviteWindowsService(db as never, workspaces as never, {
        register: async () => { entered(); await wait; return { joinedWithinPeriod: 99, pendingWithinPeriod: 99 }; },
      } as never);
      return { release, started, completion: service.refresh(userId, campaign.id) };
    }
    const newer = new AdCampaignInviteWindowsService(secondDb as never, workspaces as never, {
      register: async () => ({ joinedWithinPeriod: 0, pendingWithinPeriod: 2 }),
    } as never);
    const older = hold();
    await older.started;
    await newer.refresh(userId, campaign.id);
    older.release();
    await older.completion;
    expect(await db.adCampaignInviteLinkWindow.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({
      joinedCount: 0, pendingCount: 2, lastAttemptStatus: 'SUCCESS',
    });
    const beforeEdit = hold();
    await beforeEdit.started;
    await newer.set(userId, campaign.id, { windows: [{ inviteLinkId: link.id, fromDate: '2025-05-10' }] });
    await newer.set(userId, campaign.id, { windows: [{ inviteLinkId: link.id, fromDate: old.fromDate }] });
    beforeEdit.release();
    await beforeEdit.completion;
    expect(await db.adCampaignInviteLinkWindow.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({
      fromDate: old.fromDate, joinedCount: 0, pendingCount: 2, lastAttemptStatus: 'SUCCESS',
    });
  });

  it('starts ordinary replacement against the original instant and revision, retaining the new instant in the journal', async () => {
    const sourceId = 'original';
    const previous = new Date(Date.now() + 300_000);
    const next = new Date(previous.getTime() + 60_000);
    const owner = 'reschedule:' + randomUUID();
    const post = await db.telegramManagedPost.update({ where: { id: postId }, data: {
      scheduledAt: previous, scheduleMode: 'TELEGRAM_NATIVE', sourceType: 'MTPROTO', sourceId,
      telegramScheduledMessageIds: ['812'], deliveryClaimOwner: owner, deliveryClaimExpiresAt: next,
    } });
    const store = new TelegramManagedPostNativeRecoveryStore(db as never);
    const identity = { postId, workspaceId, channelId, owner };
    await store.prepare({ ...identity, sourceId, scheduledAt: next, previousScheduledAt: previous,
      previousSourceId: sourceId, oldMessageIds: ['812'] });
    await expect(store.start(identity, { scheduledAt: previous, sourceId, updatedAt: new Date(0) })).rejects.toThrow();
    await store.start(identity, { scheduledAt: previous, sourceId, updatedAt: post.updatedAt });
    await store.failed(identity);
    await expect(store.prepare({ ...identity, sourceId, scheduledAt: next, previousScheduledAt: previous,
      previousSourceId: sourceId, oldMessageIds: ['812'] })).rejects.toThrow();
    expect(await store.read(postId, workspaceId, channelId)).toMatchObject({ status: 'UNKNOWN', scheduledAt: next });
  });

  it('stores an unobserved counter separately from confirmed zero in the link and its snapshot', async () => {
    const linkPayload = {
      url: 'https://example.invalid/' + randomUUID(),
      telegramCreatorUserId: '404', title: 'Fixture', requestNeeded: true,
      createdAt: new Date(), usage: 0, requested: 0, usageObserved: true, requestedObserved: false,
    };
    const snapshots = new TelegramInviteSnapshotStore(db as never);
    const persistence = new TelegramInvitePersistenceService(db as never, {} as never);
    const service = new TelegramInviteSyncService(
      db as never, {} as never, {} as never, {} as never,
      { notifyInviteLinksProgress: async () => {} } as never,
      {} as never, {} as never, persistence, {} as never, snapshots,
    );
    const result = await service.persistInviteLinkFromRemote({
      workspaceId, channelId, link: linkPayload as never,
      maps: { memberByTelegramUserId: new Map(), memberByUsername: new Map(),
        memberByMtprotoUsername: new Map() } as never,
      processedCount: 1, totalLinks: 1, warnings: [], progressStep: { current: 1, total: 1 },
    });
    const stored = await db.telegramInviteLink.findUniqueOrThrow({ where: { id: result.upserted.id } });
    expect(stored).toMatchObject({ joinedCount: 0, joinedObserved: true, requestedObserved: false, requestedObservedAt: null });
    await snapshots.persistInviteLinkSnapshots({ workspaceId, channelId, syncedAt: new Date(), links: [{
      ...result.upserted, joinedCount: result.joinedObservation, requestedCount: result.requestedObservation,
    }] });
    expect(await db.telegramInviteLinkSnapshot.findFirstOrThrow({ where: { inviteLinkId: stored.id } })).toMatchObject({
      joinedCount: 0, requestedCount: null,
    });
  });

});
