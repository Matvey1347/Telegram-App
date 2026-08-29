/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { GreeterBroadcastRecipientStatus } from '@prisma/client';
import { reconcileTerminalDeliveryBroadcasts } from './telegram-bot-delivery-broadcast-reconciliation';

describe('reconcileTerminalDeliveryBroadcasts', () => {
  it('uses one bounded status aggregation for one thousand deliveries', async () => {
    const prisma = {
      greeterBroadcastRecipient: {
        findMany: jest.fn().mockResolvedValue([{ broadcastId: 'broadcast' }]),
        findFirst: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([
          {
            status: GreeterBroadcastRecipientStatus.SENT,
            _count: { _all: 1000 },
          },
        ]),
      },
      greeterBroadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await reconcileTerminalDeliveryBroadcasts(
      prisma as never,
      Array.from({ length: 1000 }, (_, index) => `delivery-${index}`),
    );

    expect(prisma.greeterBroadcastRecipient.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.greeterBroadcastRecipient.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.greeterBroadcastRecipient.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.greeterBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('does not aggregate or finalize while one recipient is non-terminal', async () => {
    const prisma = {
      greeterBroadcastRecipient: {
        findMany: jest.fn().mockResolvedValue([{ broadcastId: 'broadcast' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'recipient' }),
        groupBy: jest.fn(),
      },
      greeterBroadcast: { updateMany: jest.fn() },
    };

    await reconcileTerminalDeliveryBroadcasts(prisma as never, ['delivery']);

    expect(prisma.greeterBroadcastRecipient.groupBy).not.toHaveBeenCalled();
    expect(prisma.greeterBroadcast.updateMany).not.toHaveBeenCalled();
  });
});
