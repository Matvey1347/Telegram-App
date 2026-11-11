import { median } from '../../../common/analytics/telegram-post-expected-views';
import { visibleTelegramText } from './telegram-post-performance-math';

type PerformanceRow = {
  telegramPostId: string;
  origin: string;
  publishedAt: Date;
  views24h: number | null;
  views72h: number | null;
  views168h: number | null;
  score24h: number | null;
  scoreFinal: number | null;
  norm24h: number | null;
  normSampleSize: number;
  normReason: string | null;
  engagementPer1k24h: number | null;
  lengthBand: string;
  hasMedia: boolean;
  endsWithQuestion: boolean;
  publishHour: number;
  publishWeekday: number;
  excludedReason: string | null;
  manualClassification: string | null;
  telegramPost: { text: string | null; formattedText: string | null };
};

function bestScore(row: PerformanceRow) {
  if (Date.now() - row.publishedAt.getTime() >= 7 * 24 * 60 * 60 * 1000)
    return row.scoreFinal;
  return row.scoreFinal ?? row.score24h;
}

function summary(rows: PerformanceRow[]) {
  const scored = rows
    .map(bestScore)
    .filter(
      (score): score is number => score != null && Number.isFinite(score),
    );
  return {
    medianScore: scored.length >= 5 ? median(scored) : null,
    postCount: scored.length,
    lowSample: scored.length < 5,
  };
}

function groupBy<T extends string | number | boolean>(
  rows: PerformanceRow[],
  key: (row: PerformanceRow) => T,
) {
  const groups = new Map<T, PerformanceRow[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([value, grouped]) => ({ value, ...summary(grouped) }));
}

export function buildTelegramAiPostingPerformanceReadModel(
  rows: PerformanceRow[],
) {
  const latestNorm = [...rows].sort(
    (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
  )[0];
  const scoreable = rows.filter((row) => bestScore(row) != null);
  const originGroups = ['AI', 'SYSTEM_MANUAL', 'EXTERNAL'].map((origin) => ({
    origin,
    ...summary(rows.filter((row) => row.origin === origin)),
  }));
  const tableRows = [...rows]
    .sort((left, right) => {
      const leftScore = bestScore(left);
      const rightScore = bestScore(right);
      if (leftScore == null && rightScore == null)
        return right.publishedAt.getTime() - left.publishedAt.getTime();
      if (leftScore == null) return 1;
      if (rightScore == null) return -1;
      return rightScore - leftScore;
    })
    .slice(0, 200)
    .map((row) => ({
      telegramPostId: row.telegramPostId,
      publishedAt: row.publishedAt,
      origin: row.origin,
      textStart: visibleTelegramText(
        row.telegramPost.text ?? row.telegramPost.formattedText,
      ).slice(0, 80),
      views24h: row.views24h,
      views72h: row.views72h,
      views7d: row.views168h,
      score: bestScore(row),
      scoreWindow:
        row.scoreFinal != null ? 'final' : row.score24h != null ? '24h' : null,
      engagementPer1k24h: row.engagementPer1k24h,
      excludedReason: row.excludedReason,
      manualClassification: row.manualClassification,
      suggestedPromotion:
        /t\.me\/(?:addlist|\+|joinchat\/)|(?<![\p{L}\p{N}_])@[\p{L}\p{N}_]{4,}/iu.test(
          visibleTelegramText(row.telegramPost.text ?? row.telegramPost.formattedText),
        ),
    }));

  return {
    summary: {
      currentNorm24h: latestNorm?.norm24h ?? null,
      normSampleSize: latestNorm?.normSampleSize ?? 0,
      normReason: latestNorm?.normReason ?? 'NOT_ENOUGH_DATA',
      scoreablePosts: scoreable.length,
      origin: originGroups,
    },
    breakdowns: {
      lengthBand: groupBy(rows, (row) => row.lengthBand),
      media: groupBy(rows, (row) => row.hasMedia),
      endsWithQuestion: groupBy(rows, (row) => row.endsWithQuestion),
      hourBlocks: groupBy(rows, (row) => Math.floor(row.publishHour / 3) * 3),
      weekday: groupBy(rows, (row) => row.publishWeekday),
    },
    posts: tableRows,
  };
}
