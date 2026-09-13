import { BadRequestException } from '@nestjs/common';
import {
  createTelegramChannelsTestHarness,
  type TelegramChannelsTestHarness,
} from './__fixtures__/telegram-channels.test-harness';
import {
  buildResolvedTelegramEntity,
  buildTelegramChannel,
  buildTelegramUserAccount,
  resetTelegramTestBuilders,
} from '../../../test-support/telegram-test-builders';

describe('TelegramChannelsService importChannel', () => {
  const prisma = {
    $transaction: jest.fn(),
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn(),
  };
  const responseCache = {
    clearByPrefix: jest.fn(),
  };
  const encryptionService = {
    decrypt: jest.fn(),
  };
  const mtprotoClient = {
    getPublicChannelInfo: jest.fn(),
    findAccessibleChannelInfoByTitle: jest.fn(),
  };
  const sourceAccessService = {
    recordDataSource: jest.fn(),
  };
  const analyticsService = {};

  let service: TelegramChannelsTestHarness;

  beforeEach(() => {
    jest.clearAllMocks();
    resetTelegramTestBuilders();
    service = createTelegramChannelsTestHarness(
      prisma as never,
      workspaceService as never,
      responseCache as never,
      encryptionService as never,
      mtprotoClient as never,
      sourceAccessService as never,
      analyticsService as never,
    );
    workspaceService.resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
    encryptionService.decrypt.mockReturnValue('decrypted');
    jest
      .spyOn(service as never, 'connectedAccounts' as never)
      .mockResolvedValue([
        buildTelegramUserAccount({
          id: 'tg-account-1',
          apiId: '1',
          username: 'mainuser',
          firstName: 'Main',
          sessionEncrypted: 'sess',
          sessionIv: 'sessiv',
          sessionAuthTag: 'sesstag',
        }) as never,
      ] as never);
    jest
      .spyOn(service as never, 'findMatchingChannels' as never)
      .mockResolvedValue([] as never);
    jest
      .spyOn(service as never, 'findOne' as never)
      .mockResolvedValue({ id: 'channel-1', title: 'Смак Життя' } as never);
    jest
      .spyOn(service as never, 'runInitialImportBackfill' as never)
      .mockResolvedValue({ success: true } as never);
    jest
      .spyOn(service as never, 'ensureRequiredChannelSystemGroups' as never)
      .mockResolvedValue({
        advertise: { id: 'advertise-group-1' },
        systemBotPosts: { id: 'system-bot-posts-group-1' },
      } as never);
  });

  it('imports an invite-resolved channel, stores inviteLink and backfill metadata', async () => {
    mtprotoClient.getPublicChannelInfo.mockResolvedValue(
      buildResolvedTelegramEntity({
        telegramChatId: '123456',
        title: 'Смак Життя',
        username: null,
        description: 'About',
        participantsCount: 77,
        pendingJoinRequestsCount: 302,
        photoUrl: 'https://example.com/photo.jpg',
        inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
        joinedByInvite: true,
      }),
    );
    const tx = {
      telegramChannel: {
        create: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    const result = await service.importChannel('user-1', {
      input: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
    });

    expect(mtprotoClient.getPublicChannelInfo).toHaveBeenCalled();
    expect(tx.telegramChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramChatId: '123456',
          inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
          pendingJoinRequestsCount: 302,
        }),
      }),
    );
    expect(service.ensureRequiredChannelSystemGroups).toHaveBeenCalledWith(
      tx,
      'ws-1',
      'channel-1',
    );
    expect(sourceAccessService.recordDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'channel_import',
          inputType: 'invite',
          joinedByInvite: true,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'channel-1',
        initialSync: { success: true },
      }),
    );
  });

  it('updates an existing canonical channel instead of creating a duplicate', async () => {
    mtprotoClient.findAccessibleChannelInfoByTitle.mockResolvedValue(
      buildResolvedTelegramEntity({
        telegramChatId: '123456',
        title: 'Смак Життя',
        username: 'smak_zhyttia',
        description: 'About',
        participantsCount: 88,
        photoUrl: null,
        joinedByInvite: false,
      }),
    );
    jest
      .spyOn(service as never, 'findMatchingChannels' as never)
      .mockResolvedValue([
        {
          id: 'channel-1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          adminLinks: [],
        },
      ] as never);
    const tx = {
      telegramChannel: {
        update: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    await service.importChannel('user-1', { input: 'Смак Життя' });

    expect(tx.telegramChannel.update).toHaveBeenCalled();
  });

  it('keeps the same channel row when a public channel becomes private', async () => {
    mtprotoClient.getPublicChannelInfo.mockResolvedValue(
      buildResolvedTelegramEntity({
        telegramChatId: '123456',
        title: 'Смак Життя',
        username: null,
        description: 'Now private',
        participantsCount: 88,
        photoUrl: null,
        inviteLink: 'https://t.me/+AbC_123-xyz',
        joinedByInvite: false,
        accessMode: 'PRIVATE_JOIN_REQUEST',
        requiresJoinRequest: true,
        telegramAccessHash: '999',
      }),
    );
    jest
      .spyOn(service as never, 'findMatchingChannels' as never)
      .mockResolvedValue([
        buildTelegramChannel({
          id: 'channel-1',
          adminLinks: [{ id: 'admin-1' }],
          username: 'smak_zhyttia',
          telegramChatId: '123456',
        } as never),
      ] as never);
    const tx = {
      telegramChannel: {
        update: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    await service.importChannel('user-1', {
      input: 'https://t.me/+AbC_123-xyz',
    });

    expect(tx.telegramChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel-1' },
        data: expect.objectContaining({
          username: null,
          telegramChatId: '123456',
          accessMode: 'PRIVATE_JOIN_REQUEST',
          requiresJoinRequest: true,
          telegramAccessHash: '999',
        }),
      }),
    );
  });

  it('does not create a channel when resolution has no real telegramChatId', async () => {
    mtprotoClient.getPublicChannelInfo.mockResolvedValue({
      kind: 'channel',
      telegramChatId: '',
      title: 'Preview only',
      username: null,
      description: null,
      participantsCount: null,
      photoUrl: null,
    });

    await expect(
      service.importChannel('user-1', {
        input: 'https://t.me/+preview_only',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falls back to another connected account when the preferred session is invalid', async () => {
    const primary = buildTelegramUserAccount({
      id: 'tg-account-invalid',
      sessionEncrypted: 'invalid-session',
      sessionIv: 'invalid-iv',
      sessionAuthTag: 'invalid-tag',
    });
    const fallback = buildTelegramUserAccount({
      id: 'tg-account-fallback',
      sessionEncrypted: 'fallback-session',
      sessionIv: 'fallback-iv',
      sessionAuthTag: 'fallback-tag',
    });
    jest
      .spyOn(service as never, 'connectedAccounts' as never)
      .mockResolvedValue([primary, fallback] as never);
    const markInvalidSession = jest
      .spyOn(service as never, 'markInvalidSession' as never)
      .mockResolvedValue(true as never);
    mtprotoClient.getPublicChannelInfo
      .mockRejectedValueOnce(new Error('406: AUTH_KEY_DUPLICATED'))
      .mockResolvedValueOnce(
        buildResolvedTelegramEntity({
          telegramChatId: '1885418686',
          title: 'Етикет_ка',
          username: 'etiket_k',
        }),
      );
    const tx = {
      telegramChannel: {
        create: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    await service.importChannel('user-1', {
      input: 'http://t.me/etiket_k',
    });

    expect(markInvalidSession).toHaveBeenCalledWith(
      'tg-account-invalid',
      expect.any(Error),
    );
    expect(mtprotoClient.getPublicChannelInfo).toHaveBeenCalledTimes(2);
    expect(sourceAccessService.recordDataSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'tg-account-fallback' }),
    );
  });

  it('imports unique channel links in one batch and preserves partial successes', async () => {
    jest
      .spyOn(service, 'importChannel')
      .mockResolvedValueOnce({ id: 'channel-1', title: 'First' })
      .mockRejectedValueOnce(new BadRequestException('Invalid invite'));
    const onProgress = jest.fn();

    const result = await service.importChannels(
      'user-1',
      [' https://t.me/first ', 'https://t.me/first', 'https://t.me/+bad'],
      onProgress,
    );

    expect(service.importChannel).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      channels: [{ id: 'channel-1', title: 'First' }],
      failures: [{ input: 'https://t.me/+bad', error: 'Invalid invite' }],
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ input: 'https://t.me/+bad', success: false }),
      2,
      2,
    );
  });
});
