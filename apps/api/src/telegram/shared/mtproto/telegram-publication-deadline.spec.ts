import {
  withTelegramPublicationDeadline,
  withTelegramReadDeadline,
} from './telegram-publication-deadline';

describe('publication transport cancellation', () => {
  it('times out read operations while connecting and aborts the MTProto session', async () => {
    let observedSignal: AbortSignal | undefined;
    let release!: () => void;
    const create = jest.fn(
      (signal: AbortSignal) =>
        new Promise<object>((resolve) => {
          observedSignal = signal;
          release = () => resolve({});
        }),
    );
    const close = jest.fn().mockResolvedValue(undefined);
    await expect(
      withTelegramReadDeadline({
        timeoutMs: 5,
        label: 'scheduled queue read',
        create,
        close,
        run: jest.fn(),
      }),
    ).rejects.toThrow('scheduled queue read timed out after 5ms');
    expect(observedSignal?.aborted).toBe(true);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes an established read connection when the read itself times out', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    await expect(
      withTelegramReadDeadline({
        timeoutMs: 5,
        label: 'scheduled queue read',
        create: () => Promise.resolve({}),
        close,
        run: () => new Promise(() => undefined),
      }),
    ).rejects.toThrow('scheduled queue read timed out after 5ms');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('destroys the connection on cancellation and prevents a late followup send', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const close = jest.fn().mockResolvedValue(undefined);
    const send = jest.fn();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = withTelegramPublicationDeadline({
      timeoutMs: 60_000,
      signal: controller.signal,
      create: () => Promise.resolve({}),
      close,
      run: async (_client, checkpoint) => {
        started();
        await waiting;
        checkpoint();
        send();
      },
    });
    await ready;
    controller.abort();
    expect(close).toHaveBeenCalledTimes(1);
    release();
    await expect(pending).rejects.toThrow('requires reconciliation');
    expect(send).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not create a connection after caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const create = jest.fn();
    await expect(
      withTelegramPublicationDeadline({
        timeoutMs: 1,
        signal: controller.signal,
        create,
        close: jest.fn(),
        run: jest.fn(),
      }),
    ).rejects.toThrow('requires reconciliation');
    expect(create).not.toHaveBeenCalled();
  });
});
