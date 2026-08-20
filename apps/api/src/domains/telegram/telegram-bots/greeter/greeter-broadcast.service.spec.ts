jest.mock('./greeter-automation.service', () => ({
  GreeterAutomationService: class GreeterAutomationService {},
}));

import { ConflictException } from '@nestjs/common';
import {
  GreeterBroadcastAudience,
  GreeterBroadcastRecipientStatus,
  GreeterBroadcastStatus,
} from '@prisma/client';
import { GreeterBroadcastService } from './greeter-broadcast.service';

const now = new Date('2026-08-09T10:00:00.000Z');
const row = (
  status: GreeterBroadcastStatus,
  overrides: Record<string, unknown> = {},
) =>
  ({
    id: 'broadcast',
    workspaceId: 'w',
    botIntegrationId: 'b',
    name: 'News',
    messageText: 'Hello {{user.firstName}}',
    buttons: [],
    audience: GreeterBroadcastAudience.ALL_ALIVE,
    channelId: null,
    audienceUserState: null,
    channel: null,
    status,
    scheduledAt: status === GreeterBroadcastStatus.DRAFT ? null : now,
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    processingStartedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as any;

function service(
  prisma: any,
  audiences: any = { resolve: jest.fn().mockResolvedValue([]) },
  deliveries: any = {},
) {
  return new GreeterBroadcastService(
    prisma,
    {
      requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
    } as any,
    audiences,
    { validateButtons: jest.fn() } as any,
    deliveries,
  );
}

describe('GreeterBroadcastService', () => {
  it('treats duplicate confirmation of a scheduled broadcast as idempotent', async () => {
    const prisma = {
      greeterBroadcast: {
        findFirst: jest
          .fn()
          .mockResolvedValue(row(GreeterBroadcastStatus.SCHEDULED)),
        updateMany: jest.fn(),
      },
      greeterBroadcastRecipient: {
        groupBy: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
    } as any;
    const audiences = { resolve: jest.fn() };
    const result = await service(prisma, audiences).sendNow(
      'admin',
      'b',
      'broadcast',
    );
    expect(result.status).toBe(GreeterBroadcastStatus.SCHEDULED);
    expect(prisma.greeterBroadcast.updateMany).not.toHaveBeenCalled();
    expect(prisma.greeterBroadcastRecipient.createMany).not.toHaveBeenCalled();
    expect(audiences.resolve).not.toHaveBeenCalled();
  });

  it('schedules a draft once and returns the persisted scoped row', async () => {
    const future = new Date(Date.now() + 60_000);
    const prisma = {
      greeterBroadcast: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(row(GreeterBroadcastStatus.DRAFT))
          .mockResolvedValueOnce(
            row(GreeterBroadcastStatus.SCHEDULED, { scheduledAt: future }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterBroadcastRecipient: { groupBy: jest.fn().mockResolvedValue([]) },
    } as any;
    const result = await service(prisma).schedule(
      'admin',
      'b',
      'broadcast',
      future,
    );
    expect(prisma.greeterBroadcast.updateMany).toHaveBeenCalledWith({
      where: { id: 'broadcast', status: GreeterBroadcastStatus.DRAFT },
      data: expect.objectContaining({
        status: GreeterBroadcastStatus.SCHEDULED,
        scheduledAt: future,
      }),
    });
    expect(prisma.greeterBroadcast.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'broadcast', workspaceId: 'w', botIntegrationId: 'b' },
      }),
    );
    expect(result.status).toBe(GreeterBroadcastStatus.SCHEDULED);
  });

  it('cancels queued work atomically and reports cancelled progress', async () => {
    const cancelled = row(GreeterBroadcastStatus.CANCELLED);
    const tx = {
      greeterBroadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramBotDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      greeterBroadcastRecipient: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      greeterBroadcast: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(row(GreeterBroadcastStatus.SCHEDULED))
          .mockResolvedValueOnce(cancelled),
      },
      greeterBroadcastRecipient: {
        groupBy: jest.fn().mockResolvedValue([
          {
            status: GreeterBroadcastRecipientStatus.CANCELLED,
            _count: { _all: 2 },
          },
        ]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const result = await service(prisma).cancel('admin', 'b', 'broadcast');
    expect(tx.greeterBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'broadcast' }),
        data: expect.objectContaining({
          status: GreeterBroadcastStatus.CANCELLED,
        }),
      }),
    );
    expect(tx.telegramBotDelivery.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.greeterBroadcastRecipient.updateMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: GreeterBroadcastStatus.CANCELLED,
      progress: { total: 2, pending: 0, sent: 0, failed: 0, blocked: 0 },
    });
  });

  it('refuses cancellation after terminal completion', async () => {
    const prisma = {
      greeterBroadcast: {
        findFirst: jest
          .fn()
          .mockResolvedValue(row(GreeterBroadcastStatus.COMPLETED)),
      },
    } as any;
    await expect(
      service(prisma).cancel('admin', 'b', 'broadcast'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('materializes the estimated audience once and queues each recipient with a stable key', async () => {
    const audienceRows = [
      { telegramBotUserId: 'u1', channelId: 'c1' },
      { telegramBotUserId: 'u2', channelId: 'c2' },
    ];
    const recipients = audienceRows.map((item, index) => ({
      id: `r${index + 1}`,
      broadcastId: 'broadcast',
      status: GreeterBroadcastRecipientStatus.PENDING,
      ...item,
      telegramUser: {
        telegramChatId: String(index + 10),
        blockedAt: null,
        firstName: `User${index + 1}`,
      },
      acquiredChannel: { title: `Channel${index + 1}`, username: null },
    }));
    const prisma = {
      greeterBroadcast: {
        findUnique: jest.fn().mockResolvedValue(
          row(GreeterBroadcastStatus.SCHEDULED, {
            scheduledAt: new Date('2000-01-01T00:00:00Z'),
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterBroadcastRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue(recipients),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const audiences = { resolve: jest.fn().mockResolvedValue(audienceRows) };
    const deliveries = {
      enqueueSendMessage: jest
        .fn()
        .mockImplementation(({ telegramBotUserId }) =>
          Promise.resolve({ id: `d-${telegramBotUserId}` }),
        ),
    };
    await service(prisma, audiences, deliveries).dispatchBroadcast('broadcast');
    expect(prisma.greeterBroadcastRecipient.createMany).toHaveBeenCalledWith({
      data: [
        {
          broadcastId: 'broadcast',
          telegramBotUserId: 'u1',
          acquiredChannelId: 'c1',
        },
        {
          broadcastId: 'broadcast',
          telegramBotUserId: 'u2',
          acquiredChannelId: 'c2',
        },
      ],
      skipDuplicates: true,
    });
    expect(deliveries.enqueueSendMessage).toHaveBeenCalledTimes(2);
    expect(deliveries.enqueueSendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'greeter-broadcast:broadcast:u1',
        chatId: '10',
      }),
    );
    expect(deliveries.enqueueSendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: 'greeter-broadcast:broadcast:u2',
        chatId: '11',
      }),
    );
  });

  it('continues queuing recipient 2 when recipient 1 enqueue fails', async () => {
    const audienceRows = [
      { telegramBotUserId: 'u1', channelId: 'c1' },
      { telegramBotUserId: 'u2', channelId: 'c2' },
    ];
    const recipients = audienceRows.map((item, index) => ({
      id: `r${index + 1}`,
      broadcastId: 'broadcast',
      status: GreeterBroadcastRecipientStatus.PENDING,
      ...item,
      telegramUser: {
        telegramChatId: String(index + 10),
        blockedAt: null,
        firstName: `User${index + 1}`,
      },
      acquiredChannel: { title: `Channel${index + 1}`, username: null },
    }));
    const prisma = {
      greeterBroadcast: {
        findUnique: jest.fn().mockResolvedValue(
          row(GreeterBroadcastStatus.SCHEDULED, {
            scheduledAt: new Date('2000-01-01T00:00:00Z'),
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterBroadcastRecipient: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue(recipients),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const deliveries = {
      enqueueSendMessage: jest
        .fn()
        .mockRejectedValueOnce(new Error('queue unavailable'))
        .mockResolvedValueOnce({ id: 'd-u2' }),
    };

    await expect(
      service(
        prisma,
        { resolve: jest.fn().mockResolvedValue(audienceRows) },
        deliveries,
      ).dispatchBroadcast('broadcast'),
    ).resolves.toBeUndefined();

    expect(deliveries.enqueueSendMessage).toHaveBeenCalledTimes(2);
    expect(deliveries.enqueueSendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        telegramBotUserId: 'u2',
        idempotencyKey: 'greeter-broadcast:broadcast:u2',
      }),
    );
    expect(prisma.greeterBroadcastRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: GreeterBroadcastRecipientStatus.PENDING },
      data: {
        lastError: 'queue unavailable',
        nextQueueAttemptAt: expect.any(Date),
      },
    });
    expect(prisma.greeterBroadcastRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'r2',
        status: GreeterBroadcastRecipientStatus.PENDING,
        broadcast: { status: GreeterBroadcastStatus.PROCESSING },
      },
      data: {
        status: GreeterBroadcastRecipientStatus.QUEUED,
        deliveryId: 'd-u2',
        lastError: null,
        nextQueueAttemptAt: null,
      },
    });
  });

  it('reports sent, failed, blocked and pending recipient outcomes without overlap', async () => {
    const prisma = {
      greeterBroadcast: {
        findFirst: jest
          .fn()
          .mockResolvedValue(row(GreeterBroadcastStatus.PARTIALLY_FAILED)),
      },
      greeterBroadcastRecipient: {
        groupBy: jest.fn().mockResolvedValue([
          {
            status: GreeterBroadcastRecipientStatus.QUEUED,
            _count: { _all: 2 },
          },
          { status: GreeterBroadcastRecipientStatus.SENT, _count: { _all: 5 } },
          {
            status: GreeterBroadcastRecipientStatus.FAILED,
            _count: { _all: 1 },
          },
          {
            status: GreeterBroadcastRecipientStatus.BLOCKED,
            _count: { _all: 3 },
          },
        ]),
      },
    } as any;
    await expect(
      service(prisma).detail('admin', 'b', 'broadcast'),
    ).resolves.toMatchObject({
      progress: { total: 11, pending: 2, sent: 5, failed: 1, blocked: 3 },
    });
  });
});
