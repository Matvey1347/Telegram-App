import { isStaleLocalSupportWebhook, SupportBotsService } from './support-bots.service';

describe('SupportBotsService public username', () => {
  const createService = (vars: Record<string, string> = {}) => {
    const settings: Record<string, string> = {
      FINANCE_BOT_DASHBOARD_WORKSPACE_ID: 'finance-dashboard',
      FINANCE_BOT_SUPPORT_USERNAME: '@groshly_help_bot',
      FINANCE_BOT_SUPPORT_TOKEN: '101:test-fixture',
      TELEGRAM_SYSTEM_BOT_SUPPORT_TOKEN: '102:test-fixture',
      ...vars,
    };
    return new SupportBotsService(
      { get: (key: string) => settings[key] } as never,
      {} as never,
      {} as never,
    );
  };

  it('returns only the name of the configured bot for the matching workspace', () => {
    expect(createService().publicUsername('GROSHLY', 'finance-dashboard')).toBe(
      'groshly_help_bot',
    );
    expect(
      createService().publicUsername('GROSHLY', 'other-dashboard'),
    ).toBeNull();
  });

  it.each<Record<string, string>>([
    { FINANCE_BOT_SUPPORT_TOKEN: '' },
    { FINANCE_BOT_SUPPORT_USERNAME: 'https://example.test' },
    { FINANCE_BOT_SUPPORT_TOKEN: '102:test-fixture' },
  ])('ignores incomplete or incompatible support configuration', (vars) => {
    expect(
      createService(vars).publicUsername('GROSHLY', 'finance-dashboard'),
    ).toBeNull();
  });
});

describe('expired local support webhook', () => {
  const next = 'https://next.trycloudflare.com/api/telegram-support/webhooks/GROSHLY';
  const previous = 'https://previous.trycloudflare.com/api/telegram-support/webhooks/GROSHLY';

  it('replaces only a vanished matching Quick Tunnel', async () => {
    const missing = jest.fn().mockRejectedValue({ code: 'ENOTFOUND' });
    await expect(isStaleLocalSupportWebhook(previous, next, missing)).resolves.toBe(true);
    await expect(isStaleLocalSupportWebhook(previous.replace('GROSHLY', 'NEXELOQ'), next, missing)).resolves.toBe(false);
    await expect(isStaleLocalSupportWebhook(previous.replace('previous.trycloudflare.com', 'support.example.test'), next, missing)).resolves.toBe(false);
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it('preserves a live tunnel and treats DNS timeouts as ambiguous', async () => {
    await expect(isStaleLocalSupportWebhook(previous, next, jest.fn().mockResolvedValue(['192.0.2.1']))).resolves.toBe(false);
    await expect(isStaleLocalSupportWebhook(previous, next, jest.fn().mockRejectedValue({ code: 'ETIMEOUT' }))).resolves.toBe(false);
  });
});
