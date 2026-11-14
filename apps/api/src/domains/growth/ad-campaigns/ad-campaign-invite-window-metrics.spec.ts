import { campaignInviteWindowMetrics } from './ad-campaign-invite-window-metrics';

describe('campaignInviteWindowMetrics', () => {
  const links = [
    { id: 'one', joinedCount: 700, requestedCount: 90 },
    { id: 'two', joinedCount: 40, requestedCount: 3 },
  ];

  it('uses each selected interval independently and leaves other links unchanged', () => {
    expect(campaignInviteWindowMetrics(links, [{ inviteLinkId: 'one', joinedCount: 2, pendingCount: 5 }])).toEqual({ joined: 42, pending: 8 });
  });

  it('does not fall back to lifetime counts when Telegram did not return complete data', () => {
    expect(campaignInviteWindowMetrics(links, [{ inviteLinkId: 'one', joinedCount: null, pendingCount: 5 }])).toBeNull();
  });

  it('preserves an exact zero for a selected interval', () => {
    expect(campaignInviteWindowMetrics([links[0]], [{ inviteLinkId: 'one', joinedCount: 0, pendingCount: 0 }])).toEqual({ joined: 0, pending: 0 });
  });
});
