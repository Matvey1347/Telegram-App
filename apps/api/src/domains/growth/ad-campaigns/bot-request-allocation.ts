export const DEFAULT_BOT_PLACEMENT_DURATION_MS = 86_400_000;

export const MAX_BOT_OBSERVATION_GAP_MS = 48 * 3_600_000;

export type CampaignWindow = {
  campaignId: string;
  startsAt: Date;
  endsAt: Date | null;
  views?: number | null;
  requests?: number | null;
};

function activeAt(window: CampaignWindow, at: number) {
  return window.startsAt.getTime() <= at && (!window.endsAt || window.endsAt.getTime() > at);
}

function exposureShare(at: number, own: CampaignWindow, rivals: CampaignWindow[]) {
  if (!activeAt(own, at)) return 0;
  const competing = rivals.filter((window) => activeAt(window, at));
  if (!competing.length) return 1;
  const active = [own, ...competing];
  const metric = active.filter((window) => (window.requests ?? 0) > 0).length >= 2 ? 'requests' : 'views';
  const measured = active.flatMap((window) => {
    const value = window[metric];
    return value != null && value > 0 ? [value] : [];
  });
  const fallback = measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : 1;
  const weight = (window: CampaignWindow) => {
    const value = window[metric];
    return value != null && value > 0 ? value : fallback;
  };
  const ownWeight = weight(own);
  return ownWeight / (ownWeight + competing.reduce((sum, window) => sum + weight(window), 0));
}

// Snapshot deltas have no individual request timestamps. Integrate the
// measured reach share over the segments with the same active placements.
export function overlapShare(from: Date, to: Date, own: CampaignWindow, windows: CampaignWindow[]) {
  const start = from.getTime(), end = to.getTime();
  const rivals = windows.filter((window) => window.campaignId !== own.campaignId);
  if (end <= start) return exposureShare(start, own, rivals);
  const boundaries = new Set([start, end]);
  for (const window of [own, ...rivals]) {
    for (const time of [window.startsAt.getTime(), window.endsAt?.getTime()]) {
      if (time != null && time > start && time < end) boundaries.add(time);
    }
  }
  const times = [...boundaries].sort((a, b) => a - b);
  let weighted = 0;
  for (let index = 1; index < times.length; index++) {
    const duration = times[index] - times[index - 1];
    weighted += duration * exposureShare(times[index - 1] + duration / 2, own, rivals);
  }
  return weighted / (end - start);
}
