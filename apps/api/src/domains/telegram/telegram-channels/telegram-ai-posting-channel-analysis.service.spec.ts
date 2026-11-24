import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingChannelAnalysisService } from './telegram-ai-posting-channel-analysis.service';
import { buildTelegramAiPostingAnalysisConfiguration } from './telegram-ai-posting-analysis-configuration';
import { telegramAiPostingEditorialSelection } from './telegram-ai-posting-editorial-selection';

function setup() {
  const postDate = new Date('2026-08-04T12:00:00Z');
  const prisma = {
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ organicPosts: 31, excludedPosts: 4, scoredPosts: 17, firstPost: postDate, lastPost: postDate }])
      .mockResolvedValueOnce([
        { messageId: '14', postDate, caption: 'A familiar everyday scene', image: 'https://example.test/image.jpg', role: 'recent' },
        { messageId: '14', postDate, caption: 'A familiar everyday scene', image: 'https://example.test/image.jpg', role: 'representative' },
        { messageId: '14', postDate, caption: 'A familiar everyday scene', score24h: 1.23, engagement: 8, role: 'high' },
      ]),
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAiPostingSettings: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const authorization = { require: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }) };
  const settings = { get: jest.fn().mockResolvedValue({
    channel: { title: 'The Daily Observer' }, configurationVersion: 8, configured: true, detectedLanguage: 'en',
    configuration: { audience: 'Owner audience', spheres: [{ id: 'sphere', name: 'Activities', description: 'Daily activities' }], rubrics: [{ id: 'notes', description: 'Practical notes', goal: 'Try a prompt' }] },
  }) };
  const image = Buffer.from('grid');
  const images = { prepareReferenceSheet: jest.fn().mockResolvedValue({ image, grid: { count: 1 } }) };
  const providerReply = (value: unknown) => ({
    operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify(value) },
  });
  const gateway = { execute: jest.fn()
    .mockResolvedValueOnce(providerReply({ style: 'Open with an observable action.', findings: 'Strong examples use a scene.', audience: 'Proposed audience' }))
    .mockResolvedValueOnce(providerReply({ counts: [1] }))
    .mockResolvedValueOnce(providerReply({ visualStyle: 'Soft backlight, varied settings.' })),
  };
  const service = new TelegramAiPostingChannelAnalysisService(
    prisma as never, authorization as never, settings as never, images as never, gateway as never,
  );
  return { service, prisma, settings, images, gateway, image };
}

describe('Telegram AI Posting channel analysis', () => {
  it('returns a workspace-scoped proposal with actual coverage and preserves existing values', async () => {
    const { service, prisma, gateway, image } = setup();
    const proposal = await service.analyze('user', 'channel');
    expect(proposal).toMatchObject({
      schemaVersion: 2, configurationVersion: 8,
      performanceExamples: { high: [{ messageId: '14', score24h: 1.23, engagementPer1k24h: 8 }], low: [] },
      coverage: { organicPosts: 31, excludedPosts: 4, scoredPosts: 17, sampledPosts: 1, visualExamples: 1 },
      configuration: { audience: 'Owner audience', sphereWeights: { sphere: 100 }, visualStyle: 'Soft backlight, varied settings.' },
    });
    expect(gateway.execute).toHaveBeenCalledTimes(3);
    expect(gateway.execute).toHaveBeenLastCalledWith(expect.objectContaining({
      workspaceId: 'workspace', image: { mime: 'image/jpeg', data: image },
    }));
    expect(prisma.$queryRaw.mock.calls.every((call) =>
      JSON.stringify(call).includes('workspace') && JSON.stringify(call).includes('channel'),
    )).toBe(true);
  });

  it('does not request evidence or model work when settings access is denied', async () => {
    const { service, prisma, settings, gateway } = setup();
    settings.get.mockRejectedValueOnce(new NotFoundException());
    await expect(service.analyze('user', 'other-channel')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('reports empty history before opening image references or charging for AI', async () => {
    const { service, prisma, images, gateway } = setup();
    prisma.$queryRaw.mockReset().mockResolvedValue([]);
    await expect(service.analyze('user', 'empty')).rejects.toBeInstanceOf(BadRequestException);
    expect(images.prepareReferenceSheet).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('rejects an incomplete voice analysis', () => {
    expect(() => buildTelegramAiPostingAnalysisConfiguration({}, { findings: 'summary' }, 'en', false, false))
      .toThrow('AI_POSTING_CHANNEL_ANALYSIS_INVALID');
  });

  it('links proposed rubrics to generated spheres and keeps media unchanged without images', () => {
    const { configuration } = buildTelegramAiPostingAnalysisConfiguration({
      lengths: [{ id: 'short' }], mediaPreferences: [{ id: 'media', name: 'Original' }],
    }, {
      findings: 'Summary', style: 'Conversational', visualStyle: 'Unsupported',
      spheres: [{ id: 'temporary', name: 'Family', weight: 100 }],
      rubrics: [{ name: 'Advice', sphereId: 'temporary', lengthIds: ['short', 'invalid'] }],
    }, 'en', false, false);
    expect(configuration.visualStyle).toBeUndefined();
    expect(configuration.mediaPreferences).toEqual([{ id: 'media', name: 'Original' }]);
    expect(configuration.rubrics[0]).toMatchObject({
      sphereId: configuration.spheres[0].id, lengthIds: ['short'],
    });
  });

  it('uses configured root proportions without letting a compact rubric override the root', () => {
    const config = {
      spheres: [
        { id: 'a', tier: 'PRIMARY' }, { id: 'b', tier: 'SECONDARY' },
        { id: 'c', tier: 'SECONDARY' }, { id: 'child', parentId: 'a' },
      ],
      rubrics: [{ id: 'compact', sphereId: 'c', lengthIds: ['short'] }],
      lengths: [{ id: 'short', minCharacters: 1, maxCharacters: 99 }],
      sphereWeights: { a: 70, b: 30, c: 0 },
    };
    const recent: ReturnType<typeof telegramAiPostingEditorialSelection>[] = [];
    for (let index = 0; index < 10; index++) {
      recent.push(telegramAiPostingEditorialSelection(config, index, index, recent));
    }
    expect(recent.filter((item) => item.parentSphere?.id === 'a')).toHaveLength(7);
    expect(recent.filter((item) => item.sphere?.id === 'b')).toHaveLength(3);
    expect(recent.some((item) => item.rubric?.id === 'compact')).toBe(false);
  });
});
