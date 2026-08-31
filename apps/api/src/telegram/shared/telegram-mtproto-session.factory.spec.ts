import { closeTelegramMtprotoSession } from './telegram-mtproto-session.factory';

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
