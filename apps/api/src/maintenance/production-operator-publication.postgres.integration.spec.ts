import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ContextIdFactory } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { ProductionRecoveryModule } from './production-recovery.module';
import { ProductionOperatorPublicationService } from './production-operator-publication.service';
import { TelegramOperatorSendService } from '../domains/telegram/telegram-channels/telegram-operator-send.service';
import { TelegramManagedPostPresentationService } from '../domains/telegram/telegram-channels/telegram-managed-post-presentation.service';
import { TelegramManagedPostCalendarService } from '../domains/telegram/telegram-channels/telegram-managed-post-calendar.service';
import { TelegramManagedPostDeliveryDispatcherService } from '../domains/telegram/telegram-channels/telegram-managed-post-delivery-dispatcher.service';
import { TelegramManagedPostSendJournalService } from '../domains/telegram/telegram-channels/telegram-managed-post-send-journal.service';
import { recoveryAuthorization } from '../telegram/shared/mtproto/production-recovery-relay-context';

const scope = { userId: '', workspaceId: '', channelId: '', saleId: '', placementId: '' };
jest.mock('../config/production-recovery-config', () => ({
  productionRecoveryConfig: () => ({ ...scope, productionApiOrigin: 'https://fixture.invalid/api' }),
}));

const connection = process.env.PUBLICATION_TEST_DATABASE_URL;
const suite = connection ? describe : describe.skip;

