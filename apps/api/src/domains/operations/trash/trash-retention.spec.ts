import { trashDaysRemaining, trashExpiresAt } from './trash-retention';

describe('trash retention', () => {
  it('expires an item exactly 90 days after deletion', () => {
    const deletedAt = new Date('2026-08-27T10:00:00.000Z');
    expect(trashExpiresAt(deletedAt).toISOString()).toBe(
      '2026-11-25T10:00:00.000Z',
    );
  });

  it('orders urgency using whole remaining days without negative values', () => {
    const now = new Date('2026-11-24T11:00:00.000Z');
    expect(trashDaysRemaining(new Date('2026-08-27T10:00:00.000Z'), now)).toBe(
      1,
    );
    expect(trashDaysRemaining(new Date('2026-01-01T00:00:00.000Z'), now)).toBe(
      0,
    );
  });
});
