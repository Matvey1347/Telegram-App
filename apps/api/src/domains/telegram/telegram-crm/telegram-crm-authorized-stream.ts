import { Observable, type Subscription } from 'rxjs';

/** Bounded event-driven authorization batches. Idle streams perform no authorization queries. */
export function authorizedCrmStream<T>(
  source: Observable<T>,
  authorize: (events: T[]) => Promise<T[]>,
  maxQueued = 512,
): Observable<T> {
  return new Observable<T>((observer) => {
    const state: { subscription?: Subscription } = {};
    let queue: T[] = [];
    let active = false;
    let stopped = false;
    const stop = () => {
      stopped = true;
      queue = [];
      state.subscription?.unsubscribe();
    };
    const flush = async () => {
      if (active || stopped) return;
      active = true;
      try {
        while (queue.length && !stopped) {
          const batch = queue.splice(0, 100);
          const permitted = await authorize(batch);
          if (!stopped) for (const event of permitted) observer.next(event);
        }
      } catch {
        stop();
        observer.complete();
      } finally {
        active = false;
      }
    };
    state.subscription = source.subscribe({
      next: (event) => {
        if (stopped) return;
        if (queue.length >= maxQueued) {
          stop();
          observer.error(new Error('CRM_STREAM_RECONCILIATION_REQUIRED'));
          return;
        }
        queue.push(event);
        if (!active)
          queueMicrotask(() => {
            void flush();
          });
      },
      error: (error: unknown) => {
        stop();
        observer.error(error);
      },
      complete: () => {
        stop();
        observer.complete();
      },
    });
    return stop;
  });
}
