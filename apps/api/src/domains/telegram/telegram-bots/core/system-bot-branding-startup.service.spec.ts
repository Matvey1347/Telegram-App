import sharp from 'sharp';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import { SystemBotBrandingStartupService } from './system-bot-branding-startup.service';

const values: Record<string, string> = {
  TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
  TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
  TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'system_dev_bot',
  TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
};
const config = { get: jest.fn((name: string) => values[name]) };
const prisma = {
  telegramConfiguredBotAvatar: {
    findUnique: jest.fn<
      Promise<{ profileAssetHash: string } | null>,
      [unknown]
    >(),
    upsert: jest.fn<
      Promise<void>,
      [
        {
          create: {
            profileAssetHash: string;
            environment: TelegramBotRuntimeEnvironment;
          };
        },
      ]
    >(),
  },
};
const botApi = {
  setMyProfilePhoto: jest.fn<Promise<void>, [string, Buffer]>(),
};
const service = new SystemBotBrandingStartupService(
  config as never,
  prisma as never,
  botApi as never,
);

beforeEach(() => {
  jest.clearAllMocks();
  values.TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME = 'system_dev_bot';
  values.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN = 'local-token';
  prisma.telegramConfiguredBotAvatar.findUnique.mockResolvedValue(null);
  botApi.setMyProfilePhoto.mockResolvedValue(undefined);
});

describe('SystemBotBrandingStartupService', () => {
  it('sets the bundled white-backed System bot photo only when the asset changes', async () => {
    await service.onModuleInit();
    expect(botApi.setMyProfilePhoto).toHaveBeenCalledWith(
      'local-token',
      expect.any(Buffer),
    );
    const photo = botApi.setMyProfilePhoto.mock.calls[0][1];
    const corner = await sharp(photo)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(corner[0]).toBeGreaterThan(245);
    const hash =
      prisma.telegramConfiguredBotAvatar.upsert.mock.calls[0][0].create
        .profileAssetHash;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    prisma.telegramConfiguredBotAvatar.findUnique.mockResolvedValue({
      profileAssetHash: hash,
    });
    botApi.setMyProfilePhoto.mockClear();
    await service.onModuleInit();
    expect(botApi.setMyProfilePhoto).not.toHaveBeenCalled();
  });

  it('does not save a hash if Telegram rejects the photo', async () => {
    botApi.setMyProfilePhoto.mockRejectedValue(
      new Error('Telegram unavailable'),
    );
    await service.onModuleInit();
    expect(prisma.telegramConfiguredBotAvatar.upsert).not.toHaveBeenCalled();
  });

  it('does no work without a selected runtime', async () => {
    const selected = values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT;
    delete values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT;
    try {
      await service.onModuleInit();
      expect(
        prisma.telegramConfiguredBotAvatar.findUnique,
      ).not.toHaveBeenCalled();
    } finally {
      values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT = selected;
    }
  });
  it.each(['LOCAL', 'PRODUCTION'] as const)(
    'uses the exact validated Prisma environment for %s',
    async (environment) => {
      const selected = values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT;
      values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT = environment;
      values[`TELEGRAM_SYSTEM_BOT_${environment}_USERNAME`] = 'selected_bot';
      values[`TELEGRAM_SYSTEM_BOT_${environment}_TOKEN`] = 'selected-token';
      try {
        await service.onModuleInit();
        const [query] = prisma.telegramConfiguredBotAvatar.findUnique.mock
          .calls[0] as unknown as [
          {
            where: {
              workspaceId_kind_environment: {
                environment: TelegramBotRuntimeEnvironment;
              };
            };
          },
        ];
        const [saved] = prisma.telegramConfiguredBotAvatar.upsert.mock
          .calls[0] as unknown as [
          { create: { environment: TelegramBotRuntimeEnvironment } },
        ];
        expect(query.where.workspaceId_kind_environment.environment).toBe(
          TelegramBotRuntimeEnvironment[environment],
        );
        expect(saved.create.environment).toBe(
          TelegramBotRuntimeEnvironment[environment],
        );
        expect(botApi.setMyProfilePhoto).toHaveBeenCalledWith(
          'selected-token',
          expect.any(Buffer),
        );
      } finally {
        values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT = selected;
      }
    },
  );
  it.each(['local', 'STAGING', ''])(
    'does not touch DB or Telegram for unsupported runtime %s',
    async (environment) => {
      const selected = values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT;
      values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT = environment;
      try {
        await service.onModuleInit();
        expect(
          prisma.telegramConfiguredBotAvatar.findUnique,
        ).not.toHaveBeenCalled();
        expect(
          prisma.telegramConfiguredBotAvatar.upsert,
        ).not.toHaveBeenCalled();
        expect(botApi.setMyProfilePhoto).not.toHaveBeenCalled();
      } finally {
        values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT = selected;
      }
    },
  );
});
