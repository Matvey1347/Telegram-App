import { TelegramChannelRemindersDueService } from './telegram-channel-reminders-due.service';

const now = new Date('2026-11-24T08:00:00Z');
const workspace = {
  id: 'ws',
  timezone: 'Europe/Warsaw',
  coverageNotificationSentKeys: [],
  coverageNotificationDestination: 'TELEGRAM_GROUP',
  publicationNotificationDueAt: now,
  publicationNotificationExcludedChannelIds: ['removed'],
};

function setup() {
  const prisma = {
    $executeRaw: jest.fn(),
    workspace: {
      findMany: jest.fn().mockResolvedValue([workspace]),
      findFirst: jest.fn().mockResolvedValue({ id: workspace.id }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workspaceMember: {
      findFirst: jest.fn().mockResolvedValue({ id: 'owner' }),
    },
    telegramChannel: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'in',
          title: '💌 A & B 💌',
          presentationIcon: {
            id: 'icon',
            type: 'emoji',
            emoji: '![📢](tg://emoji?id=42)',
          },
        },
        { id: 'new', title: 'New channel' },
        { id: 'plenty', title: 'Plenty' },
      ]),
    },
  };
  const booking = {
    summariesForChannels: jest.fn().mockResolvedValue(
      new Map([
        ['in', { hasPostsToday: true, bookedThroughDate: '2026-11-27' }],
        ['plenty', { hasPostsToday: true, bookedThroughDate: '2026-11-29' }],
      ]),
    ),
  };
  const delivery = { deliver: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new TelegramChannelRemindersDueService(
      prisma as never,
      booking as never,
      delivery as never,
    ),
    prisma,
    booking,
    delivery,
  };
}

describe('publication coverage due work', () => {
  it('checks all active eligible channels in one booking query and groups by coverage', async () => {
    const { service, prisma, booking, delivery } = setup();
    expect(await service.processDueActions(now)).toEqual({ processed: 1 });
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws',
          archivedAt: null,
          isActive: true,
          id: { notIn: ['removed'] },
        },
      }),
    );
    expect(booking.summariesForChannels).toHaveBeenCalledTimes(1);
    expect(
      delivery.deliver.mock.calls.map(([message]) => message.body),
    ).toEqual(['A & B', 'New channel']);
    expect(delivery.deliver.mock.calls[0][0].telegramHtml).toContain(
      '<tg-emoji emoji-id="42">📢</tg-emoji> A &amp; B',
    );
    expect(prisma.workspace.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ws',
          publicationNotificationDueAt: now,
        }),
        data: {
          publicationNotificationDueAt: new Date('2026-11-25T08:00:00Z'),
        },
      }),
    );
  });

  it('persists Telegram receipts only for successfully sent batches', async () => {
    const { service, prisma, delivery } = setup();
    delivery.deliver.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await service.processDueActions(now);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining('2026-11-24:TELEGRAM_GROUP:3:'),
      '2026-11-24',
      'ws',
    );
  });

  it('leaves a failed occurrence due for retry', async () => {
    const { service, prisma, delivery } = setup();
    delivery.deliver.mockRejectedValueOnce(new Error('delivery failed'));
    await expect(service.processDueActions(now)).rejects.toThrow(
      'delivery failed',
    );
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
  });

  it('does no work for disabled or rescheduled workspaces', async () => {
    const { service, prisma, booking, delivery } = setup();
    prisma.workspace.findMany.mockResolvedValueOnce([]);
    expect(await service.processDueActions(now)).toEqual({ processed: 0 });
    expect(booking.summariesForChannels).not.toHaveBeenCalled();
    prisma.workspace.findFirst.mockResolvedValueOnce(null);
    await service.processDueActions(now);
    expect(delivery.deliver).not.toHaveBeenCalled();
  });
});
