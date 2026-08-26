import {
  systemBotEmoji,
  renderSystemBotStats,
  systemBotTaskEmoji,
} from './telegram-system-bot-presentation';

describe('Telegram System Bot presentation', () => {
  it('uses a configured unicode emoji and falls back for image avatars', () => {
    expect(systemBotEmoji({ type: 'unicode', value: '🏦' }, '💳')).toBe('🏦');
    expect(
      systemBotEmoji(
        { type: 'image', id: 'icon', url: 'https://example.test/icon.png' },
        '💳',
      ),
    ).toBe('💳');
  });

  it('uses contextual task emoji', () => {
    expect(systemBotTaskEmoji('telegram.channels.full_sync')).toBe('📢');
    expect(systemBotTaskEmoji('currencies.rates.sync')).toBe('💱');
  });

  it('renders entity emoji in dashboard account statistics', () => {
    expect(
      renderSystemBotStats('Business', {
        telegramChannelsCount: 2,
        totalSubscribers: 500,
        accountBalances: [
          {
            name: 'Main',
            currency: 'USD',
            balance: 125.5,
            iconPresentation: { type: 'unicode', value: '🏦' },
          },
        ],
      }),
    ).toContain('🏦 Main: 125.5 USD');
  });

  it('renders safe structured HTML for workspace statistics', () => {
    const result = renderSystemBotStats('Sales <EU>', {
      primaryCurrency: 'USD',
      profitForPeriod: -12.5,
      telegramChannelsCount: 1,
    });

    expect(result).toContain('📊 <b>Sales &lt;EU&gt;</b>');
    expect(result).toContain('<b>Finance</b>');
    expect(result).toContain('🔻 Profit: <b>-12.5 USD</b>');
    expect(result).toContain('<b>Channels and audience</b>');
  });
});
