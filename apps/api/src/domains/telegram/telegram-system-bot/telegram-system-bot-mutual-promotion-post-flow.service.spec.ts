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
    deleteMessage: jest.fn(),
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
  const postFlow = {
    sendPostPreview: jest
      .fn()
      .mockResolvedValue({ status: 'SENT', messageIds: [200] }),
  };
  const service = new TelegramSystemBotMutualPromotionPostFlowService(
    prisma as never,
    { token: 'token' } as never,
    api as never,
    workflows as never,
    content as never,
    postFlow as never,
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
    api.deleteMessage.mockResolvedValue(true);
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
            formattedHtml:
              '<b><a href="https://example.test/post">Mutual promotion copy</a></b>',
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
          plainText: 'Mutual promotion copy',
          formattedHtml:
            '<b><a href="https://example.test/post">Mutual promotion copy</a></b>',
          imageUrls: ['https://example.test/image.jpg'],
          mediaItems: [
            { kind: 'PHOTO', url: 'https://example.test/image.jpg' },
          ],
          buttonRows: [],
        },
        {
          title: 'Second post',
          text: 'Second post',
          plainText: 'Second post',
          imageUrls: [],
          mediaItems: [],
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
            [expect.objectContaining({ text: '➕ Add another post' })],
            [
              expect.objectContaining({ text: '✅ Finish import (1)' }),
              expect.objectContaining({ text: '❌ Cancel' }),
            ],
          ],
        },
      }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.not.stringContaining('Captured posts:'),
      }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: '<b>Forwarded</b> <a href="https://example.test/post">copy</a>',
      }),
    );
  });

  it('sends a native video preview after a forwarded video is stored', async () => {
    workflows.active.mockResolvedValue({
      id: 'workflow-video',
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
        text: 'Video caption',
        plainText: 'Video caption',
        imageUrls: [],
        mediaItems: [
          {
            kind: 'VIDEO',
            url: 'https://cdn.test/forwarded.mp4',
            mimeType: 'video/mp4',
          },
        ],
        buttonRows: [],
        mediaGroupId: null,
        sourceTitle: 'Source',
        warnings: [],
      },
    });

    await service.input(scope, { message_id: 92, video: { file_id: 'video' } });

    expect(postFlow.sendPostPreview).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        text: 'Video caption',
        mediaItems: [
          expect.objectContaining({
            kind: 'VIDEO',
            url: 'https://cdn.test/forwarded.mp4',
          }),
        ],
      }),
    );
    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '42',
      message_id: 10,
    });
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '42',
        text: expect.stringContaining('Post 1 captured with video.'),
      }),
    );
    expect(api.editMessageText).toHaveBeenLastCalledWith(
      'token',
      expect.objectContaining({
        message_id: 10,
        text: expect.stringContaining('Post 1 captured with video.'),
        link_preview_options: { is_disabled: true },
      }),
    );
    expect(workflows.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ previewMessageIds: [200] }),
        controlMessageId: 10,
      }),
    );
  });

  it('keeps every item in a mixed photo and video album preview', async () => {
    workflows.active.mockResolvedValue({
      id: 'workflow-album',
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
        text: 'Album caption',
        plainText: 'Album caption',
        imageUrls: ['https://cdn.test/first.jpg'],
        mediaItems: [
          { kind: 'PHOTO', url: 'https://cdn.test/first.jpg' },
          {
            kind: 'VIDEO',
            url: 'https://cdn.test/second.mp4',
            mimeType: 'video/mp4',
          },
        ],
        buttonRows: [],
        mediaGroupId: 'album-1',
        sourceTitle: 'Source',
        warnings: [],
      },
    });

    await service.input(scope, { message_id: 93, video: { file_id: 'video' } });

    expect(postFlow.sendPostPreview).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        imageUrls: [],
        mediaItems: [
          { kind: 'PHOTO', url: 'https://cdn.test/first.jpg' },
          expect.objectContaining({
            kind: 'VIDEO',
            url: 'https://cdn.test/second.mp4',
          }),
        ],
      }),
    );
  });

  it('removes the previous video preview when a newer text post is captured', async () => {
    workflows.active.mockResolvedValue({
      id: 'workflow-latest',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 3,
      step: 'COLLECT_CONTENT',
      payload: {
        folderId: 'folder-1',
        contents: [
          {
            text: 'Old video',
            plainText: 'Old video',
            imageUrls: [],
            mediaItems: [{ kind: 'VIDEO', url: 'https://cdn.test/old.mp4' }],
            buttonRows: [],
            mediaGroupId: null,
            sourceTitle: 'Source',
            warnings: [],
          },
        ],
        previewMessageIds: [70],
      },
      controlMessageId: 10,
    });
    content.capture.mockResolvedValue({
      ok: true,
      content: {
        text: 'Newest text post',
        plainText: 'Newest text post',
        imageUrls: [],
        mediaItems: [],
        buttonRows: [],
        mediaGroupId: null,
        sourceTitle: 'Source',
        warnings: [],
      },
    });

    await service.input(scope, { message_id: 94, text: 'Newest text post' });

    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '42',
      message_id: 70,
    });
    expect(postFlow.sendPostPreview).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenLastCalledWith(
      'token',
      expect.objectContaining({
        message_id: 10,
        text: 'Newest text post',
      }),
    );
    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.not.objectContaining({ previewMessageIds: [70] }),
      }),
    );
  });

  it('removes the visible video preview when Add another post is pressed', async () => {
    const payload = {
      folderId: 'folder-1',
      contents: [
        {
          text: 'Video post',
          plainText: 'Video post',
          imageUrls: [],
          mediaItems: [{ kind: 'VIDEO', url: 'https://cdn.test/post.mp4' }],
          buttonRows: [],
          mediaGroupId: null,
          sourceTitle: null,
          warnings: [],
        },
      ],
      previewMessageIds: [71],
    };
    workflows.get.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 4,
      step: 'COLLECT_CONTENT',
      payload,
      controlMessageId: 10,
    });

    await service.callback(scope, 'sbm:workflow-1:4:add');

    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '42',
      message_id: 71,
    });
    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 4,
        step: 'AWAIT_CONTENT',
        payload: {
          folderId: 'folder-1',
          contents: payload.contents,
        },
      }),
    );
  });

  it('moves to a visible wait-for-next-post state when Add another post is pressed', async () => {
    const payload = {
      folderId: 'folder-1',
      contents: [
        {
          text: '**First post**',
          plainText: 'First post',
          imageUrls: [],
          buttonRows: [],
          mediaGroupId: null,
          sourceTitle: null,
          warnings: [],
        },
      ],
    };
    workflows.get.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 2,
      step: 'COLLECT_CONTENT',
      payload,
      controlMessageId: 10,
    });

    await service.callback(scope, 'sbm:workflow-1:2:add');

    expect(workflows.transition).toHaveBeenCalledWith({
      ...scope,
      id: 'workflow-1',
      expectedVersion: 2,
      step: 'AWAIT_CONTENT',
      payload,
    });
    expect(api.editMessageText).toHaveBeenLastCalledWith('token', {
      chat_id: '42',
      message_id: 10,
      text: '🤝 Forward the next post (text, photo, video, or GIF). It will be added to this import.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Finish import (1)',
              callback_data: 'sbm:workflow-1:3:finish',
            },
            {
              text: '❌ Cancel',
              callback_data: 'sbm:workflow-1:3:cancel',
            },
          ],
        ],
      },
    });
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
    expect(api.editMessageText).toHaveBeenLastCalledWith(
      'token',
      expect.objectContaining({
        link_preview_options: { is_disabled: true },
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

  it('keeps a fifth rapidly forwarded post after more than three write conflicts', async () => {
    const existing = [1, 2, 3, 4].map((number) => ({
      text: `Post ${number}`,
      plainText: `Post ${number}`,
      imageUrls: [],
      buttonRows: [],
      mediaGroupId: null,
      sourceTitle: null,
      warnings: [],
    }));
    const fifth = { ...existing[0], text: 'Post 5', plainText: 'Post 5' };
    workflows.active.mockResolvedValue({
      id: 'workflow-1',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'COLLECT_CONTENT',
      payload: { folderId: 'folder-1', contents: [] },
      controlMessageId: 10,
    });
    workflows.get
      .mockResolvedValueOnce({
        id: 'workflow-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: 2,
        step: 'COLLECT_CONTENT',
        payload: { folderId: 'folder-1', contents: existing.slice(0, 1) },
        controlMessageId: 10,
      })
      .mockResolvedValueOnce({
        id: 'workflow-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: 3,
        step: 'COLLECT_CONTENT',
        payload: { folderId: 'folder-1', contents: existing.slice(0, 2) },
        controlMessageId: 10,
      })
      .mockResolvedValueOnce({
        id: 'workflow-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: 4,
        step: 'COLLECT_CONTENT',
        payload: { folderId: 'folder-1', contents: existing.slice(0, 3) },
        controlMessageId: 10,
      })
      .mockResolvedValueOnce({
        id: 'workflow-1',
        kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: 5,
        step: 'COLLECT_CONTENT',
        payload: { folderId: 'folder-1', contents: existing },
        controlMessageId: 10,
      });
    content.capture.mockResolvedValue({ ok: true, content: fifth });
    workflows.transition
      .mockRejectedValueOnce(new ConflictException('stale workflow'))
      .mockRejectedValueOnce(new ConflictException('stale workflow'))
      .mockRejectedValueOnce(new ConflictException('stale workflow'))
      .mockRejectedValueOnce(new ConflictException('stale workflow'))
      .mockImplementationOnce(
        (input: { id: string; step: string; payload: unknown }) =>
          Promise.resolve({
            id: input.id,
            kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
            status: TelegramSystemBotWorkflowStatus.ACTIVE,
            version: 6,
            step: input.step,
            payload: input.payload,
            controlMessageId: 10,
          }),
      );

    await service.input(scope, { message_id: 5, text: 'Post 5' });

    expect(workflows.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedVersion: 5,
        payload: { folderId: 'folder-1', contents: [...existing, fifth] },
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

  it('returns a structured conflict while another bot post import is active', async () => {
    workflows.active.mockResolvedValue({
      id: 'workflow-next',
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 1,
      step: 'AWAIT_CONTENT',
      payload: { folderId: 'folder-1' },
      controlMessageId: 10,
    });

    await expect(service.prepare(scope, 'folder-1')).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE',
        message:
          'Finish the current post import in the bot before starting a new one.',
      },
    });

    expect(workflows.cancel).not.toHaveBeenCalled();
    expect(workflows.create).not.toHaveBeenCalled();
    expect(api.editMessageText).not.toHaveBeenCalled();
  });

  it('renders a completed import without another-post controls', async () => {
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
          inline_keyboard: [],
        },
      }),
    );
    expect(workflows.create).not.toHaveBeenCalled();

    api.editMessageText.mockClear();
    await service.callback(scope, 'sbm:workflow-1:4:next');
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: { inline_keyboard: [] },
      }),
    );
    expect(workflows.create).not.toHaveBeenCalled();
  });
});
