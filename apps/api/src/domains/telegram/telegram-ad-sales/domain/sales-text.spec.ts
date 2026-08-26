import { calculateAdPlacementDeleteAt, roundSalesOfferPrice } from './sales-text';

describe('sales text presentation pricing', () => {
  it.each([
    ['113.5', '110'],
    ['116', '120'],
    ['109', '110'],
    ['110', '110'],
  ])('rounds %s to a clean ten-step offer price', (input, expected) => {
    expect(roundSalesOfferPrice(input).toFixed()).toBe(expected);
  });

  it.each([24, 48, 72])('deletes exactly %s hours after actual publication', (hours) => {
    const publishedAt = new Date('2026-01-01T12:00:00.000Z');
    expect(calculateAdPlacementDeleteAt({
      publishedAt,
      deleteAfterHoursSnapshot: hours,
      isPermanentSnapshot: false,
    })?.getTime()).toBe(publishedAt.getTime() + hours * 60 * 60 * 1000);
  });

  it('does not create a deadline for permanent placements', () => {
    expect(calculateAdPlacementDeleteAt({
      publishedAt: new Date(), deleteAfterHoursSnapshot: 24, isPermanentSnapshot: true,
    })).toBeNull();
  });
});
