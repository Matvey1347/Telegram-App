import { describe, expect, it } from 'vitest';
import { consumerFinanceKeys } from './query-keys';

describe('consumerFinanceKeys', () => {
  it('keeps history caches distinct for filter combinations', () => {
    expect(consumerFinanceKeys.transactions('bot-1', { limit: 30, type: 'EXPENSE' }))
      .not.toEqual(consumerFinanceKeys.transactions('bot-1', { limit: 30, type: 'INCOME' }));
  });

  it('keeps derived finance resources in dedicated key families', () => {
    expect(consumerFinanceKeys.limits('bot-1')).toEqual(['consumer-finance', 'bot-1', 'limits']);
    expect(consumerFinanceKeys.reminders('bot-1')).toEqual(['consumer-finance', 'bot-1', 'reminders']);
    expect(consumerFinanceKeys.settings('bot-1')).toEqual(['consumer-finance', 'bot-1', 'settings']);
    expect(consumerFinanceKeys.browserLoginConfig('bot-1')).toEqual(['consumer-finance', 'bot-1', 'browser-login-config']);
  });

  it('keeps analytics periods in separate cache entries', () => {
    expect(consumerFinanceKeys.analytics('bot-1', { period: 'CURRENT_MONTH' }))
      .not.toEqual(consumerFinanceKeys.analytics('bot-1', { period: 'PREVIOUS_MONTH' }));
  });
});
