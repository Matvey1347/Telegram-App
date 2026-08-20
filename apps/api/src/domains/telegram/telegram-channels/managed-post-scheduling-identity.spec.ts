import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';
import { scheduledTaskWakeNotifier } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';

describe('Telegram managed post scheduled identity', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T08:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  const setup = (status: TelegramManagedPostStatus, scheduledIds: string[]) => {
    const post = {
      id: 'post',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Post',
      text: 'A real post',
      imageUrls: [],
      status,
      scheduledAt: status === 'SCHEDULED' ? new Date('2026-08-10T08:00:00Z') : null,
      telegramScheduledMessageIds: scheduledIds,
      telegramMessageIds: [],
      telegramMessageUrls: [],
      sourceType: status === 'SCHEDULED' ? TelegramSourceType.MTPROTO : null,
      sourceId: status === 'SCHEDULED' ? 'account' : null,
      groupId: null,
    };
    let stored = post as Record<string, unknown>;
    const update = jest.fn().mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data };
      return stored;
    });
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(post),
        update,
        findUnique: jest.fn().mockImplementation(async () => stored),
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          isActive: true,
          username: null,
          telegramChatId: '-1001590085922',
        }),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    const mtproto = {
      publishPost: jest.fn().mockResolvedValue(['2806']),
      deleteScheduledPost: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtproto as never,
      {
        sourcesForChannel: jest.fn().mockResolvedValue([
          {
            sourceId: 'account',
            sourceType: TelegramSourceType.MTPROTO,
            permissions: { canPostMessages: true },
          },
        ]),
      } as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace');
    service['createManagedPostRevision'] = jest.fn().mockResolvedValue(undefined);
    service['resolveInternalPostLinksForPublish'] = jest.fn().mockResolvedValue('A real post');
    service['connectedAccount'] = jest.fn().mockResolvedValue({});
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    service['attachManagedPostIcons'] = jest.fn(async (rows) => rows) as never;
    return { service, update, mtproto };
  };

  it('stores scheduled ids separately and exposes no public permalink', async () => {
    const { service, update } = setup(TelegramManagedPostStatus.DRAFT, []);
    const wake = jest.fn();
    scheduledTaskWakeNotifier.on('changed', wake);
    try {
      await service.scheduleManagedPost('user', 'channel', 'post', {
        scheduledAt: '2026-08-10T12:00:00.000Z',
      });
    } finally {
      scheduledTaskWakeNotifier.off('changed', wake);
    }
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.SCHEDULED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
          telegramScheduledMessageIds: ['2806'],
          telegramMessageIds: [],
          telegramMessageUrls: [],
          telegramIdVerificationStatus: 'UNVERIFIED',
        }),
      }),
    );
    expect(wake).toHaveBeenCalledWith('telegram.managed_posts.reconcile_due');
  });

  it('deletes old scheduled ids when updating a scheduled post', async () => {
    const { service, update, mtproto } = setup(
      TelegramManagedPostStatus.SCHEDULED,
      ['101'],
    );
    await service.scheduleManagedPost('user', 'channel', 'post', {
      scheduledAt: '2026-08-10T12:00:00.000Z',
    });
    expect(mtproto.deleteScheduledPost).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['101'] }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramScheduledMessageIds: ['2806'],
          telegramMessageIds: [],
        }),
      }),
    );
  });

  it('executes reversed batch input in chronological order', async () => {
    const posts = [
      { id: 'a', title: 'A', status: TelegramManagedPostStatus.DRAFT, origin: 'SYSTEM', scheduledAt: null },
      { id: 'b', title: 'B', status: TelegramManagedPostStatus.DRAFT, origin: 'SYSTEM', scheduledAt: null },
    ];
    const prisma = {
      telegramManagedPost: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(posts)
          .mockResolvedValueOnce([]),
      },
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace');
    service['findOne'] = jest.fn().mockResolvedValue({ id: 'channel' });
    const execution: string[] = [];
    service['publishManagedPost'] = jest.fn(async (_workspace, _channel, postId, at) => {
      execution.push(postId);
      return { status: TelegramManagedPostStatus.SCHEDULED, scheduledAt: at };
    }) as never;
    await service.scheduleManagedPostsBatch('user', 'channel', {
      items: [
        { postId: 'b', scheduledAt: '2026-08-10T12:15:00.000Z' },
        { postId: 'a', scheduledAt: '2026-08-10T08:15:00.000Z' },
      ],
    });
    expect(execution).toEqual(['a', 'b']);
  });

  it('repairs an A-to-B-to-C chain with exact tokens and more than 25 dependants', async () => {
    const makePost = (id: string, target: string) => ({
      id,
      text: `[previous](tg-post:${target})`,
      scheduledAt: new Date('2026-08-10T12:00:00.000Z'),
      publishMode: 'IMAGES_THEN_TEXT',
    });
    const manyForA = Array.from({ length: 30 }, (_, index) =>
      makePost(index === 0 ? 'b' : `b-${index}`, 'a'),
    );
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const needle = where.text.contains as string;
          if (needle === 'tg-post:a') {
            return Promise.resolve([...manyForA, makePost('wrong-prefix', 'ab')]);
          }
          if (needle === 'tg-post:b') return Promise.resolve([makePost('c', 'b')]);
          return Promise.resolve([]);
        }),
      },
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const repaired: string[] = [];
    service['publishManagedPost'] = jest.fn(async (_workspace, _channel, id) => {
      repaired.push(id);
      return {};
    }) as never;
    await service['repairScheduledPostDependants'](
      'workspace', 'channel', 'a', new Date('2026-08-10T08:00:00.000Z'),
    );
    await service['repairScheduledPostDependants'](
      'workspace', 'channel', 'b', new Date('2026-08-10T08:00:00.000Z'),
    );
    expect(repaired).toHaveLength(31);
    expect(repaired).toContain('b');
    expect(repaired).toContain('c');
    expect(repaired).not.toContain('wrong-prefix');
  });
});
