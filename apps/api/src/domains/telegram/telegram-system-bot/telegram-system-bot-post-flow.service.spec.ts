/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- stateful workflow test doubles */
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

const content = {
  text: 'Forwarded post',
  imageUrls: [],
  buttonRows: [],
  mediaGroupId: null,
  sourceTitle: 'Source',
  warnings: [],
};

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    connectionId: scope.connectionId,
    workspaceId: scope.workspaceId,
    kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
    step: 'AWAIT_CONTENT',
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    version: 2,
    controlMessageId: 99,
    payload: {},
    resultManagedPostId: null,
    resultAdSaleId: null,
    resultAdSalePlacementId: null,
    lastError: null,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    updatedAt: new Date('2026-08-24T00:00:00.000Z'),
    ...overrides,
  };
}

function setup() {
  const api = {
    getFile: jest.fn().mockResolvedValue({ file_path: 'photos/source.jpg' }),
    downloadFile: jest.fn().mockResolvedValue({
      bytes: Buffer.from('image'),
      contentType: 'image/jpeg',
    }),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 99 }),
    editMessageCaption: jest.fn().mockResolvedValue({ message_id: 99 }),
    editMessageReplyMarkup: jest.fn().mockResolvedValue({ message_id: 99 }),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
    sendPhoto: jest.fn().mockResolvedValue({ message_id: 100 }),
    sendMediaGroup: jest.fn().mockResolvedValue([{ message_id: 100 }]),
    deleteMessage: jest.fn().mockResolvedValue(true),
  };
  const workflows = {
    active: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    transition: jest.fn(),
    cancel: jest.fn(),
    claimCommit: jest.fn(),
    recordManagedPost: jest
      .fn()
      .mockImplementation(({ expectedVersion, managedPostId }) =>
        workflow({
          status: TelegramSystemBotWorkflowStatus.COMMITTING,
          version: expectedVersion + 1,
          resultManagedPostId: managedPostId,
        }),
      ),
    fail: jest.fn(),
    retry: jest.fn(),
    complete: jest.fn(),
  };
  const domain = {
    channels: jest.fn().mockResolvedValue([
      { id: 'inactive', title: 'Inactive', isActive: false },
      { id: 'channel-1', title: 'Allowed', isActive: true },
    ]),
  };
  const media = {
    persistImageBytes: jest.fn().mockResolvedValue(['https://cdn/photo.jpg']),
  };
  const command = {
    createManagedPost: jest.fn().mockResolvedValue({ id: 'post-1' }),
  };
  const publication = {
    publishManagedPostNow: jest.fn(),
    scheduleManagedPost: jest.fn(),
  };
  const postGroups = {
    optionsForSystemBotPost: jest.fn().mockResolvedValue([
      { id: 'system-group', title: 'System Bot posts', isDefault: true },
      { id: 'custom-group', title: 'Ideas', isDefault: false },
    ]),
  };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest
      .fn()
      .mockImplementation((provider) =>
        provider.name === 'TelegramManagedPostCommandService'
          ? command
          : provider.name === 'TelegramSystemPostGroupsService'
            ? postGroups
            : publication,
      ),
  };
  const flowOptions = {
    channels: jest.fn(async (input) =>
      (await domain.channels(input.workspaceId, input.telegramUserId)).filter(
        (channel) => channel.isActive,
      ),
    ),
    groups: jest.fn((input, channelId) =>
      postGroups.optionsForSystemBotPost(input.userId, channelId),
    ),
  };
  const postContent = new TelegramSystemBotPostContentService(
    { token: 'token' } as any,
    api as any,
    media as any,
  );
  const service = new TelegramSystemBotPostFlowService(
    { token: 'token' } as any,
    api as any,
    workflows as any,
    flowOptions as any,
    postContent,
    moduleRef as any,
  );
  return {
    service,
    api,
    workflows,
    domain,
    media,
    command,
    publication,
    postGroups,
  };
}

