import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramCrmInboxConversationsService } from './telegram-crm-inbox-conversations.service';
import { CrmInboxConversationsQueryDto } from './telegram-crm-inbox-conversations.dto';
import { crmMessagePreviewSelect } from './telegram-crm-read-model.mapper';

type InboxQuery = {
  where: {
    workspaceId: string;
    state: string;
    contact?: unknown;
    AND: Array<{ OR?: unknown[]; [key: string]: unknown }>;
  };
  select: { messages: unknown };
  take: number;
};

const time = new Date('2026-10-30T10:00:00.000Z');
const cursor = (id: string, lastMessageAt: Date | null = time) =>
  Buffer.from(JSON.stringify({ version: 1, id, lastMessageAt })).toString(
    'base64url',
  );
const row = (id: string, lastMessageAt: Date | null = time, linked = true) => ({
  id,
  workspaceId: 'workspace-current',
  mtprotoAccountId: 'account-current',
  state: 'ACTIVE',
  lastMessageAt,
  lastInboundAt: lastMessageAt,
  lastOutboundAt: null,
  unreadCount: 2,
  ignoreInUnread: false,
  readState: 'UNREAD',
  folderMemberships: [] as Array<{
    workspaceId: string;
    mtprotoAccountId: string;
    folder: {
      id: string;
      workspaceId: string;
      mtprotoAccountId: string;
      name: string;
      color: string | null;
      emojiPresentation: null;
      excludeRead: boolean;
      isActive: boolean;
    };
  }>,
  contact: linked
    ? {
        id: `contact-${id}`,
        displayName: `Client ${id}`,
        telegramUsername: `client_${id}`,
        stage: 'LEAD',
        nextContactAt: time,
        tags: [] as Array<{
          workspaceId: string;
          tag: {
            workspaceId: string;
            id: string;
            name: string;
            color: string | null;
            systemKey: string;
          };
        }>,
      }
    : null,
  peer: {
    id: `peer-${id}`,
    telegramUserId: id,
    firstName: 'Client',
    lastName: null,
    username: null,
    photoUrl: null,
  },
  mtprotoAccount: {
    id: 'account-current',
    label: 'Sales',
    username: null,
    photoUrl: null,
  },
  messages: lastMessageAt
    ? [
        {
          id: `message-${id}`,
          conversationId: id,
          direction: 'INBOUND',
          origin: 'TELEGRAM_SYNC',
          text: 'a'.repeat(500),
          sentAt: lastMessageAt,
          readState: 'UNREAD',
        },
      ]
    : [],
});

function setup(rows: ReturnType<typeof row>[] = [], own = false) {
  const outboundField = {
    modelName: 'TelegramCrmConversation',
    name: 'lastOutboundAt',
  };
  const findMany = jest
    .fn<Promise<ReturnType<typeof row>[]>, [InboxQuery]>()
    .mockResolvedValue(rows);
  const prisma = {
    telegramCrmFolder: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          mtprotoAccountId: 'account-current',
          excludeRead: false,
        }),
    },
    telegramCrmConversation: {
      findMany,
      fields: { lastOutboundAt: outboundField },
    },
  };
  const authorization = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-current' }),
    scope: jest
      .fn()
      .mockResolvedValue(own ? { assignedMemberId: 'member-current' } : {}),
  };
  return {
    service: new TelegramCrmInboxConversationsService(
      prisma as never,
      authorization as never,
    ),
    findMany,
    folderLookup: prisma.telegramCrmFolder.findFirst,
    authorization,
    outboundField,
  };
}

