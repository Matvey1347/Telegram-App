import { withTelegramPublicationDeadline } from './telegram-publication-deadline';
import { TelegramClient } from 'telegram';
import { TelegramCrmMtprotoAdapter } from './telegram-crm-mtproto.adapter';
import {
  createTelegramMtprotoSession,
  closeTelegramMtprotoSession,
} from './telegram-mtproto-session.factory';

jest.mock('telegram', () => ({
  ...jest.requireActual<typeof import('telegram')>('telegram'),
  TelegramClient: jest.fn(),
}));
jest.mock('telegram/sessions', () => ({ StringSession: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fakeClient() {
  const physical = {
    connect: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    onError: undefined as ((error: Error) => Promise<void>) | undefined,
    handlers: [] as unknown[],
    addEventHandler(this: { handlers: unknown[] }, handler: unknown) {
      this.handlers.push(handler);
    },
    removeEventHandler(this: { handlers: unknown[] }, handler: unknown) {
      this.handlers = this.handlers.filter((value) => value !== handler);
    },
    getMessages: jest.fn().mockResolvedValue([{ id: 1 }]),
  };
  // Match GramJS: onError is setter-only, so reading it cannot notify CRM.
  let errorHandler: ((error: Error) => Promise<void>) | undefined;
  Object.defineProperty(physical, 'onError', {
    set: (handler: (error: Error) => Promise<void>) => {
      errorHandler = handler;
    },
  });
  Object.defineProperty(physical, 'errorHandler', { get: () => errorHandler });
  return physical;
}
const config = (session: string) => ({
  apiId: '123',
  apiHash: 'hash',
  session,
});

describe('MTProto factory shared physical connection', () => {
  it('serves a short queue read through the CRM connection without disconnecting its update handler', async () => {
    const physical = fakeClient();
    jest.mocked(TelegramClient).mockImplementation(() => physical as never);
    const crm = await createTelegramMtprotoSession(config('crm-short-read'));
    const handler = jest.fn();
    crm.addEventHandler(handler);
    const request = await createTelegramMtprotoSession(
      config('crm-short-read'),
    );
    await expect(request.getMessages('channel', { limit: 1 })).resolves.toEqual(
      [{ id: 1 }],
    );
    await closeTelegramMtprotoSession(request);
    await closeTelegramMtprotoSession(request);
    expect(physical.connect).toHaveBeenCalledTimes(1);
    expect(physical.destroy).not.toHaveBeenCalled();
    expect(physical.handlers).toEqual([handler]);
    await closeTelegramMtprotoSession(crm);
    expect(physical.destroy).toHaveBeenCalledTimes(1);
  });

  it('notifies CRM once on borrower abort, permits detach, and waits for destruction before reconnecting', async () => {
    const physical = fakeClient();
    const nextPhysical = fakeClient();
    const closing = deferred<void>();
    physical.destroy.mockReturnValue(closing.promise);
    jest
      .mocked(TelegramClient)
      .mockImplementationOnce(() => physical as never)
      .mockImplementationOnce(() => nextPhysical as never);
    const crm = await new TelegramCrmMtprotoAdapter().open(
      config('crm-borrower-abort'),
    );
    const crmErrors: Error[] = [];
    let crmClosing: Promise<void> | undefined;
    const detach = crm.onUpdate(jest.fn(), (error) => {
      crmErrors.push(error);
      detach();
      crmClosing = crm.close();
    });
    expect(physical.onError).toBeUndefined();
    const controller = new AbortController();
    const request = await createTelegramMtprotoSession(
      config('crm-borrower-abort'),
      controller.signal,
    );
    controller.abort();
    for (let index = 0; index < 5; index++) await Promise.resolve();
    expect(crmErrors).toHaveLength(1);
    expect(physical.handlers).toEqual([]);
    expect(() => request.getMessages('channel', {})).toThrow('closed');
    let reconnected = false;
    const reconnecting = createTelegramMtprotoSession(
      config('crm-borrower-abort'),
    ).then((client) => {
      reconnected = true;
      return client;
    });
    for (let index = 0; index < 5; index++) await Promise.resolve();
    expect(reconnected).toBe(false);
    expect(nextPhysical.connect).not.toHaveBeenCalled();
    closing.resolve();
    const replacement = await reconnecting;
    await crmClosing;
    await closeTelegramMtprotoSession(request);
    expect(nextPhysical.connect).toHaveBeenCalledTimes(1);
    await closeTelegramMtprotoSession(replacement);
  });

  it('closes the physical transport when an earlier deadline abort listener closes its borrower first', async () => {
    const physical = fakeClient();
    jest.mocked(TelegramClient).mockImplementation(() => physical as never);
    const crm = await createTelegramMtprotoSession(
      config('publication-abort-order'),
    );
    const controller = new AbortController();
    const started = deferred<void>();
    const running = deferred<void>();
    const publication = withTelegramPublicationDeadline({
      timeoutMs: 60_000,
      signal: controller.signal,
      create: (signal) =>
        createTelegramMtprotoSession(config('publication-abort-order'), signal),
      close: closeTelegramMtprotoSession,
      run: () => {
        started.resolve();
        return running.promise;
      },
    });
    const rejected = expect(publication).rejects.toThrow(
      'publication cancelled',
    );
    await started.promise;
    controller.abort();
    await rejected;
    expect(physical.destroy).toHaveBeenCalledTimes(1);
    expect(() => crm.getMessages('channel', {})).toThrow('closed');
    await closeTelegramMtprotoSession(crm);
    running.resolve();
  });

  it('cleans up a failed connection before retrying the same persisted session', async () => {
    const failed = fakeClient();
    failed.connect.mockRejectedValue(new Error('connection refused'));
    const next = fakeClient();
    jest
      .mocked(TelegramClient)
      .mockImplementationOnce(() => failed as never)
      .mockImplementationOnce(() => next as never);
    await expect(
      createTelegramMtprotoSession(config('failed-connect')),
    ).rejects.toThrow('connection refused');
    expect(failed.destroy).toHaveBeenCalledTimes(1);
    const retry = await createTelegramMtprotoSession(config('failed-connect'));
    expect(next.connect).toHaveBeenCalledTimes(1);
    await closeTelegramMtprotoSession(retry);
  });

  it('retains ownership across a cancelled connect that resolves late', async () => {
    const late = fakeClient();
    const connected = deferred<boolean>();
    late.connect.mockReturnValue(connected.promise);
    const next = fakeClient();
    jest
      .mocked(TelegramClient)
      .mockImplementationOnce(() => late as never)
      .mockImplementationOnce(() => next as never);
    const controller = new AbortController();
    const opening = createTelegramMtprotoSession(
      config('late-connect'),
      controller.signal,
    );
    for (let index = 0; index < 5; index++) await Promise.resolve();
    const cancelled = expect(opening).rejects.toThrow('cancel connect');
    controller.abort(new Error('cancel connect'));
    await cancelled;
    const replacement = createTelegramMtprotoSession(config('late-connect'));
    for (let index = 0; index < 5; index++) await Promise.resolve();
    expect(next.connect).not.toHaveBeenCalled();
    connected.resolve(true);
    const client = await replacement;
    // Abort interrupts the in-flight attempt; its late continuation closes
    // again before the physical session lease may pass to the replacement.
    expect(late.destroy).toHaveBeenCalledTimes(2);
    expect(next.connect).toHaveBeenCalledTimes(1);
    await closeTelegramMtprotoSession(client);
  });

  it('does not release or replace a physical session after unconfirmed shutdown', async () => {
    const physical = fakeClient();
    physical.destroy.mockRejectedValue(new Error('destroy failed'));
    physical.disconnect.mockRejectedValue(new Error('disconnect failed'));
    jest.mocked(TelegramClient).mockImplementation(() => physical as never);
    const client = await createTelegramMtprotoSession(config('failed-close'));
    await expect(closeTelegramMtprotoSession(client)).rejects.toThrow(
      'shutdown could not be confirmed',
    );
    await expect(
      createTelegramMtprotoSession(config('failed-close')),
    ).rejects.toThrow('shutdown could not be confirmed');
    expect(physical.connect).toHaveBeenCalledTimes(1);
    expect(physical.destroy).toHaveBeenCalledTimes(1);
  });
});
