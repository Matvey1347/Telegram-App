import {
  calculateAdPlacementDeleteAt,
  roundSalesOfferPrice,
} from './sales-text';

describe('sales text presentation pricing', () => {
  it.each([
    ['113.5', '110'],
    ['116', '120'],
    ['109', '110'],
    ['110', '110'],
  ])('rounds %s to a clean ten-step offer price', (input, expected) => {
    expect(roundSalesOfferPrice(input).toFixed()).toBe(expected);
  });

  it.each([1, 24, 37, 48, 72, 120])(
    'keeps the post for %s hours plus the one-hour safety margin',
    (hours) => {
      const scheduledAt = new Date('2026-01-01T12:00:00.000Z');
      expect(
        calculateAdPlacementDeleteAt({
          scheduledAt,
          deleteAfterHoursSnapshot: hours,
          isPermanentSnapshot: false,
        })?.getTime(),
      ).toBe(scheduledAt.getTime() + (hours + 1) * 60 * 60 * 1000);
    },
  );

  it('does not create a deadline for permanent placements', () => {
    expect(
      calculateAdPlacementDeleteAt({
        scheduledAt: new Date(),
        deleteAfterHoursSnapshot: 24,
        isPermanentSnapshot: true,
      }),
    ).toBeNull();
  });

  it('starts the booked duration from a late Telegram publication', () => {
    const scheduledAt = new Date('2026-01-01T12:00:00.000Z');
    const publishedAt = new Date('2026-01-01T12:30:00.000Z');
    expect(
      calculateAdPlacementDeleteAt({
        scheduledAt,
        publishedAt,
        deleteAfterHoursSnapshot: 24,
        isPermanentSnapshot: false,
      })?.toISOString(),
    ).toBe('2026-01-02T13:30:00.000Z');
  });

  it('uses the real Telegram time when a linked post predates the booking', () => {
    const scheduledAt = new Date('2026-01-01T12:00:00.000Z');
    expect(
      calculateAdPlacementDeleteAt({
        scheduledAt,
        publishedAt: new Date('2026-01-01T10:00:00.000Z'),
        deleteAfterHoursSnapshot: 24,
        isPermanentSnapshot: false,
      })?.toISOString(),
    ).toBe('2026-01-02T11:00:00.000Z');
  });
});
