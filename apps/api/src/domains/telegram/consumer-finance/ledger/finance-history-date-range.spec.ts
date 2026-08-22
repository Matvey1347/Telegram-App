import { BadRequestException } from '@nestjs/common';
import { financeAnalyticsDateRange } from './finance-history-date-range';

describe('financeAnalyticsDateRange', () => {
  it('uses the profile calendar month at the UTC+14 boundary', () => {
    const range = financeAnalyticsDateRange(
      { period: 'CURRENT_MONTH' },
      'Pacific/Kiritimati',
      new Date('2026-01-31T10:30:00.000Z'),
    );

    expect(range.from.toISOString()).toBe('2026-01-31T10:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('preserves local-midnight month boundaries across daylight saving time', () => {
    const range = financeAnalyticsDateRange(
      { period: 'LAST_3_MONTHS' },
      'Europe/Warsaw',
      new Date('2026-04-15T12:00:00.000Z'),
    );

    expect(range.from.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-04-30T22:00:00.000Z');
  });

  it('treats custom calendar dates like history and rejects invalid input', () => {
    expect(
      financeAnalyticsDateRange(
        { period: 'CUSTOM', from: '2026-03-29', to: '2026-03-29' },
        'Europe/Warsaw',
      ),
    ).toEqual({
      from: new Date('2026-03-28T23:00:00.000Z'),
      to: new Date('2026-03-29T22:00:00.000Z'),
    });
    expect(() =>
      financeAnalyticsDateRange(
        { period: 'CUSTOM', from: 'not-a-date', to: '2026-04-01' },
        'UTC',
      ),
    ).toThrow(BadRequestException);
  });
});
