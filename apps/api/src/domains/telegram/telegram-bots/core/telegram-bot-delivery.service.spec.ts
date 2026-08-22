/* eslint-disable @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return */
import {
  TelegramBotDeliveryStatus,
  TelegramBotDeliveryType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
} from '@prisma/client';
import { TelegramBotApiError } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotDeliveryService } from './telegram-bot-delivery.service';

const delivery = {
  id: 'delivery-1',
  workspaceId: 'workspace-1',
  botIntegrationId: 'bot-1',
  runtimeInstanceId: null,
  runtimeInstance: null,
  telegramBotUserId: 'bot-user-1',
  chatId: '123',
  type: TelegramBotDeliveryType.SEND_MESSAGE,
  payload: { text: 'hello' },
  scheduledAt: new Date('2026-08-08T10:00:00.000Z'),
  status: TelegramBotDeliveryStatus.PENDING,
  attempts: 0,
  maxAttempts: 3,
  lockedAt: null,
  lockedUntil: null,
  lastError: null,
  sentAt: null,
  idempotencyKey: 'key-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  botIntegration: {
    runtimeInstances: [
      {
        id: 'runtime-prod',
        environment: TelegramBotRuntimeEnvironment.PRODUCTION,
        runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
        botTokenEncrypted: 'token-enc',
        botTokenIv: 'token-iv',
        botTokenAuthTag: 'token-tag',
      },
    ],
  },
};

