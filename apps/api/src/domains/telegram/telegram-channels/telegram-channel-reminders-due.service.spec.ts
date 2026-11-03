import { TelegramChannelRemindersDueService } from './telegram-channel-reminders-due.service';

describe('channel post reminders', () => {
  const now = new Date('2026-11-03T08:00:00Z');
  function setup() {
    const rows = ['one', 'two'].map((id) => ({
      id,
      channelId: id,
      workspaceId: 'workspace',
      nextDueAt: now,
      workspace: { timezone: 'Europe/Warsaw' },
      channel: {
        title: id,
        isActive: true,
        archivedAt: null,
        assignedMemberId: 'member',
      },
      templateId: 'template',
      template: { daysBefore: [1, 2, 3], notifyEmpty: true, updatedAt: now },
    }));
    const prisma = {
      telegramChannelReminderAssignment: {
        findMany: jest.fn().mockResolvedValue(rows),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const booking = {
      summariesForChannels: jest
        .fn()
        .mockResolvedValue(
          new Map(
            rows.map((row) => [
              row.channelId,
              { hasPostsToday: false, bookedThroughDate: '2026-11-04' },
            ]),
          ),
        ),
    };
    const delivery = { deliver: jest.fn().mockResolvedValue(undefined) };
    return {
      prisma,
      booking,
      delivery,
      service: new TelegramChannelRemindersDueService(
        prisma as never,
        booking as never,
        delivery as never,
      ),
    };
  }
  it('groups empty today channels even when tomorrow has scheduled posts', async () => {
    const { service, delivery, prisma } = setup();
    await service.processDueActions(now);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(delivery.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Нет запланированных постов на сегодня',
        body: '• one\n• two',
        memberId: 'member',
      }),
    );
    expect(
      prisma.telegramChannelReminderAssignment.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nextDueAt: new Date('2026-11-03T20:00:00Z') },
      }),
    );
  });
  it('keeps work due when delivery fails so scheduler can retry', async () => {
    const { service, delivery, prisma } = setup();
    delivery.deliver.mockRejectedValue(new Error('temporary failure'));
    await expect(service.processDueActions(now)).rejects.toThrow(
      'temporary failure',
    );
    expect(
      prisma.telegramChannelReminderAssignment.updateMany,
    ).not.toHaveBeenCalled();
  });
  it('sends the configured horizon once and schedules the next morning', async () => {
    const { service, delivery, booking, prisma } = setup();
    booking.summariesForChannels.mockResolvedValue(
      new Map(
        ['one', 'two'].map((id) => [
          id,
          { hasPostsToday: true, bookedThroughDate: '2026-11-06' },
        ]),
      ),
    );
    await service.processDueActions(now);
    expect(delivery.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Посты запланированы ещё на 3 дн.' }),
    );
    expect(
      prisma.telegramChannelReminderAssignment.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nextDueAt: new Date('2026-11-04T08:00:00Z') },
      }),
    );
  });
  it('splits a long channel list into deterministic messages within the Telegram limit', async () => {
    const { service, prisma, booking, delivery } = setup();
    const sample = (
      await prisma.telegramChannelReminderAssignment.findMany()
    )[0];
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ...sample,
      id: `channel-${String(i).padStart(3, '0')}`,
      channelId: `channel-${String(i).padStart(3, '0')}`,
      channel: { ...sample.channel, title: `Channel ${i} ` + 'x'.repeat(80) },
    }));
    prisma.telegramChannelReminderAssignment.findMany.mockResolvedValue(rows);
    booking.summariesForChannels.mockResolvedValue(
      new Map(
        rows.map((row) => [
          row.channelId,
          { hasPostsToday: false, bookedThroughDate: null },
        ]),
      ),
    );
    await service.processDueActions(now);
    const calls = delivery.deliver.mock.calls.map(
      ([input]) => input as { sourceKey: string; body: string },
    );
    expect(calls.length).toBeGreaterThan(1);
    expect(new Set(calls.map((call) => call.sourceKey)).size).toBe(
      calls.length,
    );
    expect(calls.every((call) => call.body.length <= 3500)).toBe(true);
    expect(calls.flatMap((call) => call.body.split('\n'))).toHaveLength(100);
  });
  it('advances successful recipients while leaving failed recipients due for retry', async () => {
    const { service, prisma, delivery } = setup();
    const rows = await prisma.telegramChannelReminderAssignment.findMany();
    rows[0].channel.assignedMemberId = 'failed-member';
    rows[1].channel.assignedMemberId = 'successful-member';
    delivery.deliver.mockImplementation(async (input: { memberId: string }) => {
      if (input.memberId === 'failed-member')
        throw new Error('temporary Telegram error');
    });
    await expect(service.processDueActions(now)).rejects.toThrow(
      'temporary Telegram error',
    );
    expect(delivery.deliver).toHaveBeenCalledTimes(2);
    expect(
      prisma.telegramChannelReminderAssignment.updateMany,
    ).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramChannelReminderAssignment.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ id: 'two', nextDueAt: now }] }),
      }),
    );
  });
});
