import { TelegramSourceType } from '@prisma/client';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';

describe('OT-05 — cancelling an ordinary native schedule after owner transfer', () => {
  it('keeps the claim and rejects replay after an accepted cancellation loses its acknowledgement', async () => {
    const channel = {
      username: 'fixture_channel',
      telegramChatId: '-10012345',
    };
    const queue = new Set(['101', '102']);
    const scheduledAt = new Date(Date.now() + 60_000);
    const getScheduledHistory = jest.fn(() => [...queue].map((id) => ({
      id, date: scheduledAt.toISOString(), text: id === '101' ? 'Fixture post' : 'Another post', hasMedia: false,
    })));
    let owner: string | null = null;
    const updateMany = jest.fn(async ({ data, where }) => {
      if (where.deliveryClaimOwner ? where.deliveryClaimOwner !== owner : owner !== null) return { count: 0 };
      owner = data.deliveryClaimOwner;
      return { count: 1 };
    });
    const observations: string[][] = [];
    const deleteScheduledPost = jest.fn(
      async ({ messageIds }: { messageIds: string[] }) => {
        observations.push([...queue]);
        messageIds.forEach((id) => queue.delete(id));
        if (observations.length === 1)
          throw new Error('Connection reset after acceptance');
      },
    );
    const connectedAccount = jest
      .fn()
      .mockResolvedValue({ id: 'former-owner' });
    const publication = new TelegramManagedPostPublicationService(
      { telegramManagedPost: { updateMany, findFirst: jest.fn().mockResolvedValue(null) } } as never,
      { deleteScheduledPost, getScheduledHistory } as never,
      {} as never,
      {} as never,
      {
        connectedAccount,
        mtprotoChannelReference: () => channel,
        accountCredentials: () => ({}),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const post = {
      id: 'fixture-post',
      scheduledAt,
      text: 'Fixture post',
      imageUrls: [],
      mediaItems: null,
      telegramChannelId: 'fixture-channel',
      sourceType: TelegramSourceType.MTPROTO,
      sourceId: 'former-owner',
      telegramScheduledMessageIds: ['101'],
      telegramChannel: channel,
    };

    await expect(
      publication.cancelScheduledManagedPost('workspace', post),
    ).rejects.toThrow('Connection reset');
    expect([...queue]).toEqual(['102']);
    await expect(publication.cancelScheduledManagedPost('workspace', post)).rejects.toThrow('requires reconciliation');
    expect(observations).toEqual([['101', '102']]);
    expect(getScheduledHistory).toHaveBeenCalledTimes(1);
    expect(owner).toMatch(/^native-cancel:/);
    expect(connectedAccount).toHaveBeenLastCalledWith(
      'workspace',
      post.telegramChannelId,
      post.sourceId,
    );
  });
});
