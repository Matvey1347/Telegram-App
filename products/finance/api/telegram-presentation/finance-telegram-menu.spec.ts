import {
  financeChatMenuButton,
  financeCheckoutReturnUrl,
  financeMainMenu,
  financeMiniAppUrl,
} from '@consumer-finance/api/telegram-presentation/finance-telegram-menu';

describe('Finance Telegram application URLs', () => {
  const previousFrontendUrl = process.env.FRONTEND_URL;
  const previousFinanceUrl = process.env.FINANCE_WEB_PUBLIC_URL;

  afterEach(() => {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
    if (previousFinanceUrl === undefined) delete process.env.FINANCE_WEB_PUBLIC_URL;
    else process.env.FINANCE_WEB_PUBLIC_URL = previousFinanceUrl;
  });

  it('opens the independent Finance site when both public origins are configured', () => {
    process.env.FRONTEND_URL = 'https://nexeloq.example';
    process.env.FINANCE_WEB_PUBLIC_URL = 'https://finance.example';
    expect(financeChatMenuButton('finance-bot')).toMatchObject({
      type: 'web_app',
      webAppUrl: 'https://finance.example/finance/finance-bot',
    });
    expect(financeCheckoutReturnUrl('finance-bot', 'success')).toBe(
      'https://finance.example/finance/finance-bot?checkout=success',
    );
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

  it('keeps the reply keyboard compact without duplicating the Mini App button', () => {
    process.env.FRONTEND_URL = 'https://public-web.example';

    const menu = financeMainMenu('finance-bot', 'uk');

    expect(menu).toHaveLength(5);
    expect(menu.flat()).toHaveLength(9);
    expect(menu[0]).toEqual([{ text: '🤖 Джаврис' }]);
    expect(menu.flat()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '📱 Відкрити Finance' }),
      ]),
    );
    expect(menu.flat().some((button) => 'webAppUrl' in button)).toBe(false);
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
