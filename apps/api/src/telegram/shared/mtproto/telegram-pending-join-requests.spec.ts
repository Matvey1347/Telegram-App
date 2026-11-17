import { Api } from 'telegram';
import { livePending } from '@api/telegram/shared/mtproto/telegram-pending-join-requests';

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

  it.each([0, undefined])('queries live queue even when channel metadata reports %s', async (requestsPending) => {
    const invoke = jest.fn().mockResolvedValue({ count: 42 });
    await expect(livePending({ invoke } as never, {} as never, { requestsPending })).resolves.toBe(42);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('does not turn a failed or missing live response into a verified zero', async () => {
    await expect(livePending({ invoke: jest.fn().mockRejectedValue(new Error('CHAT_ADMIN_REQUIRED')) } as never, {} as never, { requestsPending: 0 })).resolves.toBeNull();
    await expect(livePending({ invoke: jest.fn().mockResolvedValue({}) } as never, {} as never, null)).resolves.toBeNull();
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
