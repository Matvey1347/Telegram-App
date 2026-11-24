import type { TelegramAiPostingRunProgress, TelegramAiPostingRunProgressRead } from '@telegram-system/shared';

export const AI_POSTING_STALE_RUN_MS = 30 * 60_000;
export const AI_POSTING_BACKGROUND_STALE_RUN_MS = 4 * 60_000;
export const AI_POSTING_BACKGROUND_RUN_FILTER = {
  publications: { path: ['background'], equals: true },
};
export class TelegramAiPostingRunStopped extends Error {}

export type TelegramAiPostingProgress = {
  stage: string;
  runId?: string;
  publicationIndex?: number;
  attempt?: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'MISSING';
  publication?: unknown;
};

export function createTelegramAiPostingProgress(
  count: number,
  runId: string,
  onProgress?: (event: TelegramAiPostingProgress, current: number, total: number) => void,
) {
  const snapshot: TelegramAiPostingRunProgress = {
    count, current: 0, total: 1 + count * 8, complete: 0, failed: false,
    publicationIndex: 0, processed: 0, stages: {},
  };
  const settledPublications = new Set<number>();
  const activeStages = new Map<number, { stage: string; attempt?: number }>();
  function emit(event: Omit<TelegramAiPostingProgress, 'runId'>) {
    const { stage, status, publicationIndex, attempt } = event;
    if (publicationIndex !== undefined) {
      if (stage === 'publication') settledPublications.add(publicationIndex);
      activeStages.delete(publicationIndex);
      if (status === 'RUNNING' && stage !== 'publication')
        activeStages.set(publicationIndex, { stage, attempt });
    }
    snapshot.processed = settledPublications.size;
    const active = [...activeStages.entries()].at(-1);
    const display = active?.[1] ?? {
      stage: stage === 'publication' && status === 'FAILED' ? 'slot-failed' : stage,
      attempt,
    };
    snapshot.stage = display.stage;
    if (display.attempt === undefined) delete snapshot.attempt;
    else snapshot.attempt = display.attempt;
    snapshot.publicationIndex = active?.[0] ?? publicationIndex ?? snapshot.publicationIndex;
    if (stage === 'planning') {
      for (let index = 0; index < count; index++)
        snapshot.stages[`${index}:planning`] = status;
    } else if (stage !== 'publication') {
      snapshot.stages[`${publicationIndex ?? 0}:${stage}`] = status;
    }
    if (status === 'COMPLETED' && stage === 'image') snapshot.complete++;
    if (status !== 'RUNNING' && stage !== 'publication') snapshot.current++;
    snapshot.failed = Object.values(snapshot.stages).includes('FAILED');
    onProgress?.({ ...event, runId }, snapshot.current, snapshot.total);
  }
  return { snapshot, emit };
}

export function serializeTelegramAiPostingRunProgress(run: {
  status: string;
  updatedAt?: Date;
  requestedCount: number;
  publications: unknown;
}): TelegramAiPostingRunProgressRead {
  if (run.status !== 'RUNNING') return { status: run.status };
  const stored = run.publications as { progress?: TelegramAiPostingRunProgress; background?: boolean; items?: unknown[] } | null;
  const staleAfter = stored?.background ? AI_POSTING_BACKGROUND_STALE_RUN_MS : AI_POSTING_STALE_RUN_MS;
  if (run.updatedAt && Date.now() - run.updatedAt.getTime() >= staleAfter)
    return { status: 'INTERRUPTED' };
  return {
    status: run.status,
    ...(run.updatedAt ? { updatedAt: run.updatedAt.toISOString() } : {}),
    ...(stored?.background ? { canStop: true, preparedCount: stored.items?.length ?? 0 } : {}),
    progress: stored?.progress ?? {
      ...createTelegramAiPostingProgress(run.requestedCount, '').snapshot,
      ...(stored?.background ? { stage: 'sources' } : {}),
    },
  };
}
