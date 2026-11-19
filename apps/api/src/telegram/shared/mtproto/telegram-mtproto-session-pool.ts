/** Marks an unconfirmed physical shutdown; its session must remain reserved. */
export class TelegramSessionCloseError extends Error {}

type InvalidationHandler = (error: Error) => void | Promise<void>;

type PoolEntry<T> = {
  key: string | symbol;
  identity: string;
  controller: AbortController;
  ready: Promise<T>;
  references: number;
  closing: boolean;
  closePromise?: Promise<void>;
  invalidationNotified?: boolean;
  invalidationHandlers: Set<InvalidationHandler>;
};

type Borrower<T> = {
  entry: PoolEntry<T>;
  closed: boolean;
  signal?: AbortSignal;
  invalidationHandlers: Set<InvalidationHandler>;
  removeAbort: () => void;
};

/** Shares one physical transport while retaining independent caller lifetimes. */
export class TelegramMtprotoSessionPool<T extends object> {
  private readonly entries = new Map<string | symbol, PoolEntry<T>>();
  private readonly borrowers = new WeakMap<object, Borrower<T>>();

  constructor(private readonly closePhysical: (client: T) => Promise<void>) {}

  subscribeInvalidation(client: T, handler: InvalidationHandler): () => void {
    const borrower = this.borrowers.get(client);
    if (!borrower || borrower.closed) return () => undefined;
    const listener: InvalidationHandler = (error) => handler(error);
    borrower.invalidationHandlers.add(listener);
    borrower.entry.invalidationHandlers.add(listener);
    return () => {
      borrower.invalidationHandlers.delete(listener);
      borrower.entry.invalidationHandlers.delete(listener);
    };
  }

  private async wait<R>(promise: Promise<R>, signal?: AbortSignal): Promise<R> {
    signal?.throwIfAborted();
    if (!signal) return promise;
    return new Promise<R>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        const reason: unknown = signal.reason;
        const error =
          reason instanceof Error
            ? reason
            : Object.assign(new Error('Telegram session wait cancelled'), {
                name: 'AbortError',
              });
        reject(error);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      void promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(
            error instanceof Error
              ? error
              : new Error('Telegram session unavailable'),
          );
        },
      );
      if (signal.aborted) onAbort();
    });
  }

  private closeEntry(entry: PoolEntry<T>, reason?: Error): Promise<void> {
    if (entry.closePromise) return entry.closePromise;
    entry.closing = true;
    entry.controller.abort();
    entry.closePromise = entry.ready
      .then(
        (client) => this.closePhysical(client),
        (error: unknown) => {
          if (error instanceof TelegramSessionCloseError) throw error;
        },
      )
      .then(() => {
        if (this.entries.get(entry.key) === entry)
          this.entries.delete(entry.key);
      });
    if (reason && !entry.invalidationNotified) {
      entry.invalidationNotified = true;
      const handlers = [...entry.invalidationHandlers];
      for (const handler of handlers)
        void Promise.resolve()
          .then(() => handler(reason))
          .catch(() => undefined);
    }
    return entry.closePromise;
  }

  async acquire(
    key: string | undefined,
    identity: string,
    open: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    const entryKey = key ?? Symbol('unpersisted Telegram session');
    let entry = this.entries.get(entryKey);
    if (entry?.closing) {
      await this.wait(this.closeEntry(entry), signal);
      return this.acquire(key, identity, open, signal);
    }
    if (entry && entry.identity !== identity)
      throw new Error(
        'Telegram session credentials differ from the active connection',
      );
    if (!entry) {
      const controller = new AbortController();
      entry = {
        key: entryKey,
        identity,
        controller,
        references: 0,
        closing: false,
        invalidationHandlers: new Set(),
        ready: Promise.resolve().then(() => open(controller.signal)),
      };
      this.entries.set(entryKey, entry);
      const created = entry;
      // A failed connect may be retried only after open confirmed cleanup.
      void created.ready.catch((error: unknown) => {
        if (error instanceof TelegramSessionCloseError) {
          created.closing = true;
        } else if (this.entries.get(entryKey) === created) {
          this.entries.delete(entryKey);
        }
      });
    }
    entry.references += 1;
    const borrowedEntry = entry;
    let client: T;
    try {
      client = await this.wait(entry.ready, signal);
      signal?.throwIfAborted();
      if (entry.closing) throw new Error('Telegram session is closing');
    } catch (error) {
      entry.references -= 1;
      if (!entry.references) void this.closeEntry(entry).catch(() => undefined);
      throw error;
    }
    const borrower: Borrower<T> = {
      entry,
      closed: false,
      signal,
      invalidationHandlers: new Set(),
      removeAbort: () => undefined,
    };
    const methods = new Map<PropertyKey, unknown>();
    const proxy = new Proxy(client, {
      get: (target, property) => {
        if (property === 'destroy' || property === 'disconnect')
          return () => this.close(proxy);
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== 'function' || property === 'onError') return value;
        if (!methods.has(property))
          methods.set(property, (...args: unknown[]) => {
            if (
              (borrower.closed || borrowedEntry.closing) &&
              property !== 'removeEventHandler'
            )
              throw new Error('Telegram session borrower is closed');
            return Reflect.apply(value, target, args) as unknown;
          });
        return methods.get(property);
      },
      set: (target, property, value: unknown) => {
        if (
          (borrower.closed || borrowedEntry.closing) &&
          property !== 'onError'
        )
          throw new Error('Telegram session borrower is closed');
        return Reflect.set(target, property, value, target);
      },
    });
    this.borrowers.set(proxy, borrower);
    const onAbort = () => {
      // A deadline cancels actual transport work, including requests already
      // issued by this view. Every sibling view is invalidated together.
      void this.closeEntry(
        borrowedEntry,
        new Error(
          'Telegram shared transport was cancelled; reconnect required',
        ),
      ).catch(() => undefined);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    borrower.removeAbort = () => signal?.removeEventListener('abort', onAbort);
    if (signal?.aborted) {
      onAbort();
      await this.close(proxy);
      signal.throwIfAborted();
    }
    return proxy;
  }

  /** Returns false for external clients so the factory can close them directly. */
  async close(client: T): Promise<boolean> {
    const borrower = this.borrowers.get(client);
    if (!borrower) return false;
    if (!borrower.closed) {
      // Deadline wrappers may close synchronously in an earlier abort listener.
      // Observe the signal before removing ours, or a shared live transport
      // would survive cancellation simply because another borrower remains.
      if (borrower.signal?.aborted)
        void this.closeEntry(
          borrower.entry,
          new Error(
            'Telegram shared transport was cancelled; reconnect required',
          ),
        ).catch(() => undefined);
      borrower.closed = true;
      borrower.removeAbort();
      for (const handler of borrower.invalidationHandlers)
        borrower.entry.invalidationHandlers.delete(handler);
      borrower.invalidationHandlers.clear();
      borrower.entry.references -= 1;
    }
    if (!borrower.entry.references || borrower.entry.closing)
      await this.closeEntry(borrower.entry);
    return true;
  }
}
