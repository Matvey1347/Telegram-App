import { telegramOperationSignal } from './telegram-operation-signal';
import {
  withTelegramPublicationDeadline,
  withTelegramReadDeadline,
} from './telegram-publication-deadline';

describe('publication transport cancellation', () => {
  it('honors owner-scope cancellation before creating read or mutation transports', async () => {
    const controller = new AbortController();
    controller.abort();
    const create = jest.fn();
    await expect(telegramOperationSignal.run(controller.signal, () => withTelegramReadDeadline({ timeoutMs: 60_000, label: 'scope read', create, close: jest.fn(), run: jest.fn() }))).rejects.toThrow();
    await expect(telegramOperationSignal.run(controller.signal, () => withTelegramPublicationDeadline({ timeoutMs: 60_000, create, close: jest.fn(), run: jest.fn() }))).rejects.toThrow('requires reconciliation');
    expect(create).not.toHaveBeenCalled();
  });

  it('bounds stalled successful read cleanup without releasing transport ownership', async () => {
    jest.useFakeTimers();
    try {
      let release!: () => void;
      const close = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
      const pending = withTelegramReadDeadline({
        timeoutMs: 10_000,
        label: 'queue read',
        create: async () => ({}),
        close,
        run: async () => ['confirmed'],
      });
      const rejected = expect(pending).rejects.toThrow('session remains owned');
      await jest.advanceTimersByTimeAsync(5001);
      await rejected;
      expect(close).toHaveBeenCalledTimes(1);
      release();
    } finally { jest.useRealTimers(); }
  });

  it('does not send when a future schedule expires during media preparation', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const send = jest.fn();
    const close = jest.fn().mockResolvedValue(undefined);
    try {
      await expect(withTelegramPublicationDeadline({
        timeoutMs: 60_000,
        scheduleAt: new Date(2000),
        create: async () => ({}),
        close,
        run: async (_client, checkpoint) => {
          clock.mockReturnValue(2001);
          checkpoint();
          send();
        },
      })).rejects.toThrow('schedule time elapsed');
      expect(send).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); }
  });

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

  it('rejects a hung publication at its deadline and closes the session', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    await expect(
      withTelegramPublicationDeadline({
        timeoutMs: 5,
        create: () => Promise.resolve({}),
        close,
        run: () => new Promise(() => undefined),
      }),
    ).rejects.toThrow(
      'deadline reached; remote outcome requires reconciliation',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
