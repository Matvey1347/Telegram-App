/* eslint-disable @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-member-access */
import {
  GreeterBroadcastRecipientStatus,
  Prisma,
  TelegramBotDeliveryStatus,
} from '@prisma/client';
import {
  linkGreeterBroadcastDeliveryBatch,
  queueGreeterBroadcastRecipientPage,
} from './greeter-broadcast-batch-link';

function recipients(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const number = offset + index;
    return {
      id: `recipient-${number}`,
      telegramBotUserId: `user-${number}`,
      telegramUser: {
        telegramChatId: String(number),
        blockedAt: null,
        firstName: `User ${number}`,
        lastName: null,
        username: null,
      },
      acquiredChannel: null,
    };
  });
}

const broadcast = {
  id: 'broadcast-1',
  workspaceId: 'workspace-1',
  botIntegrationId: 'bot-1',
  messageText: 'Hello {{user.firstName}}',
  buttons: null,
  scheduledAt: new Date('2026-08-27T10:00:00.000Z'),
  channel: { title: 'Channel', username: null },
};

describe('Greeter broadcast batch queue/link', () => {
  it.each([1, 25, 250, 1000])(
    'bounds enqueue/link statements by pages for %i recipients',
    async (count) => {
      const queryRaw = jest.fn();
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const enqueueSendMessageBatch = jest.fn().mockImplementation(
        (
          inputs: Array<{
            telegramBotUserId: string | null | undefined;
          }>,
        ) => {
          const rows = inputs.map(
            (item: { telegramBotUserId: string | null | undefined }) => ({
              id: `delivery-${item.telegramBotUserId}`,
            }),
          );
          queryRaw.mockResolvedValueOnce(
            rows.map((item: { id: string }) => ({ deliveryId: item.id })),
          );
          return Promise.resolve(rows);
        },
      );
      const prisma = {
        $queryRaw: queryRaw,
        telegramBotDelivery: { updateMany },
        greeterBroadcastRecipient: { updateMany: jest.fn() },
      };
      const allRecipients = recipients(count);
      const pages = Math.ceil(count / 250);

      for (let offset = 0; offset < count; offset += 250) {
        await queueGreeterBroadcastRecipientPage(
          prisma as never,
          { enqueueSendMessageBatch },
          {
            row: broadcast,
            recipients: allRecipients.slice(offset, offset + 250),
            now: new Date('2026-08-27T10:00:00.000Z'),
          },
        );
      }

      expect(enqueueSendMessageBatch).toHaveBeenCalledTimes(pages);
      expect(queryRaw).toHaveBeenCalledTimes(pages);
      expect(updateMany).not.toHaveBeenCalled();
      expect({
        beforeStatements: count * 2,
        afterStatements:
          enqueueSendMessageBatch.mock.calls.length * 2 +
          queryRaw.mock.calls.length,
      }).toEqual({ beforeStatements: count * 2, afterStatements: pages * 3 });
    },
  );

  it('cancels only the delivery left unlinked when cancellation wins', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ deliveryId: 'delivery-1' }]),
      telegramBotDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      linkGreeterBroadcastDeliveryBatch(prisma as never, {
        broadcastId: 'broadcast-1',
        links: [
          { recipientId: 'recipient-1', deliveryId: 'delivery-1' },
          { recipientId: 'recipient-2', deliveryId: 'delivery-2' },
        ],
        now: new Date('2026-08-27T10:00:00.000Z'),
      }),
    ).resolves.toEqual({
      linkedDeliveryIds: ['delivery-1'],
      unlinkedDeliveryIds: ['delivery-2'],
    });

    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['delivery-2'] },
        status: {
          in: [
            TelegramBotDeliveryStatus.PENDING,
            TelegramBotDeliveryStatus.RETRY,
          ],
        },
        greeterBroadcastRecipient: { is: null },
      },
      data: {
        status: TelegramBotDeliveryStatus.CANCELLED,
        lockedAt: null,
        lockedUntil: null,
      },
    });
    const statement = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(statement.sql).toContain('FOR UPDATE OF "delivery"');
    expect(statement.sql).toContain(
      '"broadcast"."status" = \'PROCESSING\'::"GreeterBroadcastStatus"',
    );
  });

  it('batches blocked and missing-chat outcomes by status', async () => {
    const blocked = recipients(25).map((recipient) => ({
      ...recipient,
      telegramUser: {
        ...recipient.telegramUser,
        blockedAt: new Date('2026-08-27T09:00:00.000Z'),
      },
    }));
    const missing = recipients(25, 25).map((recipient) => ({
      ...recipient,
      telegramUser: { ...recipient.telegramUser, telegramChatId: null },
    }));
    const updateMany = jest.fn().mockResolvedValue({ count: 25 });
    const enqueueSendMessageBatch = jest.fn();

    await queueGreeterBroadcastRecipientPage(
      { greeterBroadcastRecipient: { updateMany } } as never,
      { enqueueSendMessageBatch },
      {
        row: broadcast,
        recipients: [...blocked, ...missing],
        now: new Date('2026-08-27T10:00:00.000Z'),
      },
    );

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GreeterBroadcastRecipientStatus.BLOCKED,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GreeterBroadcastRecipientStatus.FAILED,
        }),
      }),
    );
    expect(enqueueSendMessageBatch).not.toHaveBeenCalled();
  });
});
