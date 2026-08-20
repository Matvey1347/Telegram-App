import { createCollapsibleReplyKeyboard } from './telegram-reply-keyboard';

describe('createCollapsibleReplyKeyboard', () => {
  it('keeps a resizable keyboard available without making it persistent', () => {
    expect(
      createCollapsibleReplyKeyboard([
        [{ text: 'Open app', webAppUrl: 'https://app.example/finance/bot-1' }],
      ]),
    ).toEqual({
      keyboard: [
        [{ text: 'Open app', web_app: { url: 'https://app.example/finance/bot-1' } }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    });
  });
});
