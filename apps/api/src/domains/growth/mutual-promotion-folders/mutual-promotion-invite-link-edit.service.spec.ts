/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- focused Prisma transaction doubles */
import { MutualPromotionInviteLinkEditService } from './mutual-promotion-invite-link-edit.service';

describe('MutualPromotionInviteLinkEditService', () => {
  function setup(status = 'ACTIVE') {
    const participants = [
      {
        id: 'participant-1',
        telegramChannelId: 'channel-1',
        inviteLinkId: 'old-link',
        role: 'PUBLISHER',
      },
    ];
    const tx = {
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue(participants),
        update: jest.fn().mockResolvedValue({}),
      },
      telegramChannel: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'channel-1', currentSubscribersCount: 420 },
          ]),
      },
      telegramInviteLink: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'new-link', joinedCount: 35 }]),
      },
    };
    const validation = {
      lockFolder: jest.fn().mockResolvedValue(undefined),
      requireFolder: jest.fn().mockResolvedValue({
        id: 'folder-1',
        status,
        startsAt: new Date('2026-09-08T08:00:00.000Z'),
        endsAt: new Date('2026-09-10T08:00:00.000Z'),
      }),
      lockInviteLinks: jest.fn().mockResolvedValue(undefined),
      validateParticipants: jest.fn().mockResolvedValue(undefined),
    };
    const read = {
      detailForWorkspace: jest.fn().mockResolvedValue({ id: 'folder-1' }),
    };
    const service = new MutualPromotionInviteLinkEditService(
      { $transaction: jest.fn((callback) => callback(tx)) } as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      validation as never,
      read as never,
    );
    return { service, tx, validation, read };
  }

  const payload = {
    participants: [
      {
        participantId: 'participant-1',
        inviteLinkId: 'new-link',
        inviteLinkMode: 'FOLDER_ONLY' as const,
      },
    ],
  };

  it('replaces an active invite link and restarts its attribution boundary', async () => {
    const { service, tx, validation, read } = setup();

    await expect(
      service.update('user-1', 'folder-1', payload),
    ).resolves.toEqual({ id: 'folder-1' });

    expect(validation.validateParticipants).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        workspaceId: 'workspace-1',
        folderId: 'folder-1',
        participants: [
          expect.objectContaining({
            telegramChannelId: 'channel-1',
            inviteLinkId: 'new-link',
          }),
        ],
      }),
    );
    expect(tx.mutualPromotionFolderParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: expect.objectContaining({
        inviteLinkId: 'new-link',
        inviteLinkMode: 'FOLDER_ONLY',
        subscribersAtStart: 420,
        inviteJoinedAtStart: 35,
        baselineCapturedAt: expect.any(Date),
        subscribersAtEnd: null,
        inviteJoinedAtEnd: null,
        finalCapturedAt: null,
      }),
    });
    expect(read.detailForWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      'folder-1',
    );
  });

  it('rejects structural link edits after a folder becomes terminal', async () => {
    const { service, tx } = setup('COMPLETED');

    await expect(service.update('user-1', 'folder-1', payload)).rejects.toThrow(
      'Invite links can be replaced only in scheduled or active folders',
    );
    expect(tx.mutualPromotionFolderParticipant.update).not.toHaveBeenCalled();
  });

  it('requires a complete participant set so omitted channels cannot change', async () => {
    const { service, tx } = setup();

    await expect(
      service.update('user-1', 'folder-1', { participants: [] }),
    ).rejects.toThrow(
      'Provide one invite-link selection for every folder participant',
    );
    expect(tx.mutualPromotionFolderParticipant.update).not.toHaveBeenCalled();
  });
});
