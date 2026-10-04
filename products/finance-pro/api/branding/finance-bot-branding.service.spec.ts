/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from '@prisma/client';
import { FinanceBotBrandingService } from './finance-bot-branding.service';

describe('FinanceBotBrandingService', () => {
  const prisma = {
    telegramBotIntegration: {
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
  });

  it('updates Telegram immediately and persists the same logo for the Finance app', async () => {
    profiles.update.mockResolvedValue({
      avatarImage: Uint8Array.from([1, 2, 3]),
      avatarMimeType: 'image/jpeg',
    });
    const logo = {
      buffer: Buffer.from([4, 5, 6]),
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
    expect(profiles.update).toHaveBeenCalledWith(
      'bot-1',
      TelegramBotRuntimeEnvironment.LOCAL,
      { name: undefined, avatar: logo },
    );
    expect(prisma.telegramBotIntegration.update).toHaveBeenCalledWith({
      where: { id: 'bot-1' },
      data: expect.objectContaining({
        financeLogoImage: Uint8Array.from([1, 2, 3]),
        financeLogoMimeType: 'image/jpeg',
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
              runtimeStatus: 'ACTIVE',
            },
          }),
        }),
      }),
    );
  });
});
