import { TelegramLeadRefreshService } from './lead-refresh.service';

describe('TelegramLeadRefreshService', () => {
  it('streams each source after paging beyond 50 posts and continues after a failure', async () => {
    const first = { id: 'one', accountId: 'a', channelId: 'c', monitoringState: 'ACTIVE', metrics: {} };
    const second = { ...first, id: 'two' };
    const third = { ...first, id: 'three', monitoringState: 'DISABLED' };
    const read = { sources: jest.fn().mockResolvedValueOnce({ items: [first], hasMore: true, nextCursor: 'next' }).mockResolvedValueOnce({ items: [second, third], hasMore: false }), source: jest.fn().mockResolvedValue(first) };
    const scan = jest.fn().mockResolvedValueOnce({ received: 50, hasMore: true, nextBeforeId: 100 }).mockResolvedValueOnce({ received: 12, hasMore: false }).mockRejectedValueOnce(new Error('access lost'));
    const service = new TelegramLeadRefreshService(read as never, { scan } as never);
    const progress = jest.fn();
    const result = await service.run('user', progress, new AbortController().signal);
    expect(result).toEqual({ updated: 1, failed: 1, skipped: 1 });
    expect(scan).toHaveBeenNthCalledWith(2, 'user', 'one', { limit: 50, beforeId: 100 });
    expect(progress.mock.calls.map(([item]) => [item.status, item.scanned])).toEqual([['updated', 62], ['failed', 0], ['skipped', 0]]);
    expect(progress.mock.calls.map(([, current, total]) => [current, total])).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});
