/* eslint-disable @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/no-unsafe-member-access */
import { Prisma, TelegramBotRuntimeEnvironment } from '@prisma/client';
import {
  claimDueDeliveryIds,
  failClosedUnhydratableDeliveryIds,
} from './telegram-bot-delivery-claim';

describe('claimDueDeliveryIds', () => {
  it.each([
    TelegramBotRuntimeEnvironment.LOCAL,
    TelegramBotRuntimeEnvironment.PRODUCTION,
  ])(
    'claims one bounded %s batch in one atomic statement',
    async (environment) => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ id: 'delivery-1' }, { id: 'delivery-2' }]);
      const now = new Date('2026-08-27T10:00:00.000Z');

      await expect(
        claimDueDeliveryIds({ $queryRaw: queryRaw } as any, {
          environment,
          now,
          lockedUntil: new Date('2026-08-27T10:05:00.000Z'),
          limit: 25,
        }),
      ).resolves.toEqual(['delivery-1', 'delivery-2']);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      const statement = queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(statement.sql).toContain('FOR UPDATE OF "delivery" SKIP LOCKED');
      expect(statement.sql).toContain('UPDATE "TelegramBotDelivery"');
      expect(statement.sql).toContain(environment);
      expect(statement.sql).toContain(
        `"runtime"."workspaceId" = "delivery"."workspaceId"`,
      );
      expect(statement.sql).toContain(
        `"runtime"."botIntegrationId" = "delivery"."botIntegrationId"`,
      );
      expect(statement.values).toContain(25);
    },
  );

  it('does no database work for an empty limit', async () => {
    const queryRaw = jest.fn();

    await expect(
      claimDueDeliveryIds({ $queryRaw: queryRaw } as any, {
        environment: TelegramBotRuntimeEnvironment.PRODUCTION,
        now: new Date(),
        lockedUntil: new Date(),
        limit: 0,
      }),
    ).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('terminally releases only a still-owned claim that lost its LOCAL scope', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'delivery-1' }]);
    const claimedAt = new Date('2026-08-27T10:00:00.000Z');
    const lockedUntil = new Date('2026-08-27T10:05:00.000Z');
    const failedAt = new Date('2026-08-27T10:00:01.000Z');

    await expect(
      failClosedUnhydratableDeliveryIds({ $queryRaw: queryRaw } as any, {
        ids: ['delivery-1'],
        environment: TelegramBotRuntimeEnvironment.LOCAL,
        claimedAt,
        lockedUntil,
        failedAt,
        error: 'runtime scope lost',
      }),
    ).resolves.toEqual(['delivery-1']);

    const statement = queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(statement.sql).toContain(
      `"status" = 'FAILED'::"TelegramBotDeliveryStatus"`,
    );
    expect(statement.sql).toContain('AND NOT');
    expect(statement.sql).toContain('LOCAL');
    expect(statement.values).toEqual(
      expect.arrayContaining([
        'delivery-1',
        'runtime scope lost',
        claimedAt,
        lockedUntil,
        failedAt,
      ]),
    );
  });
});
