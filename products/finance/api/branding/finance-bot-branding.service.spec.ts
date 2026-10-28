import { TelegramBotApplicationType, TelegramBotRuntimeEnvironment } from '@prisma/client';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { FinanceBotBrandingService } from './finance-bot-branding.service';

const prisma = {
  telegramBotIntegration: { findFirst: jest.fn() },
  telegramBotRuntimeInstance: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
};
const workspace = { requireWorkspaceRole: jest.fn() };
const profiles = { update: jest.fn() };
const environments = { current: jest.fn() };
const service = new FinanceBotBrandingService(prisma as never, workspace as never, profiles as never, environments as never);

beforeEach(() => {
  jest.clearAllMocks();
  workspace.requireWorkspaceRole.mockResolvedValue({ workspaceId: 'workspace-1' });
  prisma.telegramBotIntegration.findFirst.mockResolvedValue({ id: 'finance-1' });
  prisma.telegramBotRuntimeInstance.findFirst.mockResolvedValue({ id: 'runtime-1' });
  prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([]);
  environments.current.mockReturnValue(TelegramBotRuntimeEnvironment.PRODUCTION);
});

describe('FinanceBotBrandingService', () => {
  it('updates only the name of a Finance bot in the authorized workspace', async () => {
    await service.update('user-1', 'finance-1', TelegramBotRuntimeEnvironment.PRODUCTION, { name: 'Groshly' });
    expect(prisma.telegramBotIntegration.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: 'workspace-1', applicationType: TelegramBotApplicationType.FINANCE }),
    }));
    expect(profiles.update).toHaveBeenCalledWith('finance-1', TelegramBotRuntimeEnvironment.PRODUCTION, { name: 'Groshly' });
  });

  it('rejects a bot outside the workspace', async () => {
    prisma.telegramBotIntegration.findFirst.mockResolvedValue(null);
    await expect(service.update('user-1', 'other', TelegramBotRuntimeEnvironment.PRODUCTION, { name: 'Other' })).rejects.toThrow('Finance bot not found');
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('rejects a request without a name', async () => {
    await expect(service.update('user-1', 'finance-1', TelegramBotRuntimeEnvironment.LOCAL, {})).rejects.toThrow('Bot name is required');
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('serves the bundled white-backed production favicon without a database read', async () => {
    const asset = await service.asset('finance-1', 'favicon');
    const metadata = await sharp(asset.bytes).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBeGreaterThanOrEqual(512);
    const corner = await sharp(asset.bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect(Array.from(corner.subarray(0, 3))).toEqual([255, 255, 255]);
    expect(asset.contentType).toBe('image/png');
    expect(prisma.telegramBotIntegration.findFirst).not.toHaveBeenCalled();
  });

  it('uses a distinct local icon and brighter icon for dark surfaces', async () => {
    const production = await service.asset('finance-1', 'favicon', TelegramBotRuntimeEnvironment.PRODUCTION);
    const local = await service.asset('finance-1', 'favicon', TelegramBotRuntimeEnvironment.LOCAL);
    const dark = await service.asset('finance-1', 'favicon-light', TelegramBotRuntimeEnvironment.PRODUCTION);
    expect(local.bytes.equals(production.bytes)).toBe(false);
    expect(dark.bytes.equals(production.bytes)).toBe(false);
  });

  it('sends the bundled photo once at startup and skips an unchanged photo', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([{ id: 'runtime-1', botIntegrationId: 'finance-1', profileAssetHash: null }]);
    await service.onModuleInit();
    expect(profiles.update).toHaveBeenCalledWith('finance-1', TelegramBotRuntimeEnvironment.PRODUCTION, expect.objectContaining({ avatar: expect.objectContaining({ mimetype: 'image/png' }) }));
    const input = profiles.update.mock.calls[0][2].avatar.buffer as Buffer;
    const saved = createHash('sha256').update(input).digest('hex');
    profiles.update.mockClear();
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([{ id: 'runtime-1', botIntegrationId: 'finance-1', profileAssetHash: saved }]);
    await service.onModuleInit();
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('does not record a new asset hash when Telegram rejects the photo', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([{ id: 'runtime-1', botIntegrationId: 'finance-1', profileAssetHash: null }]);
    profiles.update.mockRejectedValueOnce(new Error('Telegram rejected photo'));
    await service.onModuleInit();
    expect(prisma.telegramBotRuntimeInstance.update).not.toHaveBeenCalled();
  });
});
