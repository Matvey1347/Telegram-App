import { BadRequestException } from '@nestjs/common';
import {
  financeDebtIsOverdue,
  financeObligationDate,
  financeRecurrenceAnchor,
  financeRegularPaymentIsDue,
  nextFinanceOccurrence,
} from './finance-obligation-date';

describe('Finance obligation calendar dates', () => {
  it('stores profile-local dates at the correct DST-aware instant', () => {
    expect(financeObligationDate('2026-03-29', 'Europe/Warsaw')).toEqual(
      new Date('2026-03-28T23:00:00.000Z'),
    );
    expect(financeObligationDate('2026-03-30', 'Europe/Warsaw')).toEqual(
      new Date('2026-03-29T22:00:00.000Z'),
    );
  });

  it('keeps monthly and yearly anchors across short months', () => {
    expect(
      nextFinanceOccurrence({
        current: new Date('2026-01-30T23:00:00.000Z'),
        recurrence: 'MONTHLY',
        anchorDay: 31,
        anchorMonth: null,
        timezone: 'Europe/Warsaw',
      }),
    ).toEqual(new Date('2026-02-27T23:00:00.000Z'));
    expect(
      nextFinanceOccurrence({
        current: new Date('2024-02-29T00:00:00.000Z'),
        recurrence: 'YEARLY',
        anchorDay: 29,
        anchorMonth: 2,
        timezone: 'UTC',
      }),
    ).toEqual(new Date('2025-02-28T00:00:00.000Z'));
  });

  it('advances weekly occurrences by local calendar days across DST', () => {
    expect(
      nextFinanceOccurrence({
        current: new Date('2026-03-22T23:00:00.000Z'),
        recurrence: 'WEEKLY',
        anchorDay: 1,
        anchorMonth: null,
        timezone: 'Europe/Warsaw',
      }),
    ).toEqual(new Date('2026-03-29T22:00:00.000Z'));
    expect(financeRecurrenceAnchor('2026-03-23', 'WEEKLY')).toEqual({
      anchorDay: 1,
      anchorMonth: null,
    });
  });

  it('derives overdue and due state from the exact stored instant', () => {
    const now = new Date('2026-08-20T10:30:00.000Z');
    const sameLocalDay = new Date('2026-08-20T10:00:00.000Z');
    expect(financeDebtIsOverdue(sameLocalDay, 'Pacific/Kiritimati', now)).toBe(
      true,
    );
    expect(
      financeRegularPaymentIsDue(sameLocalDay, 'Pacific/Kiritimati', now),
    ).toBe(true);
  });

  it('rejects impossible local dates', () => {
    expect(() => financeObligationDate('2026-02-30', 'UTC')).toThrow(
      BadRequestException,
    );
  });
});
