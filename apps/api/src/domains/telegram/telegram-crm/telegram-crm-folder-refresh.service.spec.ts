import { TelegramCrmFolderRefreshService } from './telegram-crm-folder-refresh.service';
import { syncCrmDialogFolders } from './telegram-crm-folder-sync';
jest.mock('./telegram-crm-folder-sync', () => ({
  syncCrmDialogFolders: jest.fn().mockResolvedValue(undefined),
}));
function fixture() {
  const prisma = {
    telegramCrmAccountSyncState: {
      findUnique: jest.fn().mockResolvedValue({ folderRefreshVersion: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({
        folderRefreshVersion: 1,
        folderReconciledVersion: 0,
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    telegramCrmConversation: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'existing', peer: { telegramUserId: '42' } },
        ]),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn('tx')),
  };
  const events = { emit: jest.fn() };
  const handle = {
    listPrivatePeerDialogs: jest
      .fn()
      .mockResolvedValue({ dialogs: [], folders: [] }),
    listPrivateDialogs: jest.fn().mockResolvedValue({
      dialogs: [
        { peer: { telegramUserId: '42' } },
        { peer: { telegramUserId: 'unknown' } },
      ],
      folders: [],
      scanned: 2,
      nextCursor: null,
      exhausted: true,
    }),
  };
  const account = { id: 'a', workspaceId: 'w' };
  const service = new TelegramCrmFolderRefreshService(
    prisma as never,
    events as never,
  );
  return {
    prisma,
    events,
    handle,
    service,
    account,
    run: (current = () => true) =>
      service.request(account as never, handle as never, current),
  };
}
describe('event driven CRM folder refresh', () => {
  beforeEach(() => jest.clearAllMocks());
  it('reconciles existing conversations only and emits generic invalidation after commit', async () => {
    const f = fixture();
    await f.run();
    expect(syncCrmDialogFolders).toHaveBeenCalledWith(
      'tx',
      expect.objectContaining({ workspaceId: 'w', accountId: 'a' }),
      new Map([['42', 'existing']]),
    );
    expect(f.events.emit).toHaveBeenCalledWith({
      type: 'folders.updated',
      workspaceId: 'w',
      ownerMemberId: null,
      occurredAt: expect.any(String),
    });
    expect(f.prisma.telegramCrmConversation.findMany).toHaveBeenCalledTimes(1);
  });
  it('coalesces concurrent account events into one bounded follow-up scan', async () => {
    const f = fixture();
    const first = f.run();
    const second = f.run();
    await Promise.all([first, second]);
    expect(f.handle.listPrivateDialogs).toHaveBeenCalledTimes(2);
  });
  it('stops stale handles before persistence and never emits false success on Telegram failure', async () => {
    const f = fixture();
    await f.run(() => false);
    expect(f.handle.listPrivateDialogs).not.toHaveBeenCalled();
    f.handle.listPrivateDialogs.mockRejectedValue(new Error('unavailable'));
    await expect(f.run()).rejects.toThrow('unavailable');
    expect(f.events.emit).not.toHaveBeenCalled();
  });
  it('bounds scans even when Telegram supplies endless pages', async () => {
    const f = fixture();
    let page = 0;
    f.handle.listPrivateDialogs.mockImplementation(async () => ({
      dialogs: [],
      folders: [],
      scanned: 100,
      nextCursor: String(++page),
      exhausted: false,
    }));
    await expect(f.run()).rejects.toThrow('CRM_FOLDER_REFRESH_LIMIT_REACHED');
    expect(f.handle.listPrivateDialogs).toHaveBeenCalledTimes(100);
    expect(f.events.emit).not.toHaveBeenCalled();
  });
});

it('does not lose an event arriving during the second coalesced pass', async () => {
  const f = fixture();
  let passes = 0;
  f.handle.listPrivateDialogs.mockImplementation(async () => {
    passes += 1;
    if (passes < 3) void f.run();
    return {
      dialogs: [],
      folders: [],
      scanned: 0,
      nextCursor: null,
      exhausted: true,
    };
  });
  await f.run();
  expect(passes).toBe(3);
});

it('fences ownership revoked during the conversation lookup before starting a transaction', async () => {
  const f = fixture();
  let current = true;
  f.prisma.telegramCrmConversation.findMany.mockImplementation(async () => {
    current = false;
    return [];
  });
  await f.run(() => current);
  expect(f.prisma.$transaction).not.toHaveBeenCalled();
  expect(f.events.emit).not.toHaveBeenCalled();
});

it('rejects inside the transaction when ownership changes during reconciliation', async () => {
  const f = fixture();
  let current = true;
  jest.mocked(syncCrmDialogFolders).mockImplementationOnce(async () => {
    current = false;
  });
  await expect(f.run(() => current)).rejects.toThrow(
    'CRM_FOLDER_REFRESH_SUPERSEDED',
  );
  expect(f.events.emit).not.toHaveBeenCalled();
});

it('continues past 1000 raw dialogs until Telegram reports exhaustion', async () => {
  const f = fixture();
  let page = 0;
  f.handle.listPrivateDialogs.mockImplementation(async () => ({
    dialogs: [],
    folders: [],
    scanned: 100,
    nextCursor: String(++page),
    exhausted: page === 12,
  }));
  await f.run();
  expect(f.handle.listPrivateDialogs).toHaveBeenCalledTimes(12);
  expect(f.events.emit).toHaveBeenCalledTimes(1);
});

it('retries one transient failure within the active job', async () => {
  const f = fixture();
  f.handle.listPrivateDialogs.mockRejectedValueOnce(new Error('temporary'));
  await f.run();
  expect(f.handle.listPrivateDialogs).toHaveBeenCalledTimes(2);
  expect(f.events.emit).toHaveBeenCalledTimes(1);
});

it.each([null, 'same'])(
  'rejects non-exhausted stalled pagination instead of reporting completion (%s)',
  async (cursor) => {
    const f = fixture();
    f.handle.listPrivateDialogs.mockResolvedValue({
      dialogs: [],
      folders: [],
      scanned: 100,
      exhausted: false,
      nextCursor: cursor,
    });
    await expect(f.run()).rejects.toThrow('CRM_FOLDER_REFRESH_CURSOR_STALLED');
    expect(f.events.emit).not.toHaveBeenCalled();
  },
);

it('batches 250 newly discovered peers without scanning unrelated account dialogs', async () => {
  const f = fixture();
  await f.service.markDirty(f.account as never, true);
  const userIds = Array.from({ length: 250 }, (_, index) => String(index + 1));
  f.prisma.telegramCrmConversation.findMany.mockImplementation(
    async ({ where }) =>
      where.peer.telegramUserId.in.map((id: string) => ({
        id: `c${id}`,
        telegramAccessHash: 'hash',
        peer: { telegramUserId: id },
      })),
  );
  await f.service.request(
    f.account as never,
    f.handle as never,
    () => true,
    undefined,
    userIds,
    1,
  );
  expect(f.handle.listPrivatePeerDialogs).toHaveBeenCalledTimes(3);
  expect(f.handle.listPrivateDialogs).not.toHaveBeenCalled();
  expect(f.prisma.telegramCrmConversation.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'w',
        mtprotoAccountId: 'a',
      }),
    }),
  );
});

