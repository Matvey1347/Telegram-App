import { FinanceBotBrowserLogin } from './finance-bot-browser-login';

describe('FinanceBotBrowserLogin', () => {
  function setup(approved = true) {
    const transfers = {
      approveBrowserLogin: jest.fn().mockResolvedValue(approved),
    };
    const interactive = { send: jest.fn().mockResolvedValue(undefined) };
    return {
      handler: new FinanceBotBrowserLogin(
        transfers as never,
        interactive as never,
      ),
      transfers,
      interactive,
    };
  }

  it('approves a valid deep link for the exact bot profile', async () => {
    const test = setup();
    const token = 'a'.repeat(32);

    await expect(
      test.handler.handle(
        {
          bot: { id: 'bot-1' },
          token: 'bot-token',
          update: { message: { text: `/start finlogin_${token}` } },
        } as never,
        'chat-1',
        'profile-1',
        'en',
      ),
    ).resolves.toBe(true);
    expect(test.transfers.approveBrowserLogin).toHaveBeenCalledWith({
      token,
      botIntegrationId: 'bot-1',
      profileId: 'profile-1',
    });
    expect(test.interactive.send).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      expect.objectContaining({
        text: expect.stringContaining('Browser login approved'),
      }),
    );
  });

  it('ignores ordinary Finance messages without reading the challenge store', async () => {
    const test = setup();

    await expect(
      test.handler.handle(
        {
          bot: { id: 'bot-1' },
          token: 'bot-token',
          update: { message: { text: '/start' } },
        } as never,
        'chat-1',
        'profile-1',
        'en',
      ),
    ).resolves.toBe(false);
    expect(test.transfers.approveBrowserLogin).not.toHaveBeenCalled();
    expect(test.interactive.send).not.toHaveBeenCalled();
  });
});
