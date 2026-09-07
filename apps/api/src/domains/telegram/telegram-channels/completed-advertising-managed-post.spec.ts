import {
  completedAdvertisingPostUpdate,
  missingPublishedPostUpdate,
} from './completed-advertising-managed-post';

describe('completed advertising managed posts', () => {
  const completedAt = new Date('2026-09-07T08:00:00.000Z');
  const publishedAt = new Date('2026-09-07T06:00:00.000Z');
  const advertisePost = {
    publishedAt,
    group: { isSystem: true, systemKey: 'ADVERTISE' },
  };

  it('uses the terminal auto-deleted state when an ad placement completes', () => {
    expect(
      completedAdvertisingPostUpdate(
        { publishedAt, managedPost: advertisePost },
        completedAt,
      ),
    ).toMatchObject({
      status: 'PUBLISHED',
      telegramRemoteStatus: 'AUTO_DELETED',
      lastError: null,
    });
  });

  it('recognizes completed advertising evidence during a remote link check', () => {
    expect(
      missingPublishedPostUpdate(
        { ...advertisePost, completedAdPlacements: [{ publishedAt }] },
        completedAt,
      ),
    ).toMatchObject({
      status: 'PUBLISHED',
      telegramRemoteStatus: 'AUTO_DELETED',
      lastError: null,
    });
  });

  it('preserves broken-link behavior outside the system Advertise group', () => {
    expect(
      missingPublishedPostUpdate(
        {
          publishedAt,
          group: { isSystem: false, systemKey: null },
          completedAdPlacements: [{ publishedAt }],
        },
        completedAt,
      ),
    ).toMatchObject({
      status: 'PUBLISHED',
      telegramRemoteStatus: 'BROKEN',
      lastError: 'Telegram post link is broken.',
    });
  });
});
