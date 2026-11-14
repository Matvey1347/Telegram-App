import { overlapShare } from './bot-request-allocation';
const date = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour));
describe('overlapShare', () => {
  it('splits a shared interval equally', () => {
    expect(overlapShare(date(0), date(4), 'a', [{ campaignId: 'b', startsAt: date(0), endsAt: date(4) }])).toBe(0.5);
  });
  it('only shares the overlapping part of an interval', () => {
    expect(overlapShare(date(0), date(4), 'a', [{ campaignId: 'b', startsAt: date(2), endsAt: date(4) }])).toBe(0.75);
  });
  it('keeps the full value without an overlap', () => {
    expect(overlapShare(date(0), date(4), 'a', [{ campaignId: 'b', startsAt: date(4), endsAt: null }])).toBe(1);
  });
});
