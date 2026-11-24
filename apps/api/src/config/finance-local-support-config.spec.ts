import { readFileSync } from 'node:fs';
import { loadFinanceLocalSupportConfig } from './finance-local-support-config';

jest.mock('node:fs', () => ({ readFileSync: jest.fn() }));

const readProfile = jest.mocked(readFileSync);

afterEach(() => {
  jest.restoreAllMocks();
  readProfile.mockReset();
});

it.each(['', 'LOCAL'])(
  'loads support settings in development with runtime %j',
  (runtime) => {
    jest.replaceProperty(process, 'env', {
      NODE_ENV: 'development',
      TELEGRAM_BOT_RUNTIME_ENVIRONMENT: runtime,
    });
    readProfile.mockReturnValue(
      [
        'FINANCE_BOT_SUPPORT_USERNAME="@example_help_bot"',
        'FINANCE_BOT_SUPPORT_TOKEN=fixture',
        'FINANCE_BOT_PRODUCTION_TOKEN=unused-fixture',
      ].join('\n'),
    );

    expect(loadFinanceLocalSupportConfig()).toEqual({
      FINANCE_BOT_SUPPORT_USERNAME: '@example_help_bot',
      FINANCE_BOT_SUPPORT_TOKEN: 'fixture',
    });
  },
);

it.each([
  ['production', 'LOCAL'],
  ['development', 'PRODUCTION'],
])('skips the local file for %s with runtime %s', (environment, runtime) => {
  jest.replaceProperty(process, 'env', {
    NODE_ENV: environment,
    TELEGRAM_BOT_RUNTIME_ENVIRONMENT: runtime,
  });

  expect(loadFinanceLocalSupportConfig()).toEqual({});
  expect(readProfile).not.toHaveBeenCalled();
});
