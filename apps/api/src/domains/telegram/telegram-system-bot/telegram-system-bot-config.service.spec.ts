import { ConfigService } from '@nestjs/config';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';

describe('TelegramSystemBotConfigService', () => {
  const createService = (values: Record<string, string | undefined>) =>
    new TelegramSystemBotConfigService(new ConfigService(values));

  it('uses the configured webhook secret when provided', () => {
    const service = createService({
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
      TELEGRAM_SYSTEM_BOT_LOCAL_WEBHOOK_SECRET: ' configured-secret ',
    });

    expect(service.expectedWebhookSecret()).toBe('configured-secret');
    expect(service.validatesWebhookSecret('configured-secret')).toBe(true);
  });

  it('generates one stable webhook secret when the variable is empty', () => {
    const service = createService({
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
      TELEGRAM_SYSTEM_BOT_PRODUCTION_WEBHOOK_SECRET: '',
    });

    const generated = service.expectedWebhookSecret();

    expect(generated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(service.expectedWebhookSecret()).toBe(generated);
    expect(service.validatesWebhookSecret(generated)).toBe(true);
    expect(service.validatesWebhookSecret('wrong-secret')).toBe(false);
  });

  it('uses the shared frontend URL and removes its trailing slash', () => {
    const service = createService({
      FRONTEND_URL: 'https://telegram-system-web.vercel.app/',
    });

    expect(service.frontendUrl).toBe('https://telegram-system-web.vercel.app');
  });

  it('builds the webhook URL from the canonical public API origin', () => {
    const service = createService({
      API_PUBLIC_URL: 'https://telegram-system-api.example/',
    });

    expect(service.webhookUrl).toBe(
      'https://telegram-system-api.example/api/telegram/system-bot/webhook',
    );
  });

  it('selects only credentials for the explicit environment', () => {
    const values = {
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
      TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: ' local-token ',
      TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'local_bot',
      TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN: 'production-token',
      TELEGRAM_SYSTEM_BOT_PRODUCTION_USERNAME: 'production_bot',
    };

    const local = createService(values);
    const production = createService({
      ...values,
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
    });

    expect(local.environment).toBe('LOCAL');
    expect(local.token).toBe('local-token');
    expect(local.username).toBe('local_bot');
    expect(production.environment).toBe('PRODUCTION');
    expect(production.token).toBe('production-token');
    expect(production.username).toBe('production_bot');
    expect(local.auditCredentials()).toEqual([
      {
        environment: 'LOCAL',
        token: 'local-token',
        username: 'local_bot',
        selected: true,
      },
      {
        environment: 'PRODUCTION',
        token: 'production-token',
        username: 'production_bot',
        selected: false,
      },
    ]);
    expect(production.auditCredentials()).toEqual([
      {
        environment: 'PRODUCTION',
        token: 'production-token',
        username: 'production_bot',
        selected: true,
      },
    ]);
  });

  it('stays disabled without an exact environment and ignores legacy credentials', () => {
    const service = createService({
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'local',
      TELEGRAM_SYSTEM_BOT_TOKEN: 'legacy-production-token',
      TELEGRAM_SYSTEM_BOT_USERNAME: 'legacy_bot',
    });

    expect(service.environment).toBeNull();
    expect(service.configured).toBe(false);
    expect(service.token).toBeNull();
    expect(service.username).toBeNull();
  });
});
