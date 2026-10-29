import { validateFinanceEnvironment } from './finance-runtime-config';

const valid = {
  FINANCE_DATABASE_URL: 'postgresql://finance:password@localhost:5432/finance',
  FINANCE_SESSION_SIGNING_KEY: 'a-secure-finance-session-signing-key-32-chars',
  FINANCE_BOOTSTRAP_SIGNING_KEY: 'a-secure-finance-bootstrap-key-with-32-chars',
};

describe('validateFinanceEnvironment', () => {
  it('accepts the dedicated Finance database and defaults to its local port', () => {
    expect(validateFinanceEnvironment(valid)).toMatchObject({
      FINANCE_DATABASE_URL: valid.FINANCE_DATABASE_URL,
      FINANCE_API_PORT: 4001,
    });
  });

  it('honors the platform-assigned port for a Railway service', () => {
    expect(validateFinanceEnvironment({ ...valid, FINANCE_API_PORT: '4001', PORT: '8080' }))
      .toMatchObject({ FINANCE_API_PORT: 8080 });
  });

  it('keeps the Telegram runtime disabled when no environment is selected', () => {
    expect(validateFinanceEnvironment(valid)).toMatchObject({
      FINANCE_BOT_RUNTIME_ENVIRONMENT: 'DISABLED',
    });
  });

  it('requires only the selected local bot credentials', () => {
    expect(
      validateFinanceEnvironment({
        ...valid,
        FINANCE_BOT_RUNTIME_ENVIRONMENT: 'LOCAL',
        FINANCE_BOT_LOCAL_USERNAME: '@groshly_dev_bot',
        FINANCE_BOT_LOCAL_TOKEN: 'a-secure-finance-local-token-with-32-chars',
        FINANCE_BOT_LOCAL_WEBHOOK_SECRET: 'a-secure-local-webhook-secret-with-32-chars',
      }),
    ).toMatchObject({ FINANCE_BOT_RUNTIME_ENVIRONMENT: 'LOCAL' });
  });

  it('rejects a selected bot with incomplete credentials', () => {
    expect(() =>
      validateFinanceEnvironment({ ...valid, FINANCE_BOT_RUNTIME_ENVIRONMENT: 'PRODUCTION' }),
    ).toThrow('FINANCE_BOT_PRODUCTION_USERNAME');
  });

  it('does not permit an HTTP public URL for the production Finance bot', () => {
    expect(() =>
      validateFinanceEnvironment({
        ...valid,
        FINANCE_BOT_RUNTIME_ENVIRONMENT: 'PRODUCTION',
        FINANCE_BOT_PRODUCTION_USERNAME: '@groshly_prod_bot',
        FINANCE_BOT_PRODUCTION_TOKEN: 'a-secure-finance-production-token-32-chars',
        FINANCE_BOT_PRODUCTION_WEBHOOK_SECRET: 'a-secure-production-webhook-secret-32-chars',
        FINANCE_API_PUBLIC_URL: 'http://localhost:4001',
      }),
    ).toThrow('FINANCE_API_PUBLIC_URL');
  });

  it('does not allow TEST Stripe mode with the production Finance bot', () => {
    expect(() => validateFinanceEnvironment({
      ...valid,
      FINANCE_BOT_RUNTIME_ENVIRONMENT: 'PRODUCTION',
      FINANCE_STRIPE_MODE: 'TEST',
    })).toThrow('Production Finance bot cannot use Stripe TEST mode');
  });
});