describe('TelegramSystemBotPostFlowService', () => {
  it('sends an advertising post preview to the connected bot chat', async () => {
    const state = setup();

    await expect(
      state.service.sendAdSalePreview(scope, {
        text: '**Please** approve',
        imageUrls: ['https://cdn.test/post.jpg'],
        buttonRows: [[{ text: 'Open', url: 'https://example.com' }]],
      }),
    ).resolves.toEqual({ status: 'SENT' });

    expect(state.api.sendPhoto).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      photo: 'https://cdn.test/post.jpg',
      caption: '<b>Please</b> approve',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Open', url: 'https://example.com' }]],
      },
    });
  });
  it('proactively sends the Ad Sale import prompt to the connected bot chat', async () => {
    const { service, workflows, api } = setup();
    const created = workflow({
      version: 1,
      controlMessageId: null,
      payload: { destination: 'AD_SALE_MODAL' },
    });
    workflows.create.mockResolvedValue(created);
    workflows.transition.mockResolvedValue(
      workflow({
        version: 2,
        payload: { destination: 'AD_SALE_MODAL' },
      }),
    );

    await expect(service.prepareAdSaleImport(scope)).resolves.toEqual({
      workflowId: 'workflow-1',
    });

    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ chat_id: scope.chatId }),
    );
    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { destination: 'AD_SALE_MODAL' },
      }),
    );
  });

  it('cancels a competing command Ad Sale workflow before awaiting the website post', async () => {
    const { service, workflows } = setup();
    const conflictingAdSale = workflow({
      id: 'ad-sale-workflow',
      kind: TelegramSystemBotWorkflowKind.AD_SALE,
      version: 7,
    });
    workflows.active.mockResolvedValue(conflictingAdSale);
    workflows.cancel.mockResolvedValue({
      ...conflictingAdSale,
      status: TelegramSystemBotWorkflowStatus.CANCELLED,
      version: 8,
    });
    workflows.create.mockResolvedValue(
      workflow({ payload: { destination: 'AD_SALE_MODAL' } }),
    );

    await service.prepareAdSaleImport(scope);

    expect(workflows.active).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: scope.connectionId,
        workspaceId: scope.workspaceId,
      }),
      TelegramSystemBotWorkflowKind.AD_SALE,
    );
    expect(workflows.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ad-sale-workflow',
        expectedVersion: 7,
      }),
    );
    expect(workflows.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      workflows.create.mock.invocationCallOrder[0],
    );
  });

  it('keeps Ad Sale imports channel-free and renders the captured photo natively', async () => {
    const { service, workflows, api } = setup();
    const active = workflow({
      payload: { destination: 'AD_SALE_MODAL' },
    });
    const next = workflow({
      step: 'CHOOSE_ACTION',
      version: 3,
      payload: {
        destination: 'AD_SALE_MODAL',
        content: { ...content, imageUrls: ['https://cdn/photo.jpg'] },
      },
    });
    workflows.active.mockResolvedValue(active);
    workflows.transition.mockResolvedValue(next);

    await service.input(scope, {
      message_id: 10,
      caption: 'Forwarded post',
      photo: [{ file_id: 'best', file_size: 100 }],
      forward_date: 1_700_000_000,
    });

    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'CHOOSE_ACTION' }),
    );
    expect(api.editMessageCaption).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        caption: 'Forwarded post',
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      }),
    );
    expect(JSON.stringify(api.editMessageCaption.mock.calls)).not.toContain(
      'Choose a channel',
    );
    expect(JSON.stringify(api.editMessageCaption.mock.calls)).not.toContain(
      'Post preview',
    );
  });

  it('keeps the existing post card when a native photo replacement fails', async () => {
    const { service, workflows, api } = setup();
    workflows.active.mockResolvedValue(
      workflow({ payload: { destination: 'AD_SALE_MODAL' } }),
    );
    workflows.transition.mockResolvedValue(
      workflow({
        step: 'CHOOSE_ACTION',
        version: 3,
        payload: {
          destination: 'AD_SALE_MODAL',
          content: { ...content, imageUrls: ['https://cdn/photo.jpg'] },
        },
      }),
    );
    api.editMessageCaption.mockRejectedValue(new Error('not a photo'));
    api.sendPhoto.mockRejectedValue(new Error('caption too long'));

    await service.input(scope, {
      message_id: 10,
      caption: 'Forwarded post',
      photo: [{ file_id: 'best', file_size: 100 }],
      forward_date: 1_700_000_000,
    });

    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ message_id: 99 }),
    );
    expect(api.deleteMessage).not.toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ message_id: 99 }),
    );
  });

  it('keeps the imported post intact and sends Ad Sale completion below it', async () => {
    const { service, workflows, api } = setup();
    const payload = {
      destination: 'AD_SALE_MODAL',
      content: { ...content, imageUrls: ['https://cdn/photo.jpg'] },
    };
    workflows.get.mockResolvedValue(
      workflow({
        step: 'CHOOSE_ACTION',
        payload,
      }),
    );
    workflows.claimCommit.mockResolvedValue(
      workflow({
        step: 'CHOOSE_ACTION',
        status: TelegramSystemBotWorkflowStatus.COMMITTING,
        version: 3,
        payload,
      }),
    );
    workflows.complete.mockResolvedValue(
      workflow({
        step: 'CHOOSE_ACTION',
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        version: 4,
        payload,
      }),
    );

    await service.callback(scope, 'sbp:workflow-1:2:confirm');

    expect(api.editMessageReplyMarkup).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      message_id: 99,
      reply_markup: { inline_keyboard: [] },
    });
    expect(api.sendMessage).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      text: '✅ Post added to the Ad Sale form. Return to the website.',
    });
    expect(api.editMessageCaption).not.toHaveBeenCalled();
  });

  it('captures a forwarded photo into a persisted managed-post draft payload', async () => {
    const { service, workflows, media, api } = setup();
    const active = workflow();
    const next = workflow({
      step: 'CHOOSE_CHANNEL',
      version: 3,
      payload: {
        content: { ...content, imageUrls: ['https://cdn/photo.jpg'] },
      },
    });
    workflows.active.mockResolvedValue(active);
    workflows.transition.mockResolvedValue(next);

    await service.input(scope, {
      message_id: 10,
      caption: 'Forwarded post',
      photo: [{ file_id: 'small' }, { file_id: 'best', file_size: 100 }],
      forward_date: 1_700_000_000,
    });

    expect(api.getFile).toHaveBeenCalledWith('token', 'best');
    expect(media.persistImageBytes).toHaveBeenCalledTimes(1);
    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...scope,
        step: 'CHOOSE_CHANNEL',
        payload: expect.objectContaining({
          content: expect.objectContaining({
            text: 'Forwarded post',
            imageUrls: ['https://cdn/photo.jpg'],
          }),
        }),
      }),
    );
    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      message_id: 10,
    });
  });

  it('retries a failed photo import and keeps the workflow available', async () => {
    const { service, workflows, media, api } = setup();
    const active = workflow();
    workflows.active.mockResolvedValue(active);
    media.persistImageBytes.mockRejectedValue(new Error('storage unavailable'));

    await service.input(scope, {
      message_id: 10,
      caption: 'Forwarded post',
      photo: [{ file_id: 'best', file_size: 100 }],
      forward_date: 1_700_000_000,
    });

    expect(api.getFile).toHaveBeenCalledTimes(2);
    expect(workflows.transition).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining(
          'Could not download or store this photo. Forward the post again to retry.',
        ),
      }),
    );
  });

  it('commits the captured photo as a managed draft without publishing it', async () => {
    const { service, workflows, command, publication } = setup();
    const photoContent = {
      ...content,
      imageUrls: ['https://cdn/photo.jpg'],
    };
    const confirming = workflow({
      step: 'CONFIRM',
      payload: {
        content: photoContent,
        channelId: 'channel-1',
        channelTitle: 'Allowed',
        groupId: 'system-group',
        groupTitle: 'System Bot posts',
        action: 'DRAFT',
      },
    });
    workflows.get.mockResolvedValue(confirming);
    workflows.claimCommit.mockResolvedValue(
      workflow({
        ...confirming,
        status: TelegramSystemBotWorkflowStatus.COMMITTING,
        version: 3,
      }),
    );
    workflows.complete.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        version: 4,
        resultManagedPostId: 'post-1',
      }),
    );

    await service.callback(scope, 'sbp:workflow-1:2:confirm');

    expect(command.createManagedPost).toHaveBeenCalledWith(
      scope.userId,
      'channel-1',
      expect.objectContaining({ imageUrls: ['https://cdn/photo.jpg'] }),
      { groupId: 'system-group' },
    );
    expect(publication.publishManagedPostNow).not.toHaveBeenCalled();
    expect(publication.scheduleManagedPost).not.toHaveBeenCalled();
  });

  it('accepts scheduling input in the workspace timezone', async () => {
    const { service, workflows } = setup();
    const active = workflow({
      step: 'AWAIT_SCHEDULE',
      payload: { content, channelId: 'channel-1', channelTitle: 'Allowed' },
    });
    workflows.active.mockResolvedValue(active);
    workflows.transition.mockImplementation(({ payload }) =>
      workflow({ step: 'CONFIRM', version: 3, payload }),
    );

    await service.input(scope, {
      message_id: 11,
      text: '31.12.2099 14:30',
    });

    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'CONFIRM',
        payload: expect.objectContaining({
          action: 'SCHEDULE',
          scheduledAt: expect.stringMatching(/^2099-12-31T/),
        }),
      }),
    );
  });

  it('refreshes stale callbacks without changing workflow state', async () => {
    const { service, workflows, api } = setup();
    workflows.get.mockResolvedValue(workflow({ version: 4 }));

    await service.callback(scope, 'sbp:workflow-1:2:back');

    expect(workflows.transition).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('view was refreshed'),
      }),
    );
  });

  it('supports back and cancel with versioned transitions', async () => {
    const { service, workflows } = setup();
    workflows.get
      .mockResolvedValueOnce(workflow({ step: 'CHOOSE_ACTION' }))
      .mockResolvedValueOnce(workflow());
    workflows.transition.mockResolvedValue(
      workflow({ step: 'CHOOSE_CHANNEL', version: 3 }),
    );
    workflows.cancel.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.CANCELLED,
        version: 3,
      }),
    );

    await service.callback(scope, 'sbp:workflow-1:2:back');
    await service.callback(scope, 'sbp:workflow-1:2:cancel');

    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'CHOOSE_CHANNEL', expectedVersion: 2 }),
    );
    expect(workflows.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ ...scope, expectedVersion: 2 }),
    );
  });

  it('keeps unsupported media rejection inside the existing card', async () => {
    const { service, workflows, api, media } = setup();
    workflows.active.mockResolvedValue(workflow());

    await service.input(scope, {
      message_id: 12,
      text: 'Video caption',
      video: { file_id: 'video' },
      forward_date: 1_700_000_000,
    });

    expect(media.persistImageBytes).not.toHaveBeenCalled();
    expect(workflows.transition).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('Unsupported media: video'),
      }),
    );
  });

  it('appends photos belonging to the same forwarded album', async () => {
    const { service, workflows, media } = setup();
    const albumContent = {
      ...content,
      imageUrls: ['https://cdn/one.jpg'],
      mediaGroupId: 'album-1',
    };
    const active = workflow({
      step: 'CHOOSE_CHANNEL',
      payload: { content: albumContent },
    });
    workflows.active.mockResolvedValue(active);
    workflows.transition.mockImplementation(({ payload }) =>
      workflow({ step: 'CHOOSE_CHANNEL', version: 3, payload }),
    );
    media.persistImageBytes.mockResolvedValue(['https://cdn/two.jpg']);

    await service.input(scope, {
      message_id: 13,
      media_group_id: 'album-1',
      photo: [{ file_id: 'two' }],
      forward_date: 1_700_000_000,
    });

    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'CHOOSE_CHANNEL',
        payload: expect.objectContaining({
          content: expect.objectContaining({
            imageUrls: ['https://cdn/one.jpg', 'https://cdn/two.jpg'],
          }),
        }),
      }),
    );
  });

  it('selects only active channels returned for the scoped Telegram user', async () => {
    const { service, workflows, domain } = setup();
    workflows.get.mockResolvedValue(
      workflow({ step: 'CHOOSE_CHANNEL', payload: { content } }),
    );
    workflows.transition.mockResolvedValue(
      workflow({ step: 'CHOOSE_ACTION', version: 3 }),
    );

    await service.callback(scope, 'sbp:workflow-1:2:channel.0');

    expect(domain.channels).toHaveBeenCalledWith(
      scope.workspaceId,
      scope.telegramUserId,
    );
    expect(workflows.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          channelId: 'channel-1',
          channelTitle: 'Allowed',
          groupId: 'system-group',
          groupTitle: 'System Bot posts',
        }),
      }),
    );
  });

  it('renders the latest card when a double confirm loses the commit claim', async () => {
    const { service, workflows, command, api } = setup();
    const confirming = workflow({
      step: 'CONFIRM',
      payload: {
        content,
        channelId: 'channel-1',
        groupId: 'system-group',
        action: 'DRAFT',
      },
    });
    workflows.get.mockResolvedValueOnce(confirming).mockResolvedValueOnce(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        version: 4,
        resultManagedPostId: 'post-1',
      }),
    );
    workflows.claimCommit.mockRejectedValue(
      new ConflictException('already claimed'),
    );

    await service.callback(scope, 'sbp:workflow-1:2:confirm');

    expect(command.createManagedPost).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ text: expect.stringContaining('Post saved') }),
    );
  });

  it('keeps commit failures in one card and exposes retry', async () => {
    const { service, workflows, command, api } = setup();
    const confirming = workflow({
      step: 'CONFIRM',
      payload: {
        content,
        channelId: 'channel-1',
        groupId: 'system-group',
        action: 'DRAFT',
      },
    });
    workflows.get.mockResolvedValue(confirming);
    workflows.claimCommit.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMMITTING,
        version: 3,
      }),
    );
    command.createManagedPost.mockRejectedValue(
      new Error('storage unavailable'),
    );
    workflows.fail.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.FAILED,
        version: 4,
        lastError: 'storage unavailable',
      }),
    );

    await expect(
      service.callback(scope, 'sbp:workflow-1:2:confirm'),
    ).resolves.toBeDefined();
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('storage unavailable'),
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [
              expect.objectContaining({
                callback_data: 'sbp:workflow-1:4:retry',
              }),
            ],
          ]),
        }),
      }),
    );
  });

  it('reclaims a failed workflow and completes it on retry', async () => {
    const { service, workflows, command } = setup();
    const failed = workflow({
      step: 'CONFIRM',
      status: TelegramSystemBotWorkflowStatus.FAILED,
      version: 4,
      payload: {
        content,
        channelId: 'channel-1',
        groupId: 'system-group',
        action: 'DRAFT',
      },
    });
    const active = workflow({
      step: 'CONFIRM',
      version: 5,
      payload: failed.payload,
    });
    workflows.get.mockResolvedValue(failed);
    workflows.retry.mockResolvedValue(active);
    workflows.claimCommit.mockResolvedValue(
      workflow({
        step: 'CONFIRM',
        status: TelegramSystemBotWorkflowStatus.COMMITTING,
        version: 6,
        payload: failed.payload,
      }),
    );
    workflows.complete.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        version: 7,
        resultManagedPostId: 'post-1',
      }),
    );

    await service.callback(scope, 'sbp:workflow-1:4:retry');

    expect(workflows.retry).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 4 }),
    );
    expect(command.createManagedPost).toHaveBeenCalledTimes(1);
    expect(workflows.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 7,
        resultManagedPostId: 'post-1',
      }),
    );
  });

  it('reuses the journaled managed post when delivery fails and is retried', async () => {
    const { service, workflows, command, publication } = setup();
    const payload = {
      content,
      channelId: 'channel-1',
      groupId: 'system-group',
      action: 'PUBLISH_NOW',
    };
    const confirming = workflow({ step: 'CONFIRM', payload });
    const claimed = workflow({
      step: 'CONFIRM',
      status: TelegramSystemBotWorkflowStatus.COMMITTING,
      version: 3,
      payload,
    });
    const journaled = workflow({
      ...claimed,
      version: 4,
      resultManagedPostId: 'post-1',
    });
    const failed = workflow({
      step: 'CONFIRM',
      status: TelegramSystemBotWorkflowStatus.FAILED,
      version: 5,
      payload,
      resultManagedPostId: 'post-1',
    });
    const retried = workflow({
      step: 'CONFIRM',
      version: 6,
      payload,
      resultManagedPostId: 'post-1',
    });
    const reclaimed = workflow({
      step: 'CONFIRM',
      status: TelegramSystemBotWorkflowStatus.COMMITTING,
      version: 7,
      payload,
      resultManagedPostId: 'post-1',
    });
    workflows.get
      .mockResolvedValueOnce(confirming)
      .mockResolvedValueOnce(failed);
    workflows.claimCommit
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(reclaimed);
    workflows.recordManagedPost.mockResolvedValue(journaled);
    workflows.fail.mockResolvedValue(failed);
    workflows.retry.mockResolvedValue(retried);
    workflows.complete.mockResolvedValue(
      workflow({
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        version: 8,
        resultManagedPostId: 'post-1',
      }),
    );
    publication.publishManagedPostNow
      .mockRejectedValueOnce(new Error('Telegram unavailable'))
      .mockResolvedValueOnce({ id: 'post-1' });

    await service.callback(scope, 'sbp:workflow-1:2:confirm');
    await service.callback(scope, 'sbp:workflow-1:5:retry');

    expect(command.createManagedPost).toHaveBeenCalledTimes(1);
    expect(workflows.recordManagedPost).toHaveBeenCalledTimes(1);
    expect(publication.publishManagedPostNow).toHaveBeenCalledTimes(2);
    expect(workflows.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 7,
        resultManagedPostId: 'post-1',
      }),
    );
  });
});
