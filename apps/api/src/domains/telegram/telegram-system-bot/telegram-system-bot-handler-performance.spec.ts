/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- focused handler test doubles */
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';
import { SYSTEM_BOT_HELP_TEXT } from './telegram-system-bot-menu';

function handler(
  api: Record<string, unknown>,
  connections: Record<string, unknown>,
  domain: Record<string, unknown> = {},
  finance: Record<string, unknown> = {},
) {
  return new TelegramSystemBotHandlerService(
    { token: 'token' } as any,
    api as any,
    connections as any,
    domain as any,
    finance as any,
  );
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

describe('TelegramSystemBotHandlerService critical path', () => {
  it('serves help without typing, connection, or workspace context', async () => {
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      sendChatAction: jest.fn(),
    };
    const connections = {
      requireEnabledConnection: jest.fn(),
      requireCurrentWorkspace: jest.fn(),
    };

    await handler(api, connections).handle(message('/help'));

    expect(api.sendMessage).toHaveBeenCalledWith('token', {
      chat_id: '44',
      text: SYSTEM_BOT_HELP_TEXT,
    });
    expect(api.sendChatAction).not.toHaveBeenCalled();
    expect(connections.requireEnabledConnection).not.toHaveBeenCalled();
    expect(connections.requireCurrentWorkspace).not.toHaveBeenCalled();
  });

  it('still rejects workspace-bound commands for a disabled connection', async () => {
    const api = {
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };
    const connections = {
      requireEnabledConnection: jest
        .fn()
        .mockRejectedValue(new Error('disabled')),
      requireCurrentWorkspace: jest.fn(),
    };
    const domain = { stats: jest.fn() };

    await handler(api, connections, domain).handle(message('/stats'));

    expect(connections.requireCurrentWorkspace).not.toHaveBeenCalled();
    expect(domain.stats).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('Reconnect your account'),
      }),
    );
  });

  it('acknowledges a callback before context work and reuses its connection', async () => {
    const calls: string[] = [];
    const connection = {
      id: 'connection',
      userId: 'user',
      telegramUserId: '44',
      currentWorkspaceId: 'workspace',
    };
    const api = {
      answerCallbackQuery: jest.fn().mockImplementation(() => {
        calls.push('ack');
        return Promise.resolve();
      }),
      sendChatAction: jest.fn().mockImplementation(() => {
        calls.push('typing');
        return Promise.resolve();
      }),
    };
    const connections = {
      requireEnabledConnection: jest.fn().mockImplementation(() => {
        calls.push('connection');
        return Promise.resolve(connection);
      }),
      requireCurrentWorkspace: jest.fn().mockImplementation(() => {
        calls.push('workspace');
        return Promise.resolve({
          workspaceId: 'workspace',
          workspace: { name: 'Business', timezone: 'UTC' },
        });
      }),
    };
    const finance = {
      menu: jest.fn().mockImplementation(() => {
        calls.push('action');
        return Promise.resolve();
      }),
    };
    const service = handler(api, connections, {}, finance);

    await service.handle({
      callback_query: {
        id: 'callback',
        data: 'finance',
        from: { id: 44 },
        message: { chat: { id: 44, type: 'private' } },
      },
    });

    expect(calls[0]).toBe('ack');
    expect(calls.indexOf('ack')).toBeLessThan(calls.indexOf('connection'));
    expect(connections.requireEnabledConnection).toHaveBeenCalledTimes(1);
    expect(connections.requireCurrentWorkspace).toHaveBeenCalledWith(
      connection,
    );
  });

  it('does not let pending typing delay a useful connection-only response', async () => {
    const api = {
      sendChatAction: jest.fn().mockReturnValue(new Promise(() => undefined)),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };
    const connection = {
      id: 'connection',
      userId: 'user',
      telegramUserId: '44',
      currentWorkspaceId: 'workspace',
    };
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue(connection),
      workspacesForConnection: jest.fn().mockResolvedValue([]),
    };

    const handling = handler(api, connections).handle(message('/workspace'));
    const outcome = await Promise.race([
      handling.then(() => 'handled'),
      new Promise<string>((resolve) =>
        setImmediate(() => resolve('typing-blocked')),
      ),
    ]);

    expect(outcome).toBe('handled');
    expect(api.sendMessage).toHaveBeenCalled();
    expect(connections.workspacesForConnection).toHaveBeenCalledWith(
      connection,
    );
  });

  it('handles a rejected best-effort typing request', async () => {
    const api = {
      sendChatAction: jest.fn().mockRejectedValue(new Error('unavailable')),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
        telegramUserId: '44',
        currentWorkspaceId: 'workspace',
      }),
      workspacesForConnection: jest.fn().mockResolvedValue([]),
    };

    await expect(
      handler(api, connections).handle(message('/workspace')),
    ).resolves.toEqual({ message_id: 1 });
  });

  it('reuses the selected workspace list for an established start', async () => {
    const api = {
      sendChatAction: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };
    const connection = {
      id: 'connection',
      userId: 'user',
      telegramUserId: '44',
      currentWorkspaceId: 'workspace',
    };
    const selectedWorkspace = {
      id: 'workspace',
      name: 'Business',
      role: 'admin',
      selected: true,
      avatarPresentation: null,
    };
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue(connection),
      workspacesForConnection: jest.fn().mockResolvedValue([selectedWorkspace]),
      requireCurrentWorkspace: jest.fn(),
    };

    await handler(api, connections).handle(message('/start'));

    expect(connections.requireEnabledConnection).toHaveBeenCalledTimes(1);
    expect(connections.workspacesForConnection).toHaveBeenCalledWith(
      connection,
    );
    expect(connections.requireCurrentWorkspace).not.toHaveBeenCalled();
    expect(api.sendChatAction).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '44',
        text: '🏢 Workspace: Business',
      }),
    );
  });
});
