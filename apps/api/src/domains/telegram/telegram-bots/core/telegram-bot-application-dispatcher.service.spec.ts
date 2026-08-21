import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotApplicationDispatcherService } from './telegram-bot-application-dispatcher.service';

describe('TelegramBotApplicationDispatcherService interaction feedback', () => {
  const logger = { writeStructured: jest.fn() };

  it('does not put Finance behind the temporary Loading round trip', async () => {
    const finance = { handle: jest.fn().mockResolvedValue(undefined) };
    const loading = { show: jest.fn(), remove: jest.fn() };
    const service = new TelegramBotApplicationDispatcherService({ handle: jest.fn() } as never, finance as never, logger as never, loading as never);
    await expect(service.dispatch({ bot: { applicationType: TelegramBotApplicationType.FINANCE } } as never)).resolves.toEqual({ handled: true });
    expect(loading.show).not.toHaveBeenCalled();
    expect(loading.remove).toHaveBeenCalledWith(null);
  });

  it('preserves Greeter loading feedback', async () => {
    const greeter = { handle: jest.fn().mockResolvedValue(undefined) };
    const marker = { messageId: 1 };
    const loading = { show: jest.fn().mockResolvedValue(marker), remove: jest.fn() };
    const service = new TelegramBotApplicationDispatcherService(greeter as never, { handle: jest.fn() } as never, logger as never, loading as never);
    const context = { bot: { applicationType: TelegramBotApplicationType.GREETER } } as never;
    await service.dispatch(context);
    expect(loading.show).toHaveBeenCalledWith(context);
    expect(loading.remove).toHaveBeenCalledWith(marker);
  });
});
