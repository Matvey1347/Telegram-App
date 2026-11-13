/** Cancels the actual transport, and keeps ownership until work and close settle. */
export async function withTelegramPublicationDeadline<TClient, TResult>(input: {
  timeoutMs: number;
  signal?: AbortSignal;
  create(signal: AbortSignal): Promise<TClient>;
  close(client: TClient): Promise<void>;
  run(client: TClient, checkpoint: () => void): Promise<TResult>;
}) {
  const controller = new AbortController();
  let client: TClient | undefined;
  let closing: Promise<void> | undefined;
  const closeOnce = () =>
    client === undefined
      ? Promise.resolve()
      : (closing ??= input.close(client));
  const checkpoint = () => {
    if (controller.signal.aborted)
      throw new Error(
        'Telegram publication cancelled; remote outcome requires reconciliation',
      );
  };
  const onAbort = () => {
    void closeOnce().catch(() => undefined);
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const abortFromCaller = () => controller.abort();
  input.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (input.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  timer.unref?.();
  try {
    checkpoint();
    client = await input.create(controller.signal);
    checkpoint();
    const result = await input.run(client, checkpoint);
    checkpoint();
    return result;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    input.signal?.removeEventListener('abort', abortFromCaller);
    // Never release a publication claim merely because the deadline elapsed.
    await closeOnce();
  }
}

/** A read-operation waiting bound; this does not cancel a remote side effect. */
export async function waitTelegramOperationWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
