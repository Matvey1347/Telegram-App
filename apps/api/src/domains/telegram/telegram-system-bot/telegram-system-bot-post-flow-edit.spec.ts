/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- stateful workflow test doubles */
import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { TelegramSystemBotPostFlowService } from './telegram-system-bot-post-flow.service';
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: 'telegram-user-1',
  chatId: 'telegram-user-1',
  timezone: 'Europe/Warsaw',
};

const originalContent = {
  text: 'Original forwarded text',
  imageUrls: ['https://cdn/photo.jpg'],
  buttonRows: [[{ text: 'Old', url: 'https://old.example', style: 'default' }]],
  mediaGroupId: null,
  sourceTitle: 'Source channel',
  warnings: [],
};

function workflow(step: string, version: number, payload: unknown) {
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
    resultManagedPostId: null,
    resultAdSaleId: null,
    resultAdSalePlacementId: null,
    lastError: null,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    updatedAt: new Date('2026-08-24T00:00:00.000Z'),
  };
}

function setup() {
  const api = {
    editMessageText: jest.fn().mockResolvedValue({ message_id: 99 }),
    sendMessage: jest.fn(),
    deleteMessage: jest.fn().mockResolvedValue(true),
  };
  const workflows = {
    active: jest.fn(),
    get: jest.fn(),
    transition: jest.fn(),
  };
  const service = new TelegramSystemBotPostFlowService(
    { token: 'token' } as any,
    api as any,
    workflows as any,
    { channels: jest.fn() } as any,
    new TelegramSystemBotPostContentService(
      { token: 'token' } as any,
      api as any,
      {} as any,
    ),
    {} as any,
  );
  return { service, api, workflows };
}

describe('TelegramSystemBotPostFlowService editing', () => {
  it('replaces forwarded managed text and returns to the action card', async () => {
    const { service, api, workflows } = setup();
    const payload = {
      content: originalContent,
      channelId: 'channel-1',
      channelTitle: 'Channel',
    };
    const choosing = workflow('CHOOSE_ACTION', 2, payload);
    const awaiting = workflow('AWAIT_EDIT_TEXT', 3, payload);
    const edited = workflow('CHOOSE_ACTION', 4, {
      ...payload,
      content: { ...originalContent, text: 'Replacement text' },
    });
    workflows.get.mockResolvedValue(choosing);
    workflows.transition
      .mockResolvedValueOnce(awaiting)
      .mockResolvedValueOnce(edited);
    workflows.active.mockResolvedValue(awaiting);

    await service.callback(scope, 'sbp:workflow-1:2:edit.text');
    await service.input(scope, {
      message_id: 20,
      text: '  Replacement text  ',
    });

    expect(workflows.transition).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        step: 'CHOOSE_ACTION',
        payload: expect.objectContaining({
          content: expect.objectContaining({
            text: 'Replacement text',
            imageUrls: ['https://cdn/photo.jpg'],
          }),
        }),
      }),
    );
    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      message_id: 20,
    });
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('replaces forwarded buttons with validated URL button lines', async () => {
    const { service, api, workflows } = setup();
    const payload = {
      content: originalContent,
      channelId: 'channel-1',
      channelTitle: 'Channel',
    };
    const choosing = workflow('CHOOSE_ACTION', 2, payload);
    const awaiting = workflow('AWAIT_EDIT_BUTTONS', 3, payload);
    const edited = workflow('CHOOSE_ACTION', 4, payload);
    workflows.get.mockResolvedValue(choosing);
    workflows.transition
      .mockResolvedValueOnce(awaiting)
      .mockResolvedValueOnce(edited);
    workflows.active.mockResolvedValue(awaiting);

    await service.callback(scope, 'sbp:workflow-1:2:edit.buttons');
    await service.input(scope, {
      message_id: 21,
      text: 'Website | https://example.com\nTelegram | http://t.me/example',
    });

    expect(workflows.transition).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        step: 'CHOOSE_ACTION',
        payload: expect.objectContaining({
          content: expect.objectContaining({
            buttonRows: [
              [
                {
                  text: 'Website',
                  url: 'https://example.com',
                  style: 'default',
                },
              ],
              [
                {
                  text: 'Telegram',
                  url: 'http://t.me/example',
                  style: 'default',
                },
              ],
            ],
          }),
        }),
      }),
    );
    expect(api.deleteMessage).toHaveBeenCalledTimes(1);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('retries button editing against the refreshed workflow version', async () => {
    const { service, workflows } = setup();
    const payload = {
      content: originalContent,
      channelId: 'channel-1',
      channelTitle: 'Channel',
    };
    const stale = workflow('AWAIT_EDIT_BUTTONS', 3, payload);
    const refreshed = workflow('AWAIT_EDIT_BUTTONS', 4, payload);
    const edited = workflow('CHOOSE_ACTION', 5, payload);
    workflows.active.mockResolvedValue(stale);
    workflows.get.mockResolvedValue(refreshed);
    workflows.transition
      .mockRejectedValueOnce(new ConflictException('Workflow changed'))
      .mockResolvedValueOnce(edited);

    await service.input(scope, {
      message_id: 22,
      text: 'Website | https://example.com',
    });

    expect(workflows.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'workflow-1',
        expectedVersion: 4,
        step: 'CHOOSE_ACTION',
      }),
    );
  });
});
