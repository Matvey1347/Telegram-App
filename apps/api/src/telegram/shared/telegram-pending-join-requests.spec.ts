import { Api } from 'telegram';
import { livePending } from './telegram-pending-join-requests';

describe('fetchPendingJoinRequestsCount', () => {
  it('reads the live requested-importers count, including zero after approval', async () => {
    const invoke = jest.fn().mockResolvedValue({ count: 0, importers: [] });

    await expect(
      livePending(
        { invoke } as never,
        new Api.InputPeerChannel({
          channelId: '123' as never,
          accessHash: '456' as never,
        }),
        { requestsPending: 302 },
      ),
    ).resolves.toBe(0);

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: true,
        offsetDate: 0,
        limit: 1,
      }),
    );
  });

  it('keeps the reported count when Telegram returns an invalid live count', async () => {
    const invoke = jest.fn().mockResolvedValue({ count: 'invalid' });

    await expect(
      livePending(
        { invoke } as never,
        new Api.InputPeerChannel({
          channelId: '123' as never,
          accessHash: '456' as never,
        }),
        { requestsPending: 7 },
      ),
    ).resolves.toBe(7);
  });
});
