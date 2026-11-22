import { TelegramAiPostingReferenceAnalysisService } from './telegram-ai-posting-reference-analysis.service';

describe('TelegramAiPostingReferenceAnalysisService', () => {
  const input = {
    name: 'Night photography',
    description: 'Natural city light',
    generationDescription: '',
    searchDescription: '',
    references: ['https://media.example/reference.jpg'],
  };
  const image = Buffer.from('reference sheet');

  function setup() {
    const prisma = {
      telegramChannel: { findFirst: jest.fn().mockResolvedValue({ id: 'channel', language: 'en' }) },
      telegramAiPostingSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const authorization = { require: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }) };
    const images = { prepareReferenceSheet: jest.fn().mockResolvedValue({ image, grid: { count: 1 } }) };
    const gateway = { execute: jest.fn().mockResolvedValue({
      operation: { status: 'SUCCEEDED' },
      result: { reply: '[GENERATION]\nBacklit wide shot.\n\n[SEARCH]\nFind photos like «city at dusk» or "evening street".' },
    }) };
    const service = new TelegramAiPostingReferenceAnalysisService(
      prisma as never, authorization as never, images as never, gateway as never,
    );
    return { service, prisma, images, gateway };
  }

  it('uses the reference sheet to produce two separate briefs and accepts quoted queries', async () => {
    const { service, prisma, gateway } = setup();
    await expect(service.analyze('user', 'channel', input)).resolves.toEqual({
      generationDescription: 'Backlit wide shot.',
      searchDescription: 'Find photos like «city at dusk» or "evening street".',
    });
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace', id: 'channel' },
    }));
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      image: { mime: 'image/jpeg', data: image },
      category: 'TELEGRAM_POSTING_PLAN',
      aiPosting: expect.objectContaining({ channelId: 'channel', postingMode: 'TEST' }),
    }));
  });

  it('does not fetch images for a channel outside the workspace', async () => {
    const { service, prisma, images, gateway } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(service.analyze('user', 'channel', input)).rejects.toThrow('Telegram channel not found');
    expect(images.prepareReferenceSheet).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('preserves existing guidance when the provider returns an incomplete result', async () => {
    const { service, gateway } = setup();
    gateway.execute.mockResolvedValue({
      operation: { status: 'SUCCEEDED' },
      result: { reply: '[GENERATION]\nBacklit wide shot.' },
    });
    await expect(service.analyze('user', 'channel', input)).rejects.toThrow('AI_POSTING_REFERENCE_ANALYSIS_FAILED');
  });

  it('does not charge for analysis of an incomplete reference set', async () => {
    const { service, images, gateway } = setup();
    images.prepareReferenceSheet.mockResolvedValue({ image, grid: { count: 0 } });
    await expect(service.analyze('user', 'channel', input)).rejects.toThrow('AI_POSTING_IMAGE_REFERENCE_UNAVAILABLE');
    expect(gateway.execute).not.toHaveBeenCalled();
  });
});
