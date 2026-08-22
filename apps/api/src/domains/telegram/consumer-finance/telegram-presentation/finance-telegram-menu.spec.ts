import {
  financeChatMenuButton,
  financeCheckoutReturnUrl,
  financeMiniAppUrl,
} from './finance-telegram-menu';

describe('Finance Telegram application URLs', () => {
  const previousFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  });

  it('builds the product route from the canonical public web origin', () => {
    process.env.FRONTEND_URL = 'https://public-web.example/';

    expect(financeMiniAppUrl('bot id', undefined, 'transactions', true)).toBe(
      'https://public-web.example/finance/bot%20id?screen=transactions&transfer=1',
    );
  });

  it('uses the same canonical route for the Telegram menu button', () => {
    process.env.FRONTEND_URL = 'https://public-web.example';

    expect(financeChatMenuButton('finance-bot')).toMatchObject({
      type: 'web_app',
      webAppUrl: 'https://public-web.example/finance/finance-bot',
    });
  });

  it('adds checkout state through the owned Finance route helper', () => {
    expect(
      financeCheckoutReturnUrl(
        'finance-bot',
        'success',
        'https://public-web.example',
      ),
    ).toBe('https://public-web.example/finance/finance-bot?checkout=success');
  });

  it('falls back to commands when the deployment has no public web origin', () => {
    delete process.env.FRONTEND_URL;

    expect(financeChatMenuButton('finance-bot')).toEqual({ type: 'commands' });
  });
});
