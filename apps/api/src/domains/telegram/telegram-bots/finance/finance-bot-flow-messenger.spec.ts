import { FinanceBotFlowMessenger } from './finance-bot-flow-messenger';

describe('FinanceBotFlowMessenger language completion', () => {
  it('replaces the completed step and publishes a fresh localized reply keyboard', async () => {
    const interactive = {
      edit: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue({ message_id: 12 }),
    };
    const chat = { sendMainMenu: jest.fn().mockResolvedValue(undefined) };
    const presenter = {
      completionText: jest.fn().mockReturnValue('✅ Язык обновлён.'),
    };
    const messenger = new FinanceBotFlowMessenger(
      interactive as never,
      chat as never,
      {} as never,
      presenter as never,
    );
    const context = {
      token: 'bot-token',
      bot: { id: 'bot-1' },
      update: {},
    } as never;

    await messenger.send(
      context,
      'telegram-user-1',
      'chat-1',
      'en',
      {
        kind: 'updated',
        flow: 'SETTINGS_LANGUAGE',
        payload: { locale: 'ru', messageId: 10 },
      } as never,
      'profile-1',
    );

    expect(presenter.completionText).toHaveBeenCalledWith(
      'ru',
      expect.objectContaining({ flow: 'SETTINGS_LANGUAGE' }),
    );
    expect(interactive.edit).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      10,
      expect.objectContaining({ text: '✅ Язык обновлён.' }),
    );
    expect(chat.sendMainMenu).toHaveBeenCalledWith(
      context,
      'telegram-user-1',
      'chat-1',
      'ru',
    );
  });
});
