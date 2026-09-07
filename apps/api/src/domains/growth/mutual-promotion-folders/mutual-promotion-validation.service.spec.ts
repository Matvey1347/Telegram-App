import { MutualPromotionValidationService } from './mutual-promotion-validation.service';

describe('MutualPromotionValidationService', () => {
  const participant = {
    telegramChannelId: 'channel-1',
    inviteLinkId: 'invite-1',
    role: 'PUBLISHER' as const,
    inviteLinkMode: 'REUSABLE' as const,
  };

  function transaction(assignments: unknown[]) {
    return {
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'invite-1',
            telegramChannelId: 'channel-1',
            isRevoked: false,
            adCampaignId: null,
            snapshots: [],
          },
        ]),
      },
      telegramChannel: { count: jest.fn().mockResolvedValue(1) },
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue(assignments),
      },
    };
  }

  it('acquires folder and invite-link locks without decoding void query rows', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
    const service = new MutualPromotionValidationService({} as never);

    await service.lockFolder(tx as never, 'folder-1');
    await service.lockInviteLinks(tx as never, [
      'invite-2',
      'invite-1',
      'invite-2',
    ]);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('rejects overlapping reusable-link activity windows', async () => {
    const tx = transaction([
      {
        inviteLinkId: 'invite-1',
        inviteLinkMode: 'REUSABLE',
        folder: {
          id: 'folder-2',
          status: 'ACTIVE',
          startsAt: new Date('2026-09-10T00:00:00.000Z'),
          endsAt: new Date('2026-09-20T00:00:00.000Z'),
        },
      },
    ]);
    const service = new MutualPromotionValidationService({} as never);

    await expect(
      service.validateParticipants(tx as never, {
        workspaceId: 'workspace-1',
        startsAt: new Date('2026-09-15T00:00:00.000Z'),
        endsAt: new Date('2026-09-25T00:00:00.000Z'),
        participants: [participant],
      }),
    ).rejects.toThrow('overlaps another folder');
  });

  it('keeps a folder-only link globally exclusive outside overlapping dates', async () => {
    const tx = transaction([
      {
        inviteLinkId: 'invite-1',
        inviteLinkMode: 'FOLDER_ONLY',
        folder: {
          id: 'folder-2',
          status: 'COMPLETED',
          startsAt: new Date('2026-01-01T00:00:00.000Z'),
          endsAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      },
    ]);
    const service = new MutualPromotionValidationService({} as never);

    await expect(
      service.validateParticipants(tx as never, {
        workspaceId: 'workspace-1',
        startsAt: new Date('2026-09-15T00:00:00.000Z'),
        endsAt: new Date('2026-09-25T00:00:00.000Z'),
        participants: [participant],
      }),
    ).rejects.toThrow('Folder-only invite link is already assigned');
  });

  it('rejects inactive participant channels before activation', async () => {
    const tx = transaction([]);
    tx.telegramChannel.count.mockResolvedValue(0);
    const service = new MutualPromotionValidationService({} as never);

    await expect(
      service.validateParticipants(tx as never, {
        workspaceId: 'workspace-1',
        startsAt: new Date('2026-09-15T00:00:00.000Z'),
        endsAt: new Date('2026-09-25T00:00:00.000Z'),
        participants: [participant],
      }),
    ).rejects.toThrow('participant channels are unavailable');
    expect(tx.telegramChannel.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: 'workspace-1',
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
      }),
    });
  });
});