it('serializes initial folder backfill with a later external edit', async () => {
  const f = fixture();
  let release!: () => void;
  const order: string[] = [];
  const initial = f.service.withAccountScan('a', async () => {
    order.push('initial');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    order.push('initial persisted');
  });
  await Promise.resolve();
  await Promise.resolve();
  const external = f.run();
  await Promise.resolve();
  expect(f.handle.listPrivateDialogs).not.toHaveBeenCalled();
  release();
  await Promise.all([initial, external]);
  expect(order).toEqual(['initial', 'initial persisted']);
  expect(f.handle.listPrivateDialogs).toHaveBeenCalledTimes(1);
});

it('does no startup scan for clean records and repairs persisted pending work after restart', async () => {
  const f = fixture();
  await f.service.resumePending(
    f.account as never,
    f.handle as never,
    () => true,
  );
  expect(f.handle.listPrivateDialogs).not.toHaveBeenCalled();
  f.prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
  await f.service.resumePending(
    f.account as never,
    f.handle as never,
    () => true,
  );
  expect(f.handle.listPrivateDialogs).toHaveBeenCalledTimes(1);
  expect(f.prisma.telegramCrmAccountSyncState.updateMany).toHaveBeenCalledWith({
    where: { mtprotoAccountId: 'a', workspaceId: 'w', folderRefreshVersion: 1 },
    data: { folderReconciledVersion: 1 },
  });
});

