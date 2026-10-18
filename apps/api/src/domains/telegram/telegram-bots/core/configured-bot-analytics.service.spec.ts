import { ConfiguredBotAnalyticsService } from './configured-bot-analytics.service';

describe('ConfiguredBotAnalyticsService', () => {
  it('shows configured bot analytics to a regular member of the selected workspace', async () => {
    const workspace = {
      resolveWorkspaceIdForUser: jest
        .fn()
        .mockResolvedValue('business-workspace'),
    };
    const prisma = {
      telegramSystemBotConnection: { count: jest.fn().mockResolvedValue(3) },
      telegramConfiguredBotAvatar: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const config = {
      get: jest.fn((name: string) => {
        const values: Record<string, string> = {
          TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
          TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'nexeloq_local_bot',
          TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
        };
        return values[name];
      }),
    };
    const service = new ConfiguredBotAnalyticsService(
      config as never,
      prisma as never,
      workspace as never,
      {
        getMyName: jest.fn().mockResolvedValue({ name: 'Nexeloq Local' }),
      } as never,
    );

    await expect(service.overview('regular-member')).resolves.toEqual({
      systemBot: {
        runtimes: [
          {
            environment: 'LOCAL',
            username: 'nexeloq_local_bot',
            name: 'nexeloq_local_bot',
            description: null,
            avatarUrl: '/brand/telegram-system-dev.png',
            configured: true,
            selected: false,
          },
        ],
        analytics: { registeredUsers: 3, enabledUsers: 3, activeUsers: 3 },
      },
      financeBot: null,
    });
    expect(workspace.resolveWorkspaceIdForUser).toHaveBeenCalledWith(
      'regular-member',
    );
  });

  it('preserves the standalone Finance migration state for the dashboard', async () => {
    const workspace = {
      resolveWorkspaceIdForUser: jest
        .fn()
        .mockResolvedValue('business-workspace'),
    };
    const config = {
      get: jest.fn((name: string) => {
        const values: Record<string, string> = {
          FINANCE_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
          FINANCE_ADMIN_ANALYTICS_URL: 'http://finance.test',
          FINANCE_ADMIN_ANALYTICS_TOKEN: 'analytics-token',
        };
        return values[name];
      }),
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'MIGRATION_REQUIRED', bots: [] }), {
        status: 200,
      }),
    );
    const service = new ConfiguredBotAnalyticsService(
      config as never,
      {
        telegramConfiguredBotAvatar: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      } as never,
      workspace as never,
      {
        telegramConfiguredBotAvatar: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      } as never,
    );

    await expect(service.overview('member')).resolves.toEqual({
      systemBot: null,
      financeBot: { status: 'MIGRATION_REQUIRED', bots: [] },
    });
    fetchSpy.mockRestore();
  });

  it('uses the active platform Finance runtime metrics while its data is being migrated', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        status: 'AVAILABLE',
        bots: [{
          id: 'finance-local', environment: 'LOCAL', username: 'Groshly_dev_bot',
          name: 'Groshly', registeredUsers: 0, profiles: 0, avatarUpdatedAt: null,
        }],
      }), { status: 200 }),
    );
    const service = new ConfiguredBotAnalyticsService(
      {
        get: jest.fn((name: string) => ({
          FINANCE_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
          FINANCE_ADMIN_ANALYTICS_URL: 'http://finance.test',
          FINANCE_ADMIN_ANALYTICS_TOKEN: 'analytics-token',
        })[name]),
      } as never,
      {
        telegramBotIntegration: {
          findMany: jest.fn().mockResolvedValue([{
            id: 'legacy-finance-bot',
            runtimeInstances: [{ username: 'groshly_DEV_bot' }],
            _count: { botUsers: 1, financeProfiles: 1 },
          }]),
        },
      } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('business-workspace') } as never,
      {} as never,
    );

    await expect(service.overview('member')).resolves.toMatchObject({
      financeBot: {
        status: 'AVAILABLE',
        bots: [{ managementBotId: 'legacy-finance-bot', registeredUsers: 1, profiles: 1 }],
      },
    });
    fetchSpy.mockRestore();
  });

  it('uses the public Telegram profile photo when Bot API omits the System Bot image', async () => {
    const service = new ConfiguredBotAnalyticsService(
      {
        get: jest.fn((name: string) => {
          const values: Record<string, string> = {
            TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
            TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'nexeloq_local_bot',
            TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
          };
          return values[name];
        }),
      } as never,
      {
        telegramConfiguredBotAvatar: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      } as never,
      {
        resolveWorkspaceIdForUser: jest
          .fn()
          .mockResolvedValue('business-workspace'),
      } as never,
      {
        getMe: jest.fn().mockResolvedValue({ id: 123 }),
        getUserProfilePhotos: jest.fn().mockResolvedValue({ photos: [] }),
        downloadUsernameProfilePhoto: jest
          .fn()
          .mockResolvedValue({
            bytes: Buffer.from('avatar'),
            contentType: 'image/jpeg',
          }),
      } as never,
    );

    await expect(service.systemBotAvatar('member', 'LOCAL')).resolves.toEqual({
      bytes: Buffer.from('avatar'),
      contentType: 'image/jpeg',
    });
  });

  it('returns a saved System Bot avatar without making Telegram calls', async () => {
    const botApi = {
      getMe: jest.fn(),
      getUserProfilePhotos: jest.fn(),
    };
    const service = new ConfiguredBotAnalyticsService(
      {
        get: jest.fn((name: string) => ({
          TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
          TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'nexeloq_local_bot',
          TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
        })[name]),
      } as never,
      {
        telegramConfiguredBotAvatar: {
          findUnique: jest.fn().mockResolvedValue({
            username: 'nexeloq_local_bot',
            image: Buffer.from('saved-avatar'),
            mimeType: 'image/png',
          }),
        },
      } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('business-workspace') } as never,
      botApi as never,
    );

    await expect(service.systemBotAvatar('member', 'LOCAL')).resolves.toEqual({
      bytes: Buffer.from('saved-avatar'),
      contentType: 'image/png',
    });
    expect(botApi.getMe).not.toHaveBeenCalled();
  });

  it('writes an avatar only when an explicit refresh finds a changed image', async () => {
    const avatars = {
      findUnique: jest.fn().mockResolvedValue({
        username: 'nexeloq_local_bot',
        image: Buffer.from('same-avatar'),
        mimeType: 'image/jpeg',
      }),
      upsert: jest.fn(),
    };
    const service = new ConfiguredBotAnalyticsService(
      {
        get: jest.fn((name: string) => ({
          TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
          TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'nexeloq_local_bot',
          TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
        })[name]),
      } as never,
      { telegramConfiguredBotAvatar: avatars } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('business-workspace') } as never,
      {
        getMe: jest.fn().mockResolvedValue({ id: 123 }),
        getUserProfilePhotos: jest.fn().mockResolvedValue({ photos: [] }),
        downloadUsernameProfilePhoto: jest.fn().mockResolvedValue({
          bytes: Buffer.from('same-avatar'),
          contentType: 'image/jpeg',
        }),
      } as never,
    );

    await service.refreshSystemBotAvatars('member');
    expect(avatars.upsert).not.toHaveBeenCalled();
  });

  it('keeps the dashboard available while the cache migration has not reached the database', async () => {
    const missingTable = { code: 'P2021' };
    const service = new ConfiguredBotAnalyticsService(
      {
        get: jest.fn((name: string) => ({
          TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
          TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'nexeloq_local_bot',
          TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
        })[name]),
      } as never,
      {
        telegramConfiguredBotAvatar: {
          findUnique: jest.fn().mockRejectedValue(missingTable),
          upsert: jest.fn().mockRejectedValue(missingTable),
        },
      } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('business-workspace') } as never,
      {
        getMe: jest.fn().mockResolvedValue({ id: 123 }),
        getUserProfilePhotos: jest.fn().mockResolvedValue({ photos: [] }),
        downloadUsernameProfilePhoto: jest.fn().mockResolvedValue({
          bytes: Buffer.from('avatar'),
          contentType: 'image/jpeg',
        }),
      } as never,
    );

    await expect(service.systemBotAvatar('member', 'LOCAL')).resolves.toEqual({
      bytes: Buffer.from('avatar'),
      contentType: 'image/jpeg',
    });
  });
});
