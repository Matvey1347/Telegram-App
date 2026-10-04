import {
  TELEGRAM_BOT_ACTION_TEXT,
  telegramBotActionRow,
  telegramBotApiActionRow,
  telegramBotEditButtonText,
} from './telegram-bot-action-buttons';

describe('Telegram bot action buttons', () => {
  it('keeps Back, Cancel and Confirm in one shared order', () => {
    expect(
      telegramBotActionRow({
        confirm: 'confirm-action',
        back: 'back-action',
        cancel: 'cancel-action',
      }),
    ).toEqual([
      { text: '←', callbackData: 'back-action' },
      { text: '❌', callbackData: 'cancel-action' },
      { text: '✅', callbackData: 'confirm-action' },
    ]);
  });

  it('supports Bot API callback_data and omits unavailable actions', () => {
    expect(
      telegramBotApiActionRow({ cancel: 'cancel-action', confirm: 'save' }),
    ).toEqual([
      { text: '❌', callback_data: 'cancel-action' },
      { text: '✅', callback_data: 'save' },
    ]);
  });

  it('owns the shared edit style', () => {
    expect(telegramBotEditButtonText('Workspace')).toBe('✏️ Workspace');
    expect(telegramBotEditButtonText()).toBe(TELEGRAM_BOT_ACTION_TEXT.edit);
  });
});
