import { FinanceBotIconInputService } from './finance-bot-icon-input.service';

describe('FinanceBotIconInputService', () => {
  const flows = {
    expectsIcon: jest.fn(),
    consumeIcon: jest.fn(),
  };
  const icons = { media: jest.fn(), text: jest.fn() };
  const botApi = { deleteMessage: jest.fn() };
  const service = new FinanceBotIconInputService(
    flows as never,
    icons as never,
    botApi as never,
  );
  const input = {
    profileId: 'profile-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses a photo as the active Finance entity icon instead of a receipt', async () => {
    flows.expectsIcon.mockResolvedValue(true);
    icons.media.mockResolvedValue('image:https://cdn.test/icon.jpg');
    flows.consumeIcon.mockResolvedValue({
      kind: 'prompt',
      flow: 'CATEGORY_CREATE',
      step: 'CATEGORY_PARENT',
      payload: {},
    });
    botApi.deleteMessage.mockResolvedValue(true);

    await expect(
      service.consume('token', '44', input, {
        message_id: 7,
        photo: [{ file_id: 'photo-1' }],
      }),
    ).resolves.toMatchObject({ handled: true, result: { kind: 'prompt' } });
    expect(flows.consumeIcon).toHaveBeenCalledWith({
      ...input,
      iconSource: 'image:https://cdn.test/icon.jpg',
    });
    expect(botApi.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '44',
      message_id: 7,
    });
  });

  it('leaves ordinary receipt photos untouched when no icon step is active', async () => {
    flows.expectsIcon.mockResolvedValue(false);

    await expect(
      service.consume('token', '44', input, {
        photo: [{ file_id: 'receipt-1' }],
      }),
    ).resolves.toEqual({ handled: false });
    expect(icons.media).not.toHaveBeenCalled();
  });
});
