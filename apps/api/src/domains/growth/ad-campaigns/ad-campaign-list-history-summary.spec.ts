import { loadCampaignListHistorySummaries } from './ad-campaign-list-history-summary';

describe('loadCampaignListHistorySummaries', () => {
  it('loads all campaign peaks in one query and includes pending requests', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        peakJoinedCount: BigInt(100),
        peakRequestedCount: BigInt(15),
        peakTotalAttributed: BigInt(115),
      },
    ]);

    const result = await loadCampaignListHistorySummaries(
      { $queryRaw: queryRaw } as never,
      'workspace-1',
      [
        {
          id: 'campaign-1',
          inviteLinks: [
            { joinedCount: 80, requestedCount: 10 },
            { joinedCount: 5, requestedCount: 0 },
          ],
        },
      ],
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result.get('campaign-1')).toMatchObject({
      currentJoinedCount: 85,
      currentRequestedCount: 10,
      currentTotalAttributed: 95,
      peakTotalAttributed: 115,
      drawdownFromPeak: 20,
      drawdownPercent: 17.391304347826086,
      inviteLinksCount: 2,
    });
  });

  it('does not query history when the page has no invite links', async () => {
    const queryRaw = jest.fn();

    const result = await loadCampaignListHistorySummaries(
      { $queryRaw: queryRaw } as never,
      'workspace-1',
      [{ id: 'campaign-1', inviteLinks: [] }],
    );

    expect(result.size).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
