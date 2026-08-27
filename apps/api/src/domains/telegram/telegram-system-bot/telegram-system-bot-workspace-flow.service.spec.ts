import { ForbiddenException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Prisma/Jest nested asymmetric matchers are intentionally dynamic. */
import { TelegramSystemBotWorkspaceFlowService } from './telegram-system-bot-workspace-flow.service';

describe('TelegramSystemBotWorkspaceFlowService', () => {
  const scope = {
    chatId: '44',
    connectionId: 'connection-1',
    userId: 'user-1',
    telegramUserId: '44',
    workspaceId: 'workspace-1',
    timezone: 'UTC',
  };
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 10 }),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 10 }),
    deleteMessage: jest.fn().mockResolvedValue(true),
  };
  const tx = {
    workspace: { create: jest.fn(), update: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
    telegramSystemBotConnection: { update: jest.fn() },
    icon: { findFirst: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const workflows = {
    active: jest.fn(),
    create: jest.fn(),
    transition: jest.fn(),
    get: jest.fn(),
    cancel: jest.fn(),
    claimCommit: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  };
  const icons = { text: jest.fn(), media: jest.fn() };
  const service = new TelegramSystemBotWorkspaceFlowService(
    prisma as never,
    { token: 'token' } as never,
    api as never,
    workflows as never,
    icons as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.icon.findFirst.mockResolvedValue(null);
    tx.icon.create.mockResolvedValue({ id: 'icon-1' });
  });

  it('turns the workspace menu into the editor instead of sending a second message', async () => {
    const editor = {
      id: 'flow-edit',
      version: 1,
      step: 'CHOOSE_FIELD',
      status: 'ACTIVE',
      payload: { mode: 'EDIT', name: 'Test' },
      controlMessageId: 77,
    };
    workflows.active.mockResolvedValue(null);
    workflows.create.mockResolvedValue(editor);

    await service.beginEdit(scope, 'Test', 77);

    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({ controlMessageId: 77 }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        message_id: 77,
        text: expect.stringContaining('Edit workspace'),
      }),
    );
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the configured Premium emoji on the icon edit button only', async () => {
    const editor = {
      id: 'flow-premium',
      version: 1,
      step: 'CHOOSE_FIELD',
      status: 'ACTIVE',
      payload: {
        mode: 'EDIT',
        name: 'Test',
        iconSource: '![💬](tg://emoji?id=5368324170671202286)',
      },
      controlMessageId: 77,
    };
    workflows.active.mockResolvedValue(null);
    workflows.create.mockResolvedValue(editor);

    await service.beginEdit(
      scope,
      'Test',
      77,
      '![💬](tg://emoji?id=5368324170671202286)',
    );

    const card = api.editMessageText.mock.calls.at(-1)?.[1];
    expect(card.text).not.toContain('5368324170671202286');
    expect(card.reply_markup.inline_keyboard[0][1]).toEqual({
      text: '✏️',
      callback_data: 'sbw:flow-premium:1:icon',
      icon_custom_emoji_id: '5368324170671202286',
    });
  });

  it('rebinds a stale active workflow to the currently opened menu card', async () => {
    const stale = {
      id: 'flow-stale',
      version: 3,
      step: 'CHOOSE_FIELD',
      status: 'ACTIVE',
      payload: { mode: 'EDIT', name: 'Old' },
      controlMessageId: 55,
    };
    const editor = {
      ...stale,
      id: 'flow-current',
      version: 1,
      payload: { mode: 'EDIT', name: 'Test' },
      controlMessageId: 77,
    };
    workflows.active.mockResolvedValue(stale);
    workflows.create.mockResolvedValue(editor);

    await service.beginEdit(scope, 'Test', 77);

    expect(workflows.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'flow-stale', expectedVersion: 3 }),
    );
    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({ controlMessageId: 77 }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ message_id: 77 }),
    );
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('exits the root edit step back to the workspace menu', async () => {
    const editor = {
      id: 'flow-edit',
      version: 1,
      step: 'CHOOSE_FIELD',
      status: 'ACTIVE',
      payload: { mode: 'EDIT', name: 'Test' },
      controlMessageId: 77,
    };
    workflows.get.mockResolvedValue(editor);
    workflows.cancel.mockResolvedValue({
      ...editor,
      version: 2,
      status: 'CANCELLED',
    });

    await expect(
      service.callback(scope, 'sbw:flow-edit:1:back'),
    ).resolves.toEqual({
      navigateToWorkspaceMenu: true,
      messageId: 77,
    });
    expect(workflows.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'flow-edit', expectedVersion: 1 }),
    );
  });

  it('creates a workspace from a name and a sent Premium emoji, then selects it', async () => {
    const awaitingName = {
      id: 'flow-1',
      version: 1,
      step: 'AWAIT_NAME',
      status: 'ACTIVE',
      payload: { mode: 'CREATE' },
      controlMessageId: 10,
    };
    const awaitingIcon = {
      ...awaitingName,
      version: 2,
      step: 'AWAIT_ICON',
      payload: { mode: 'CREATE', name: 'Studio' },
    };
    const review = {
      ...awaitingIcon,
      version: 3,
      step: 'REVIEW',
      payload: {
        mode: 'CREATE',
        name: 'Studio',
        iconSource: '![🔥](tg://emoji?id=5368324170671202286)',
      },
    };
    workflows.active
      .mockResolvedValueOnce(awaitingName)
      .mockResolvedValueOnce(awaitingIcon);
    workflows.transition
      .mockResolvedValueOnce(awaitingIcon)
      .mockResolvedValueOnce(review);
    icons.text.mockReturnValue('![🔥](tg://emoji?id=5368324170671202286)');
    workflows.get.mockResolvedValue(review);
    workflows.claimCommit.mockResolvedValue({ ...review, version: 4 });
    workflows.complete.mockResolvedValue({
      ...review,
      version: 5,
      status: 'COMPLETED',
    });

    await service.input(scope, { message_id: 1, text: 'Studio' });
    await service.input(scope, {
      message_id: 2,
      text: '🔥',
      entities: [],
    });
    expect(api.editMessageText).toHaveBeenLastCalledWith(
      'token',
      expect.objectContaining({
        parse_mode: 'HTML',
        text: expect.not.stringContaining('5368324170671202286'),
        reply_markup: {
          inline_keyboard: [
            [
              expect.objectContaining({ text: '←' }),
              expect.objectContaining({ text: '❌' }),
              expect.objectContaining({ text: '✅' }),
            ],
          ],
        },
      }),
    );
    await service.callback(scope, 'sbw:flow-1:3:confirm');

    expect(tx.workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Studio',
          members: { create: { userId: 'user-1', role: 'owner' } },
        }),
      }),
    );
    expect(tx.icon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: expect.any(String),
          type: 'emoji',
          emoji: '![🔥](tg://emoji?id=5368324170671202286)',
        }),
      }),
    );
    expect(tx.telegramSystemBotConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connection-1' },
        data: expect.objectContaining({
          currentWorkspaceId: expect.any(String),
        }),
      }),
    );
  });

  it('rejects workspace editing for a regular member', async () => {
    const review = {
      id: 'flow-2',
      version: 2,
      step: 'REVIEW',
      status: 'ACTIVE',
      payload: { mode: 'EDIT', name: 'Renamed' },
      controlMessageId: 10,
    };
    workflows.get.mockResolvedValue(review);
    workflows.claimCommit.mockResolvedValue({ ...review, version: 3 });
    tx.workspaceMember.findFirst.mockResolvedValue({
      role: 'member',
      workspace: { name: 'Old', avatarIconId: null },
    });

    await expect(
      service.callback(scope, 'sbw:flow-2:2:confirm'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.workspace.update).not.toHaveBeenCalled();
    expect(workflows.fail).toHaveBeenCalled();
  });
});
