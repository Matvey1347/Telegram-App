import { TelegramChannelImportService } from './telegram-channel-import.service';
import { TelegramUserAccountsService } from '../telegram-user-accounts/telegram-user-accounts.service';

const normalized = (raw: Record<string, unknown>) => ({
  role: raw.isCreator ? 'OWNER' : raw.adminRights ? 'ADMIN' : 'UNKNOWN',
  permissions: {},
});
const account = {
  id: 'owner-account',
  workspaceId: 'workspace',
  apiId: '1',
  apiHashEncrypted: 'cipher',
  apiHashIv: 'iv',
  apiHashAuthTag: 'tag',
  sessionEncrypted: 'cipher',
  sessionIv: 'iv',
  sessionAuthTag: 'tag',
  label: 'Owner',
};
const sourceAccess = () => ({
  normalizeMtprotoPermissions: jest.fn(normalized),
  upsertAccess: jest.fn((input: { role: string }) =>
    Promise.resolve({ role: input.role }),
  ),
  recordDataSource: jest.fn().mockResolvedValue({}),
  canBeUsedForAnalytics: jest.fn().mockReturnValue(true),
});

function generalImport(isCreator: boolean) {
  const info = {
    kind: 'channel',
    telegramChatId: '123',
    title: 'Owned channel',
    username: 'owned_channel',
    description: null,
    participantsCount: null,
    photoUrl: null,
    isCreator,
    adminRights: isCreator ? null : { postMessages: true },
  };
  const channel = { id: 'channel' };
  const tx = {
    telegramChannel: { create: jest.fn().mockResolvedValue(channel) },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const access = sourceAccess();
  const avatars = { enqueueInitial: jest.fn().mockResolvedValue(undefined) };
  const preparation = {
    connectedAccounts: jest.fn().mockResolvedValue([account]),
    importProgressSteps: jest.fn().mockReturnValue([]),
    notifyImportProgress: jest.fn().mockResolvedValue(undefined),
    resolveImportEntity: jest.fn().mockResolvedValue(info),
    ensureImportableChannelEntity: jest.fn((value: unknown) => value),
    findMatchingChannels: jest.fn().mockResolvedValue([]),
    pickCanonicalChannel: jest.fn().mockReturnValue(null),
  };
  const service = new TelegramChannelImportService(
    prisma as never,
    {} as never,
    access as never,
    {
      workspace: jest.fn().mockResolvedValue('workspace'),
      normalizeUsername: jest.fn((value: string) => value),
    } as never,
    {
      channelIdentityPatch: jest.fn().mockReturnValue({ title: info.title }),
      sourceDisplayName: jest.fn().mockReturnValue('Owner'),
    } as never,
    { resolveImportPolicy: jest.fn().mockResolvedValue({}) } as never,
    { findOne: jest.fn().mockResolvedValue(channel) } as never,
    {} as never,
    {} as never,
    {} as never,
    preparation as never,
    {
      ensureRequiredChannelSystemGroups: jest.fn().mockResolvedValue(undefined),
    } as never,
    avatars as never,
  );
  return { service, access, avatars };
}

function accountSync(isCreator: boolean) {
  const access = sourceAccess();
  const avatars = { enqueueInitial: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    telegramUserAccountIntegration: {
      findFirst: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue(account),
    },
    telegramChannel: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'channel', username: 'owned_channel', telegramChatId: '123' },
        ]),
    },
    telegramChannelSourceAccess: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    telegramChannelAdminLink: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const transaction = {
    ...prisma,
    $transaction: jest.fn((work: (client: typeof prisma) => Promise<unknown>) =>
      work(prisma),
    ),
  };
  const service = new TelegramUserAccountsService(
    transaction as never,
    {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
    } as never,
    { decrypt: jest.fn().mockReturnValue('test-decrypted-value') } as never,
    {
      getAdminChannelsWithProfile: jest.fn().mockResolvedValue({
        channels: [
          {
            id: '123',
            title: 'Owned channel',
            username: 'owned_channel',
            isCreator,
            adminRights: isCreator ? null : { postMessages: true },
          },
        ],
        profile: {
          id: 'owner',
          username: 'owner',
          firstName: 'Owner',
          capabilities: {
            checkedAt: '2026-01-01',
            isPremium: false,
            captionLengthMax: 1024,
            messageLengthMax: 4096,
          },
        },
      }),
    } as never,
    access as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    undefined,
    avatars as never,
  );
  return { service, access, avatars };
}

describe('avatar initial admission after authoritative owner access', () => {
  it.each([true, false])(
    'general import persists real creator evidence before owner admission (%s)',
    async (isCreator) => {
      const f = generalImport(isCreator);
      await f.service.importChannel(
        'user',
        { input: '@owned_channel' },
        undefined,
        { runInitialSync: false },
      );
      expect(f.access.upsertAccess.mock.calls[0][0].role).toBe(
        isCreator ? 'OWNER' : 'ADMIN',
      );
      if (isCreator) {
        expect(f.avatars.enqueueInitial).toHaveBeenCalledWith(
          'workspace',
          'channel',
        );
        expect(f.access.upsertAccess.mock.invocationCallOrder[0]).toBeLessThan(
          f.avatars.enqueueInitial.mock.invocationCallOrder[0],
        );
      } else expect(f.avatars.enqueueInitial).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'dialog sync admits only actual owner channels after access upsert (%s)',
    async (isCreator) => {
      const f = accountSync(isCreator);
      await f.service.syncDialogs('user', 'owner-account');
      if (isCreator) {
        expect(f.avatars.enqueueInitial).toHaveBeenCalledWith(
          'workspace',
          'channel',
        );
        expect(f.access.upsertAccess.mock.invocationCallOrder[0]).toBeLessThan(
          f.avatars.enqueueInitial.mock.invocationCallOrder[0],
        );
      } else expect(f.avatars.enqueueInitial).not.toHaveBeenCalled();
    },
  );
});
