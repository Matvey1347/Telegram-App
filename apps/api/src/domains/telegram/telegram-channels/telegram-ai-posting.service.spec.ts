import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingService } from './telegram-ai-posting.service';

describe('TelegramAiPostingService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-a'),
  };
  const prisma = {
    telegramChannel: { findFirst: jest.fn(), findMany: jest.fn() },
    telegramAiPostingSettings: { findFirst: jest.fn(), upsert: jest.fn() },
  };
  const service = new TelegramAiPostingService(
    prisma as never,
    workspace as never,
  );
  beforeEach(() => jest.clearAllMocks());

  it('uses channel language and niche as defaults and leaves autopilot off', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'ch-a',
      language: 'ru',
      niche: 'Tech',
      shortDescription: 'Founders',
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    const result = await service.get('user-a', 'ch-a');
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ch-a', workspaceId: 'ws-a' } }),
    );
    expect(result).toMatchObject({
      configured: false,
      autopilotEnabled: false,
      detectedLanguage: 'ru',
      configuration: {
        language: '',
        topic: 'Tech',
        audience: 'Founders',
        historyMode: 'all',
      },
    });
  });

  it('rejects a channel outside the active workspace', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(service.get('user-a', 'other-channel')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('limits Telegram idea sources to owned channels in the active workspace', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramChannel.findMany.mockResolvedValue([]);

    await service.sourceChannels('user-a', 'ch-a');

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-a',
          id: { not: 'ch-a' },
          adminLinks: { some: {} },
        }),
        select: expect.objectContaining({ photoUrl: true }),
      }),
    );
  });

  it('keeps autopilot disabled on first save, regardless of omitted toggle', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    prisma.telegramAiPostingSettings.upsert.mockResolvedValue({
      configuration: {},
      autopilotEnabled: false,
    });
    const configuration = {
      historyMode: 'all',
      hashtags: 'disabled',
      imageMode: 'found',
      sources: [],
      categories: [],
      formats: [],
    };
    await service.save('user-a', 'ch-a', { configuration });
    expect(prisma.telegramAiPostingSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'ws-a',
          autopilotEnabled: false,
        }),
      }),
    );
  });

  it('requires a date for history since a date', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'ch-a' });
    await expect(
      service.save('user-a', 'ch-a', {
        configuration: {
          historyMode: 'since',
          hashtags: 'disabled',
          imageMode: 'found',
          sources: [],
          categories: [],
          formats: [],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
