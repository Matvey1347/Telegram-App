import { TelegramCrmSystemTagsService } from './telegram-crm-system-tags.service';

describe('TelegramCrmSystemTagsService', () => {
  it('creates colored Telegram folder tags and assigns them to imported contacts', async () => {
    const tagFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'tag-folder', systemKey: 'TELEGRAM_FOLDER:account-1:9' },
      ]);
    const assignmentCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      telegramAdvertiserTag: {
        findMany: tagFindMany,
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: assignmentCreateMany,
        deleteMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncTelegramFolderTags(
      {
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        folders: [{ id: 9, title: 'Customers', emoticon: '🤝', color: 3 }],
        dialogs: [
          {
            peer: { telegramUserId: '42' },
            folderIds: [9],
          },
        ] as never,
        contactIdByTelegramUserId: new Map([['42', 'advertiser-1']]),
      },
      prisma as never,
    );

    expect(prisma.telegramAdvertiserTag.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          systemKey: 'TELEGRAM_FOLDER:account-1:9',
          name: '🤝 Customers',
          color: '#22c55e',
        }),
      ],
      skipDuplicates: true,
    });
    expect(assignmentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: 'workspace-1',
          advertiserId: 'advertiser-1',
          tagId: 'tag-folder',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('does not invent an emoji for a Telegram folder without one', async () => {
    const prisma = {
      telegramAdvertiserTag: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncTelegramFolderTags(
      {
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        folders: [{ id: 9, title: 'Внут', emoticon: null, color: 5 }],
        dialogs: [],
        contactIdByTelegramUserId: new Map(),
      },
      prisma as never,
    );

    expect(prisma.telegramAdvertiserTag.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: 'Внут',
          color: '#3b82f6',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('creates and assigns network and channel tags for completed purchases', async () => {
    const tagFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'tag-channel', systemKey: 'CHANNEL:channel-1' },
        { id: 'tag-network', systemKey: 'NETWORK:network-1' },
      ]);
    const tagCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const assignmentCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannel: {
              id: 'channel-1',
              title: 'Business patterns',
              networkMembers: [],
            },
            network: { id: 'network-1', name: 'Business' },
          },
        ]),
      },
      telegramAdvertiserTag: {
        findMany: tagFindMany,
        createMany: tagCreateMany,
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: assignmentCreateMany,
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags(
      'workspace-1',
      'advertiser-1',
      prisma as never,
    );

    const [tagCreate] = tagCreateMany.mock.calls[0] as unknown as [
      {
        data: Array<{ systemKey: string; name: string }>;
        skipDuplicates: boolean;
      },
    ];
    expect(tagCreate.skipDuplicates).toBe(true);
    expect(tagCreate.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          systemKey: 'NETWORK:network-1',
          name: 'Network · Business',
        }),
        expect.objectContaining({
          systemKey: 'CHANNEL:channel-1',
          name: 'Channel · Business patterns',
        }),
      ]),
    );
    const [assignmentCreate] = assignmentCreateMany.mock
      .calls[0] as unknown as [
      {
        data: Array<{
          advertiserId: string;
          tagId: string;
          workspaceId: string;
        }>;
        skipDuplicates: boolean;
      },
    ];
    expect(assignmentCreate.skipDuplicates).toBe(true);
    expect(assignmentCreate.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          advertiserId: 'advertiser-1',
          tagId: 'tag-channel',
          workspaceId: 'workspace-1',
        }),
      ]),
    );
  });

  it('does not write tags when the advertiser has no qualifying purchase', async () => {
    const prisma = {
      telegramAdSalePlacement: { findMany: jest.fn().mockResolvedValue([]) },
      telegramAdvertiserTag: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags('workspace-1', 'advertiser-1');

    expect(prisma.telegramAdvertiserTag.createMany).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.createMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('removes stale purchase tags after the last qualifying sale is cancelled', async () => {
    const prisma = {
      telegramAdSalePlacement: { findMany: jest.fn().mockResolvedValue([]) },
      telegramAdvertiserTag: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            tagId: 'tag-network',
            tag: { systemKey: 'NETWORK:network-1' },
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags('workspace-1', 'advertiser-1');

    expect(
      prisma.telegramAdvertiserTagAssignment.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        advertiserId: 'advertiser-1',
        tagId: { in: ['tag-network'] },
      },
    });
    expect(
      prisma.telegramAdvertiserTagAssignment.createMany,
    ).not.toHaveBeenCalled();
  });

  it('does not rewrite assignments that are already current', async () => {
    const prisma = {
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannel: {
              id: 'channel-1',
              title: 'Business patterns',
              networkMembers: [],
            },
            network: null,
          },
        ]),
      },
      telegramAdvertiserTag: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'tag-channel',
              systemKey: 'CHANNEL:channel-1',
              name: 'Channel · Business patterns',
            },
          ])
          .mockResolvedValueOnce([{ id: 'tag-channel' }]),
        createMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            tagId: 'tag-channel',
            tag: { systemKey: 'CHANNEL:channel-1' },
          },
        ]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags('workspace-1', 'advertiser-1');

    expect(prisma.telegramAdvertiserTag.createMany).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.createMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.deleteMany,
    ).not.toHaveBeenCalled();
  });
});

