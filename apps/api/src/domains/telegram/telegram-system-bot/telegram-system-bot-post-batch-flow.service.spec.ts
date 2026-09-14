import { ConflictException } from '@nestjs/common';
import { TelegramSystemBotPostBatchFlowService } from './telegram-system-bot-post-batch-flow.service';
import { TelegramSystemBotPostFlowService } from './telegram-system-bot-post-flow.service';
import { TelegramSystemBotMutualPromotionPostFlowService } from './telegram-system-bot-mutual-promotion-post-flow.service';

describe('TelegramSystemBotPostBatchFlowService', () => {
  const scope = {
    connectionId: 'connection-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    telegramUserId: 'telegram-user-1',
    chatId: 'chat-1',
    timezone: 'UTC',
  };
  it('rejects batch capture while another post-import workflow is active', async () => {
    const workflows = {
      requireNoActiveOutsideBatchImport: jest
        .fn()
        .mockRejectedValue(new ConflictException()),
      recoverableBatchImport: jest.fn(),
      create: jest.fn(),
    };
    const service = new TelegramSystemBotPostBatchFlowService(
      { token: 'token' } as never,
      {} as never,
      workflows as never,
      {} as never,
    );

    await expect(service.prepare(scope)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(workflows.create).not.toHaveBeenCalled();
  });

  it('recovers a completed unconsumed import when the client lost its workflow id', async () => {
    const workflows = {
      requireNoActiveOutsideBatchImport: jest.fn(),
      recoverableBatchImport: jest.fn().mockResolvedValue({
        id: 'completed-workflow',
        status: 'COMPLETED',
      }),
      create: jest.fn(),
    };
    const service = new TelegramSystemBotPostBatchFlowService(
      { token: 'token' } as never,
      {} as never,
      workflows as never,
      {} as never,
    );

    await expect(service.prepare(scope)).resolves.toEqual({
      workflowId: 'completed-workflow',
    });
    expect(workflows.create).not.toHaveBeenCalled();
  });

  it('resumes an active batch capture instead of orphaning its content', async () => {
    const active = {
      id: 'active-workflow',
      status: 'ACTIVE',
      step: 'COLLECT_CONTENT',
      version: 2,
      payload: { contents: [{ text: 'Captured', imageUrls: [] }] },
      controlMessageId: 42,
    };
    const workflows = {
      requireNoActiveOutsideBatchImport: jest.fn(),
      recoverableBatchImport: jest.fn().mockResolvedValue(active),
      create: jest.fn(),
    };
    const api = { editMessageText: jest.fn().mockResolvedValue({}) };
    const service = new TelegramSystemBotPostBatchFlowService(
      { token: 'token' } as never,
      api as never,
      workflows as never,
      {} as never,
    );

    await expect(service.prepare(scope)).resolves.toEqual({
      workflowId: 'active-workflow',
    });
    expect(api.editMessageText).toHaveBeenCalled();
    expect(workflows.create).not.toHaveBeenCalled();
  });

  it('rejects a single-post workflow while batch capture is active', async () => {
    const workflows = {
      activeWithoutBatchImport: jest
        .fn()
        .mockRejectedValue(new ConflictException()),
    };
    const service = new TelegramSystemBotPostFlowService(
      {} as never,
      {} as never,
      workflows as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.begin(scope)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a folder import while batch capture is active', async () => {
    const workflows = {
      activeWithoutBatchImport: jest
        .fn()
        .mockRejectedValue(new ConflictException()),
    };
    const service = new TelegramSystemBotMutualPromotionPostFlowService(
      {
        mutualPromotionFolder: {
          findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }),
        },
      } as never,
      {} as never,
      {} as never,
      workflows as never,
      {} as never,
      {} as never,
    );
    await expect(service.prepare(scope, 'folder-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
