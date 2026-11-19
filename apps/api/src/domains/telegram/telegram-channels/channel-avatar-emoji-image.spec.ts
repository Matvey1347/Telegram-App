import sharp from 'sharp';
import {
  channelAvatarEmojiImage,
  channelAvatarEmojiImagesMatch,
} from './channel-avatar-emoji-image';

describe('channelAvatarEmojiImage', () => {
  it('center-crops to 100x100 with transparent circular corners and an opaque center', async () => {
    const source = await sharp({
      create: { width: 300, height: 100, channels: 3, background: '#ff0000' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 100,
              height: 100,
              channels: 3,
              background: '#00ff00',
            },
          })
            .png()
            .toBuffer(),
          left: 100,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const image = await channelAvatarEmojiImage(source);
    const { data, info } = await sharp(image.png)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 100, height: 100, channels: 4 });
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4),
    ];
    for (const [x, y] of [
      [0, 0],
      [99, 0],
      [0, 99],
      [99, 99],
    ])
      expect(pixel(x, y)[3]).toBe(0);
    expect(pixel(50, 50)).toEqual([0, 255, 0, 255]);
    expect(pixel(5, 50)).toEqual([0, 255, 0, 255]);
    expect(image.imageUrl).toBe(
      `data:image/png;base64,${image.png.toString('base64')}`,
    );
  });

  it('produces a stable content hash for identical image pixels and a new hash for changed pixels', async () => {
    const pixels = {
      create: {
        width: 120,
        height: 120,
        channels: 3 as const,
        background: '#224488',
      },
    };
    const png = await sharp(pixels).png({ compressionLevel: 1 }).toBuffer();
    const reencoded = await sharp(pixels)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const [first, second, third] = await Promise.all([
      channelAvatarEmojiImage(png),
      channelAvatarEmojiImage(reencoded),
      channelAvatarEmojiImage(
        await sharp({
          create: {
            width: 120,
            height: 120,
            channels: 3,
            background: '#884422',
          },
        })
          .png()
          .toBuffer(),
      ),
    ]);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(second.png).toEqual(first.png);
    expect(third.hash).not.toBe(first.hash);
  });

  it('rejects invalid image bytes instead of creating a misleading avatar emoji', async () => {
    await expect(
      channelAvatarEmojiImage(Buffer.from('not-an-image')),
    ).rejects.toThrow();
  });
});

describe('Telegram WebP reconciliation', () => {
  it('accepts Telegram-like lossy WebP without weakening exact source-version hashing', async () => {
    const source = await channelAvatarEmojiImage(
      await sharp({
        create: { width: 120, height: 100, channels: 3, background: '#237746' },
      })
        .png()
        .toBuffer(),
    );
    const webp = await sharp(source.png).webp({ quality: 75 }).toBuffer();
    expect(await channelAvatarEmojiImagesMatch(source.png, webp)).toBe(true);
    const other = await channelAvatarEmojiImage(
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: '#992255' },
      })
        .png()
        .toBuffer(),
    );
    expect(await channelAvatarEmojiImagesMatch(source.png, other.png)).toBe(
      false,
    );
    const square = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#237746' },
    })
      .png()
      .toBuffer();
    expect(await channelAvatarEmojiImagesMatch(source.png, square)).toBe(false);
    expect(source.hash).not.toBe(other.hash);
  });
});
