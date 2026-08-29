import {
  SYSTEM_BOT_COMMANDS,
  SYSTEM_BOT_HELP_TEXT,
  systemBotCommandFor,
  systemBotMenuPayload,
} from './telegram-system-bot-menu';

describe('Telegram System Bot menu', () => {
  it('registers the supported public commands without removed internal actions', () => {
    expect(SYSTEM_BOT_COMMANDS.map(({ command }) => command)).toEqual([
      'start',
      'help',
      'posts',
      'post',
      'adsale',
      'channels',
      'stats',
      'finance',
      'workspace',
    ]);
    expect(SYSTEM_BOT_COMMANDS.map(({ command }) => command)).not.toContain(
      'tasks',
    );
    expect(SYSTEM_BOT_COMMANDS.map(({ command }) => command)).not.toContain(
      'sync',
    );
  });

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
        '🏢 Workspace',
      ]),
    );
    expect(labels).not.toContain('⏱ Scheduled Tasks');
    expect(SYSTEM_BOT_HELP_TEXT).not.toContain('/tasks');
  });

  it('maps both the current and legacy workspace labels to the command', () => {
    expect(systemBotCommandFor('🏢 Workspace')).toBe('/workspace');
    expect(systemBotCommandFor('🏢 Switch Workspace')).toBe('/workspace');
  });

  it('does not translate the removed task button into a command', () => {
    expect(systemBotCommandFor('⏱ Scheduled Tasks')).toBe('⏱ Scheduled Tasks');
  });
});
