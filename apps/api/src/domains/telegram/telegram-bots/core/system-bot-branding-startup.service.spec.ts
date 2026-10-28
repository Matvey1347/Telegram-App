import sharp from 'sharp';
import { SystemBotBrandingStartupService } from './system-bot-branding-startup.service';

const values: Record<string, string> = {
  TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID: 'business-workspace',
  TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
  TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'system_dev_bot',
  TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'local-token',
};
const config = { get: jest.fn((name: string) => values[name]) };
const prisma = { telegramConfiguredBotAvatar: { findUnique: jest.fn(), upsert: jest.fn() } };
const botApi = { setMyProfilePhoto: jest.fn() };
const service = new SystemBotBrandingStartupService(config as never, prisma as never, botApi as never);

beforeEach(() => {
  jest.clearAllMocks();
  prisma.telegramConfiguredBotAvatar.findUnique.mockResolvedValue(null);
  botApi.setMyProfilePhoto.mockResolvedValue(undefined);
});

describe('SystemBotBrandingStartupService', () => {
  it('sets the bundled white-backed System bot photo only when the asset changes', async () => {
    await service.onModuleInit();
    expect(botApi.setMyProfilePhoto).toHaveBeenCalledWith('local-token', expect.any(Buffer));
    const photo = botApi.setMyProfilePhoto.mock.calls[0][1] as Buffer;
    const corner = await sharp(photo).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect(corner[0]).toBeGreaterThan(245);
    const hash = prisma.telegramConfiguredBotAvatar.upsert.mock.calls[0][0].create.profileAssetHash;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    prisma.telegramConfiguredBotAvatar.findUnique.mockResolvedValue({ profileAssetHash: hash });
    botApi.setMyProfilePhoto.mockClear();
    await service.onModuleInit();
    expect(botApi.setMyProfilePhoto).not.toHaveBeenCalled();
  });

  it('does not save a hash if Telegram rejects the photo', async () => {
    botApi.setMyProfilePhoto.mockRejectedValue(new Error('Telegram unavailable'));
    await service.onModuleInit();
    expect(prisma.telegramConfiguredBotAvatar.upsert).not.toHaveBeenCalled();
  });

  it('does no work without a selected runtime', async () => {
    const selected = values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT;
    delete values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT;
    try {
      await service.onModuleInit();
      expect(prisma.telegramConfiguredBotAvatar.findUnique).not.toHaveBeenCalled();
    } finally {
      values.TELEGRAM_SYSTEM_BOT_ENVIRONMENT = selected;
    }
  });
});
