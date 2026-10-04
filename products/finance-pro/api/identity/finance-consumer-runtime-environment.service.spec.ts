import { FinanceConsumerRuntimeEnvironmentService } from './finance-consumer-runtime-environment.service';

describe('FinanceConsumerRuntimeEnvironmentService', () => {
  const previousBot = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;

  afterEach(() => {
    if (previousBot === undefined) {
      delete process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    } else {
      process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = previousBot;
    }
  });

  it('uses the workspace bot runtime', () => {
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = 'PRODUCTION';

    expect(new FinanceConsumerRuntimeEnvironmentService().current()).toBe(
      'PRODUCTION',
    );
  });

  it('does not guess a runtime when neither selector is valid', () => {
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = 'staging';

    expect(new FinanceConsumerRuntimeEnvironmentService().current()).toBeNull();
  });
});
