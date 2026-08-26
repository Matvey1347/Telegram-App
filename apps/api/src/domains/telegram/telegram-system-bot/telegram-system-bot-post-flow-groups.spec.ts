/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- focused workflow test doubles */
import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { TelegramSystemBotPostFlowService } from './telegram-system-bot-post-flow.service';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: 'telegram-user-1',
  chatId: 'telegram-user-1',
  timezone: 'UTC',
};
const content = {
  text: 'Post',
  imageUrls: [],
  buttonRows: [],
  mediaGroupId: null,
  sourceTitle: null,
  warnings: [],
};

function workflow(step: string, payload: unknown, version = 2) {
  return {
    id: 'workflow-1',
    connectionId: scope.connectionId,
    workspaceId: scope.workspaceId,
    kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
    step,
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    version,
    controlMessageId: 99,
    payload,
  };
}

function setup() {
  const api = { editMessageText: jest.fn().mockResolvedValue({}) };
  const workflows = {
    get: jest.fn(),
    transition: jest.fn(),
    claimCommit: jest.fn(),
    recordManagedPost: jest.fn(),
  };
  const domain = {
    channels: jest
      .fn()
      .mockResolvedValue([
        { id: 'channel-1', title: 'Channel', isActive: true },
      ]),
  };
  const groups = {
    optionsForSystemBotPost: jest.fn().mockResolvedValue([
      { id: 'system-group', title: 'System Bot posts', isDefault: true },
      { id: 'custom-group', title: 'Ideas', isDefault: false },
    ]),
  };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn().mockResolvedValue(groups),
  };
  const service = new TelegramSystemBotPostFlowService(
    { token: 'token' } as any,
    api as any,
    workflows as any,
    {
      channels: jest.fn((input) =>
        domain.channels(input.workspaceId, input.telegramUserId),
      ),
      groups: jest.fn((input, channelId) =>
        groups.optionsForSystemBotPost(input.userId, channelId),
      ),
    } as any,
    {} as any,
    moduleRef as any,
  );
  return { api, workflows, groups, service };
}

describe('TelegramSystemBotPostFlowService groups', () => {
  it('defaults a selected channel to the System Bot posts group', async () => {
    const { service, workflows, groups } = setup();
    workflows.get.mockResolvedValue(workflow('CHOOSE_CHANNEL', { content }));
    workflows.transition.mockImplementation(({ step, payload }) =>
      workflow(step, payload, 3),
    );

    await service.callback(scope, 'sbp:workflow-1:2:channel.0');

    expect(groups.optionsForSystemBotPost).toHaveBeenCalledWith(
      scope.userId,
      'channel-1',
    );
    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'CHOOSE_ACTION',
        payload: expect.objectContaining({
          groupId: 'system-group',
          groupTitle: 'System Bot posts',
        }),
      }),
    );
  });

  it('lets the user replace the default with a scoped custom group', async () => {
    const { service, workflows } = setup();
    workflows.get.mockResolvedValue(
      workflow('CHOOSE_GROUP', {
        content,
        channelId: 'channel-1',
        channelTitle: 'Channel',
        groupId: 'system-group',
        groupTitle: 'System Bot posts',
      }),
    );
    workflows.transition.mockImplementation(({ step, payload }) =>
      workflow(step, payload, 3),
    );

    await service.callback(scope, 'sbp:workflow-1:2:group.1');

    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'CHOOSE_ACTION',
        payload: expect.objectContaining({
          groupId: 'custom-group',
          groupTitle: 'Ideas',
        }),
      }),
    );
  });

  it('renders the default and custom groups in the single control card', async () => {
    const { service, workflows, api } = setup();
    const payload = {
      content,
      channelId: 'channel-1',
      channelTitle: 'Channel',
      groupId: 'system-group',
      groupTitle: 'System Bot posts',
    };
    workflows.get.mockResolvedValue(workflow('CHOOSE_ACTION', payload));
    workflows.transition.mockImplementation(({ step, payload: nextPayload }) =>
      workflow(step, nextPayload, 3),
    );

    await service.callback(scope, 'sbp:workflow-1:2:group.change');

    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('Choose a post group'),
        reply_markup: {
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '★ System Bot posts' }),
              expect.objectContaining({ text: 'Ideas' }),
            ]),
          ]),
        },
      }),
    );
  });

  it('returns to group selection when a custom group disappeared', async () => {
    const { service, workflows, groups, api } = setup();
    groups.optionsForSystemBotPost.mockResolvedValue([
      { id: 'system-group', title: 'System Bot posts', isDefault: true },
    ]);
    workflows.get.mockResolvedValue(
      workflow('CONFIRM', {
        content,
        channelId: 'channel-1',
        channelTitle: 'Channel',
        groupId: 'deleted-group',
        groupTitle: 'Deleted',
        action: 'DRAFT',
      }),
    );
    workflows.transition.mockImplementation(({ step, payload }) =>
      workflow(step, payload, 3),
    );

    await service.callback(scope, 'sbp:workflow-1:2:confirm');

    expect(workflows.claimCommit).not.toHaveBeenCalled();
    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'CHOOSE_GROUP' }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('no longer available'),
      }),
    );
  });
});
