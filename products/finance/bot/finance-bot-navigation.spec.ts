import { financeBotNavigation } from './finance-bot-navigation';

describe('Finance bot navigation', () => {
  const previous = process.env.FRONTEND_URL;
  const previousFinance = process.env.FINANCE_WEB_PUBLIC_URL;
  beforeEach(() => { process.env.FRONTEND_URL = 'https://finance.example'; process.env.FINANCE_WEB_PUBLIC_URL = 'https://finance.example'; });
  afterAll(() => {
    if (previous === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
    if (previousFinance === undefined) delete process.env.FINANCE_WEB_PUBLIC_URL;
    else process.env.FINANCE_WEB_PUBLIC_URL = previousFinance;
  });

  it('links analytics and subscription status to handled Finance screens', () => {
    expect(financeBotNavigation('bot-1', 'uk', 'analytics').inlineButtons?.[0][0]).toMatchObject({
      webAppUrl: 'https://finance.example/finance/bot-1?screen=analytics',
    });
    expect(financeBotNavigation('bot-1', 'en', 'plus').inlineButtons?.[0][0]).toMatchObject({
      webAppUrl: 'https://finance.example/finance/bot-1?screen=billing',
    });
  });

  it('provides payment support and legal pages without Checkout links', () => {
    expect(financeBotNavigation('bot-1', 'en', 'support').text).toContain('matveybogdantg@gmail.com');
    expect(financeBotNavigation('bot-1', 'en', 'terms').inlineButtons).toEqual([[
      { text: 'Terms of service', url: 'https://finance.example/terms' },
      { text: 'Privacy policy', url: 'https://finance.example/privacy' },
    ]]);
    expect(JSON.stringify(financeBotNavigation('bot-1', 'en', 'plus'))).not.toContain('checkout');
  });
});
