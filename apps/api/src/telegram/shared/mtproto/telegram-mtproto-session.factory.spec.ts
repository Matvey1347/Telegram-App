import { acquireTelegramMtprotoSessionLease } from './telegram-mtproto-session-lease';
import {
  closeTelegramMtprotoSession,
  createTelegramMtprotoSession,
} from '@api/telegram/shared/mtproto/telegram-mtproto-session.factory';

describe('closeTelegramMtprotoSession', () => {
  it('destroys the transport without a redundant disconnect', async () => {
    const client = {
      destroy: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    await expect(
      closeTelegramMtprotoSession(client as never),
    ).resolves.toBeUndefined();
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('falls back to disconnect and keeps shutdown best-effort', async () => {
    const client = {
      destroy: jest.fn().mockRejectedValue(new Error('destroy failed')),
      disconnect: jest.fn().mockRejectedValue(new Error('disconnect failed')),
    };

    await expect(
      closeTelegramMtprotoSession(client as never),
    ).resolves.toBeUndefined();
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('createTelegramMtprotoSession admission cancellation', () => {
  it('aborts while waiting for an occupied session before constructing a transport', async () => {
    const session = 'factory-wait-cancellation';
    const release = await acquireTelegramMtprotoSessionLease(session);
    try {
      const controller = new AbortController();
      const pending = createTelegramMtprotoSession(
        { apiId: '1', apiHash: 'hash', session },
        controller.signal,
      );
      const rejection = expect(pending).rejects.toThrow('connection deadline');
      controller.abort(new Error('connection deadline'));
      await rejection;
    } finally {
      release();
    }
    const releaseNext = await acquireTelegramMtprotoSessionLease(session);
    releaseNext();
  });
});