suite('Operator publish with independent local, Railway and worker DB clients', () => {
  let db: PrismaClient;
  let cloudDb: PrismaClient;
  let workerDb: PrismaClient;
  let module: TestingModule;
  let service: ProductionOperatorPublicationService;
  let contextId: ReturnType<typeof ContextIdFactory.create>;
  let post: Awaited<ReturnType<PrismaClient['telegramManagedPost']['create']>>;
  let sourceId: string;
  let cloud: TelegramOperatorSendService;
  const send = jest.fn();
  const verify = jest.fn();
  const publisher = jest.fn();

  beforeAll(async () => {
    const target = new URL(connection!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('_qa_'))
      throw new Error('Use a disposable localhost QA database for operator integration');
    const client = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: connection! }) });
    db = client();
    cloudDb = client();
    workerDb = client();
    await Promise.all([db.$connect(), cloudDb.$connect(), workerDb.$connect()]);
  });

  beforeEach(async () => {
    const nonce = randomUUID();
    const user = await db.user.create({ data: { email: `operator-${nonce}@example.invalid`, name: 'Operator fixture', passwordHash: 'unused' } });
    const workspace = await db.workspace.create({ data: { name: `Operator fixture ${nonce}` } });
    const member = await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'owner' } });
    const channel = await db.telegramChannel.create({
      data: { workspaceId: workspace.id, assignedMemberId: member.id, title: 'Private QA channel', telegramChatId: '-1001234897654' },
    });
    Object.assign(scope, { userId: user.id, workspaceId: workspace.id, channelId: channel.id, saleId: '', placementId: '' });
    const bot = await db.telegramBotIntegration.create({ data: { workspaceId: scope.workspaceId, label: 'Fixture actor' } });
    sourceId = bot.id;
    await db.telegramChannelSourceAccess.create({
      data: { workspaceId: scope.workspaceId, channelId: scope.channelId, sourceId, sourceType: 'BOT', role: 'ADMIN', canPostMessages: true },
    });
    post = await db.telegramManagedPost.create({
      data: {
        workspaceId: scope.workspaceId, telegramChannelId: scope.channelId, assignedMemberId: member.id,
        title: 'Operator draft', text: 'Original fixture text',
        status: 'SCHEDULED', scheduledAt: new Date(Date.now() - 2_000), scheduleMode: 'LOCAL',
      },
    });

    module = await Test.createTestingModule({ imports: [ProductionRecoveryModule] })
      .overrideProvider(PrismaService).useValue(db).compile();
    contextId = ContextIdFactory.create();
    module.registerRequestByContextId({ headers: { 'x-workspace-id': scope.workspaceId } }, contextId);
    service = await module.resolve(ProductionOperatorPublicationService, contextId);
    cloud = new TelegramOperatorSendService(
      cloudDb as never, await module.resolve(WorkspaceService, contextId),
      { botTokenForSource: jest.fn(async (_workspace, actor) => {
        expect(actor).toBe(sourceId);
        return 'fixture-transport-marker';
      }), botChatId: () => channel.telegramChatId } as never,
      { getMe: async () => ({ id: 123 }), getChatMember: async () => ({ status: 'administrator', can_post_messages: true }), call: send } as never,
      {} as never,
    );
    send.mockReset().mockResolvedValue({ message_id: 161 });
    verify.mockReset().mockResolvedValue(new Response('{"verified":true}'));
    publisher.mockReset();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await module?.close();
    if (post) await db.telegramManagedPost.deleteMany({ where: { id: post.id } });
    if (scope.workspaceId) await db.workspace.deleteMany({ where: { id: scope.workspaceId } });
    if (scope.userId) await db.user.deleteMany({ where: { id: scope.userId } });
  });

  afterAll(async () => {
    await Promise.all([db?.$disconnect(), cloudDb?.$disconnect(), workerDb?.$disconnect()]);
  });

  function bridge({ loseAck = false } = {}) {
    return jest.spyOn(global, 'fetch').mockImplementation(async (url, option) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith(`/operator-publication-evidence/${post.id}`)) return verify();
      expect(path).toBe(`/api/telegram-channels/${scope.channelId}/operator-send`);
      const envelope = JSON.parse(String(option?.body));
      const result = await cloud.send(scope.userId, scope.channelId, envelope, new AbortController().signal);
      await expect(cloud.send(scope.userId, scope.channelId, envelope, new AbortController().signal))
        .rejects.toThrow('no longer matches');
      if (loseAck) throw new Error('Fixture lost transport response after cloud persisted ACK');
      return new Response(JSON.stringify({ result }));
    });
  }

  function publish(revision = post.updatedAt.toISOString()) {
    return recoveryAuthorization.run('fixture-session', () =>
      service.publishPost(scope.userId, post.id, revision, {}, new AbortController().signal));
  }

  it('runs the local formatter, fences the real worker and rereads a warmed calendar', async () => {
    const calendar = await module.resolve(TelegramManagedPostCalendarService, contextId);
    const formatter = await module.resolve(TelegramManagedPostPresentationService, contextId);
    const render = formatter.renderManagedPostText.bind(formatter);
    jest.spyOn(formatter, 'renderManagedPostText').mockImplementation((text, ...args) =>
      render(text.replace('Original', 'LOCAL changed'), ...args));
    const query = { from: new Date(Date.now() - 180_000).toISOString(), to: new Date(Date.now() + 180_000).toISOString() };
    expect((await calendar.managedPostsCalendar(scope.userId, scope.channelId, query)).items[0].status).toBe('SCHEDULED');

    const relay = bridge();
    await expect(publish('stale')).rejects.toThrow('object changed');
    expect(relay).not.toHaveBeenCalled();
    const worker = new TelegramManagedPostDeliveryDispatcherService(
      workerDb as never,
      { publishManagedPost: publisher } as never,
      new TelegramManagedPostSendJournalService(workerDb as never),
      {} as never,
    );
    send.mockImplementationOnce(async (_token, _action, body) => {
      expect(body.text).toBe('LOCAL changed fixture text');
      await expect(worker.dispatch(post)).resolves.toBe(false);
      return { message_id: 161 };
    });
    await expect(publish()).resolves.toMatchObject({ status: 'PUBLISHED', telegramMessageIds: ['161'] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(publisher).not.toHaveBeenCalled();
    expect((await calendar.managedPostsCalendar(scope.userId, scope.channelId, query)).items[0].status).toBe('SCHEDULED');
    expect((await calendar.managedPostsCalendar(scope.userId, scope.channelId, query, { authoritative: true })).items[0].status).toBe('PUBLISHED');
  });

  it('retains the cloud ACK and blocks a new request after loss of the reply', async () => {
    bridge({ loseAck: true });
    await expect(publish()).rejects.toThrow(/lost transport response/u);
    const [receipt] = await cloudDb.telegramManagedPostSendOperation.findMany({ where: { postId: post.id } });
    expect(receipt).toMatchObject({ status: 'ACKED', messageIds: ['161'], sourceId });
    const restarted = await module.resolve(ProductionOperatorPublicationService, contextId);
    const latest = await db.telegramManagedPost.findUniqueOrThrow({ where: { id: post.id } });
    await expect(restarted.publishPost(scope.userId, post.id, latest.updatedAt.toISOString(), {}, new AbortController().signal))
      .rejects.toThrow('Reconcile delivery evidence');
    await expect(recoveryAuthorization.run('fixture-session', () =>
      restarted.publishPost(scope.userId, post.id, latest.updatedAt.toISOString(), {}, new AbortController().signal, true)))
      .resolves.toMatchObject({ status: 'PUBLISHED', telegramMessageIds: ['161'] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retains UNKNOWN when the cloud transport cannot prove the Telegram result', async () => {
    bridge();
    send.mockRejectedValueOnce(new Error('fixture network loss after send'));
    await expect(publish()).rejects.toThrow('outcome is uncertain');
    const [receipt] = await cloudDb.telegramManagedPostSendOperation.findMany({ where: { postId: post.id } });
    expect(receipt.status).toBe('UNKNOWN');
    const latest = await db.telegramManagedPost.findUniqueOrThrow({ where: { id: post.id } });
    await expect(service.publishPost(scope.userId, post.id, latest.updatedAt.toISOString(), {}, new AbortController().signal, true))
      .rejects.toThrow('complete acknowledged delivery');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('publishes a selected Ad placement and verifies an existing publication without a second send', async () => {
    const sale = await db.telegramAdSale.create({ data: { workspaceId: scope.workspaceId, advertiserName: 'Fixture advertiser', settlementCurrency: 'PLN' } });
    const placement = await db.telegramAdSalePlacement.create({
      data: {
        workspaceId: scope.workspaceId, telegramAdSaleId: sale.id, telegramChannelId: scope.channelId, managedPostId: post.id,
        scheduledAt: post.scheduledAt!, timezone: 'UTC', pricingMode: 'FIXED', expectedViews: 1, recommendedPrice: 1,
        minimumPrice: 1, agreedPrice: 1, currency: 'PLN', status: 'SCHEDULED', deleteAfterHoursSnapshot: 3,
      },
    });
    Object.assign(scope, { saleId: sale.id, placementId: placement.id });
    bridge();
    await expect(publish()).rejects.toThrow('Ordinary post not found');
    await expect(service.placementRevision(sale.id, 'wrong')).rejects.toThrow('configured Ad Sales');
    const live = async (reconcile: boolean) => {
      const { revision } = await service.placementRevision(sale.id, placement.id);
      return recoveryAuthorization.run('fixture-session', () => service.publishPlacement(
        scope.userId, sale.id, placement.id, revision, {}, new AbortController().signal, reconcile));
    };
    await expect(live(false)).resolves.toMatchObject({ status: 'PUBLISHED', plannedDeleteAt: expect.any(Date) });
    await db.telegramAdSalePlacement.update({ where: { id: placement.id }, data: { status: 'SCHEDULED' } });
    await expect(live(true)).resolves.toMatchObject({ status: 'PUBLISHED' });
    expect((await db.telegramAdSalePlacement.findUniqueOrThrow({ where: { id: placement.id } })).status).toBe('PUBLISHED');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
