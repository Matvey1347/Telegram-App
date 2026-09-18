import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS } from '@telegram-system/shared';
import { TelegramSystemBotPostImportService } from './telegram-system-bot-post-import.service';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: '42',
  chatId: '42',
  timezone: 'UTC',
};

const captured = {
  text: 'Formatted post',
  plainText: 'Formatted post',
  formattedHtml: '<b>Formatted</b> post',
  imageUrls: ['https://cdn.test/photo.jpg'],
  mediaItems: [
    {
      kind: 'PHOTO' as const,
      url: 'https://cdn.test/photo.jpg',
      sourceMessageId: 10,
    },
  ],
  buttonRows: [
    [
      {
        text: 'Open',
        url: 'https://example.test',
        style: 'primary' as const,
      },
    ],
  ],
  mediaGroupId: null,
  sourceTitle: 'Source',
  warnings: [],
};

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    connectionId: scope.connectionId,
    workspaceId: scope.workspaceId,
    kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
    postImportMode: 'SINGLE',
    step: 'AWAIT_CONTENT',
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    version: 3,
    controlMessageId: 77,
    payload: { mode: 'single', contents: [] },
    resultManagedPostId: null,
    resultPostBatchPostId: null,
    resultAdSaleId: null,
    resultAdSalePlacementId: null,
    mutualPromotionFolderId: null,
    resultMutualPromotionPostId: null,
    lastError: null,
    expiresAt: new Date(Date.now() + 60_000),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 77 }),
    sendPhoto: jest.fn().mockResolvedValue({ message_id: 78 }),
    sendMediaGroup: jest.fn().mockResolvedValue([]),
    call: jest.fn().mockResolvedValue({ message_id: 78 }),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 77 }),
    deleteMessage: jest.fn().mockResolvedValue(true),
  };
  const workflows = {
    active: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    get: jest.fn(),
    transition: jest.fn(),
    cancel: jest.fn(),
    completeCapture: jest.fn(),
    expire: jest.fn(),
    websitePostImportMetadata: jest.fn(),
    throwActiveImportConflict: jest.fn(() => {
      throw new Error('active import');
    }),
  };
  const content = {
    capture: jest.fn(),
    removeInput: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TelegramSystemBotPostImportService(
    { token: 'token' } as never,
    api as never,
    workflows as never,
    content as never,
  );
  return { service, api, workflows, content };
}

