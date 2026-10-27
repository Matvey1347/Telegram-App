/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from '@prisma/client';
import sharp from 'sharp';
import { FinanceBotBrandingService } from '@consumer-finance/api/branding/finance-bot-branding.service';

describe('FinanceBotBrandingService', () => {
  const prisma = {
    telegramBotIntegration: {
      findFirst: jest.fn(),
    },
    telegramBotRuntimeInstance: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const workspace = {
    requireWorkspaceRole: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-1' }),
  };
  const profiles = { update: jest.fn() };
  const environments = {
    current: jest
      .fn()
      .mockReturnValue(TelegramBotRuntimeEnvironment.PRODUCTION),
  };
  const service = new FinanceBotBrandingService(
    prisma as never,
    workspace as never,
    profiles as never,
    environments as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.telegramBotIntegration.findFirst.mockResolvedValue({ id: 'bot-1' });
    prisma.telegramBotRuntimeInstance.findFirst.mockResolvedValue({ id: 'runtime-local' });
  });

  it('saves one white-backed favicon and uses it for the Telegram photo', async () => {
    const favicon = {
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/P3sAAAAASUVORK5CYII=', 'base64'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    await service.update(
      'user-1',
      'bot-1',
      TelegramBotRuntimeEnvironment.LOCAL,
      { favicon },
    );

    expect(prisma.telegramBotIntegration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'bot-1',
          workspaceId: 'workspace-1',
          applicationType: TelegramBotApplicationType.FINANCE,
        }),
      }),
    );
    expect(profiles.update).toHaveBeenCalledWith('bot-1', TelegramBotRuntimeEnvironment.LOCAL, expect.objectContaining({ avatar: expect.objectContaining({ mimetype: 'image/png' }) }));
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith({
      where: { id: 'runtime-local' },
      data: expect.objectContaining({
        financeFaviconImage: expect.any(Uint8Array),
        financeFaviconMimeType: 'image/png',
        financeBrandingUpdatedAt: expect.any(Date),
      }),
    });
    const image = prisma.telegramBotRuntimeInstance.update.mock.calls[0][0].data.financeFaviconImage;
    const { data, info } = await sharp(Buffer.from(image)).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(512);
    expect(info.height).toBe(512);
    expect(Array.from(data.subarray(0, 3))).toEqual([255, 255, 255]);
  });

  it('rejects non-image uploads before changing Telegram or database state', async () => {
    await expect(service.update('user-1', 'bot-1', TelegramBotRuntimeEnvironment.LOCAL, {
      favicon: { buffer: Buffer.from('bad'), mimetype: 'text/plain' } as Express.Multer.File,
    })).rejects.toThrow('Finance favicon must be an image');
    expect(profiles.update).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.update).not.toHaveBeenCalled();
  });

  it('does not persist a favicon if Telegram rejects its profile photo', async () => {
    profiles.update.mockRejectedValueOnce(new Error('Telegram rejected photo'));
    await expect(service.update('user-1', 'bot-1', TelegramBotRuntimeEnvironment.PRODUCTION, {
      favicon: { buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/P3sAAAAASUVORK5CYII=', 'base64'), mimetype: 'image/png' } as Express.Multer.File,
    })).rejects.toThrow('Telegram rejected photo');
    expect(prisma.telegramBotRuntimeInstance.update).not.toHaveBeenCalled();
  });

  it('does not allow branding a non-Finance bot or a bot outside the workspace', async () => {
    prisma.telegramBotIntegration.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        'user-1',
        'other-bot',
        TelegramBotRuntimeEnvironment.PRODUCTION,
        { name: 'Other' },
      ),
    ).rejects.toThrow('Finance bot not found');
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('serves the favicon from the active runtime in the process environment', async () => {
    const updatedAt = new Date('2026-08-22T18:00:00Z');
    prisma.telegramBotIntegration.findFirst.mockResolvedValue({
      runtimeInstances: [
        {
          avatarImage: Uint8Array.from([9, 8, 7]),
          avatarMimeType: 'image/jpeg',
          avatarUpdatedAt: updatedAt,
        },
      ],
    });

    await expect(service.asset('bot-1', 'favicon')).resolves.toEqual({
      bytes: Buffer.from([9, 8, 7]),
      contentType: 'image/jpeg',
      updatedAt,
    });
    expect(prisma.telegramBotIntegration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          runtimeInstances: expect.objectContaining({
            where: {
              environment: TelegramBotRuntimeEnvironment.PRODUCTION,
            },
          }),
        }),
      }),
    );
  });

  it('serves the LOCAL favicon independently of the PRODUCTION image', async () => {
    prisma.telegramBotIntegration.findFirst.mockImplementation(({ select }) => ({
      runtimeInstances: [{
        financeFaviconImage: Uint8Array.from(
          select.runtimeInstances.where.environment === TelegramBotRuntimeEnvironment.LOCAL
            ? [1, 2, 3]
            : [4, 5, 6],
        ),
        financeFaviconMimeType: 'image/png',
        financeBrandingUpdatedAt: new Date('2026-10-25T00:00:00Z'),
      }],
    }));
    const local = await service.asset('bot-1', 'favicon', TelegramBotRuntimeEnvironment.LOCAL);
    const production = await service.asset('bot-1', 'favicon', TelegramBotRuntimeEnvironment.PRODUCTION);
    expect(local.bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(production.bytes).toEqual(Buffer.from([4, 5, 6]));
  });
});
