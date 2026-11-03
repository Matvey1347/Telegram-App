import { classifySweepPost } from './lead-rule-sweep-classifier';
import type { TelegramLeadPost } from '../../../../telegram/shared/mtproto/telegram-lead-channel.types';

const post = (text: string): TelegramLeadPost => ({
  channelId: '12345', messageId: 1, text, publishedAt: new Date(), editedAt: null,
  metadata: { complete: true, textComplete: true, incompleteReasons: [], entityUrls: [], inlineButtonUrls: [], mentions: [], hasForwardMetadata: false, forwardChannelId: null, hasMedia: false, mediaType: null },
});

describe('no-AI sweep classification', () => {
  it('marks literal offers as provisional and derives a stable candidate identity', () => {
    const result = classifySweepPost(post('Розпродаж. Ціна 100 грн. Замовити https://merchant.example/'), { channelId: '12345', username: 'source' });
    expect(result.decision).toBe('LIKELY_AD');
    expect(result.candidate).toMatchObject({ title: 'https://merchant.example/', identityKey: expect.any(String) });
  });
  it('treats mutual promotion as a hint without fabricating a candidate', () => {
    const result = classifySweepPost(post('Взаємопіар https://example.org/'), { channelId: '12345', username: 'source' });
    expect(result.decision).toBe('LIKELY_VP');
    expect(result.candidate).toBeNull();
  });
  it('does not label ambiguous or source-only content as an advertisement', () => {
    const result = classifySweepPost(post('Подписывайтесь на @source'), { channelId: '12345', username: 'source' });
    expect(result.decision).not.toBe('LIKELY_AD');
    expect(result.candidate).toBeNull();
  });
});
