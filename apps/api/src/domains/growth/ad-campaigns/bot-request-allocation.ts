export type CampaignWindow = { campaignId: string; startsAt: Date; endsAt: Date | null };

// Snapshot deltas do not contain the individual request timestamps. Distribute
// each delta uniformly across its interval, sharing overlapping time equally.
export function overlapShare(from: Date, to: Date, ownId: string, windows: CampaignWindow[]) {
  const start = from.getTime(), end = to.getTime();
  if (end <= start) return 1;
  const boundaries = new Set([start, end]);
  for (const window of windows) {
    if (window.campaignId === ownId) continue;
    for (const time of [window.startsAt.getTime(), window.endsAt?.getTime()]) {
      if (time != null && time > start && time < end) boundaries.add(time);
    }
  }
  const times = [...boundaries].sort((a, b) => a - b);
  let weighted = 0;
  for (let index = 1; index < times.length; index++) {
    const midpoint = (times[index - 1] + times[index]) / 2;
    const rivals = windows.filter((window) => window.campaignId !== ownId && window.startsAt.getTime() <= midpoint && (!window.endsAt || window.endsAt.getTime() > midpoint)).length;
    weighted += (times[index] - times[index - 1]) / (rivals + 1);
  }
  return weighted / (end - start);
}
