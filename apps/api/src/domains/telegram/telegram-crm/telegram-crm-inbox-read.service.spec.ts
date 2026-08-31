import { TelegramCrmInboxReadService } from './telegram-crm-inbox-read.service';

const date = new Date('2026-08-31T12:00:00.000Z');
const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const peerRow = (id: string, lastMessageAt: Date) => ({
  id,
  workspaceId: 'workspace-1',
  telegramUserId: id === 'peer-new' ? '42' : '43',
  contactId: null,
  username: null,
  firstName: id,
  lastName: null,
  photoUrl: null,
  createdAt: date,
  updatedAt: date,
  conversations: [
    {
      id: `conversation-${id}`,
      mtprotoAccountId: 'account-1',
      state: 'ACTIVE',
      lastMessageAt,
      lastInboundAt: lastMessageAt,
      lastOutboundAt: null,
      unreadCount: id === 'peer-new' ? 2 : 0,
      readState: id === 'peer-new' ? 'UNREAD' : 'READ',
    },
  ],
});

describe('TelegramCrmInboxReadService', () => {
  it('preserves latest-Conversation SQL order and keeps nested rows out of Peer', async () => {
    const newer = peerRow('peer-new', new Date('2026-08-31T14:00:00.000Z'));
    const older = peerRow('peer-old', new Date('2026-08-31T13:00:00.000Z'));
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'peer-new' }, { id: 'peer-old' }]),
      telegramCrmPeer: {
        findMany: jest.fn().mockResolvedValue([older, newer]),
        count: jest.fn().mockResolvedValue(2),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new TelegramCrmInboxReadService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
    );

    const result = await service.list('user-1', { page: 1, pageSize: 10 });

    expect(result.items.map((item) => item.peer.id)).toEqual([
      'peer-new',
      'peer-old',
    ]);
    expect(result.items[0]).toMatchObject({
      unreadCount: 2,
      latestConversation: {
        id: 'conversation-peer-new',
        lastMessageAt: '2026-08-31T14:00:00.000Z',
      },
    });
    expect(result.items[0]?.peer).not.toHaveProperty('conversations');
    expect(callArgument(prisma.telegramCrmPeer.findMany)).toMatchObject({
      where: {
        workspaceId: 'workspace-1',
        id: { in: ['peer-new', 'peer-old'] },
      },
    });
  });
});
