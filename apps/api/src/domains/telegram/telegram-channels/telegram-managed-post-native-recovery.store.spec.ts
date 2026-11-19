import {
  TelegramManagedPostNativeRecoveryStore,
  type NativeRecoveryPrepareInput,
} from './telegram-managed-post-native-recovery.store';

type Row = NativeRecoveryPrepareInput & {
  status: string;
  newMessageIds: string[];
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
function fixture() {
  const input: NativeRecoveryPrepareInput = {
    workspaceId: 'workspace',
    channelId: 'channel',
    postId: 'post',
    owner: 'claim-1',
    sourceId: 'priority',
    scheduledAt: new Date(Date.now() + 3600_000),
    oldMessageIds: ['11'],
  };
  const post = {
    sourceId: 'old',
    scheduledAt: input.scheduledAt,
    telegramScheduledMessageIds: ['11'],
    owner: input.owner,
    expiry: new Date(Date.now() + 120_000),
    ordinary: true,
  };
  let row: Row | null = null;
  const live = (where: Record<string, unknown>) =>
    post.ordinary &&
    post.owner === where.deliveryClaimOwner &&
    post.expiry > new Date();
  const table = {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)),
    findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(row)),
    findFirst: jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          row &&
            row.postId === where.postId &&
            row.workspaceId === where.workspaceId &&
            row.channelId === where.channelId &&
            (!where.owner || row.owner === where.owner) &&
            (!where.status || row.status === where.status)
            ? row
            : null,
        ),
      ),
    create: jest
      .fn()
      .mockImplementation(
        ({ data }: { data: Omit<Row, 'createdAt' | 'updatedAt'> }) => {
          row = { ...data, createdAt: new Date(), updatedAt: new Date() };
          return Promise.resolve(row);
        },
      ),
    updateMany: jest
      .fn()
      .mockImplementation(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<Row>;
        }) => {
          const status = where.status as string | { in: string[] } | undefined;
          const relation = where.post as
            | { is: Record<string, unknown> }
            | undefined;
          const matches =
            row &&
            row.postId === where.postId &&
            row.workspaceId === where.workspaceId &&
            row.channelId === where.channelId &&
            row.owner === where.owner &&
            (!status ||
              (typeof status === 'string'
                ? row.status === status
                : status.in.includes(row.status))) &&
            (!relation || live(relation.is)) &&
            (where.cancelledAt !== null || row.cancelledAt === null);
          if (!matches) return Promise.resolve({ count: 0 });
          row = { ...row!, ...data, updatedAt: new Date() };
          return Promise.resolve({ count: 1 });
        },
      ),
  };
  const prisma = {
    telegramManagedPostNativeRecovery: table,
    telegramManagedPost: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(live(where) ? post : null),
        ),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (run: (tx: typeof prisma) => unknown) => run(prisma),
  );
  const store = new TelegramManagedPostNativeRecoveryStore(prisma as never);
  return { store, input, post, prisma, getRow: () => row };
}

describe('bounded native schedule recovery evidence', () => {
  it('prepares once and atomically admits only one start for the live ordinary claim', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    await f.store.prepare(f.input);
    expect(
      f.prisma.telegramManagedPostNativeRecovery.create,
    ).toHaveBeenCalledTimes(1);
    await f.store.start(f.input);
    await expect(f.store.start(f.input)).rejects.toThrow('no replay');
    expect(f.getRow()?.status).toBe('STARTED');
  });
  it.each(['other owner', 'advertisement', 'expired'])(
    'excludes %s before creating durable evidence',
    async (reason) => {
      const f = fixture();
      if (reason === 'other owner') f.post.owner = 'different';
      if (reason === 'advertisement') f.post.ordinary = false;
      if (reason === 'expired') f.post.expiry = new Date(Date.now() - 1);
      await expect(f.store.prepare(f.input)).rejects.toThrow('no replay');
      expect(f.getRow()).toBeNull();
    },
  );
  it('records deletion acknowledgement before scheduling without releasing the claim', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    await f.store.cancelled(f.input);
    expect(f.getRow()?.cancelledAt).toBeInstanceOf(Date);
    expect(f.post.owner).toBe(f.input.owner);
    await f.store.start(f.input);
  });
  it('keeps unknown attempts blocked even after a different claim owner is admitted', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    await f.store.start(f.input);
    await f.store.failed(f.input);
    expect(f.getRow()?.status).toBe('UNKNOWN');
    f.post.owner = 'claim-2';
    await expect(
      f.store.prepare({ ...f.input, owner: f.post.owner }),
    ).rejects.toThrow('no replay');
    expect(f.getRow()?.status).toBe('UNKNOWN');
  });
  it('preserves acknowledged IDs when the HTTP response is lost and failure handling runs', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    await f.store.start(f.input);
    await f.store.acknowledged({ ...f.input, newMessageIds: ['21'] });
    await f.store.failed(f.input);
    expect(f.getRow()).toMatchObject({
      status: 'ACKED',
      newMessageIds: ['21'],
    });
    await f.store.acknowledged({ ...f.input, newMessageIds: ['21'] });
    await expect(
      f.store.acknowledged({ ...f.input, newMessageIds: ['22'] }),
    ).rejects.toThrow('no replay');
  });
  it('allows a new deliberate generation only after the accepted schedule is projected on the post', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    await f.store.start(f.input);
    await f.store.acknowledged({ ...f.input, newMessageIds: ['21'] });
    f.post.owner = 'claim-2';
    await expect(
      f.store.prepare({ ...f.input, owner: 'claim-2' }),
    ).rejects.toThrow('no replay');
    f.post.sourceId = 'priority';
    f.post.telegramScheduledMessageIds = ['21'];
    await f.store.prepare({
      ...f.input,
      owner: 'claim-2',
      oldMessageIds: ['21'],
    });
    expect(f.getRow()).toMatchObject({
      status: 'PREPARED',
      owner: 'claim-2',
      oldMessageIds: ['21'],
      newMessageIds: [],
      cancelledAt: null,
    });
  });
  it('rejects starting after the post claim changed or deadline elapsed', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    f.post.owner = 'changed';
    await expect(f.store.start(f.input)).rejects.toThrow('no replay');
    expect(f.getRow()?.status).toBe('PREPARED');
  });
  it('never reads or changes evidence from another workspace', async () => {
    const f = fixture();
    await f.store.prepare(f.input);
    expect(await f.store.read('post', 'other', 'channel')).toBeNull();
    await f.store.failed({ ...f.input, workspaceId: 'other' });
    expect(f.getRow()?.status).toBe('PREPARED');
  });
  it('redacts database errors', async () => {
    const f = fixture();
    f.prisma.telegramManagedPostNativeRecovery.findFirst.mockRejectedValue(
      new Error('private connection credentials'),
    );
    await expect(f.store.read('post', 'workspace', 'channel')).rejects.toThrow(
      'Native recovery evidence could not be read.',
    );
  });
});
