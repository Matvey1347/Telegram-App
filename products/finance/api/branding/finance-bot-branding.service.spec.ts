/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from '@prisma/client';
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

  it('saves a site logo on the selected runtime without replacing the Telegram avatar', async () => {
    const logo = {
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/P3sAAAAASUVORK5CYII=', 'base64'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    await service.update(
      'user-1',
      'bot-1',
      TelegramBotRuntimeEnvironment.LOCAL,
      { logo },
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
    expect(profiles.update).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith({
      where: { id: 'runtime-local' },
      data: expect.objectContaining({
        financeLogoImage: expect.any(Uint8Array),
        financeLogoMimeType: 'image/png',
        financeBrandingUpdatedAt: expect.any(Date),
      }),
    });
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

  it('serves the logo from the active runtime in the process environment', async () => {
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

    await expect(service.asset('bot-1', 'logo')).resolves.toEqual({
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
