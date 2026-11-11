export type RhythmSample = {
  publishedAt: Date;
  publishHour: number;
  publishWeekday: number;
  origin: string;
  localDate?: string;
};

export function buildTelegramAiPostingRhythm(
  samples: RhythmSample[],
  now = new Date(),
  timezone = 'UTC',
) {
  const from = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const eligible = samples.filter(
    (sample) =>
      sample.publishedAt >= from &&
      sample.publishedAt <= now &&
      sample.origin !== 'AD' &&
      sample.origin !== 'MUTUAL_PROMO',
  );
  const dailyCounts = new Map<string, number>();
  for (let day = 0; day < 28; day++) {
    const date = new Date(from.getTime() + day * 24 * 60 * 60 * 1000);
    dailyCounts.set(
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date),
      0,
    );
  }
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const sample of eligible) {
    const key = sample.localDate ?? sample.publishedAt.toISOString().slice(0, 10);
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    if (sample.publishHour >= 0 && sample.publishHour <= 23)
      hourCounts[sample.publishHour]++;
  }
  const ordered = [...dailyCounts.values()].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const medianPerDay = (ordered[middle - 1] + ordered[middle]) / 2;
  const postsPerDay = Math.max(1, Math.min(20, Math.round(medianPerDay)));
  const slots = hourCounts
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, postsPerDay)
    .sort((a, b) => a.hour - b.hour)
    .map(({ hour }) => `${String(hour).padStart(2, '0')}:00`);
  const ads = samples.filter(
    (sample) =>
      sample.publishedAt >= from &&
      sample.publishedAt <= now &&
      sample.origin === 'AD',
  ).length;
  return {
    postsPerDay,
    slots,
    samplePosts: eligible.length,
    advertisingShare: samples.length ? ads / samples.length : 0,
  };
}
