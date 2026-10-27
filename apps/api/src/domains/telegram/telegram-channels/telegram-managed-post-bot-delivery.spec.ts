import {
  deliverTelegramManagedPostViaBot,
  includeReplyMarkupInBotDelivery,
  type TelegramBotDeliveryOperation,
} from './telegram-managed-post-bot-delivery';

function operation(method: string): TelegramBotDeliveryOperation {
  return {
    method,
    body: { text: 'Post text' },
    expectedMessageCount: 1,
    messageIds: () => ['42'],
  };
}

describe('Telegram managed post Bot delivery', () => {
  it.each(['sendMessage', 'sendRichMessage'])(
    'includes the keyboard in %s, so publishing has no keyboard-free window',
    async (method) => {
      const operations = [operation(method)];
      const markup = {
        inline_keyboard: [[{ text: 'Join', url: 'https://t.me/example' }]],
      };
      const included = includeReplyMarkupInBotDelivery(operations, markup);
      const call = jest.fn().mockResolvedValue({ message_id: 42 });
      const applyReplyMarkup = jest.fn();

      await deliverTelegramManagedPostViaBot({
        operations,
        journaledMessageIds: [],
        call,
        persist: jest.fn(),
        ...(included ? {} : { applyReplyMarkup }),
      });

      expect(call).toHaveBeenCalledWith(
        method,
        expect.objectContaining({ reply_markup: markup }),
      );
      expect(applyReplyMarkup).not.toHaveBeenCalled();
    },
  );

  it('keeps the separate markup edit for media groups without a text follow-up', () => {
    const operations = [operation('sendMediaGroup')];
    expect(
      includeReplyMarkupInBotDelivery(operations, { inline_keyboard: [] }),
    ).toBe(false);
    expect(operations[0].body).not.toHaveProperty('reply_markup');
  });

  it('puts the keyboard on the final message of a split text post', () => {
    const operations = [operation('sendMessage'), operation('sendMessage')];
    const markup = {
      inline_keyboard: [[{ text: 'Join', url: 'https://t.me/example' }]],
    };
    includeReplyMarkupInBotDelivery(operations, markup);
    expect(operations[0].body).not.toHaveProperty('reply_markup');
    expect(operations[1].body.reply_markup).toBe(markup);
  });

  it('does not report a failed send as published', async () => {
    const operations = [operation('sendMessage')];
    includeReplyMarkupInBotDelivery(operations, { inline_keyboard: [] });
    const persist = jest.fn();

    await expect(
      deliverTelegramManagedPostViaBot({
        operations,
        journaledMessageIds: [],
        call: jest
          .fn()
          .mockRejectedValue(new Error('Telegram rejected the message')),
        persist,
      }),
    ).rejects.toThrow('Telegram rejected the message');
    expect(persist).not.toHaveBeenCalled();
  });
});
