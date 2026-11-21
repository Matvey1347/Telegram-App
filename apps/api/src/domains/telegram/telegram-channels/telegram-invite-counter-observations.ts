/** Aggregate metrics require a point at which both counters were observed. */
export function hasBothInviteCounters<T extends { joinedCount: number | null; requestedCount: number | null }>(
  row: T,
): row is T & { joinedCount: number; requestedCount: number } {
  return row.joinedCount != null && row.requestedCount != null;
}
