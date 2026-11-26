import { overlapShare } from './bot-request-allocation';
const date = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour));
const own = { campaignId: 'a', startsAt: date(0), endsAt: date(4) };
describe('overlapShare', () => {
  it('splits a shared interval equally', () => {
    expect(overlapShare(date(0), date(4), own, [{ campaignId: 'b', startsAt: date(0), endsAt: date(4) }])).toBe(0.5);
  });
  it('only shares the overlapping part of an interval', () => {
    expect(overlapShare(date(0), date(4), own, [{ campaignId: 'b', startsAt: date(2), endsAt: date(4) }])).toBe(0.75);
  });
  it('attributes only the measured share within the placement window', () => {
    expect(overlapShare(date(0), date(8), { ...own, views: 100 }, [
      { campaignId: 'vp', startsAt: date(0), endsAt: date(4), views: 300 },
      { campaignId: 'own placement', startsAt: date(0), endsAt: date(4), views: 100 },
    ])).toBeCloseTo(0.1);
  });
  it('keeps the full value without an overlap', () => {
    expect(overlapShare(date(0), date(4), own, [{ campaignId: 'b', startsAt: date(4), endsAt: null }])).toBe(1);
  });
});
