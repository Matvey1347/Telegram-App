import { TelegramBotDeliveryScheduler } from './telegram-bot-delivery-scheduler';

describe('TelegramBotDeliveryScheduler', () => {
  afterEach(() => jest.useRealTimers());

  it('does not delay an earlier shared wake when a later delivery is notified', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-08T00:00:00.000Z'));
    const early = new Date('2026-09-08T00:00:10.000Z');
    const later = new Date('2026-09-08T00:01:00.000Z');
    const findNextDueAt = jest
      .fn()
      .mockResolvedValueOnce(early)
      .mockResolvedValue(null);
    const processDue = jest.fn().mockResolvedValue(1);
    const scheduler = new TelegramBotDeliveryScheduler({
      batchSize: 25,
      findNextDueAt,
      processDue,
      onError: jest.fn(),
    });

    await scheduler.bootstrap();
    scheduler.notify(later);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(processDue).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });
});
