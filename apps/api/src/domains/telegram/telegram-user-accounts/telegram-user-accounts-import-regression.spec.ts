import { TelegramUserAccountsService } from './telegram-user-accounts.service';
const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
const policy = {
  acquisitionType: 'PURCHASED' as const,
  postsSyncFrom: new Date('2026-01-01'),
  inviteLinksSyncFrom: new Date('2026-02-01'),
  purchaseTransactionId: 'purchase-transaction',
};
function setup(
  existing: {
    id: string;
    username: string | null;
    telegramChatId: string | null;
  } | null,
) {
  const saved = existing ? { ...existing, ...policy } : null;
  const channel = {
    id: 'existing-channel',
    title: 'Current channel',
    username: 'current_name',
  };
  const prisma = {
    telegramUserAccountIntegration: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'account',
        workspaceId: 'workspace',
        label: 'Owner',
        apiId: '123',
        apiHashEncrypted: 'encrypted',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'encrypted',
        sessionIv: 'iv',
        sessionAuthTag: 'tag',
        isActive: true,
      }),
    },
    telegramChannel: {
      update: jest.fn().mockResolvedValue(channel),
      create: jest.fn().mockResolvedValue(channel),
    },
    telegramChannelAdminLink: { upsert: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue(saved ? [saved] : []),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const importPolicy = {
    ensureStorageAvailable: jest.fn().mockResolvedValue(undefined),
    resolveChannelImportPolicy: jest.fn().mockResolvedValue(policy),
  };
  const sourceAccess = {
    normalizeMtprotoPermissions: jest
      .fn()
      .mockReturnValue({ role: 'OWNER', permissions: {} }),
    canBeUsedForAnalytics: jest.fn().mockReturnValue(true),
    upsertAccess: jest.fn().mockResolvedValue({}),
    recordDataSource: jest.fn().mockResolvedValue({}),
  };
  const syncNow = jest.fn().mockResolvedValue(undefined);
  const service = new TelegramUserAccountsService(
    prisma as never,
    {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
    } as never,
    { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
    {
      getAdminChannels: jest.fn().mockResolvedValue([
        {
          id: '-100123',
          title: 'Current channel',
          username: 'current_name',
          isCreator: true,
          adminRights: null,
        },
      ]),
    } as never,
    sourceAccess as never,
    { get: jest.fn() } as never,
    importPolicy as never,
    { syncNow } as never,
    {} as never,
    {} as never,
    { writeStructured: jest.fn() } as never,
  );
  return { service, prisma, importPolicy, saved, syncNow };
}
describe('typed Telegram channel import read model', () => {
  it.each([
    { id: 'existing-channel', username: '@CURRENT_NAME', telegramChatId: null },
    {
      id: 'existing-channel',
      username: 'previous_name',
      telegramChatId: '123',
    },
  ])(
    'reuses the matched channel and preserves acquisition/cutoff policy %#',
    async (existing) => {
      const f = setup(existing);
      const result = await f.service.importChannels('user', 'account', {
        channels: [{ telegramChannelId: '-100123' }],
      });
      expect(result.success).toBe(true);
      expect(f.prisma.telegramChannel.create).not.toHaveBeenCalled();
      expect(f.prisma.telegramChannel.update).toHaveBeenCalledWith(
        containing({ where: { id: 'existing-channel' } }),
      );
      expect(f.importPolicy.resolveChannelImportPolicy).toHaveBeenCalledWith(
        containing({
          workspaceId: 'workspace',
          channelId: 'existing-channel',
          existing: f.saved,
        }),
      );
      expect(f.syncNow).toHaveBeenCalledWith(
        'user',
        'existing-channel',
        {},
        expect.any(Function),
      );
    },
  );
  it('aborts before channel writes when storage compatibility is unavailable', async () => {
    const f = setup(null);
    f.importPolicy.ensureStorageAvailable.mockRejectedValue(
      new Error('Storage incompatible'),
    );
    await expect(
      f.service.importChannels('user', 'account', {
        channels: [{ telegramChannelId: '-100123' }],
      }),
    ).rejects.toThrow('Storage incompatible');
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(f.prisma.telegramChannel.create).not.toHaveBeenCalled();
    expect(f.syncNow).not.toHaveBeenCalled();
  });
});
