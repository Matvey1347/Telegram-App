/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Jest matcher assertions */
import { ConflictException } from '@nestjs/common';
import {
  MutualPromotionFolderStatus,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { TelegramSystemBotMutualPromotionPostFlowService } from './telegram-system-bot-mutual-promotion-post-flow.service';

describe('TelegramSystemBotMutualPromotionPostFlowService', () => {
  const prisma = {
    mutualPromotionFolder: { findFirst: jest.fn() },
  };
  const api = {
    sendMessage: jest.fn(),
    editMessageText: jest.fn(),
  };
  const workflows = {
    active: jest.fn(),
    create: jest.fn(),
    transition: jest.fn(),
    get: jest.fn(),
    cancel: jest.fn(),
    claimCommit: jest.fn(),
    complete: jest.fn(),
  };
  const content = { capture: jest.fn(), removeInput: jest.fn() };
  const service = new TelegramSystemBotMutualPromotionPostFlowService(
    prisma as never,
    { token: 'token' } as never,
    api as never,
    workflows as never,
    content as never,
  );
  const scope = {
    connectionId: 'connection-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    telegramUserId: '42',
    chatId: '42',
    timezone: 'UTC',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.mutualPromotionFolder.findFirst.mockResolvedValue({
      id: 'folder-1',
    });
    workflows.active.mockResolvedValue(null);
    api.sendMessage.mockResolvedValue({ message_id: 10 });
    api.editMessageText.mockResolvedValue({ message_id: 10 });
    workflows.transition.mockImplementation(
      (input: {
        id: string;
        expectedVersion: number;
        step: string;
        payload: unknown;
        controlMessageId?: number;
      }) =>
        Promise.resolve({
          id: input.id,
          kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
          status: TelegramSystemBotWorkflowStatus.ACTIVE,
          version: input.expectedVersion + 1,
          step: input.step,
          payload: input.payload,
          controlMessageId: input.controlMessageId ?? 10,
        }),
    );
  });

  it('prepares only a folder owned by the workflow workspace', async () => {
    const workflow = {
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 0,
      step: 'AWAIT_CONTENT',
      payload: { folderId: 'folder-1' },
      controlMessageId: null,
    };
    workflows.create.mockResolvedValue(workflow);

    await expect(service.prepare(scope, 'folder-1')).resolves.toEqual({
      workflowId: 'workflow-1',
    });

    expect(prisma.mutualPromotionFolder.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'folder-1',
        workspaceId: 'workspace-1',
        status: MutualPromotionFolderStatus.DRAFT,
      },
      select: { id: true },
    });
    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-1',
        workspaceId: 'workspace-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        mutualPromotionFolderId: 'folder-1',
        payload: { folderId: 'folder-1' },
      }),
    );
  });

  it('rejects a folder outside the current workspace', async () => {
    prisma.mutualPromotionFolder.findFirst.mockResolvedValue(null);

    await expect(service.prepare(scope, 'foreign-folder')).rejects.toThrow(
      'Mutual promotion folder not found',
    );
    expect(workflows.create).not.toHaveBeenCalled();
  });

  it('rejects a folder that is no longer a draft', async () => {
    prisma.mutualPromotionFolder.findFirst.mockResolvedValue(null);

    await expect(service.prepare(scope, 'active-folder')).rejects.toThrow(
      'Mutual promotion folder not found',
    );
    expect(prisma.mutualPromotionFolder.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'active-folder',
        workspaceId: 'workspace-1',
        status: MutualPromotionFolderStatus.DRAFT,
      },
      select: { id: true },
    });
    expect(workflows.create).not.toHaveBeenCalled();
  });

  it('does not complete an import after its folder leaves draft status', async () => {
    prisma.mutualPromotionFolder.findFirst.mockResolvedValue(null);
    workflows.get.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'COLLECT_CONTENT',
      payload: {
        folderId: 'folder-1',
        content: {
          text: 'Forwarded copy',
          imageUrls: [],
          buttonRows: [],
          mediaGroupId: null,
          sourceTitle: null,
          warnings: [],
        },
      },
      controlMessageId: 10,
    });

    await expect(
      service.callback(scope, 'sbm:workflow-1:1:confirm'),
    ).rejects.toThrow('Mutual promotion folder not found');
    expect(workflows.claimCommit).not.toHaveBeenCalled();
  });

  it('returns every captured draft from a completed scoped workflow', async () => {
    workflows.get.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
      payload: {
        folderId: 'folder-1',
        contents: [
          {
            text: '**[Mutual promotion copy](https://example.test/post)**',
            plainText: 'Mutual promotion copy',
            imageUrls: ['https://example.test/image.jpg'],
            buttonRows: [],
            mediaGroupId: null,
            sourceTitle: null,
            warnings: [],
          },
          {
            text: 'Second post',
            plainText: 'Second post',
            imageUrls: [],
            buttonRows: [],
            mediaGroupId: null,
            sourceTitle: null,
            warnings: [],
          },
        ],
      },
    });

    await expect(service.result(scope, 'workflow-1')).resolves.toEqual({
      ready: true,
      drafts: [
        {
          title: 'Mutual promotion copy',
          text: '**[Mutual promotion copy](https://example.test/post)**',
          imageUrls: ['https://example.test/image.jpg'],
          buttonRows: [],
        },
        {
          title: 'Second post',
          text: 'Second post',
          imageUrls: [],
          buttonRows: [],
        },
      ],
    });
    expect(workflows.get).toHaveBeenCalledWith(scope, 'workflow-1');
  });

  it('captures forwarded content and keeps the batch open for more posts', async () => {
    workflows.active.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'AWAIT_CONTENT',
      payload: { folderId: 'folder-1' },
      controlMessageId: 10,
    });
    content.capture.mockResolvedValue({
      ok: true,
      content: {
        text: '**Forwarded** [copy](https://example.test/post)',
        plainText: 'Forwarded copy',
        imageUrls: ['https://example.test/photo.jpg'],
        buttonRows: [
          [{ text: 'Open', url: 'https://example.test', style: 'primary' }],
        ],
        mediaGroupId: null,
        sourceTitle: 'Source',
        warnings: [],
      },
    });

    await service.input(scope, { message_id: 91, text: 'Forwarded copy' });

    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workflow-1',
        expectedVersion: 1,
        step: 'COLLECT_CONTENT',
        payload: expect.objectContaining({
          folderId: 'folder-1',
          contents: [
            expect.objectContaining({
              text: '**Forwarded** [copy](https://example.test/post)',
            }),
          ],
        }),
      }),
    );
    expect(content.removeInput).toHaveBeenCalledWith('42', 91);
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '42',
        message_id: 10,
        text: expect.stringContaining(
          '<b>Forwarded</b> <a href="https://example.test/post">copy</a>',
        ),
        parse_mode: 'HTML',
        link_preview_options: {
          url: 'https://example.test/photo.jpg',
          prefer_large_media: true,
          show_above_text: true,
        },
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Open',
                url: 'https://example.test',
                style: 'primary',
              },
            ],
            [
              expect.objectContaining({ text: '✅ Finish import (1)' }),
              expect.objectContaining({ text: '❌ Cancel' }),
            ],
          ],
        },
      }),
    );
  });

  it('appends independently forwarded messages to one import batch', async () => {
    const firstContent = {
      text: 'First post',
      plainText: 'First post',
      imageUrls: [],
      buttonRows: [],
      mediaGroupId: null,
      sourceTitle: null,
      warnings: [],
    };
    const secondContent = {
      ...firstContent,
      text: 'Second post',
      plainText: 'Second post',
    };
    workflows.active
      .mockResolvedValueOnce({
        id: 'workflow-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: 1,
        step: 'AWAIT_CONTENT',
        payload: { folderId: 'folder-1' },
        controlMessageId: 10,
      })
      .mockResolvedValueOnce({
        id: 'workflow-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: 2,
        step: 'COLLECT_CONTENT',
        payload: { folderId: 'folder-1', contents: [firstContent] },
        controlMessageId: 10,
      });
    content.capture
      .mockResolvedValueOnce({ ok: true, content: firstContent })
      .mockResolvedValueOnce({ ok: true, content: secondContent });

    await service.input(scope, { message_id: 1, text: 'First post' });
    await service.input(scope, { message_id: 2, text: 'Second post' });

    expect(workflows.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        step: 'COLLECT_CONTENT',
        payload: {
          folderId: 'folder-1',
          contents: [firstContent, secondContent],
        },
      }),
    );
  });

  it('retries against the latest workflow so rapidly forwarded posts are not lost', async () => {
    const firstContent = {
      text: 'First post',
      plainText: 'First post',
      imageUrls: [],
      buttonRows: [],
      mediaGroupId: null,
      sourceTitle: null,
      warnings: [],
    };
    const secondContent = {
      ...firstContent,
      text: 'Second post',
      plainText: 'Second post',
    };
    workflows.active.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'AWAIT_CONTENT',
      payload: { folderId: 'folder-1' },
      controlMessageId: 10,
    });
    workflows.get.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 2,
      step: 'COLLECT_CONTENT',
      payload: { folderId: 'folder-1', contents: [firstContent] },
      controlMessageId: 10,
    });
    content.capture.mockResolvedValue({ ok: true, content: secondContent });
    workflows.transition
      .mockRejectedValueOnce(new ConflictException('stale workflow'))
      .mockImplementationOnce(
        (input: { id: string; step: string; payload: unknown }) =>
          Promise.resolve({
            id: input.id,
            kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
            status: TelegramSystemBotWorkflowStatus.ACTIVE,
            version: 3,
            step: input.step,
            payload: input.payload,
            controlMessageId: 10,
          }),
      );

    await service.input(scope, { message_id: 2, text: 'Second post' });

    expect(workflows.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        payload: {
          folderId: 'folder-1',
          contents: [firstContent, secondContent],
        },
      }),
    );
  });

  it('finishes the latest batch when Telegram sends a callback from a stale button', async () => {
    const active = {
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 3,
      step: 'COLLECT_CONTENT',
      payload: {
        folderId: 'folder-1',
        contents: [
          {
            text: 'First post',
            plainText: 'First post',
            imageUrls: [],
            buttonRows: [],
            mediaGroupId: null,
            sourceTitle: null,
            warnings: [],
          },
          {
            text: 'Second post',
            plainText: 'Second post',
            imageUrls: [],
            buttonRows: [],
            mediaGroupId: null,
            sourceTitle: null,
            warnings: [],
          },
        ],
      },
      controlMessageId: 10,
    };
    workflows.get.mockResolvedValue(active);
    workflows.claimCommit.mockResolvedValue({ ...active, version: 4 });
    workflows.complete.mockResolvedValue({
      ...active,
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
      version: 5,
    });

    await service.callback(scope, 'sbm:workflow-1:1:finish');

    expect(workflows.claimCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workflow-1',
        expectedVersion: 3,
      }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('2 post(s) captured'),
      }),
    );
  });

  it('reuses an active next-post import for the same folder', async () => {
    workflows.active.mockResolvedValue({
      id: 'workflow-next',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'AWAIT_CONTENT',
      payload: { folderId: 'folder-1' },
      controlMessageId: 10,
    });

    await expect(service.prepare(scope, 'folder-1')).resolves.toEqual({
      workflowId: 'workflow-next',
    });

    expect(workflows.cancel).not.toHaveBeenCalled();
    expect(workflows.create).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: '🤝 Forward a text or photo post for this folder.',
      }),
    );
  });

  it('offers and starts the next post from a completed bot workflow', async () => {
    const completed = {
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
      version: 4,
      step: 'COLLECT_CONTENT',
      payload: {
        folderId: 'folder-1',
        content: {
          text: '**Post one**',
          plainText: 'Post one',
          imageUrls: [],
          buttonRows: [],
          mediaGroupId: null,
          sourceTitle: null,
          warnings: [],
        },
      },
      controlMessageId: 10,
    };
    workflows.get.mockResolvedValue(completed);

    await service.resume(scope, 'workflow-1');
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '➕ Forward next post',
                callback_data: 'sbm:workflow-1:4:next',
              },
            ],
          ],
        },
      }),
    );

    const next = {
      ...completed,
      id: 'workflow-2',
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'AWAIT_CONTENT',
      payload: { folderId: 'folder-1' },
    };
    workflows.active.mockResolvedValue(null);
    workflows.create.mockResolvedValue(next);
    api.editMessageText.mockClear();

    await service.callback(scope, 'sbm:workflow-1:4:next');

    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        payload: { folderId: 'folder-1' },
        controlMessageId: 10,
        mutualPromotionFolderId: 'folder-1',
      }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: '🤝 Forward a text or photo post for this folder.',
      }),
    );
  });
});
