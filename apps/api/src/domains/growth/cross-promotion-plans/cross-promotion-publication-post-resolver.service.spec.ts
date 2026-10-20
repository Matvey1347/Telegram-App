import { CrossPromotionPublicationPostResolverService } from './cross-promotion-publication-post-resolver.service';

describe('CrossPromotionPublicationPostResolverService', () => {
  it('relinks a missing managed-post id to the matching live Telegram post', async () => {
    const livePost = {
      id: 'reimported-post',
      telegramChannelId: 'channel-2',
      title: 'Partner post',
      text: 'Original Telegram text',
      imageUrls: [],
      mediaItems: [],
      buttonRows: [],
      scheduledAt: null,
      publishedAt: new Date('2026-10-20T07:10:00.000Z'),
      createdAt: new Date('2026-10-20T07:45:00.000Z'),
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([livePost]);
    const service = new CrossPromotionPublicationPostResolverService({
      telegramManagedPost: { findMany },
    } as never);

    await expect(
      service.resolve({
        workspaceId: 'workspace-1',
        publicationId: 'publication-2',
        placementPostIds: [
          {
            telegramChannelId: 'channel-2',
            managedPostId: 'deleted-local-post',
            publicationId: 'publication-2',
          },
        ],
        publicationPost: {
          publisherPublications: [
            {
              id: 'publication-2',
              post: {
                title: 'Partner post',
                text: 'Original Telegram text',
                imageUrls: [],
                mediaItems: [],
                buttonRows: [],
              },
              placements: [
                {
                  telegramChannelId: 'channel-2',
                  scheduledAt: '2026-10-20T07:10:00.000Z',
                },
              ],
            },
          ],
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'reimported-post',
        linkedManagedPostId: 'deleted-local-post',
      }),
    ]);
  });

  it('does not guess when no content-matching live post exists', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'unrelated-post',
          telegramChannelId: 'channel-2',
          title: 'Different post',
          text: 'Different text',
          imageUrls: [],
          mediaItems: [],
          buttonRows: [],
          scheduledAt: null,
          publishedAt: new Date('2026-10-20T07:10:00.000Z'),
          createdAt: new Date('2026-10-20T07:45:00.000Z'),
        },
      ]);
    const service = new CrossPromotionPublicationPostResolverService({
      telegramManagedPost: { findMany },
    } as never);

    const resolved = await service.resolve({
      workspaceId: 'workspace-1',
      publicationId: 'publication-2',
      placementPostIds: [
        {
          telegramChannelId: 'channel-2',
          managedPostId: 'deleted-local-post',
          publicationId: 'publication-2',
        },
      ],
      publicationPost: {
        publisherPublications: [
          {
            id: 'publication-2',
            post: {
              title: 'Partner post',
              text: 'Original Telegram text',
              imageUrls: [],
              mediaItems: [],
              buttonRows: [],
            },
            placements: [
              {
                telegramChannelId: 'channel-2',
                scheduledAt: '2026-10-20T07:10:00.000Z',
              },
            ],
          },
        ],
      },
    });

    expect(resolved).toEqual([]);
  });
});
