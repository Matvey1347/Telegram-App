import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';

describe('TelegramInvitePersistenceService invite URL logging', () => {
  const rawUrl = 'https://t.me/+privateBearerHash123';
  const prisma = {
    telegramInviteLink: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };
  let service: TelegramInvitePersistenceService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramInvitePersistenceService(
      prisma as never,
      {} as never,
    );
    warn = jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation();
  });

  function expectInviteSecretRedacted() {
    const output = warn.mock.calls.flat().join(' ');
    expect(output).toContain('https://t.me/[REDACTED_INVITE]');
    expect(output).not.toContain(rawUrl);
    expect(output).not.toContain('privateBearerHash123');
  }

  it('redacts the invite URL in legacy-persistence warnings', async () => {
    prisma.telegramInviteLink.create.mockResolvedValue({ id: 'link-1' });

    await service.persistInviteLinkWithoutRequestedCount({
      workspaceId: 'workspace-1',
      channelId: 'channel-1',
      url: rawUrl,
      create: {
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        url: rawUrl,
      },
      update: { url: rawUrl },
    });

    expectInviteSecretRedacted();
  });

  it('redacts the invite URL when retrying for an outdated Prisma client', async () => {
    (
      service as unknown as {
        telegramInviteLinkRequestedCountSupported: boolean;
      }
    ).telegramInviteLinkRequestedCountSupported = true;
    prisma.telegramInviteLink.upsert
      .mockRejectedValueOnce(new Error('Unknown argument `requestedCount`'))
      .mockResolvedValueOnce({ id: 'link-1' });

    await service.upsertInviteLinkWithRequestedCountFallback({
      workspaceId: 'workspace-1',
      channelId: 'channel-1',
      url: rawUrl,
      create: { requestedCount: 1 },
      update: { requestedCount: 1 },
    });

    expectInviteSecretRedacted();
  });
});
