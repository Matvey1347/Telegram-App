import { TelegramBotApiError } from './telegram-bot-api.client';
import { sendTelegramCustomEmojiHtml } from './telegram-custom-emoji-html-send';

describe('Telegram custom emoji HTML send', () => {
  const html =
    '<a href="https://t.me/news"><tg-emoji emoji-id="42">📢</tg-emoji> News</a>';
  const rejection = (message: string, code = 400, confirmed = true) =>
    new TelegramBotApiError(message, 'PERMANENT', {
      explicitRejected: confirmed,
      errorCode: code,
    });

  it('returns the first successful send without another request', async () => {
    const send = jest.fn().mockResolvedValue({ message_id: 1 });
    await expect(sendTelegramCustomEmojiHtml(html, send)).resolves.toEqual({
      message_id: 1,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(html);
  });

  it('retries a confirmed custom-emoji rejection with Unicode ALT and links intact', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(rejection('CUSTOM_EMOJI_NOT_ALLOWED'))
      .mockResolvedValue({ message_id: 2 });
    await expect(sendTelegramCustomEmojiHtml(html, send)).resolves.toEqual({
      message_id: 2,
    });
    expect(send.mock.calls).toEqual([
      [html],
      ['<a href="https://t.me/news">📢 News</a>'],
    ]);
  });

  it.each([
    new Error('network timeout'),
    rejection('CUSTOM_EMOJI_NOT_ALLOWED', 400, false),
    rejection('CUSTOM_EMOJI_NOT_ALLOWED', 429),
    rejection('chat not found'),
  ])('never retries an ambiguous or unrelated error: %s', async (error) => {
    const send = jest.fn().mockRejectedValue(error);
    await expect(sendTelegramCustomEmojiHtml(html, send)).rejects.toBe(error);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed fallback without a third send', async () => {
    const last = new Error('network timeout on fallback');
    const send = jest
      .fn()
      .mockRejectedValueOnce(rejection('CUSTOM_EMOJI_ID_INVALID'))
      .mockRejectedValueOnce(last);
    await expect(sendTelegramCustomEmojiHtml(html, send)).rejects.toBe(last);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
