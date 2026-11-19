import { createHash } from 'node:crypto';

type ReleaseLease = () => void;

// A StringSession contains an MTProto authorization key. Telegram invalidates
// that key when concurrent connections present it from competing transports.
// Keep only a digest in the queue map so the session itself is never retained.
const sessionQueues = new Map<string, Promise<void>>();

function sessionQueueKey(session: string) {
  return createHash('sha256').update(session).digest('hex');
}

/**
 * Grants exclusive access to one persisted MTProto session until released.
 * This is process-local by design: it prevents concurrent work in an API
 * process without introducing polling, database work, or a permanent socket.
 */
export async function acquireTelegramMtprotoSessionLease(
  session: string | undefined,
  signal?: AbortSignal,
): Promise<ReleaseLease> {
  signal?.throwIfAborted();
  if (!session) return () => undefined;

  const key = sessionQueueKey(session);
  const previous = sessionQueues.get(key) ?? Promise.resolve();
  let resolveTurn!: () => void;
  const turn = new Promise<void>((resolve) => {
    resolveTurn = resolve;
  });
  const queued = previous.then(() => turn);
  sessionQueues.set(key, queued);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    resolveTurn();
    void queued.finally(() => {
      if (sessionQueues.get(key) === queued) sessionQueues.delete(key);
    });
  };
  try {
    // Cancellation skips only this waiter's turn. The predecessor still owns
    // the session until it closes; successors must remain behind it.
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener('abort', onAbort);
        const reason: unknown = signal?.reason;
        reject(
          reason instanceof Error
            ? reason
            : new Error('Telegram session wait cancelled'),
        );
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      void previous.then(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      });
      if (signal?.aborted) onAbort();
    });
    signal?.throwIfAborted();
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
