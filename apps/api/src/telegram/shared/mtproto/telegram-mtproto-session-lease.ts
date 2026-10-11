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
): Promise<ReleaseLease> {
  if (!session) return () => undefined;

  const key = sessionQueueKey(session);
  const previous = sessionQueues.get(key) ?? Promise.resolve();
  let resolveTurn!: () => void;
  const turn = new Promise<void>((resolve) => {
    resolveTurn = resolve;
  });
  const queued = previous.then(() => turn);
  sessionQueues.set(key, queued);
  await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    resolveTurn();
    void queued.finally(() => {
      if (sessionQueues.get(key) === queued) sessionQueues.delete(key);
    });
  };
}