it.each([null, 'TELEGRAM_FOLDER:other-account:4'])(
  'preserves legacy name on collision with another workspace tag (%s)',
  async (conflictingSystemKey) => {
    const rows = [
      {
        id: 'old',
        workspaceId: 'w',
        systemKey: 'TELEGRAM_FOLDER:a:9',
        name: 'Old name',
        color: '#000000',
        position: 9,
      },
      {
        id: 'unrelated',
        workspaceId: 'w',
        systemKey: conflictingSystemKey,
        name: 'Customers',
        color: null,
        position: 0,
      },
      {
        id: 'foreign',
        workspaceId: 'other-workspace',
        systemKey: null,
        name: 'Unrelated',
        color: null,
        position: 0,
      },
    ];
    type Where = {
      workspaceId: string;
      systemKey?: { in: string[] };
      name?: { in: string[] };
      OR?: Where[];
    };
    const matches = (row: (typeof rows)[number], where: Where): boolean =>
      (!where.workspaceId || row.workspaceId === where.workspaceId) &&
      (!where.systemKey || where.systemKey.in.includes(row.systemKey ?? '')) &&
      (!where.name || where.name.in.includes(row.name)) &&
      (!where.OR || where.OR.some((part) => matches(row, part)));
    const prisma = {
      telegramAdvertiserTag: {
        findMany: jest.fn(({ where }: { where: Where }) =>
          rows.filter((row) => matches(row, where)),
        ),
        createMany: jest.fn(),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { workspaceId: string; systemKey: string };
            data: { name: string };
          }) => {
            const current = rows.find(
              (row) =>
                row.workspaceId === where.workspaceId &&
                row.systemKey === where.systemKey,
            )!;
            if (
              rows.some(
                (row) =>
                  row.workspaceId === where.workspaceId &&
                  row.id !== current.id &&
                  row.name === data.name,
              )
            )
              throw new Error('Unique constraint failed: workspaceId,name');
            current.name = data.name;
            return { count: 1 };
          },
        ),
      },
    };
    await new TelegramCrmSystemTagsService(
      prisma as never,
    ).syncTelegramFolderTags(
      {
        workspaceId: 'w',
        accountId: 'a',
        folders: [{ id: 9, title: 'Customers', emoticon: null, color: 3 }],
        dialogs: [],
        contactIdByTelegramUserId: new Map(),
      },
      prisma as never,
    );
    expect(prisma.telegramAdvertiserTag.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          workspaceId: 'w',
          OR: [
            { systemKey: { in: ['TELEGRAM_FOLDER:a:9'] } },
            { name: { in: ['Customers'] } },
          ],
        },
      }),
    );
    expect(prisma.telegramAdvertiserTag.findMany).toHaveBeenCalledTimes(2);
    expect(rows[0].name).toBe('Old name');
    expect(rows[1].name).toBe('Customers');
    expect(
      prisma.telegramAdvertiserTag.updateMany.mock.calls[0]?.[0].data.name,
    ).toBe('Old name');
  },
);

it('preserves an existing folder name when a newly inserted folder claims its proposed rename in the same batch', async () => {
  const rows = [
    {
      id: 'existing',
      systemKey: 'TELEGRAM_FOLDER:a:1',
      name: 'Original',
      color: null as string | null,
      position: 301,
    },
  ];
  const prisma = {
    telegramAdvertiserTag: {
      findMany: jest
        .fn()
        .mockImplementation(() => rows.map((row) => ({ ...row }))),
      createMany: jest.fn(
        ({
          data,
        }: {
          data: Array<{
            systemKey: string;
            name: string;
            color: string | null;
            position: number;
          }>;
        }) => {
          for (const definition of data)
            if (!rows.some((row) => row.name === definition.name))
              rows.push({ id: 'new', ...definition });
          return { count: 1 };
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { systemKey: string };
          data: { name: string };
        }) => {
          const current = rows.find(
            (row) => row.systemKey === where.systemKey,
          )!;
          if (
            rows.some((row) => row.id !== current.id && row.name === data.name)
          )
            throw new Error('Unique constraint failed');
          current.name = data.name;
          return { count: 1 };
        },
      ),
    },
  };
  await new TelegramCrmSystemTagsService(
    prisma as never,
  ).syncTelegramFolderTags(
    {
      workspaceId: 'w',
      accountId: 'a',
      folders: [
        { id: 1, title: 'Shared', emoticon: null, color: 3 },
        { id: 2, title: 'Shared', emoticon: null, color: 3 },
      ],
      dialogs: [],
      contactIdByTelegramUserId: new Map(),
    },
    prisma as never,
  );
  expect(rows.map((row) => [row.systemKey, row.name])).toEqual([
    ['TELEGRAM_FOLDER:a:1', 'Original'],
    ['TELEGRAM_FOLDER:a:2', 'Shared'],
  ]);
  expect(prisma.telegramAdvertiserTag.findMany).toHaveBeenCalledTimes(2);
});
