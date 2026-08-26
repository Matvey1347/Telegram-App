import { preflightTelegramAdDeletionCapability } from './deletion-capability';

const bot = {
  sourceType: 'BOT',
  permissions: { canDeleteMessages: true },
};
const mtproto = {
  sourceType: 'MTPROTO',
  permissions: { canDeleteMessages: true },
};

describe('preflightTelegramAdDeletionCapability', () => {
  it('allows a Bot API placement that is deleted before 48 hours', () => {
    expect(
      preflightTelegramAdDeletionCapability({
        publishingSourceType: 'BOT',
        deleteAfterHours: 24,
        isPermanent: false,
        sources: [bot],
      }),
    ).toEqual({ ok: true });
  });

  it.each([48, 72])(
    'requires an MTProto delete source for a %s-hour Bot API placement',
    (deleteAfterHours) => {
      expect(
        preflightTelegramAdDeletionCapability({
          publishingSourceType: 'BOT',
          deleteAfterHours,
          isPermanent: false,
          sources: [bot],
        }),
      ).toEqual(
        expect.objectContaining({
          ok: false,
          code: 'MTPROTO_DELETE_SOURCE_REQUIRED',
        }),
      );
    },
  );

  it('allows a long Bot API placement when an MTProto admin can delete', () => {
    expect(
      preflightTelegramAdDeletionCapability({
        publishingSourceType: 'BOT',
        deleteAfterHours: 72,
        isPermanent: false,
        sources: [bot, mtproto],
      }),
    ).toEqual({ ok: true });
  });

  it('does not require a fallback for MTProto publication or permanent posts', () => {
    expect(
      preflightTelegramAdDeletionCapability({
        publishingSourceType: 'MTPROTO',
        deleteAfterHours: 72,
        isPermanent: false,
        sources: [],
      }),
    ).toEqual({ ok: true });
    expect(
      preflightTelegramAdDeletionCapability({
        publishingSourceType: 'BOT',
        deleteAfterHours: null,
        isPermanent: true,
        sources: [bot],
      }),
    ).toEqual({ ok: true });
  });

  it('does not count an MTProto source without delete permission', () => {
    expect(
      preflightTelegramAdDeletionCapability({
        publishingSourceType: 'BOT',
        deleteAfterHours: 48,
        isPermanent: false,
        sources: [
          bot,
          {
            sourceType: 'MTPROTO',
            permissions: { canDeleteMessages: false },
          },
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});
