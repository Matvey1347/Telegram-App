import { TelegramSystemBotPostFlowOptions } from './telegram-system-bot-post-flow.options';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: 'telegram-user-1',
  chatId: 'chat-1',
  timezone: 'UTC',
};

describe('TelegramSystemBotPostFlowOptions', () => {
  it('keeps only active scoped channels and resolves group options in workspace context', async () => {
    const domain = {
      channels: jest.fn().mockResolvedValue([
        { id: 'inactive', isActive: false },
        { id: 'active', isActive: true },
      ]),
    };
    const groups = {
      optionsForSystemBotPost: jest
        .fn()
        .mockResolvedValue([
          { id: 'system-group', title: 'System Bot posts', isDefault: true },
        ]),
    };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockResolvedValue(groups),
    };
    const service = new TelegramSystemBotPostFlowOptions(
      domain as never,
      moduleRef as never,
    );

    await expect(service.channels(scope)).resolves.toEqual([
      { id: 'active', isActive: true },
    ]);
    await service.groups(scope, 'active');

    expect(domain.channels).toHaveBeenCalledWith(
      scope.workspaceId,
      scope.telegramUserId,
    );
    expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
      { headers: { 'x-workspace-id': scope.workspaceId } },
      expect.anything(),
    );
    expect(groups.optionsForSystemBotPost).toHaveBeenCalledWith(
      scope.userId,
      'active',
    );
  });
});
