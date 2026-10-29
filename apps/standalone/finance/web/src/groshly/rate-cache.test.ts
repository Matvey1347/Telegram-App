import { beforeEach, describe, expect, it } from 'vitest';
import { readFinanceRateCache, writeFinanceRateCache } from './rate-cache';

const rates = { UAH: 1, PLN: 10.71, USD: 41.8, EUR: 48.2 };

describe('Finance rate cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('reuses the last confirmed live rates after a PWA reopen', () => {
    expect(writeFinanceRateCache({ rates, rateDate: '2026-10-28' })).toBe(true);
    expect(readFinanceRateCache()).toEqual({ rates, rateDate: '2026-10-28', rateSource: 'cached' });
  });

  it('rejects malformed rates instead of changing displayed balances', () => {
    expect(writeFinanceRateCache({ rates: { ...rates, PLN: 0 }, rateDate: '2026-10-28' })).toBe(false);
    expect(readFinanceRateCache()).toBeNull();
  });
});
