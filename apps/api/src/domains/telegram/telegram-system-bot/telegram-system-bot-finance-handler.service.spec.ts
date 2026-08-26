/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { TelegramSystemBotFinanceHandlerService } from './telegram-system-bot-finance-handler.service';

function setup() {
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    editMessageText: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
  };
  const finance = {
    accountsSummary: jest.fn(),
    beginTransaction: jest.fn(),
    beginTransfer: jest.fn(),
    choose: jest.fn(),
    submitInput: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
  };
  const service = new TelegramSystemBotFinanceHandlerService(
    { token: 'token' } as never,
    api as never,
    finance as never,
  );
  return { service, api, finance };
}

describe('TelegramSystemBotFinanceHandlerService', () => {
  it('shows accounts, transaction types, and transfers in the finance menu', async () => {
    const { service, api } = setup();

    await service.menu('44');

    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '44',
        reply_markup: {
          inline_keyboard: expect.arrayContaining([
            [expect.objectContaining({ callback_data: 'finance:accounts' })],
            expect.arrayContaining([
              expect.objectContaining({
                callback_data: 'finance:begin:income',
              }),
              expect.objectContaining({
                callback_data: 'finance:begin:expense',
              }),
            ]),
            [
              expect.objectContaining({
                callback_data: 'finance:begin:transfer',
              }),
            ],
          ]),
        },
      }),
    );
  });

  it('renders account balances returned by the finance domain service', async () => {
    const { service, api, finance } = setup();
    finance.accountsSummary.mockResolvedValue([
      {
        id: 'account',
        name: 'Main',
        balance: 1250.5,
        currency: 'USD',
        isActive: true,
      },
    ]);

    await service.callback({
      chatId: '44',
      connectionId: 'connection',
      userId: 'user',
      workspaceId: 'workspace',
      callback: 'finance:accounts',
    });

    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('Main: 1,250.50 USD'),
      }),
    );
  });

  it('does not record a transaction before the confirmation callback', async () => {
    const { service, api, finance } = setup();
    finance.submitInput.mockResolvedValue({
      kind: 'CONFIRM',
      text: 'Confirm transaction',
      callbackData: 'finance:confirm:draft',
    });

    await service.pendingInput({
      chatId: '44',
      connectionId: 'connection',
      userId: 'user',
      workspaceId: 'workspace',
      text: '125 hosting',
    });

    expect(finance.confirm).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              expect.objectContaining({
                callback_data: 'finance:confirm:draft',
              }),
              expect.objectContaining({
                callback_data: 'finance:cancel:draft',
              }),
            ],
          ],
        },
      }),
    );
  });

  it('edits one control message through finance choices', async () => {
    const { service, api, finance } = setup();
    finance.beginTransaction.mockResolvedValue({
      kind: 'ACCOUNT',
      text: 'Choose account:',
      controlMessageId: 77,
      buttons: [
        { text: '💳 Main · USD', callback_data: 'finance:account:draft:0' },
        { text: '💳 Cash · USD', callback_data: 'finance:account:draft:1' },
      ],
    });

    await service.callback({
      chatId: '44',
      connectionId: 'connection',
      userId: 'user',
      workspaceId: 'workspace',
      callback: 'finance:begin:expense',
      messageId: 77,
    });

    expect(finance.beginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ controlMessageId: 77 }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '44',
        message_id: 77,
        text: 'Choose account:',
        reply_markup: {
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                callback_data: 'finance:account:draft:0',
              }),
              expect.objectContaining({
                callback_data: 'finance:account:draft:1',
              }),
            ]),
          ]),
        },
      }),
    );
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
