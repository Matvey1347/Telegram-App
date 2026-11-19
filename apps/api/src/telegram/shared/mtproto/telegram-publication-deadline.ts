/** Cancels the actual transport, and keeps ownership until work and close settle. */
export async function withTelegramPublicationDeadline<TClient, TResult>(input: {
  timeoutMs: number;
  signal?: AbortSignal;
  scheduleAt?: Date | null;
  create(signal: AbortSignal): Promise<TClient>;
  close(client: TClient): Promise<void>;
  run(client: TClient, checkpoint: () => void): Promise<TResult>;
}) {
  const controller = new AbortController();
  let client: TClient | undefined;
  let closing: Promise<void> | undefined;
  let deadlineReached = false;
  const closeOnce = () =>
    client === undefined
      ? Promise.resolve()
      : (closing ??= input.close(client));
  const checkpoint = () => {
    if (input.scheduleAt && input.scheduleAt.getTime() <= Date.now())
      throw new Error(
        'Telegram schedule time elapsed; reconcile the remote outcome before rescheduling',
      );
    if (controller.signal.aborted)
      throw new Error(
        deadlineReached
          ? 'Telegram publication deadline reached; remote outcome requires reconciliation'
          : 'Telegram publication cancelled; remote outcome requires reconciliation',
      );
  };
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const abortError = () =>
    new Error(
      deadlineReached
        ? 'Telegram publication deadline reached; remote outcome requires reconciliation'
        : 'Telegram publication cancelled; remote outcome requires reconciliation',
    );
  const onAbort = () => {
    rejectDeadline(abortError());
    void closeOnce().catch(() => undefined);
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const abortFromCaller = () => {
    controller.abort();
  };
  input.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (input.signal?.aborted) abortFromCaller();
  const timer = setTimeout(() => {
    deadlineReached = true;
    controller.abort();
  }, input.timeoutMs);
  timer.unref?.();
  const operation = controller.signal.aborted
    ? Promise.reject<TResult>(abortError())
    : (async () => {
        checkpoint();
        client = await input.create(controller.signal);
        checkpoint();
        const result = await input.run(client, checkpoint);
        checkpoint();
        return result;
      })();
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    input.signal?.removeEventListener('abort', abortFromCaller);
    // Never release a publication claim merely because the deadline elapsed.
    // A stalled MTProto destroy() must not keep the API request alive forever.
    // The session factory releases its lease in its own finally path.
    await Promise.race([
      closeOnce(),
      new Promise<void>((resolve) => {
        const closeTimer = setTimeout(resolve, 5_000);
        closeTimer.unref?.();
      }),
    ]);
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

/** Bounds read-only MTProto work, including session connection and entity resolution. */
export async function withTelegramReadDeadline<TClient, TResult>(input: {
  timeoutMs: number;
  label: string;
  create(signal: AbortSignal): Promise<TClient>;
  close(client: TClient): Promise<void>;
  run(client: TClient): Promise<TResult>;
}) {
  const controller = new AbortController();
  let client: TClient | undefined;
  let closePromise: Promise<void> | undefined;
  const closeOnce = () =>
    client === undefined
      ? Promise.resolve()
      : (closePromise ??= input.close(client));
  const timeoutError = () =>
    new Error(`${input.label} timed out after ${input.timeoutMs}ms`);
  let rejectTimeout!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const onAbort = () => {
    rejectTimeout(timeoutError());
    void closeOnce().catch(() => undefined);
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  timer.unref?.();
  const operation = (async () => {
    client = await input.create(controller.signal);
    if (controller.signal.aborted) {
      await closeOnce();
      throw timeoutError();
    }
    return input.run(client);
  })();
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    if (!controller.signal.aborted)
      await waitTelegramOperationWithTimeout(
        closeOnce(),
        5_000,
        `${input.label} transport cleanup (session remains owned)`,
      );
  }
}
