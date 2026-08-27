/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { TelegramBotInteractiveReplyService } from './telegram-bot-interactive-reply.service';

describe('TelegramBotInteractiveReplyService', () => {
  it('sends immediately with the shared inline keyboard formatting and no persistence', async () => {
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 7 }) };
    await new TelegramBotInteractiveReplyService(api as never).send(
      'token',
      'chat',
      {
        text: 'Choose',
        inlineButtons: [[{ text: 'Save', callbackData: 'fin:flow:confirm' }]],
      },
    );
    expect(api.sendMessage).toHaveBeenCalledWith('token', {
      chat_id: 'chat',
      text: 'Choose',
      parse_mode: undefined,
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Save', callback_data: 'fin:flow:confirm' }],
        ],
      },
    });
  });

  it('shares reply-keyboard Web App formatting with durable delivery', async () => {
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 8 }) };
    await new TelegramBotInteractiveReplyService(api as never).send(
      'token',
      'chat',
      {
        text: 'Menu',
        replyKeyboard: [[{ text: 'Open', webAppUrl: 'https://example.test' }]],
      },
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: [
            [{ text: 'Open', web_app: { url: 'https://example.test' } }],
          ],
        }),
      }),
    );
  });

  it('preserves a Premium emoji document id on inline buttons', async () => {
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 8 }) };
    await new TelegramBotInteractiveReplyService(api as never).send(
      'token',
      'chat',
      {
        text: 'Choose',
        inlineButtons: [
          [
            {
              text: '🔥 Card',
              callbackData: 'card',
              iconCustomEmojiId: '5368324170671202286',
            },
          ],
        ],
      },
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              expect.objectContaining({
                icon_custom_emoji_id: '5368324170671202286',
              }),
            ],
          ],
        },
      }),
    );
  });

  it('can explicitly remove a stale reply keyboard', async () => {
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 9 }) };
    await new TelegramBotInteractiveReplyService(api as never).send(
      'token',
      'chat',
      {
        text: 'Local is stopped',
        removeReplyKeyboard: true,
      },
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: { remove_keyboard: true },
      }),
    );
  });

  it('can remove stale inline actions from a finalized message', async () => {
    const api = { editMessageText: jest.fn().mockResolvedValue(true) };
    await new TelegramBotInteractiveReplyService(api as never).edit(
      'token',
      'chat',
      42,
      { text: 'Saved', removeInlineKeyboard: true },
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
    );
  });

  it('replaces an existing interactive step with the next inline keyboard', async () => {
    const api = { editMessageText: jest.fn().mockResolvedValue(true) };

    await new TelegramBotInteractiveReplyService(api as never).edit(
      'token',
      'chat',
      42,
      {
        text: 'Choose a category',
        inlineButtons: [
          [{ text: 'Salary', callbackData: 'fin:flow:category:salary' }],
        ],
      },
    );

    expect(api.editMessageText).toHaveBeenCalledWith('token', {
      chat_id: 'chat',
      message_id: 42,
      text: 'Choose a category',
      parse_mode: undefined,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Salary',
              callback_data: 'fin:flow:category:salary',
            },
          ],
        ],
      },
    });
  });
});
