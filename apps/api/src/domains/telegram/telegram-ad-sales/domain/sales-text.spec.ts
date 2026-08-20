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

  it('uses actual publication time plus duration and ten minute grace', () => {
    expect(calculateAdPlacementDeleteAt({
      publishedAt: new Date('2026-01-01T12:00:00.000Z'),
      deleteAfterHoursSnapshot: 24,
      isPermanentSnapshot: false,
    })?.toISOString()).toBe('2026-01-02T12:10:00.000Z');
  });

  it('does not create a deadline for permanent placements', () => {
    expect(calculateAdPlacementDeleteAt({
      publishedAt: new Date(), deleteAfterHoursSnapshot: 24, isPermanentSnapshot: true,
    })).toBeNull();
  });
});
