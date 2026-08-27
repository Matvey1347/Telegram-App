/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- focused handler test doubles */
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';

function setup() {
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
    deleteMessage: jest.fn().mockResolvedValue(true),
  } as any;
  const connections = {
    requireEnabledConnection: jest.fn().mockResolvedValue({
      id: 'connection-1',
      userId: 'user-1',
      telegramUserId: '44',
    }),
    requireCurrentWorkspace: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      role: 'admin',
      workspace: { name: 'Workspace', timezone: 'UTC' },
    }),
    workspacesForConnection: jest.fn().mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `workspace-${index}`,
        name: `Workspace ${index}`,
        selected: index === 0,
      })),
    ),
  } as any;
  const domain = {
    channels: jest.fn().mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `channel-${index}`,
        title: `Channel ${index}`,
        isActive: true,
      })),
    ),
  } as any;
  const service = new TelegramSystemBotHandlerService(
    { token: 'token' } as any,
    api,
    connections,
    domain,
    {} as any,
  );
  return { api, service };
}

function message(text: string) {
  return {
    message: {
      chat: { id: 44, type: 'private' },
      from: { id: 44 },
      text,
    },
  };
}

describe('Telegram System Bot handler option layouts', () => {
  it('packs workspace choices into two columns', async () => {
    const { api, service } = setup();

    await service.handle(message('/workspace'));

    expect(
      api.sendMessage.mock.calls
        .at(-1)[1]
        .reply_markup.inline_keyboard.map((row: unknown[]) => row.length),
    ).toEqual([2, 2, 1, 2]);
  });
});
