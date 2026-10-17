import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotApplicationDispatcherService } from './telegram-bot-application-dispatcher.service';

describe('TelegramBotApplicationDispatcherService interaction feedback', () => {
  const logger = { writeStructured: jest.fn() };

  it('does not put Finance behind the temporary Loading round trip', async () => {
    const finance = { handle: jest.fn().mockResolvedValue(undefined) };
    const loading = { show: jest.fn(), remove: jest.fn() };
    const service = new TelegramBotApplicationDispatcherService(finance as never, logger as never, loading as never);
    await expect(service.dispatch({ bot: { applicationType: TelegramBotApplicationType.FINANCE } } as never)).resolves.toEqual({ handled: true });
    expect(loading.show).not.toHaveBeenCalled();
    expect(loading.remove).toHaveBeenCalledWith(null);
  });

  it('does not dispatch a legacy Simple Finance integration before its retirement migration runs', async () => {
    const finance = { handle: jest.fn() };
    const loading = { remove: jest.fn() };
    const service = new TelegramBotApplicationDispatcherService(
      finance as never,
      logger as never,
      loading as never,
    );

    await expect(
      service.dispatch({
        bot: { applicationType: TelegramBotApplicationType.SIMPLE_FINANCE },
      } as never),
    ).resolves.toEqual({ handled: false });

    expect(finance.handle).not.toHaveBeenCalled();
  });
});
