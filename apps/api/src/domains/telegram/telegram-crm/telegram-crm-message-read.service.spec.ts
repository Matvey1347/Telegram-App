import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramCrmMessageReadService } from './telegram-crm-message-read.service';

const sentAt = new Date('2026-08-31T12:00:00.000Z');
const message = (id: string, timestamp = sentAt) => ({
  id,
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  telegramMessageId: id,
  telegramMessageIdNumeric: 1,
  clientIdempotencyKey: null,
  mtprotoAccountId: 'account-1',
  direction: 'INBOUND',
  origin: 'TELEGRAM_SYNC',
  sentByMemberId: null,
  text: id,
  contentMetadata: null,
  sentAt: timestamp,
  editedAt: null,
  readState: 'UNREAD',
  deliveryState: 'DELIVERED',
  createdAt: timestamp,
  sentByMember: null,
  conversation: {
    mtprotoAccount: {
      id: 'account-1',
      label: 'Manager',
      username: 'manager',
      photoUrl: null,
    },
  },
});

type MessageFindManyArgs = {
  where: Record<string, unknown>;
  take: number;
  orderBy: Array<Record<string, string>>;
};

describe('TelegramCrmMessageReadService', () => {
  const setup = (rows: ReturnType<typeof message>[][]) => {
    const queuedRows = [...rows];
    const findManyArgs: MessageFindManyArgs[] = [];
    const findMany = jest.fn((args: MessageFindManyArgs) => {
      findManyArgs.push(args);
      return Promise.resolve(queuedRows.shift() ?? []);
    });
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-1',
          mtprotoAccount: {
            id: 'account-1',
            label: 'Manager',
            username: 'manager',
            photoUrl: null,
          },
        }),
      },
      telegramCrmMessage: {
        findMany,
        count: jest.fn(),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
    };
    return {
      prisma,
      findMany,
      findManyArgs,
      service: new TelegramCrmMessageReadService(
        prisma as never,
        authorization as never,
      ),
    };
  };

  it('uses an opaque (sentAt,id) limit+1 cursor without count, skip, or duplicates', async () => {
    const older = new Date('2026-08-31T11:00:00.000Z');
    const { service, prisma, findManyArgs } = setup([
      [message('message-c'), message('message-b'), message('message-a', older)],
      [message('message-a', older)],
    ]);

    const first = await service.list('user-1', 'conversation-1', {
      pageSize: 2,
    });
    expect(first.items.map((item) => item.id)).toEqual([
      'message-c',
      'message-b',
    ]);
    expect(first.items[0]).toMatchObject({ sentByMember: null });
    expect(first.items[0]).not.toHaveProperty('account');
    expect(first).toMatchObject({ hasMore: true });
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(findManyArgs[0]).toEqual(
      expect.objectContaining({
        take: 3,
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(findManyArgs[0]).not.toHaveProperty('skip');
    expect(prisma.telegramCrmMessage.count).not.toHaveBeenCalled();
    expect(prisma.telegramCrmConversation.findFirst).not.toHaveBeenCalled();

    const second = await service.list('user-1', 'conversation-1', {
      pageSize: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.id)).toEqual(['message-a']);
    expect(
      second.items.some((item) =>
        first.items.some((firstItem) => firstItem.id === item.id),
      ),
    ).toBe(false);
    expect(findManyArgs[1].where).toEqual(
      expect.objectContaining({
        OR: [{ sentAt: { lt: sentAt } }, { sentAt, id: { lt: 'message-b' } }],
      }),
    );
  });

  it('returns exactly 50 newest messages and exposes Load more only for a 51st row', async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      message(`message-${String(51 - index).padStart(2, '0')}`),
    );
    const { service, findManyArgs } = setup([rows]);

    const page = await service.list('user-1', 'conversation-1', {});

    expect(page.items).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(findManyArgs[0]).toEqual(expect.objectContaining({ take: 51 }));
  });

  it('does not expose an older page when fewer than 51 messages exist', async () => {
    const { service } = setup([[message('only-message')]]);

    const page = await service.list('user-1', 'conversation-1', {});

    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor before reading messages', async () => {
    const { service, prisma } = setup([]);

    await expect(
      service.list('user-1', 'conversation-1', { cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramCrmMessage.findMany).not.toHaveBeenCalled();
  });

  it('hides a Conversation outside the workspace/own scope', async () => {
    const { service, prisma } = setup([]);
    prisma.telegramCrmConversation.findFirst.mockResolvedValue(null);

    await expect(
      service.list('user-1', 'conversation-other', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'conversation-other',
          workspaceId: 'workspace-1',
          contact: { ownerMemberId: 'member-1' },
        },
      }),
    );
  });
});
