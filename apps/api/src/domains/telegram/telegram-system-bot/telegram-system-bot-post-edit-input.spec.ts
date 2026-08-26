import { parseTelegramSystemBotPostButtonsInput } from './telegram-system-bot-post-edit-input';

describe('parseTelegramSystemBotPostButtonsInput', () => {
  it('clears all buttons with a dash', () => {
    expect(parseTelegramSystemBotPostButtonsInput(' - ')).toEqual({
      ok: true,
      buttonRows: [],
    });
  });

  it.each([
    'Missing separator',
    'Unsafe | javascript:alert(1)',
    'Telegram deep link | tg://resolve?domain=test',
    'Empty URL | ',
  ])('rejects invalid input: %s', (value) => {
    expect(parseTelegramSystemBotPostButtonsInput(value)).toEqual({
      ok: false,
      error:
        'Send one button per line as Label | https://example.com, or - to clear buttons.',
    });
  });
});
