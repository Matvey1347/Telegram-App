import {
  TelegramBotDeliveryStatus,
  TelegramBotDeliveryType,
} from '@prisma/client';
import {
  enqueueTelegramBotSendMessageBatch,
  type TelegramBotSendMessageInput,
} from './telegram-bot-delivery-batch-enqueue';

function input(index: number): TelegramBotSendMessageInput {
  return {
    workspaceId: 'workspace-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: `user-${index}`,
    chatId: String(index),
    text: `Hello ${index}`,
    scheduledAt: new Date('2026-08-27T10:00:00.000Z'),
    idempotencyKey: `broadcast:user-${index}`,
  };
}

function storedDelivery(
  index: number,
  idempotencyKey = `broadcast:user-${index}`,
) {
  return {
    id: `delivery-${index}`,
    workspaceId: 'workspace-1',
    botIntegrationId: 'bot-1',
    runtimeInstanceId: null,
    telegramBotUserId: `user-${index}`,
    financeReminderId: null,
    chatId: String(index),
    type: TelegramBotDeliveryType.SEND_MESSAGE,
    payload: { text: `Hello ${index}` },
    scheduledAt: new Date('2026-08-27T10:00:00.000Z'),
    status: TelegramBotDeliveryStatus.PENDING,
    attempts: 0,
    maxAttempts: 3,
    lockedAt: null,
    lockedUntil: null,
    lastError: null,
    sentAt: null,
    idempotencyKey,
    createdAt: new Date('2026-08-27T09:00:00.000Z'),
    updatedAt: new Date('2026-08-27T09:00:00.000Z'),
  };
}

describe('enqueueTelegramBotSendMessageBatch', () => {
  it.each([1, 25, 250, 1000])(
    'uses two database statements per page for %i deliveries',
    async (count) => {
      const createMany = jest.fn().mockResolvedValue({ count: 0 });
      const findMany = jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { OR: Array<{ idempotencyKey: string }> } }) =>
            Promise.resolve(
              where.OR.map(
                (lookup: { idempotencyKey: string }, index: number) =>
                  storedDelivery(
                    Number(lookup.idempotencyKey.match(/(\d+)$/)?.[1] ?? index),
                    lookup.idempotencyKey,
                  ),
              ),
            ),
        );
      const prisma = { telegramBotDelivery: { createMany, findMany } };
      const inputs = Array.from({ length: count }, (_, index) => input(index));
      const pages = Math.ceil(count / 250);
      const queued: Array<{ id: string }> = [];

      for (let offset = 0; offset < inputs.length; offset += 250) {
        queued.push(
          ...(await enqueueTelegramBotSendMessageBatch(
            prisma as never,
            inputs.slice(offset, offset + 250),
            null,
          )),
        );
      }

      expect(queued).toHaveLength(count);
      expect({
        beforeUpserts: count,
        afterStatements:
          createMany.mock.calls.length + findMany.mock.calls.length,
      }).toEqual({ beforeUpserts: count, afterStatements: pages * 2 });
    },
  );

  it('resolves duplicate inputs to one runtime-prefixed idempotent delivery', async () => {
    const existing = storedDelivery(1, 'runtime-local:broadcast:user-1');
    const prisma = {
      telegramBotDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([existing]),
      },
    };

    const result = await enqueueTelegramBotSendMessageBatch(
      prisma as never,
      [input(1), input(1)],
      'runtime-local',
    );

    expect(result).toEqual([existing, existing]);
    expect(prisma.telegramBotDelivery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            runtimeInstanceId: 'runtime-local',
            idempotencyKey: 'runtime-local:broadcast:user-1',
          }),
          expect.objectContaining({
            runtimeInstanceId: 'runtime-local',
            idempotencyKey: 'runtime-local:broadcast:user-1',
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(1);
  });
});
