import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { StreamResponseService } from './stream-response.service';
import { telegramPostsBadRequest } from '../../domains/telegram/telegram-channels/telegram-posts.errors';

function responseHarness() {
  const events = new EventEmitter();
  const writes: string[] = [];
  const response = Object.assign(events, {
    destroyed: false,
    writableEnded: false,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    flush: jest.fn(),
    write: jest.fn((value: string) => writes.push(value)),
    end: jest.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  }) as unknown as Response;
  return { response, writes };
}

describe('StreamResponseService', () => {
  const createService = () =>
    new StreamResponseService(
      { writeStructured: jest.fn() } as never,
      { get: jest.fn().mockReturnValue({ correlationId: 'corr-1' }) } as never,
    );

  it('writes progress and a complete event for a finished action', async () => {
    const { response, writes } = responseHarness();

    await createService().stream(response, {
      eventPrefix: 'test.stream',
      action: async (onProgress) => {
        onProgress({ id: 1 }, 1, 1);
        return { ok: true };
      },
    });

    expect(writes.join('')).toContain('"type":"progress"');
    expect(writes.join('')).toContain('"type":"complete"');
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('aborts server work when the client closes the response', async () => {
    const { response, writes } = responseHarness();
    let receivedSignal: AbortSignal | undefined;
    const stream = createService().stream(response, {
      eventPrefix: 'test.stream',
      action: async (_onProgress, signal) => {
        receivedSignal = signal;
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        return { stopped: true };
      },
    });

    (response as unknown as { destroyed: boolean }).destroyed = true;
    (response as unknown as EventEmitter).emit('close');
    await stream;

    expect(receivedSignal?.aborted).toBe(true);
    expect(writes.join('')).not.toContain('"type":"complete"');
    expect(response.end).not.toHaveBeenCalled();
  });

  it('does not persist or stream a normal client-abort error', async () => {
    const { response, writes } = responseHarness();
    const applicationLogger = { writeStructured: jest.fn() };
    const service = new StreamResponseService(
      applicationLogger as never,
      { get: jest.fn().mockReturnValue({ correlationId: 'corr-1' }) } as never,
    );
    const stream = service.stream(response, {
      eventPrefix: 'test.abort',
      action: async (_onProgress, signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    });

    (response as unknown as { destroyed: boolean }).destroyed = true;
    (response as unknown as EventEmitter).emit('close');
    await stream;

    expect(writes.join('')).not.toContain('"type":"error"');
    expect(applicationLogger.writeStructured).toHaveBeenCalledTimes(1);
    expect(applicationLogger.writeStructured).not.toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
    );
  });

  it('can disable persisted lifecycle logs for credential-bearing streams', async () => {
    const { response } = responseHarness();
    const applicationLogger = { writeStructured: jest.fn() };
    const service = new StreamResponseService(
      applicationLogger as never,
      { get: jest.fn().mockReturnValue({ correlationId: 'corr-1' }) } as never,
    );

    await service.stream(response, {
      eventPrefix: 'credential.stream',
      persistLifecycleLogs: false,
      action: async () => ({ ok: true }),
    });

    expect(applicationLogger.writeStructured).not.toHaveBeenCalled();
  });

  it('preserves machine error codes and parameters in stream errors', async () => {
    const { response, writes } = responseHarness();

    await createService().stream(response, {
      eventPrefix: 'test.structured-error',
      action: async () => {
        throw telegramPostsBadRequest(
          'TELEGRAM_POST_INVALID_TIMEZONE',
          'Invalid timezone',
          { timezone: 'Moon/Base' },
        );
      },
    });

    expect(writes.join('')).toContain(
      '"code":"TELEGRAM_POST_INVALID_TIMEZONE"',
    );
    expect(writes.join('')).toContain('"timezone":"Moon/Base"');
  });
});