it('does not acknowledge a concurrent edit with an old scan revision', async () => {
  const f = fixture();
  f.prisma.telegramCrmAccountSyncState.updateMany.mockResolvedValue({
    count: 0,
  });
  await f.run();
  expect(f.prisma.telegramCrmAccountSyncState.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ folderRefreshVersion: 1 }),
    }),
  );
});

it('forces full repair when a new peer arrives after an unresolved global edit', async () => {
  const f = fixture();
  await f.service.markDirty(f.account as never, false);
  f.prisma.telegramCrmAccountSyncState.upsert.mockResolvedValue({
    folderRefreshVersion: 2,
    folderReconciledVersion: 0,
  });
  expect(await f.service.markDirty(f.account as never, true)).toEqual({
    targeted: false,
    version: 2,
  });
  expect(f.prisma.telegramCrmAccountSyncState.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { mtprotoAccountId: 'a', workspaceId: 'w' },
    }),
  );
});

it('acknowledges only the revision whose peer ids were included, even if a later marker already committed', async () => {
  const f = fixture();
  await f.service.markDirty(f.account as never, true);
  f.prisma.telegramCrmAccountSyncState.findUnique.mockResolvedValue({
    folderRefreshVersion: 2,
  });
  f.prisma.telegramCrmConversation.findMany.mockResolvedValue([
    {
      id: 'existing',
      telegramAccessHash: '420',
      peer: { telegramUserId: '42' },
    },
  ]);
  await f.service.request(
    f.account as never,
    f.handle as never,
    () => true,
    undefined,
    ['42'],
    1,
  );
  expect(
    f.prisma.telegramCrmAccountSyncState.findUnique,
  ).not.toHaveBeenCalled();
  expect(f.prisma.telegramCrmAccountSyncState.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ folderRefreshVersion: 1 }),
      data: { folderReconciledVersion: 1 },
    }),
  );
});

it('invalidates target-only scope after failure, preventing a later peer from acknowledging an unprocessed earlier peer', async () => {
  const f = fixture();
  expect((await f.service.markDirty(f.account as never, true)).targeted).toBe(
    true,
  );
  f.prisma.telegramCrmConversation.findMany.mockResolvedValue([
    {
      id: 'existing',
      telegramAccessHash: '420',
      peer: { telegramUserId: '42' },
    },
  ]);
  f.handle.listPrivatePeerDialogs.mockRejectedValue(
    new Error('CRM_FOLDER_PEER_DIALOGS_UNAVAILABLE'),
  );
  await expect(
    f.service.request(
      f.account as never,
      f.handle as never,
      () => true,
      undefined,
      ['42'],
      1,
    ),
  ).rejects.toThrow('CRM_FOLDER_PEER_DIALOGS_UNAVAILABLE');
  f.prisma.telegramCrmAccountSyncState.upsert.mockResolvedValue({
    folderRefreshVersion: 2,
    folderReconciledVersion: 0,
  });
  expect((await f.service.markDirty(f.account as never, true)).targeted).toBe(
    false,
  );
});
