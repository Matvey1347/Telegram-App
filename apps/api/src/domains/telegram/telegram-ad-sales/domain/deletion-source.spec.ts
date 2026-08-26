import { selectAdPlacementDeletionSource } from './deletion-source';

const bot = {
  sourceType: 'BOT',
  sourceId: 'bot',
  permissions: { canDeleteMessages: true },
};
const mtproto = {
  sourceType: 'MTPROTO',
  sourceId: 'account',
  permissions: { canDeleteMessages: true },
};

describe('selectAdPlacementDeletionSource', () => {
  it('uses the publishing bot while Bot API deletion is still allowed', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      selectAdPlacementDeletionSource(
        [bot, mtproto],
        {
          sourceType: 'BOT',
          sourceId: 'bot',
          publishedAt,
        },
        new Date(publishedAt.getTime() + 24 * 60 * 60 * 1000),
      ),
    ).toBe(bot);
  });

  it.each([48, 72])(
    'falls back to an MTProto admin for a %s-hour Bot API placement',
    (hours) => {
      const publishedAt = new Date('2026-01-01T00:00:00Z');
      expect(
        selectAdPlacementDeletionSource(
          [bot, mtproto],
          { sourceType: 'BOT', sourceId: 'bot', publishedAt },
          new Date(publishedAt.getTime() + hours * 60 * 60 * 1000),
        ),
      ).toBe(mtproto);
    },
  );

  it('returns no source after 48 hours when no MTProto admin is connected', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      selectAdPlacementDeletionSource(
        [bot],
        { sourceType: 'BOT', sourceId: 'bot', publishedAt },
        new Date(publishedAt.getTime() + 48 * 60 * 60 * 1000),
      ),
    ).toBeUndefined();
  });
});
