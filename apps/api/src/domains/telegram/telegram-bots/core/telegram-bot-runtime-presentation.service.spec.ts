import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';

describe('TelegramBotRuntimePresentationService', () => {
  it('reconciles product-owned Finance commands, locales, and menu button', async () => {
    const botApi = {
      setMyCommands: jest.fn().mockResolvedValue(undefined),
      setChatMenuButton: jest.fn().mockResolvedValue(undefined),
    };
    const finance = {
      commands: jest.fn((locale = 'en') => [
        { command: 'start', description: `start-${locale}` },
      ]),
      supportedLocales: jest.fn().mockReturnValue(['uk', 'ru', 'en']),
      menuButton: jest.fn().mockReturnValue({
        type: 'web_app',
        text: 'Open',
        webAppUrl: 'https://finance.example/finance/bot-1',
      }),
    };
    const greeter = {
      commands: jest.fn().mockReturnValue([]),
      supportedLocales: jest.fn().mockReturnValue([]),
      menuButton: jest.fn().mockReturnValue({ type: 'commands' }),
    };
    const service = new TelegramBotRuntimePresentationService(
      botApi as never,
      greeter as never,
      finance as never,
    );

    await service.reconcile(
      'token',
      TelegramBotApplicationType.FINANCE,
      'bot-1',
    );

    expect(botApi.setMyCommands).toHaveBeenCalledTimes(4);
    expect(botApi.setMyCommands).toHaveBeenCalledWith(
      'token',
      [{ command: 'start', description: 'start-uk' }],
      'uk',
    );
    expect(botApi.setChatMenuButton).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ type: 'web_app' }),
    );
  });

  it('clears commands and restores the command menu for NONE', async () => {
    const botApi = {
      setMyCommands: jest.fn().mockResolvedValue(undefined),
      setChatMenuButton: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TelegramBotRuntimePresentationService(
      botApi as never,
      {} as never,
      {} as never,
    );

    await service.reconcile('token', TelegramBotApplicationType.NONE, 'bot-1');

    expect(botApi.setMyCommands).toHaveBeenCalledWith('token', []);
    expect(botApi.setChatMenuButton).toHaveBeenCalledWith('token', {
      type: 'commands',
    });
  });
});