function setup(
  sendMessage = jest.fn().mockResolvedValue({ message_id: 1 }),
  environment: TelegramBotRuntimeEnvironment = TelegramBotRuntimeEnvironment.PRODUCTION,
  runtimeId: string | null = null,
  financeReminders = { scheduleNext: jest.fn().mockResolvedValue(null) },
) {
  const prisma = {
    telegramBotDelivery: {
      upsert: jest.fn().mockResolvedValue(delivery),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([delivery]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    telegramBotUser: {
      update: jest.fn().mockResolvedValue({}),
    },
    greeterSequenceStepExecution: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    greeterBroadcastRecipient: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    greeterBroadcast: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((operation) =>
      typeof operation === 'function'
        ? operation(prisma)
        : Promise.all(operation),
    ),
  };
  const encryption = {
    decrypt: jest.fn().mockReturnValue('bot-token'),
  };
  const botApi = { sendMessage };
  const service = new TelegramBotDeliveryService(
    prisma as never,
    encryption as never,
    botApi as never,
    { current: () => environment } as never,
    { currentRuntimeId: () => runtimeId } as never,
    financeReminders as never,
  );
  return { service, prisma, botApi, financeReminders };
}

describe('TelegramBotDeliveryService', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T10:05:00.000Z'));
  });

  beforeEach(() => {
    jest.clearAllTimers();
    jest.setSystemTime(new Date('2026-08-08T10:05:00.000Z'));
  });

  it('pins an immediate delivery to the originating LOCAL runtime', async () => {
    const { service, prisma } = setup(
      undefined,
      TelegramBotRuntimeEnvironment.LOCAL,
      'runtime-local',
    );

    await service.enqueueSendMessage({
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      chatId: '123',
      text: 'local response',
      idempotencyKey: 'update-1',
    });

    expect(prisma.telegramBotDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          runtimeInstanceId: 'runtime-local',
          idempotencyKey: 'runtime-local:update-1',
        }),
      }),
    );
  });

  it('claims only LOCAL-pinned deliveries in a LOCAL process', async () => {
    const { service, prisma } = setup(
      undefined,
      TelegramBotRuntimeEnvironment.LOCAL,
    );

    await service.claimDueDeliveries(25);

    expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              runtimeInstance: {
                is: { environment: TelegramBotRuntimeEnvironment.LOCAL },
              },
            },
          ],
        }),
      }),
    );
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('uses update-scoped keys so separate starts create deliveries while retries upsert one', async () => {
    const { service, prisma } = setup();
    const enqueue = (idempotencyKey: string) =>
      service.enqueueSendMessage({
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'bot-user-1',
        chatId: '123',
        text: 'Welcome',
        idempotencyKey,
      });

    await enqueue('finance-main-menu:update-1');
    await enqueue('finance-main-menu:update-1');
    await enqueue('finance-main-menu:update-2');

    expect(
      prisma.telegramBotDelivery.upsert.mock.calls.map((call) => call[0].where),
    ).toEqual([
      {
        botIntegrationId_idempotencyKey: {
          botIntegrationId: 'bot-1',
          idempotencyKey: 'finance-main-menu:update-1',
        },
      },
      {
        botIntegrationId_idempotencyKey: {
          botIntegrationId: 'bot-1',
          idempotencyKey: 'finance-main-menu:update-1',
        },
      },
      {
        botIntegrationId_idempotencyKey: {
          botIntegrationId: 'bot-1',
          idempotencyKey: 'finance-main-menu:update-2',
        },
      },
    ]);
    expect(prisma.telegramBotDelivery.upsert.mock.calls[0][0].update).toEqual(
      {},
    );
  });

  it('asks the Finance reminder port for the next durable occurrence after send', async () => {
    const nextDelivery = {
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'bot-user-1',
      financeReminderId: 'reminder-1',
      chatId: '123',
      text: 'Next reminder',
      scheduledAt: new Date('2026-09-01T09:00:00.000Z'),
      idempotencyKey: 'finance-reminder:reminder-1:next',
    };
    const financeReminders = {
      scheduleNext: jest.fn().mockResolvedValue(nextDelivery),
    };
    const { service, prisma } = setup(
      undefined,
      TelegramBotRuntimeEnvironment.PRODUCTION,
      null,
      financeReminders,
    );
    prisma.telegramBotDelivery.findMany.mockResolvedValue([
      { ...delivery, financeReminderId: 'reminder-1' },
    ]);

    await service.processDue();

    expect(financeReminders.scheduleNext).toHaveBeenCalledWith('reminder-1');
    expect(prisma.telegramBotDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          financeReminderId: 'reminder-1',
          idempotencyKey: nextDelivery.idempotencyKey,
          scheduledAt: nextDelivery.scheduledAt,
        }),
      }),
    );
  });

  it('claims due deliveries with a database lease before sending', async () => {
    const { service, prisma, botApi } = setup();

    await service.processDue();

    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'delivery-1' }),
        data: expect.objectContaining({
          status: TelegramBotDeliveryStatus.PROCESSING,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
    expect(botApi.sendMessage).toHaveBeenCalledWith('bot-token', {
      chat_id: '123',
      text: 'hello',
      parse_mode: undefined,
    });
    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: TelegramBotDeliveryStatus.PROCESSING,
        }),
        data: expect.objectContaining({
          status: TelegramBotDeliveryStatus.SENT,
        }),
      }),
    );
  });

  it('reclaims expired processing deliveries after a worker crash', async () => {
    const processingDelivery = {
      ...delivery,
      status: TelegramBotDeliveryStatus.PROCESSING,
      lockedUntil: new Date('2026-08-08T10:01:00.000Z'),
    };
    const { service, prisma } = setup();
    prisma.telegramBotDelivery.findMany.mockResolvedValue([processingDelivery]);

    await service.processDue();

    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'delivery-1',
          status: {
            in: [
              TelegramBotDeliveryStatus.PENDING,
              TelegramBotDeliveryStatus.RETRY,
              TelegramBotDeliveryStatus.PROCESSING,
            ],
          },
        }),
      }),
    );
  });

  it('retries transient Telegram API failures', async () => {
    const { service, prisma } = setup(
      jest
        .fn()
        .mockRejectedValue(new TelegramBotApiError('retry later', 'TRANSIENT')),
    );

    await service.processDue();

    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramBotDeliveryStatus.RETRY,
          attempts: 1,
          lastError: 'retry later',
        }),
      }),
    );
  });

  it('marks blocked Telegram users when Telegram reports a blocked chat', async () => {
    const { service, prisma } = setup(
      jest
        .fn()
        .mockRejectedValue(
          new TelegramBotApiError('bot was blocked', 'BLOCKED'),
        ),
    );

    await service.processDue();

    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramBotDeliveryStatus.FAILED,
          lastError: 'bot was blocked',
        }),
      }),
    );
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({
      where: { id: 'bot-user-1' },
      data: { blockedAt: expect.any(Date) },
    });
  });

  it('renders URL and callback-data buttons through the durable payload', async () => {
    const buttonDelivery = {
      ...delivery,
      payload: {
        text: 'choose',
        inlineButtons: [
          [
            { text: 'Website', url: 'https://example.com' },
            { text: 'Confirm', callbackData: 'greeter:confirm' },
          ],
        ],
      },
    };
    const { service, prisma, botApi } = setup();
    prisma.telegramBotDelivery.findMany.mockResolvedValue([buttonDelivery]);

    await service.processDue();

    expect(botApi.sendMessage).toHaveBeenCalledWith(
      'bot-token',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Website', url: 'https://example.com' },
              { text: 'Confirm', callback_data: 'greeter:confirm' },
            ],
          ],
        },
      }),
    );
  });

  it('uses the shared collapsible reply keyboard markup', async () => {
    const keyboardDelivery = {
      ...delivery,
      payload: {
        text: 'choose',
        replyKeyboard: [
          [{ text: 'Open app', webAppUrl: 'https://app.example' }],
        ],
      },
    };
    const { service, prisma, botApi } = setup();
    prisma.telegramBotDelivery.findMany.mockResolvedValue([keyboardDelivery]);

    await service.processDue();

    expect(botApi.sendMessage).toHaveBeenCalledWith(
      'bot-token',
      expect.objectContaining({
        reply_markup: {
          keyboard: [
            [{ text: 'Open app', web_app: { url: 'https://app.example' } }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }),
    );
    expect(botApi.sendMessage.mock.calls[0][1].reply_markup).not.toHaveProperty(
      'is_persistent',
    );
  });

  it('reconciles successful sequence and broadcast delivery state', async () => {
    const { service, prisma } = setup();
    prisma.greeterBroadcastRecipient.findUnique.mockResolvedValue({
      broadcastId: 'broadcast-1',
    });
    prisma.greeterBroadcastRecipient.findMany.mockResolvedValue([
      { status: 'SENT' },
    ]);

    await service.processDue();

    expect(prisma.greeterSequenceStepExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(prisma.greeterBroadcastRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(prisma.greeterBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'broadcast-1', status: { not: 'CANCELLED' } },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('keeps linked work queued and honors Telegram Retry-After', async () => {
    const { service, prisma } = setup(
      jest
        .fn()
        .mockRejectedValue(
          new TelegramBotApiError(
            'Too Many Requests: retry after 17',
            'TRANSIENT',
          ),
        ),
    );

    await service.processDue();

    expect(prisma.telegramBotDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramBotDeliveryStatus.RETRY,
          scheduledAt: new Date('2026-08-08T10:05:17.000Z'),
        }),
      }),
    );
    expect(prisma.greeterSequenceStepExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'QUEUED' }),
      }),
    );
    expect(prisma.greeterBroadcastRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'QUEUED' }),
      }),
    );
  });

  it('reconciles blocked recipients distinctly from ordinary failures', async () => {
    const { service, prisma } = setup(
      jest
        .fn()
        .mockRejectedValue(
          new TelegramBotApiError('bot was blocked', 'BLOCKED'),
        ),
    );

    await service.processDue();

    expect(prisma.greeterSequenceStepExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(prisma.greeterBroadcastRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'BLOCKED' }),
      }),
    );
  });

  it('does not resurrect work cancelled while Telegram send was in flight', async () => {
    const { service, prisma } = setup();
    prisma.telegramBotDelivery.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await service.processDue();

    expect(
      prisma.greeterSequenceStepExecution.updateMany,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('marks a completed mixed-result broadcast partially failed', async () => {
    const { service, prisma } = setup();
    prisma.greeterBroadcastRecipient.findUnique.mockResolvedValue({
      broadcastId: 'broadcast-1',
    });
    prisma.greeterBroadcastRecipient.findMany.mockResolvedValue([
      { status: 'SENT' },
      { status: 'FAILED' },
    ]);
    await service.processDue();
    expect(prisma.greeterBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PARTIALLY_FAILED' }),
      }),
    );
  });

  it('marks a terminal broadcast failed when no recipient was sent', async () => {
    const { service, prisma } = setup(
      jest
        .fn()
        .mockRejectedValue(
          new TelegramBotApiError('invalid target', 'PERMANENT'),
        ),
    );
    prisma.greeterBroadcastRecipient.findUnique.mockResolvedValue({
      broadcastId: 'broadcast-1',
    });
    prisma.greeterBroadcastRecipient.findMany.mockResolvedValue([
      { status: 'FAILED' },
      { status: 'BLOCKED' },
    ]);
    await service.processDue();
    expect(prisma.greeterBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  describe('due-driven scheduling', () => {
    const now = new Date('2026-08-08T10:05:00.000Z');

    function queueDueDates(
      prisma: ReturnType<typeof setup>['prisma'],
      dates: Array<Date | null>,
    ) {
      const queuedDates = [...dates];
      prisma.telegramBotDelivery.findFirst.mockImplementation(
        ({ where }: { where: { status: unknown } }) => {
          if (typeof where.status === 'object') {
            const scheduledAt = queuedDates.shift();
            return Promise.resolve(scheduledAt ? { scheduledAt } : null);
          }
          return Promise.resolve(null);
        },
      );
    }

    it('does not poll the database after an empty bootstrap', async () => {
      const { service, prisma } = setup();
      await service.onModuleInit();

      expect(prisma.telegramBotDelivery.findFirst).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);
      expect(prisma.telegramBotDelivery.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.telegramBotDelivery.findMany).not.toHaveBeenCalled();
    });

    it('arms the nearest delivery and processes it only when due', async () => {
      const { service, prisma, botApi } = setup();
      queueDueDates(prisma, [new Date(now.getTime() + 60_000), null]);
      await service.onModuleInit();

      await jest.advanceTimersByTimeAsync(59_999);
      expect(botApi.sendMessage).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('moves the timer when a newly queued delivery is earlier', async () => {
      const { service, prisma, botApi } = setup();
      queueDueDates(prisma, [new Date(now.getTime() + 60_000), null]);
      await service.onModuleInit();
      prisma.telegramBotDelivery.upsert.mockResolvedValue({
        ...delivery,
        scheduledAt: new Date(now.getTime() + 10_000),
      });

      await service.enqueueSendMessage({
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
        chatId: '123',
        text: 'earlier',
        scheduledAt: new Date(now.getTime() + 10_000),
        idempotencyKey: 'earlier',
      });

      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('keeps one timer when a newly queued delivery is later', async () => {
      const { service, prisma, botApi } = setup();
      queueDueDates(prisma, [new Date(now.getTime() + 10_000), null]);
      await service.onModuleInit();
      prisma.telegramBotDelivery.upsert.mockResolvedValue({
        ...delivery,
        scheduledAt: new Date(now.getTime() + 60_000),
      });

      await service.enqueueSendMessage({
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
        chatId: '123',
        text: 'later',
        scheduledAt: new Date(now.getTime() + 60_000),
        idempotencyKey: 'later',
      });

      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('plans the next delivery after processing the current one', async () => {
      const { service, prisma, botApi } = setup();
      queueDueDates(prisma, [now, new Date(now.getTime() + 30_000), null]);
      await service.onModuleInit();

      await jest.advanceTimersByTimeAsync(0);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('uses a persisted retry as the next due delivery', async () => {
      const { service, prisma, botApi } = setup(
        jest
          .fn()
          .mockRejectedValueOnce(
            new TelegramBotApiError(
              'Too Many Requests: retry after 17',
              'TRANSIENT',
            ),
          )
          .mockResolvedValue({ message_id: 2 }),
      );
      queueDueDates(prisma, [now, new Date(now.getTime() + 17_000), null]);
      await service.onModuleInit();

      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(16_999);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(botApi.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('backs off after a processing error instead of creating a tight loop', async () => {
      const { service, prisma } = setup();
      queueDueDates(prisma, [now, null]);
      prisma.telegramBotDelivery.findMany
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValue([]);
      await service.onModuleInit();

      await jest.advanceTimersByTimeAsync(0);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(2);
    });

    it('uses increasing bounded backoff for persistently due unclaimable deliveries', async () => {
      const { service, prisma } = setup();
      prisma.telegramBotDelivery.findFirst.mockImplementation(
        ({ where }: { where: { status: unknown } }) =>
          Promise.resolve(
            typeof where.status === 'object' ? { scheduledAt: now } : null,
          ),
      );
      prisma.telegramBotDelivery.findMany.mockResolvedValue([]);
      await service.onModuleInit();

      await jest.advanceTimersByTimeAsync(0);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(9_999);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(3);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('lets a new due delivery notify bypass an existing no-progress backoff', async () => {
      const { service, prisma } = setup();
      prisma.telegramBotDelivery.findFirst.mockImplementation(
        ({ where }: { where: { status: unknown } }) =>
          Promise.resolve(
            typeof where.status === 'object' ? { scheduledAt: now } : null,
          ),
      );
      prisma.telegramBotDelivery.findMany.mockResolvedValue([]);
      await service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(1);

      prisma.telegramBotDelivery.upsert.mockResolvedValue({
        ...delivery,
        scheduledAt: now,
      });
      await service.enqueueSendMessage({
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
        chatId: '123',
        text: 'wake now',
        scheduledAt: now,
        idempotencyKey: 'wake-now',
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(prisma.telegramBotDelivery.findMany).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('restores pending deliveries during bootstrap', async () => {
      const { service, prisma } = setup();
      queueDueDates(prisma, [new Date(now.getTime() + 5_000)]);

      await service.onModuleInit();

      expect(jest.getTimerCount()).toBe(1);
      expect(prisma.telegramBotDelivery.findFirst).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent reschedules into one timer', async () => {
      const { service, prisma } = setup();
      prisma.telegramBotDelivery.findFirst.mockImplementation(
        ({ where }: { where: { status: unknown } }) =>
          Promise.resolve(
            typeof where.status === 'object'
              ? { scheduledAt: new Date(now.getTime() + 60_000) }
              : null,
          ),
      );

      await Promise.all([
        service.reschedule(),
        service.reschedule(),
        service.reschedule(),
      ]);

      expect(jest.getTimerCount()).toBe(1);
    });

    it('re-arms a far-future timeout without querying the database', async () => {
      const { service, prisma } = setup();
      queueDueDates(prisma, [new Date(now.getTime() + 3_000_000_000)]);
      await service.onModuleInit();
      const bootstrapQueries =
        prisma.telegramBotDelivery.findFirst.mock.calls.length;

      await jest.advanceTimersByTimeAsync(2_147_483_647);

      expect(jest.getTimerCount()).toBe(1);
      expect(prisma.telegramBotDelivery.findFirst).toHaveBeenCalledTimes(
        bootstrapQueries,
      );
      expect(prisma.telegramBotDelivery.findMany).not.toHaveBeenCalled();
    });
  });
});
