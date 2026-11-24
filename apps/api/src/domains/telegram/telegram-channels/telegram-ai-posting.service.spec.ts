import { BadRequestException } from '@nestjs/common';
import { TelegramAiPostingService } from './telegram-ai-posting.service';
import { telegramAiPostingMediaPreferences } from './telegram-ai-posting-media-preferences';

describe('TelegramAiPostingService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-a'),
  };
  const prisma = {
    telegramChannel: { findFirst: jest.fn() },
    telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAiPostingSettings: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    icon: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const contentModel = {
    read: jest.fn().mockResolvedValue({
      idea: { audience: 'Readers', valueProposition: 'Practical advice', language: 'en' },
      spheres: [],
      rubrics: [],
      lengths: [],
    }),
    replace: jest.fn(),
  };
  const service = new TelegramAiPostingService(
    prisma as never,
    workspace as never,
    contentModel as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('imports edited media descriptions while retaining omitted references for an existing preference', async () => {
    const previous = { id: 'existing', name: 'Natural moments', emoji: '📷', references: ['https://media.example/reference.jpg'], description: 'Original' };
    const get = jest.spyOn(service, 'get').mockResolvedValue({
      configuration: { mediaPreferences: [previous] }, mode: 'TEST', draftExpirationDays: 30,
    } as never);
    const save = jest.spyOn(service, 'save').mockResolvedValue({} as never);
    try {
      await service.importSettings('user-a', 'channel-a', {
        schemaVersion: 2,
        configuration: { mediaPreferences: [{ id: 'new-id', name: 'Natural moments', description: 'Updated' }] },
      });
      expect(save).toHaveBeenCalledWith('user-a', 'channel-a', expect.objectContaining({
        configuration: expect.objectContaining({ mediaPreferences: [{
          id: 'new-id', name: 'Natural moments', description: 'Updated',
          emoji: '📷', references: ['https://media.example/reference.jpg'],
        }] }),
      }));
    } finally {
      get.mockRestore();
      save.mockRestore();
    }
  });

  it('retains eleven imported media preferences for generation', () => {
    const mediaPreferences = Array.from({ length: 11 }, (_, i) => ({
      id: `preference-${i}`, name: `Preference ${i}`, description: '', emoji: '🎨', references: [],
    }));
    expect(telegramAiPostingMediaPreferences({ mediaPreferences })).toHaveLength(11);
    expect(telegramAiPostingMediaPreferences({ mediaPreferences })[10].id).toBe('preference-10');
  });

  it('rejects more than thirty media preferences before saving', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-a' });
    const mediaPreferences = Array.from({ length: 31 }, (_, i) => ({
      id: `preference-${i}`, name: `Preference ${i}`, description: '', emoji: '🎨', references: [],
    }));
    await expect(service.save('user-a', 'channel-a', {
      configuration: { historyMode: 'all', hashtags: 'disabled', imageMode: 'hybrid', mediaPreferences },
    })).rejects.toThrow('AI_POSTING_MEDIA_PREFERENCES_INVALID');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('loads the editorial model and channel defaults in the settings read model', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-a',
      title: 'Example',
      username: 'example',
      language: 'en',
      niche: 'Technology',
      description: null,
      shortDescription: null,
      photoUrl: null,
      defaultInviteLink: { url: 'https://t.me/+mainInvite', isRevoked: false },
      publicInviteLink: { url: 'https://t.me/public_channel', isRevoked: false },
    });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);

    const result = await service.get('user-a', 'channel-a');

    expect(result.configuration).toMatchObject({
      audience: 'Readers',
      topic: 'Practical advice',
      language: 'en',
      spheres: [],
      rubrics: [],
    });
    expect(result.configuration.lengths).toHaveLength(4);
    expect(result.channel).toMatchObject({
      mainInviteLink: 'https://t.me/+mainInvite',
      publicInviteLink: 'https://t.me/public_channel',
    });
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel-a', workspaceId: 'workspace-a' },
        select: expect.objectContaining({
          defaultInviteLink: { select: { url: true, isRevoked: true } },
          publicInviteLink: { select: { url: true, isRevoked: true } },
        }),
      }),
    );
  });

  it.each([-1, 100.5, '70', 101])('rejects the invalid hybrid share %p before writing settings', async (hybridSearchPercent) => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-a' });
    await expect(service.save('user-a', 'channel-a', {
      configuration: { historyMode: 'all', hashtags: 'disabled', imageMode: 'hybrid', hybridSearchPercent },
    })).rejects.toThrow('AI_POSTING_SEARCH_PERCENT_INVALID');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a since-history setting without a valid date', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-a',
      title: 'Example',
      username: null,
      language: 'en',
      niche: null,
      description: null,
      shortDescription: null,
      photoUrl: null,
    });

    await expect(
      service.save('user-a', 'channel-a', {
        configuration: {
          historyMode: 'since',
          historyFrom: '',
          hashtags: 'disabled',
          imageMode: 'ai',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