describe('TelegramCrmInboxConversationsService', () => {
  it('returns linked and unlinked exact dialogs with bounded compact previews', async () => {
    const { service, findMany } = setup([
      row('c3'),
      row('c2', time, false),
      row('c1'),
    ]);
    const result = await service.list('user-current', { limit: 2 });
    expect(result.items.map((item) => item.id)).toEqual(['c3', 'c2']);
    expect(result.items[0].contact).toMatchObject({
      displayName: 'Client c3',
      telegramUsername: 'client_c3',
      nextContactAt: time.toISOString(),
    });
    expect(result.items[1].contact).toBeNull();
    expect(result.items[0].lastMessage?.text).toHaveLength(240);
    expect(result.items[0]).not.toHaveProperty('messages');
    expect(result.items[0]).not.toHaveProperty('telegramAccessHash');
    expect(result.hasMore).toBe(true);
    expect(
      JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString('utf8')),
    ).toEqual({
      version: 1,
      id: 'c2',
      lastMessageAt: time.toISOString(),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-current', state: 'ACTIVE', AND: [{}] },
        take: 3,
      }),
    );
    expect(findMany.mock.calls[0][0].select.messages).toEqual({
      where: { deletedAt: null },
      select: crmMessagePreviewSelect,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: 1,
    });
  });

  it('returns account-scoped canonical folders on unlinked chats without relying on contact tags', async () => {
    const item = row('client', time, false);
    const folder = {
      workspaceId: 'workspace-current',
      mtprotoAccountId: 'account-current',
      id: 'our-folder',
      name: 'VIP',
      color: null,
      emojiPresentation: null,
      excludeRead: true,
      isActive: true,
    };
    item.folderMemberships = [
      {
        workspaceId: 'workspace-current',
        mtprotoAccountId: 'account-current',
        folder,
      },
      {
        workspaceId: 'workspace-current',
        mtprotoAccountId: 'account-other',
        folder: {
          ...folder,
          id: 'other-account',
          mtprotoAccountId: 'account-other',
        },
      },
    ];
    const { service } = setup([item]);
    const result = await service.list('user-current', {});
    expect(result.items[0].folders).toEqual([
      {
        id: 'our-folder',
        name: 'VIP',
        color: null,
        emojiPresentation: null,
        excludeRead: true,
      },
    ]);
  });

  it('filters a folder inside the authorized workspace and its Telegram account', async () => {
    const { service, findMany } = setup();
    await service.list('user-current', { folderId: 'folder-one' });
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      mtprotoAccountId: 'account-current',
      folderMemberships: {
        some: {
          workspaceId: 'workspace-current',
          mtprotoAccountId: 'account-current',
          folderId: 'folder-one',
        },
      },
    });
  });

  it('applies an unread-only folder against the current unread count while preserving base chips', async () => {
    const h = setup();
    h.folderLookup.mockResolvedValueOnce({
      mtprotoAccountId: 'account-current',
      excludeRead: true,
    });
    await h.service.list('user-current', {
      folderId: 'unread-folder',
      filter: 'ALL',
    });
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual(
      expect.objectContaining({
        unreadCount: { gt: 0 },
        folderMemberships: {
          some: {
            workspaceId: 'workspace-current',
            mtprotoAccountId: 'account-current',
            folderId: 'unread-folder',
          },
        },
      }),
    );
  });

  it('does not expose or query a folder outside the current workspace', async () => {
    const { service, findMany, folderLookup } = setup();
    folderLookup.mockResolvedValueOnce(null);
    await expect(
      service.list('user-current', { folderId: 'foreign-folder' }),
    ).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(folderLookup).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-current',
        id: 'foreign-folder',
        isActive: true,
      },
      select: { mtprotoAccountId: true, excludeRead: true },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps the timestamp tie-break and includes the null partition after a dated cursor', async () => {
    const { service, findMany } = setup();
    await service.list('user-current', { cursor: cursor('c2') });
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      OR: [
        { lastMessageAt: { lt: time } },
        { lastMessageAt: time, id: { lt: 'c2' } },
        { lastMessageAt: null },
      ],
    });
  });

  it('continues only within the null partition and serializes an empty dialog', async () => {
    const { service, findMany } = setup([row('c1', null)]);
    const result = await service.list('user-current', {
      cursor: cursor('c2', null),
    });
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      lastMessageAt: null,
      id: { lt: 'c2' },
    });
    expect(result).toMatchObject({
      items: [{ lastMessage: null, lastMessageAt: null }],
      nextCursor: null,
      hasMore: false,
    });
  });

  it.each([
    'garbage',
    cursor(''),
    Buffer.from(
      JSON.stringify({ version: 1, id: 'c1', lastMessageAt: 'yesterday' }),
    ).toString('base64url'),
  ])('rejects malformed cursor %s without DB reads', async (value) => {
    const { service, findMany } = setup();
    await expect(
      service.list('user-current', { cursor: value }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('enforces workspace and ownership even when given a foreign cursor id', async () => {
    const { service, findMany } = setup([], true);
    await service.list('user-current', {
      cursor: cursor('foreign-conversation'),
      filter: 'FOLLOW_UP',
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'workspace-current',
      contact: { ownerMemberId: 'member-current' },
    });
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      contact: {
        OR: [
          { manualSalesStatus: null },
          { manualSalesStatus: { notIn: ['CLOSED', 'DO_NOT_CONTACT'] } },
        ],
        archivedAt: null,
        nextContactAt: { lte: expect.any(Date) as unknown },
      },
    });
  });

  it('does not query dialogs when authorization fails', async () => {
    const { service, findMany, authorization } = setup();
    authorization.require.mockRejectedValue(new ForbiddenException());
    await expect(service.list('user-current', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('uses SQL field comparison for Needs Reply independently of unread status', async () => {
    const { service, findMany, outboundField } = setup();
    await service.list('user-current', { filter: 'NEEDS_REPLY' });
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual(
      expect.objectContaining({
        lastInboundAt: { not: null },
        OR: [
          { lastOutboundAt: null },
          { lastInboundAt: { gt: outboundField } },
        ],
      }),
    );
  });

  it.each(['UNREAD', 'ARCHIVED'] as const)(
    'filters %s in the database',
    async (filter) => {
      const { service, findMany } = setup();
      await service.list('user-current', { filter });
      const where = findMany.mock.calls[0][0].where;
      expect(where.state).toBe(filter === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE');
      if (filter === 'UNREAD')
        expect(where.AND).toContainEqual({ unreadCount: { gt: 0 }, ignoreInUnread: false });
    },
  );

  it('returns a truthful empty AI Leads queue after authorization without a DB scan', async () => {
    const { service, findMany, authorization } = setup();
    await expect(
      service.list('user-current', { filter: 'AI_LEADS' }),
    ).resolves.toEqual({ items: [], hasMore: false, nextCursor: null });
    expect(authorization.scope).toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('combines search with ownership and cursor instead of replacing those predicates', async () => {
    const { service, findMany } = setup([], true);
    await service.list('user-current', {
      search: '  client  ',
      cursor: cursor('c2'),
    });
    const where = findMany.mock.calls[0][0].where;
    expect(where.contact).toEqual({ ownerMemberId: 'member-current' });
    expect(where.AND).toHaveLength(3);
    expect(where.AND[2].OR).toContainEqual({
      contact: { displayName: { contains: 'client', mode: 'insensitive' } },
    });
  });

  it('accepts a copied @username using the same handle search as the client', async () => {
    const { service, findMany } = setup();
    await service.list('user-current', { search: ' @sales_client ' });
    expect(findMany.mock.calls[0][0].where.AND[1].OR).toContainEqual({
      peer: { username: { contains: 'sales_client', mode: 'insensitive' } },
    });
  });

  it.each([100, 1000])(
    'keeps collection reads bounded with %i available dialogs',
    async (size) => {
      const { service, findMany } = setup(
        Array.from({ length: Math.min(size, 51) }, (_, id) => row(String(id))),
      );
      const result = await service.list('user-current', {});
      expect(result.items).toHaveLength(50);
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0][0]).toMatchObject({ take: 51 });
      expect(findMany.mock.calls[0][0]).not.toHaveProperty('skip');
    },
  );

  it.each([
    { limit: 0 },
    { limit: 101 },
    { filter: 'invented' },
    { search: 'a'.repeat(101) },
  ])('validates external query limits and filters: %j', async (query) => {
    expect(
      await validate(plainToInstance(CrmInboxConversationsQueryDto, query)),
    ).not.toHaveLength(0);
  });
});

describe('Inbox follow-up with manual business decisions', () => {
  it.each(['INTERESTED', 'HUMAN_REVIEW'] as const)(
    'keeps overdue %s visible without discarding its manual label',
    async (manualSalesStatus) => {
      const item = row('dialog-due');
      const current = {
        ...item,
        contact: { ...item.contact!, manualSalesStatus, archivedAt: null },
      };
      const { service, findMany } = setup([current]);
      const result = await service.list('user-current', {
        filter: 'FOLLOW_UP',
      });
      expect(result.items[0].attentionStatus).toBe(manualSalesStatus);
      expect(findMany.mock.calls[0][0].where.AND).toContainEqual(
        expect.objectContaining({
          contact: expect.objectContaining({
            OR: [
              { manualSalesStatus: null },
              { manualSalesStatus: { notIn: ['CLOSED', 'DO_NOT_CONTACT'] } },
            ],
          }) as unknown,
        }),
      );
    },
  );
});
