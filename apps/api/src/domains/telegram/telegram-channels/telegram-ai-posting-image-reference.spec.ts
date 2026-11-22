import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { createTelegramAiPostingReferenceSheet } from './telegram-ai-posting-image-reference';

describe('AI Posting media reference size', () => {
  it('accepts valid reference images larger than 2 MB', async () => {
    const width = 1500;
    const height = 1500;
    const source = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    expect(source.byteLength).toBeGreaterThan(2 * 1024 * 1024);
    expect(source.byteLength).toBeLessThanOrEqual(10 * 1024 * 1024);

    const sheet = await createTelegramAiPostingReferenceSheet(
      ['https://media.example/reference.jpg'],
      async () => source,
    );

    expect(sheet).toBeInstanceOf(Buffer);
    expect(sheet?.byteLength).toBeGreaterThan(0);
  });

  it('rejects reference images above 10 MB', async () => {
    await expect(
      createTelegramAiPostingReferenceSheet(
        ['https://media.example/large.jpg'],
        async () => Buffer.alloc(10 * 1024 * 1024 + 1),
      ),
    ).rejects.toThrow('AI_POSTING_IMAGE_REFERENCE_INVALID');
  });
});
