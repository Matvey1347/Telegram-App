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

  it('shows and removes the same temporary loading message for a chat update', async () => {
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 42 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
    };
    const service = new TelegramBotLoadingFeedbackService(api as any);

    const loading = await service.show(context);
    await service.remove(loading);

    expect(api.sendMessage).toHaveBeenCalledWith('local-token', {
      chat_id: 'chat-1',
      text: '⏳ Loading…',
    });
    expect(api.deleteMessage).toHaveBeenCalledWith('local-token', {
      chat_id: 'chat-1',
      message_id: 42,
    });
  });

  it('does not add chat work to a pre-checkout update', async () => {
    const api = { sendMessage: jest.fn(), deleteMessage: jest.fn() };
    const service = new TelegramBotLoadingFeedbackService(api as any);

    await expect(
      service.show({
        ...context,
        update: { pre_checkout_query: { id: 'pc' } },
      } as any),
    ).resolves.toBeNull();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
