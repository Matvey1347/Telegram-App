import {
  SYSTEM_BOT_HELP_TEXT,
  systemBotCommandFor,
  systemBotMenuPayload,
} from './telegram-system-bot-menu';

describe('Telegram System Bot menu', () => {
  it('keeps quick product actions and omits Scheduled Tasks', () => {
    const payload = systemBotMenuPayload({ name: 'Workspace' });
    const labels = payload.reply_markup.keyboard
      .flat()
      .map((button) => button.text);

    expect(labels).toEqual(
      expect.arrayContaining([
        '📝 Posts',
        '💼 Ad Sale',
        '💰 Finance',
        '🏢 Switch Workspace',
      ]),
    );
    expect(labels).not.toContain('⏱ Scheduled Tasks');
    expect(SYSTEM_BOT_HELP_TEXT).not.toContain('/tasks');
  });

  it('does not translate the removed task button into a command', () => {
    expect(systemBotCommandFor('⏱ Scheduled Tasks')).toBe('⏱ Scheduled Tasks');
  });
});
