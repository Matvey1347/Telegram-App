import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportProgressItem,
} from '@telegram-system/shared';

export type TelegramUnifiedImportProgressCallback = (
  item: TelegramUnifiedImportProgressItem,
  current: number,
  total: number,
) => void;

export function countUnifiedImportOperations(
  manifest: TelegramUnifiedImportManifest,
) {
  return (
    (manifest.groups?.length ?? 0) +
    (manifest.hypotheses?.length ?? 0) +
    (manifest.posts?.length ?? 0) +
    (manifest.schedule?.length ?? 0) +
    (manifest.delete?.groups?.length ?? 0) +
    (manifest.delete?.hypotheses?.length ?? 0) +
    (manifest.delete?.posts?.length ?? 0)
  );
}

export class TelegramUnifiedImportProgressReporter {
  private current = 0;
  private readonly total: number;

  constructor(
    manifest: TelegramUnifiedImportManifest,
    private readonly callback?: TelegramUnifiedImportProgressCallback,
    private readonly signal?: AbortSignal,
  ) {
    this.total = countUnifiedImportOperations(manifest);
  }

  phase(
    section: TelegramUnifiedImportProgressItem['section'],
    status: 'started' | 'completed',
  ) {
    this.assertActive();
    const label = section === 'deletions' ? 'deletions' : section;
    this.callback?.(
      {
        kind: 'phase',
        section,
        status,
        message:
          status === 'started' ? `Processing ${label}` : `Finished ${label}`,
      },
      this.current,
      this.total,
    );
  }

  operation(item: Omit<TelegramUnifiedImportProgressItem, 'kind'>) {
    this.current += 1;
    this.callback?.({ kind: 'operation', ...item }, this.current, this.total);
    this.assertActive();
  }

  assertActive() {
    if (!this.signal?.aborted) return;
    const error = new Error('Unified import was cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

export function reportUnifiedImportOperation(
  progress: TelegramUnifiedImportProgressReporter,
  section: TelegramUnifiedImportProgressItem['section'],
  action: TelegramUnifiedImportProgressItem['action'],
  ref: string,
  label: string,
  status: 'success' | 'failed' | 'skipped',
  error?: string,
) {
  progress.operation({
    section,
    action,
    ref,
    label,
    status,
    message:
      status === 'failed'
        ? `${action} ${label} failed: ${error}`
        : status === 'skipped'
          ? `Skipped ${label}`
          : `${action} ${label}`,
  });
}
