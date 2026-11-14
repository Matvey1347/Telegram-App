import { resolveAiPostingPreferenceIcons } from './telegram-ai-posting-preference-icons';

describe('AI Posting preference icon read model', () => {
  it('loads icons once with workspace isolation and returns resolved display values', async () => {
    const prisma = {
      icon: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'icon-a',
              type: 'emoji',
              name: 'Visual',
              emoji: '🎨',
              imageUrl: null,
            },
          ]),
      },
      telegramCustomEmoji: { findMany: jest.fn() },
    };
    const result = await resolveAiPostingPreferenceIcons(
      prisma as never,
      'workspace-a',
      {
        mediaPreferences: [
          { id: 'pref-a', emojiIconId: 'icon-a' },
          { id: 'pref-b', emojiIconId: 'icon-a' },
        ],
      },
    );
    expect(prisma.icon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['icon-a'] },
          OR: [{ workspaceId: 'workspace-a' }, { workspaceId: null }],
        },
      }),
    );
    expect(result['icon-a']).toMatchObject({ type: 'unicode', value: '🎨' });
    expect(prisma.telegramCustomEmoji.findMany).not.toHaveBeenCalled();
  });
  it('does not query when no saved icon is selected', async () => {
    const prisma = { icon: { findMany: jest.fn() } };
    expect(
      await resolveAiPostingPreferenceIcons(prisma as never, 'workspace-a', {}),
    ).toEqual({});
    expect(prisma.icon.findMany).not.toHaveBeenCalled();
  });
});
