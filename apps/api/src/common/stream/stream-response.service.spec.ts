import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { StreamResponseService } from './stream-response.service';

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
});
