import type { TelegramAiPostingRunProgress, TelegramAiPostingRunProgressRead } from '@telegram-system/shared';

export const AI_POSTING_STALE_RUN_MS = 30 * 60_000;
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
  function emit(event: Omit<TelegramAiPostingProgress, 'runId'>) {
    const { stage, status, publicationIndex, attempt } = event;
    if (stage === 'publication') {
      snapshot.processed = Math.max(snapshot.processed ?? 0, (publicationIndex ?? 0) + 1);
    }
    snapshot.stage = stage === 'publication' && status === 'FAILED' ? 'slot-failed' : stage;
    if (attempt === undefined) delete snapshot.attempt;
    else snapshot.attempt = attempt;
    snapshot.publicationIndex = publicationIndex ?? snapshot.publicationIndex;
    if (stage === 'planning') {
      for (let index = 0; index < count; index++)
        snapshot.stages[`${index}:planning`] = status;
    } else if (stage !== 'publication') {
      snapshot.stages[`${snapshot.publicationIndex}:${stage}`] = status;
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
  if (run.updatedAt && Date.now() - run.updatedAt.getTime() >= AI_POSTING_STALE_RUN_MS)
    return { status: 'INTERRUPTED' };
  const stored = run.publications as { progress?: TelegramAiPostingRunProgress; background?: boolean; items?: unknown[] } | null;
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
