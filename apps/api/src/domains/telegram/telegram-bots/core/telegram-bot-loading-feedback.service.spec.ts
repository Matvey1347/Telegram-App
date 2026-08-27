/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
import { TelegramBotLoadingFeedbackService } from './telegram-bot-loading-feedback.service';

describe('TelegramBotLoadingFeedbackService', () => {
  const context = {
    bot: {},
    runtime: {},
    token: 'local-token',
    updateLogId: 'update-1',
    update: { message: { chat: { id: 'chat-1' }, text: 'hello' } },
  } as any;

  it('uses Telegram native typing feedback without creating a message', async () => {
    const api = {
      sendChatAction: jest.fn().mockResolvedValue(true),
    };
    const service = new TelegramBotLoadingFeedbackService(api as any);

    const loading = await service.show(context);
    await service.remove(loading);

    expect(api.sendChatAction).toHaveBeenCalledWith(
      'local-token',
      'chat-1',
      'typing',
    );
  });

  it('does not add chat work to a pre-checkout update', async () => {
    const api = { sendChatAction: jest.fn() };
    const service = new TelegramBotLoadingFeedbackService(api as any);

    await expect(
      service.show({
        ...context,
        update: { pre_checkout_query: { id: 'pc' } },
      } as any),
    ).resolves.toBeNull();
    expect(api.sendChatAction).not.toHaveBeenCalled();
  });
});
