import {
  TelegramAdvertiserStatus,
  TelegramCrmContactStage,
} from '@prisma/client';
import {
  legacyAdvertiserFilter,
  legacyAdvertiserStatus,
} from './telegram-crm-legacy-compatibility';

describe('legacy CRM compatibility', () => {
  it('keeps CUSTOMER without an active Deal consistent between mapper and LEAD filter', () => {
    expect(
      legacyAdvertiserStatus(TelegramCrmContactStage.CUSTOMER, false),
    ).toBe(TelegramAdvertiserStatus.LEAD);
    expect(
      legacyAdvertiserFilter({ status: TelegramAdvertiserStatus.LEAD }),
    ).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            stage: expect.objectContaining({
              in: expect.arrayContaining([TelegramCrmContactStage.CUSTOMER]),
            }),
          }),
        ]),
      }),
    );
  });

  it.each([TelegramCrmContactStage.LOST, TelegramCrmContactStage.ARCHIVED])(
    'does not expose %s as ACTIVE even when a Deal is active',
    (stage) => {
      expect(legacyAdvertiserStatus(stage, true)).not.toBe(
        TelegramAdvertiserStatus.ACTIVE,
      );
      expect(
        legacyAdvertiserFilter({ status: TelegramAdvertiserStatus.ACTIVE }),
      ).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              stage: expect.objectContaining({
                notIn: expect.arrayContaining([stage]),
              }),
            }),
          ]),
        }),
      );
    },
  );
});