describe('TelegramSystemBotPostImportService', () => {
  it('starts a canonical single import with its compact persisted mode', async () => {
    const test = setup();
    test.workflows.create.mockResolvedValue(workflow());

    await expect(test.service.prepare(scope, 'single')).resolves.toEqual({
      workflowId: 'workflow-1',
      mode: 'single',
    });

    expect(test.workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
        postImportMode: 'SINGLE',
        payload: { mode: 'single', contents: [] },
      }),
    );
  });

  it('recovers a persisted active import by its workflow id after a restart', async () => {
    const test = setup();
    test.workflows.get.mockResolvedValue(workflow());

    await test.service.resume(scope, 'workflow-1');

    expect(test.workflows.get).toHaveBeenCalledWith(scope, 'workflow-1');
    expect(test.workflows.create).not.toHaveBeenCalled();
    expect(test.api.editMessageText).toHaveBeenCalledTimes(1);
  });

  it('rejects a same-mode start while a website import is active', async () => {
    const test = setup();
    test.workflows.active.mockResolvedValue(workflow());

    await expect(test.service.prepare(scope, 'single')).rejects.toThrow(
      'active import',
    );
    expect(test.workflows.create).not.toHaveBeenCalled();
    expect(test.api.editMessageText).not.toHaveBeenCalled();
  });

  it('replaces a confirmed active import and removes its Telegram controls', async () => {
    const test = setup();
    test.workflows.active.mockResolvedValue(workflow());
    test.workflows.cancel.mockResolvedValue(
      workflow({ status: TelegramSystemBotWorkflowStatus.CANCELLED }),
    );
    test.workflows.create.mockResolvedValue(
      workflow({ id: 'workflow-2', controlMessageId: 88 }),
    );

    await expect(
      test.service.prepare(scope, 'single', {
        context: 'Ad sale',
        replaceActive: true,
      }),
    ).resolves.toEqual({ workflowId: 'workflow-2', mode: 'single' });

    expect(test.workflows.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workflow-1', expectedVersion: 3 }),
    );
    expect(test.api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '42',
      message_id: 77,
    });
    expect(test.workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { mode: 'single', context: 'Ad sale', contents: [] },
      }),
    );
  });

  it('explains the website destination in the bot instruction', async () => {
    const test = setup();
    test.workflows.create.mockResolvedValue(
      workflow({
        payload: { mode: 'single', context: 'Mass publication', contents: [] },
      }),
    );

    await test.service.prepare(scope, 'single', {
      context: 'Mass publication',
    });

    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: '📨 Forward a post (text, photo, video, or GIF) for Mass publication.',
      }),
    );
  });

  it('does not reveal a same-mode workflow created by a concurrent start', async () => {
    const test = setup();
    test.workflows.create.mockRejectedValue(
      new ConflictException('active import'),
    );

    await expect(test.service.prepare(scope, 'single')).rejects.toThrow(
      'active import',
    );
    expect(test.workflows.active).toHaveBeenCalledTimes(1);
    expect(test.api.editMessageText).not.toHaveBeenCalled();
  });

  it('preserves the active-workflow conflict when the requested mode differs', async () => {
    const test = setup();
    test.workflows.active.mockResolvedValue(workflow());

    await expect(test.service.prepare(scope, 'multiple')).rejects.toThrow(
      'active import',
    );
    expect(test.workflows.create).not.toHaveBeenCalled();
  });

  it('reads ACTIVE state without loading the workflow payload', async () => {
    const test = setup();
    test.workflows.websitePostImportMetadata.mockResolvedValue({
      id: 'workflow-1',
      postImportMode: 'MULTIPLE',
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 4,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(test.service.result(scope, 'workflow-1')).resolves.toEqual({
      ready: false,
      mode: 'multiple',
      status: 'ACTIVE',
    });
    expect(test.workflows.get).not.toHaveBeenCalled();
  });

  it('loads and normalizes the payload only for a completed result', async () => {
    const test = setup();
    test.workflows.websitePostImportMetadata.mockResolvedValue({
      id: 'workflow-1',
      postImportMode: 'SINGLE',
      status: TelegramSystemBotWorkflowStatus.COMPLETED,
      version: 5,
      expiresAt: new Date(),
    });
    test.workflows.get.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        payload: { mode: 'single', contents: [captured] },
      }),
    );

    const result = await test.service.result(scope, 'workflow-1');
    expect(result).toEqual({
      ready: true,
      mode: 'single',
      status: 'COMPLETED',
      drafts: [
        expect.objectContaining({
          title: 'Formatted post',
          formattedHtml: '<b>Formatted</b> post',
          mediaItems: captured.mediaItems,
          buttonRows: captured.buttonRows,
        }),
      ],
    });
  });

  it('captures and completes a single non-album post automatically', async () => {
    const test = setup();
    const active = workflow();
    const next = workflow({
      version: 4,
      step: 'COLLECT_CONTENT',
      payload: { mode: 'single', contents: [captured] },
    });
    test.workflows.active.mockResolvedValue(active);
    test.content.capture.mockResolvedValue({ ok: true, content: captured });
    test.workflows.transition.mockResolvedValue(next);
    test.workflows.completeCapture.mockResolvedValue(
      workflow({
        version: 5,
        step: 'COLLECT_CONTENT',
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        payload: { mode: 'single', contents: [captured] },
      }),
    );

    await test.service.input(scope, { message_id: 10, text: 'forwarded' });

    expect(test.workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        payload: { mode: 'single', contents: [captured] },
      }),
    );
    expect(test.content.removeInput).toHaveBeenCalledWith('42', 10);
    expect(test.workflows.completeCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workflow-1',
        expectedVersion: 4,
      }),
    );
    expect(test.api.sendPhoto).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '42',
        photo: 'https://cdn.test/photo.jpg',
        caption: 'Formatted post',
        parse_mode: 'HTML',
      }),
    );
    expect(test.api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '42',
      message_id: 77,
    });
    expect(test.api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining(
          '1 post(s) captured. Return to the website to continue.',
        ),
      }),
    );
  });

  it('keeps a single Telegram album active until all album items arrive', async () => {
    const test = setup();
    const albumPost = { ...captured, mediaGroupId: 'album-1' };
    test.workflows.active.mockResolvedValue(workflow());
    test.content.capture.mockResolvedValue({ ok: true, content: albumPost });
    test.workflows.transition.mockResolvedValue(
      workflow({
        version: 4,
        step: 'COLLECT_CONTENT',
        payload: { mode: 'single', contents: [albumPost] },
      }),
    );

    await test.service.input(scope, { message_id: 10, photo: [] });

    expect(test.workflows.completeCapture).not.toHaveBeenCalled();
    expect(test.api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('Finish the import'),
      }),
    );
  });

  it('merges album updates into one logical post', async () => {
    const test = setup();
    const first = {
      ...captured,
      mediaGroupId: 'album-1',
      imageUrls: ['https://cdn.test/first.jpg'],
      mediaItems: [
        {
          kind: 'PHOTO' as const,
          url: 'https://cdn.test/first.jpg',
          sourceMessageId: 10,
        },
      ],
    };
    const second = {
      ...captured,
      mediaGroupId: 'album-1',
      imageUrls: ['https://cdn.test/second.jpg'],
      mediaItems: [
        {
          kind: 'PHOTO' as const,
          url: 'https://cdn.test/second.jpg',
          sourceMessageId: 11,
        },
      ],
    };
    test.workflows.active.mockResolvedValue(
      workflow({
        postImportMode: 'MULTIPLE',
        step: 'COLLECT_CONTENT',
        payload: { mode: 'multiple', contents: [first] },
      }),
    );
    test.content.capture.mockResolvedValue({ ok: true, content: second });
    let transitionedPayload:
      | { contents: Array<{ mediaItems: typeof first.mediaItems }> }
      | undefined;
    test.workflows.transition.mockImplementation(
      (input: {
        step: string;
        payload: { contents: Array<{ mediaItems: typeof first.mediaItems }> };
      }) => {
        transitionedPayload = input.payload;
        return workflow({
          version: 4,
          step: input.step,
          payload: input.payload,
        });
      },
    );

    await test.service.input(scope, { message_id: 11, photo: [] });

    expect(transitionedPayload?.contents).toHaveLength(1);
    expect(transitionedPayload?.contents[0].mediaItems).toHaveLength(2);
  });

  it('enforces the multiple-import post limit', async () => {
    const test = setup();
    test.workflows.active.mockResolvedValue(
      workflow({
        postImportMode: 'MULTIPLE',
        step: 'COLLECT_CONTENT',
        payload: {
          mode: 'multiple',
          contents: Array.from(
            { length: TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS },
            (_, index) => ({ ...captured, text: `Post ${index}` }),
          ),
        },
      }),
    );
    test.content.capture.mockResolvedValue({ ok: true, content: captured });

    await expect(
      test.service.input(scope, { message_id: 51, text: 'one too many' }),
    ).rejects.toThrow('at most 50 posts');
    expect(test.workflows.transition).not.toHaveBeenCalled();
  });

  it('retries a stale append without capturing the Telegram update twice', async () => {
    const test = setup();
    const active = workflow({
      postImportMode: 'MULTIPLE',
      payload: { mode: 'multiple', contents: [] },
    });
    test.workflows.active.mockResolvedValue(active);
    test.content.capture.mockResolvedValue({ ok: true, content: captured });
    test.workflows.transition
      .mockRejectedValueOnce(new ConflictException('stale'))
      .mockResolvedValueOnce(
        workflow({
          version: 5,
          postImportMode: 'MULTIPLE',
          step: 'COLLECT_CONTENT',
          payload: { mode: 'multiple', contents: [captured] },
        }),
      )
      .mockResolvedValueOnce(
        workflow({
          version: 6,
          postImportMode: 'MULTIPLE',
          step: 'COLLECT_CONTENT',
          payload: { mode: 'multiple', contents: [captured] },
        }),
      );
    test.workflows.get.mockResolvedValue(workflow({ version: 4 }));

    await test.service.input(scope, { message_id: 10, text: 'forwarded' });

    expect(test.content.capture).toHaveBeenCalledTimes(1);
    expect(test.workflows.transition).toHaveBeenCalledTimes(3);
  });

  it('finishes a multiple import with a version-guarded transition', async () => {
    const test = setup();
    const active = workflow({
      postImportMode: 'MULTIPLE',
      payload: { mode: 'multiple', contents: [captured] },
    });
    test.workflows.get.mockResolvedValue(active);
    test.workflows.completeCapture.mockResolvedValue(
      workflow({
        postImportMode: 'MULTIPLE',
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        payload: { mode: 'multiple', contents: [captured] },
      }),
    );

    await test.service.callback(scope, 'sbi:workflow-1:3:finish');

    expect(test.workflows.completeCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        workspaceId: 'workspace-1',
      }),
    );
  });

  it('does not apply a stale finish callback twice', async () => {
    const test = setup();
    test.workflows.get.mockResolvedValue(
      workflow({
        version: 4,
        postImportMode: 'MULTIPLE',
        payload: { mode: 'multiple', contents: [captured] },
      }),
    );

    await test.service.callback(scope, 'sbi:workflow-1:3:finish');

    expect(test.workflows.completeCapture).not.toHaveBeenCalled();
    expect(test.api.editMessageText).toHaveBeenCalledTimes(1);
  });

  it('cancels only the connection- and workspace-scoped workflow version', async () => {
    const test = setup();
    test.workflows.websitePostImportMetadata.mockResolvedValue({
      id: 'workflow-1',
      postImportMode: 'SINGLE',
      status: TelegramSystemBotWorkflowStatus.ACTIVE,
      version: 9,
      expiresAt: new Date(Date.now() + 60_000),
    });
    test.workflows.cancel.mockResolvedValue(
      workflow({ status: TelegramSystemBotWorkflowStatus.CANCELLED }),
    );

    await expect(test.service.cancel(scope, 'workflow-1')).resolves.toEqual({
      workflowId: 'workflow-1',
      mode: 'single',
      status: 'CANCELLED',
    });
    expect(test.workflows.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-1',
        workspaceId: 'workspace-1',
        expectedVersion: 9,
      }),
    );
  });
});
