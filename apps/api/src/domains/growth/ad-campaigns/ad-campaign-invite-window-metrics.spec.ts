import { campaignInviteWindowMetrics } from './ad-campaign-invite-window-metrics';

describe('campaignInviteWindowMetrics', () => {
  const links = [
    { id: 'one', joinedCount: 700, requestedCount: 90 },
    { id: 'two', joinedCount: 40, requestedCount: 3 },
  ];

  it('uses each selected interval independently and leaves other links unchanged', () => {
    expect(campaignInviteWindowMetrics(links, [{ inviteLinkId: 'one', joinedCount: 2, pendingCount: 5 }])).toEqual({ joined: 42, pending: 8 });
  });

  it('keeps joined people within the date and displays the current Telegram queue', () => {
    expect(campaignInviteWindowMetrics([links[0]], [
      { inviteLinkId: 'one', fromDate: '2026-11-12', currentRequests: true, joinedCount: 0, pendingCount: 5 },
    ])).toEqual({ joined: 0, pending: 90 });
  });

  it('does not fall back to lifetime counts when Telegram did not return complete data', () => {
    expect(campaignInviteWindowMetrics(links, [{ inviteLinkId: 'one', joinedCount: null, pendingCount: 5 }])).toEqual({ joined: null, pending: 8 });
  });

  it('preserves an exact zero for a selected interval', () => {
    expect(campaignInviteWindowMetrics([links[0]], [{ inviteLinkId: 'one', joinedCount: 0, pendingCount: 0 }])).toEqual({ joined: 0, pending: 0 });
  });
});
