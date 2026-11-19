export type TelegramHistoryCutoff = {
  postLimit?: number;
  beforeMessageId?: string | number | null;
  postsFrom: Date;
  beforeDate?: Date;
  onComplete?: (complete: boolean) => void;
};

/** Reports complete only when Telegram proves exhaustion or crosses the cutoff. */
export async function readTelegramHistoryFromCutoff<
  T extends { id?: unknown; date?: unknown },
>(
  readPage: (params: {
    limit: number;
    offsetId: number;
    offsetDate?: number;
  }) => Promise<T[]>,
  params: TelegramHistoryCutoff,
  options: {
    maxPostBackfillLimit: number;
    pageSize: number;
    toFiniteNumber: (value: unknown) => number | null;
    toTelegramDate: (value: unknown) => Date | null;
  },
) {
  const hardCap = Math.max(
    1,
    Math.min(options.maxPostBackfillLimit, params.postLimit || 100),
  );
  const pageSize = Math.min(options.pageSize, hardCap);
  let offsetId = options.toFiniteNumber(params.beforeMessageId) ?? 0;
  let processed = 0;
  let previousOldestId: number | null = null;
  const accepted: T[] = [];
  let complete = false;
  while (processed < hardCap) {
    const requested = Math.min(pageSize, hardCap - processed);
    const page = await readPage({
      limit: requested,
      offsetId,
      ...(processed === 0 && params.beforeDate
        ? { offsetDate: Math.floor(params.beforeDate.getTime() / 1000) }
        : {}),
    });
    if (!page.length) {
      complete = true;
      break;
    }
    processed += page.length;
    let reachedCutoff = false;
    for (const message of page) {
      if (!message?.id || !message?.date) continue;
      const postDate = options.toTelegramDate(message.date);
      if (!postDate) continue;
      if (postDate.getTime() < params.postsFrom.getTime()) {
        reachedCutoff = true;
        break;
      }
      accepted.push(message);
    }
    if (reachedCutoff || page.length < requested) {
      complete = true;
      break;
    }
    const pageIds = page
      .map((message) => options.toFiniteNumber(message?.id))
      .filter((value): value is number => value != null);
    const oldestId = pageIds.length > 0 ? Math.min(...pageIds) : null;
    if (oldestId == null || oldestId === previousOldestId) break;
    previousOldestId = oldestId;
    offsetId = oldestId;
  }
  params.onComplete?.(complete);
  return accepted;
}
