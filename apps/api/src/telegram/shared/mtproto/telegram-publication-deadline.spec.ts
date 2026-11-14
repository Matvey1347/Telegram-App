import { withTelegramPublicationDeadline } from './telegram-publication-deadline';

describe('publication transport cancellation', () => {
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
      create: async () => ({}),
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
