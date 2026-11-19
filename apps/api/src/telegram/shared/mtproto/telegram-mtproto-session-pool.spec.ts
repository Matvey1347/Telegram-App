import {
  TelegramMtprotoSessionPool,
  TelegramSessionCloseError,
} from './telegram-mtproto-session-pool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const physical = {
    onError: undefined as ((error: Error) => void) | undefined,
    handlers: [] as string[],
    addEventHandler(this: { handlers: string[] }, value: string) {
      this.handlers.push(value);
    },
    read(this: { handlers: string[] }): string[] {
      return this.handlers;
    },
    destroy: jest.fn().mockResolvedValue(undefined),
  };
  const open = jest.fn().mockResolvedValue(physical);
  const close = jest
    .fn()
    .mockImplementation(
      (client: typeof physical): Promise<void> =>
        client.destroy() as Promise<void>,
    );
  const pool = new TelegramMtprotoSessionPool<typeof physical>(close);
  return { physical, open, close, pool };
}

describe('shared physical Telegram session pool', () => {
  it('keeps a long-lived CRM client connected while short reads borrow its one transport', async () => {
    const h = harness();
    const crm = await h.pool.acquire('session', 'identity', h.open);
    crm.addEventHandler('crm-handler');
    const onError = jest.fn();
    crm.onError = onError;
    const request = await h.pool.acquire('session', 'identity', h.open);
    expect(request).not.toBe(crm);
    expect(request.read()).toEqual(['crm-handler']);
    expect(request.onError).toBe(onError);
    expect(h.open).toHaveBeenCalledTimes(1);
    await h.pool.close(request);
    await h.pool.close(request);
    expect(h.close).not.toHaveBeenCalled();
    expect(crm.read()).toEqual(['crm-handler']);
    expect(() => request.read()).toThrow('closed');
    await h.pool.close(crm);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent connects and closes only after both borrowers finish', async () => {
    const h = harness();
    const connecting = deferred<typeof h.physical>();
    h.open.mockReturnValue(connecting.promise);
    const first = h.pool.acquire('session', 'identity', h.open);
    const second = h.pool.acquire('session', 'identity', h.open);
    await Promise.resolve();
    expect(h.open).toHaveBeenCalledTimes(1);
    connecting.resolve(h.physical);
    const [one, two] = await Promise.all([first, second]);
    await h.pool.close(one);
    expect(h.close).not.toHaveBeenCalled();
    await h.pool.close(two);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('an acquired borrower abort destroys the transport, invalidates siblings, and fences replacements until close', async () => {
    const h = harness();
    const closing = deferred<void>();
    h.close.mockReturnValue(closing.promise);
    const crm = await h.pool.acquire('session', 'identity', h.open);
    const controller = new AbortController();
    const request = await h.pool.acquire(
      'session',
      'identity',
      h.open,
      controller.signal,
    );
    controller.abort();
    await Promise.resolve();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(() => crm.read()).toThrow('closed');
    expect(() => request.read()).toThrow('closed');
    let replacementReady = false;
    const replacement = h.pool
      .acquire('session', 'identity', h.open)
      .then((client) => {
        replacementReady = true;
        return client;
      });
    for (let index = 0; index < 5; index++) await Promise.resolve();
    expect(replacementReady).toBe(false);
    expect(h.open).toHaveBeenCalledTimes(1);
    closing.resolve();
    const next = await replacement;
    expect(h.open).toHaveBeenCalledTimes(2);
    await h.pool.close(request);
    await h.pool.close(crm);
    await h.pool.close(next);
  });

  it('a cancelled waiter does not evict a shared connect needed by another borrower', async () => {
    const h = harness();
    const connecting = deferred<typeof h.physical>();
    h.open.mockReturnValue(connecting.promise);
    const first = h.pool.acquire('session', 'identity', h.open);
    const controller = new AbortController();
    const second = h.pool.acquire(
      'session',
      'identity',
      h.open,
      controller.signal,
    );
    const rejected = expect(second).rejects.toThrow('read cancelled');
    controller.abort(new Error('read cancelled'));
    await rejected;
    expect(h.close).not.toHaveBeenCalled();
    connecting.resolve(h.physical);
    const crm = await first;
    expect(crm.read()).toEqual([]);
    expect(h.open).toHaveBeenCalledTimes(1);
    await h.pool.close(crm);
  });

  it('keeps a failed physical shutdown reserved and never opens a competing transport', async () => {
    const h = harness();
    const client = await h.pool.acquire('session', 'identity', h.open);
    h.close.mockRejectedValue(
      new TelegramSessionCloseError('shutdown unconfirmed'),
    );
    await expect(h.pool.close(client)).rejects.toThrow('shutdown unconfirmed');
    await expect(h.pool.acquire('session', 'identity', h.open)).rejects.toThrow(
      'shutdown unconfirmed',
    );
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('can retry a cleanly failed connect and isolates unpersisted login sessions', async () => {
    const h = harness();
    h.open.mockRejectedValueOnce(new Error('connect rejected'));
    await expect(h.pool.acquire('session', 'identity', h.open)).rejects.toThrow(
      'connect rejected',
    );
    const connected = await h.pool.acquire('session', 'identity', h.open);
    await h.pool.close(connected);
    const one = await h.pool.acquire(undefined, 'identity', h.open);
    const two = await h.pool.acquire(undefined, 'identity', h.open);
    expect(h.open).toHaveBeenCalledTimes(4);
    await h.pool.close(one);
    await h.pool.close(two);
  });

  it('rejects mismatched credentials without disturbing an active client', async () => {
    const h = harness();
    const client = await h.pool.acquire('session', 'identity', h.open);
    await expect(
      h.pool.acquire('session', 'other-identity', h.open),
    ).rejects.toThrow('credentials differ');
    expect(client.read()).toEqual([]);
    await h.pool.close(client);
  });
});
