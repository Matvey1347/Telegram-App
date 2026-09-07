import { GrowthInviteLinkReservationService } from './invite-link-reservation.service';

describe('GrowthInviteLinkReservationService', () => {
  it('rejects an Ads acquisition link reserved by mutual promotion under its lock', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'invite-1',
            adCampaignId: null,
            mutualPromotionParticipants: [{ id: 'participant-1' }],
          },
        ]),
      },
    };

    await expect(
      new GrowthInviteLinkReservationService().assertAvailableForAds(
        tx as never,
        'workspace-1',
        ['invite-1'],
        'channel-1',
      ),
    ).rejects.toThrow('reserved by mutual-promotion folders');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
