import { TelegramSourceType } from '@prisma/client';
import { selectManagedPostPublishingSource } from './managed-post-publishing-source';

const source = (sourceId: string, sourceType: TelegramSourceType) => ({
  sourceId,
  sourceType,
  permissions: { canPostMessages: true },
});

describe('selectManagedPostPublishingSource', () => {
  const sources = [
    source('account', TelegramSourceType.MTPROTO),
    source('bot', TelegramSourceType.BOT),
  ];

  it('uses Bot API for native headings and tables even when MTProto is connected', () => {
    expect(
      selectManagedPostPublishingSource(sources, {
        requiresBotApi: true,
      }),
    ).toMatchObject({ sourceId: 'bot', sourceType: TelegramSourceType.BOT });
  });

  it('keeps MTProto as the default source for ordinary posts', () => {
    expect(
      selectManagedPostPublishingSource(sources, {
        requiresBotApi: false,
      }),
    ).toMatchObject({
      sourceId: 'account',
      sourceType: TelegramSourceType.MTPROTO,
    });
  });

  it('does not silently fall back to MTProto when rich publishing needs a bot', () => {
    expect(
      selectManagedPostPublishingSource([sources[0]], {
        requiresBotApi: true,
      }),
    ).toBeUndefined();
  });
});
