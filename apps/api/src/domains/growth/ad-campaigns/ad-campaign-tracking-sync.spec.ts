import { attachNewCampaignTrackingLinks } from './ad-campaign-tracking-sync';
import { resolveTrackingInviteLinks } from './ad-campaign-link-selection';

describe('Campaign request tracking scope', () => {
  it('selects owned active destinations while allowing channels that still need a bot link', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'destination', botInviteLinkId: 'tracked' },
      { id: 'unconfigured', botInviteLinkId: null },
    ]);
    await expect(resolveTrackingInviteLinks(
      { telegramChannel: { findMany } }, 'workspace', null, 'BOT', 'advertised', true,
    )).resolves.toEqual(['tracked']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace', id: { not: 'advertised' }, isActive: true, archivedAt: null, adminLinks: { some: {} } },
    }));
  });

  it('rejects explicitly selected destinations outside the workspace', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await expect(resolveTrackingInviteLinks(
      { telegramChannel: { findMany } }, 'workspace', ['external'], 'BOT', 'advertised', true,
    )).rejects.toThrow('Destination channels must be owned active channels');
  });

  it('attaches only newly available scoped links and retains their opening counters', async () => {
    const createMany = jest.fn();
    const tx = {
      $executeRaw: jest.fn(),
      adCampaign: { findMany: jest.fn().mockResolvedValue([{
        id: 'campaign', telegramChannelId: 'advertised', trackingScope: { kind: 'BOT', channelIds: null },
        botInviteLinks: [{ inviteLinkId: 'already' }],
      }]) },
      telegramChannel: { findMany: jest.fn().mockResolvedValue([
        { id: 'advertised', botInviteLinkId: 'own' },
        { id: 'existing', botInviteLinkId: 'already' },
        { id: 'new-channel', botInviteLinkId: 'new-link' },
      ]) },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([
        { id: 'new-link', telegramChannelId: 'new-channel', joinedCount: 2, requestedCount: 7 },
      ]) },
      adCampaignBotInviteLink: { createMany },
    };
    await attachNewCampaignTrackingLinks({
      $transaction: (action: (db: typeof tx) => Promise<void>) => action(tx),
    } as never, 'workspace');
    expect(createMany).toHaveBeenCalledWith({
      data: [{ adCampaignId: 'campaign', kind: 'BOT', inviteLinkId: 'new-link', baselineJoinedCount: 2, baselineRequestedCount: 7 }],
      skipDuplicates: true,
    });
  });
});
