import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramSystemBotWorkflowKind,
  WorkspaceRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotIconCaptureService } from '../../../telegram/shared/telegram-bot-icon-capture.service';
import { storedTelegramIconPresentation } from '../../../telegram/shared/telegram-bot-icon-source';
import {
  telegramBotApiActionRow,
  telegramBotEditButtonText,
} from '../../../telegram/shared/telegram-bot-action-buttons';
import { telegramMarkupToHtml } from '../../../telegram/shared/telegram-markup';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import type { TelegramSystemBotPostFlowScope } from './telegram-system-bot-post-flow.types';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';
import { systemBotReviewActionRow } from './telegram-system-bot-inline-keyboard';

type Payload = {
  mode?: 'CREATE' | 'EDIT';
  name?: string;
  iconSource?: string;
};

@Injectable()
export class TelegramSystemBotWorkspaceFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly workflows: TelegramSystemBotWorkflowStore,
    private readonly icons: TelegramBotIconCaptureService,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('sbw:'));
  }

  isWorkspaceMenuNavigation(
    value: unknown,
  ): value is { navigateToWorkspaceMenu: true; messageId?: number } {
    return Boolean(
      value && typeof value === 'object' && 'navigateToWorkspaceMenu' in value,
    );
  }

  async beginCreate(
    scope: TelegramSystemBotPostFlowScope,
    controlMessageId?: number,
  ) {
    return this.begin(scope, 'CREATE', 'AWAIT_NAME', {}, controlMessageId);
  }

  async beginEdit(
    scope: TelegramSystemBotPostFlowScope,
    currentName: string,
    controlMessageId?: number,
    currentIconSource?: string,
  ) {
    return this.begin(
      scope,
      'EDIT',
      'CHOOSE_FIELD',
      { name: currentName, iconSource: currentIconSource },
      controlMessageId,
    );
  }

  async input(
    scope: TelegramSystemBotPostFlowScope,
    message: TelegramSystemBotIncomingMessage,
  ) {
    const workflow = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.WORKSPACE_SETTINGS,
    );
    if (!workflow) return null;
    const payload = this.payload(workflow.payload);
    if (workflow.step === 'AWAIT_NAME') {
      const name = message.text?.trim();
      if (!name || name.length > 80)
        return this.render(
          workflow,
          scope,
          'Send a name from 1 to 80 characters.',
        );
      await this.removeInput(scope.chatId, message.message_id);
      return this.transition(
        workflow,
        scope,
        payload.mode === 'CREATE' ? 'AWAIT_ICON' : 'REVIEW',
        { ...payload, name },
      );
    }
    if (workflow.step !== 'AWAIT_ICON') return null;
    const iconSource =
      this.icons.text(message) ??
      (await this.icons.media(this.config.token!, message));
    await this.removeInput(scope.chatId, message.message_id);
    if (!iconSource)
      return this.render(
        workflow,
        scope,
        'Send one emoji, one Telegram Premium emoji, or one image up to 5 MB.',
      );
    return this.transition(workflow, scope, 'REVIEW', {
      ...payload,
      iconSource,
    });
  }

  async callback(scope: TelegramSystemBotPostFlowScope, value: string) {
    const match = /^sbw:([^:]+):(\d+):(.+)$/.exec(value);
    if (!match) return null;
    const workflow = await this.workflows.get(scope, match[1]);
    if (workflow.version !== Number(match[2]))
      return this.render(workflow, scope, 'This view was refreshed.');
    const action = match[3];
    const payload = this.payload(workflow.payload);
    if (action === 'cancel') {
      const cancelled = await this.workflows.cancel({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
      return this.render(cancelled, scope);
    }
    if (action === 'name')
      return this.transition(workflow, scope, 'AWAIT_NAME', payload);
    if (action === 'icon')
      return this.transition(workflow, scope, 'AWAIT_ICON', payload);
    if (action === 'back') {
      const exitsToWorkspaceMenu =
        (payload.mode === 'EDIT' && workflow.step === 'CHOOSE_FIELD') ||
        (payload.mode === 'CREATE' && workflow.step === 'AWAIT_NAME');
      if (exitsToWorkspaceMenu) {
        await this.workflows.cancel({
          ...scope,
          id: workflow.id,
          expectedVersion: workflow.version,
        });
        return {
          navigateToWorkspaceMenu: true as const,
          ...(workflow.controlMessageId
            ? { messageId: workflow.controlMessageId }
            : {}),
        };
      }
      if (payload.mode === 'EDIT')
        return this.transition(workflow, scope, 'CHOOSE_FIELD', payload);
      if (workflow.step === 'REVIEW')
        return this.transition(workflow, scope, 'AWAIT_ICON', payload);
      if (workflow.step === 'AWAIT_ICON')
        return this.transition(workflow, scope, 'AWAIT_NAME', payload);
    }
    if (action === 'skip' && payload.mode === 'CREATE')
      return this.transition(workflow, scope, 'REVIEW', payload);
    if (action === 'confirm') return this.commit(workflow, scope, payload);
    return null;
  }

  private async begin(
    scope: TelegramSystemBotPostFlowScope,
    mode: 'CREATE' | 'EDIT',
    step: string,
    payload: Payload,
    controlMessageId?: number,
  ) {
    const active = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.WORKSPACE_SETTINGS,
    );
    if (active) {
      const replacesAnotherCard =
        controlMessageId !== undefined &&
        active.controlMessageId !== controlMessageId;
      if (!replacesAnotherCard) return this.render(active, scope);
      await this.workflows.cancel({
        ...scope,
        id: active.id,
        expectedVersion: active.version,
      });
    }
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.WORKSPACE_SETTINGS,
      step,
      payload: { ...payload, mode },
      controlMessageId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    return this.render(workflow, scope);
  }

  private async transition(
    workflow: { id: string; version: number },
    scope: TelegramSystemBotPostFlowScope,
    step: string,
    payload: Payload,
  ) {
    const next = await this.workflows.transition({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
      step,
      payload,
    });
    return this.render(next, scope);
  }

  private async commit(
    workflow: { id: string; version: number },
    scope: TelegramSystemBotPostFlowScope,
    payload: Payload,
  ) {
    const claimed = await this.workflows.claimCommit({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
    });
    let selectedWorkspaceId = scope.workspaceId;
    try {
      selectedWorkspaceId = await this.prisma.$transaction(async (tx) => {
        if (payload.mode === 'CREATE') {
          const workspaceId = randomUUID();
          await tx.workspace.create({
            data: {
              id: workspaceId,
              name: payload.name!,
              members: {
                create: { userId: scope.userId, role: WorkspaceRole.owner },
              },
            },
          });
          const avatarIconId = payload.iconSource
            ? await this.createIcon(
                tx,
                workspaceId,
                scope.userId,
                payload.iconSource,
              )
            : null;
          if (avatarIconId)
            await tx.workspace.update({
              where: { id: workspaceId },
              data: { avatarIconId },
            });
          await tx.telegramSystemBotConnection.update({
            where: { id: scope.connectionId },
            data: {
              currentWorkspaceId: workspaceId,
              lastInteractionAt: new Date(),
            },
          });
          return workspaceId;
        }
        const membership = await tx.workspaceMember.findFirst({
          where: { userId: scope.userId, workspaceId: scope.workspaceId },
          select: {
            role: true,
            workspace: { select: { name: true, avatarIconId: true } },
          },
        });
        if (!membership) throw new NotFoundException('Workspace not found');
        if (
          membership.role !== WorkspaceRole.owner &&
          membership.role !== WorkspaceRole.admin
        )
          throw new ForbiddenException('Only workspace admins can edit it');
        const avatarIconId = payload.iconSource
          ? await this.createIcon(
              tx,
              scope.workspaceId,
              scope.userId,
              payload.iconSource,
            )
          : undefined;
        if (
          membership.workspace.name !== payload.name ||
          (avatarIconId && membership.workspace.avatarIconId !== avatarIconId)
        )
          await tx.workspace.update({
            where: { id: scope.workspaceId },
            data: {
              name: payload.name,
              ...(avatarIconId ? { avatarIconId } : {}),
            },
          });
        return scope.workspaceId;
      });
      const completed = await this.workflows.complete({
        ...scope,
        id: claimed.id,
        expectedVersion: claimed.version,
      });
      await this.render(completed, scope);
      return { workspaceId: selectedWorkspaceId };
    } catch (error) {
      await this.workflows.fail({
        ...scope,
        id: claimed.id,
        expectedVersion: claimed.version,
        error:
          error instanceof Error ? error.message : 'Workspace update failed',
      });
      throw error;
    }
  }

  private async createIcon(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
    source: string,
  ) {
    const image = source.startsWith('image:');
    const existing = await tx.icon.findFirst({
      where: {
        workspaceId,
        type: image ? 'image' : 'emoji',
        ...(image ? { imageUrl: source.slice(6) } : { emoji: source }),
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const icon = await tx.icon.create({
      data: {
        workspaceId,
        type: image ? 'image' : 'emoji',
        name: `telegram-bot:${randomUUID()}`,
        ...(image ? { imageUrl: source.slice(6) } : { emoji: source }),
        createdByUserId: userId,
      },
      select: { id: true },
    });
    return icon.id;
  }

  private async render(
    workflow: {
      id: string;
      version: number;
      step: string;
      status: string;
      payload: unknown;
      controlMessageId?: number | null;
    },
    scope: TelegramSystemBotPostFlowScope,
    error?: string,
  ) {
    const payload = this.payload(workflow.payload);
    const callback = (action: string) =>
      `sbw:${workflow.id}:${workflow.version}:${action}`;
    const heading =
      payload.mode === 'CREATE' ? '➕ New workspace' : '✏️ Edit workspace';
    let text = heading;
    let inline_keyboard: Array<
      Array<{
        text: string;
        callback_data: string;
        style?: 'default' | 'primary' | 'success' | 'danger';
        icon_custom_emoji_id?: string;
      }>
    > = [];
    if (workflow.status === 'COMPLETED') text = '✅ Workspace saved.';
    else if (workflow.status === 'CANCELLED')
      text = 'Workspace changes cancelled.';
    else if (workflow.step === 'CHOOSE_FIELD') {
      text += `\n\nCurrent name: ${payload.name}`;
      const icon = storedTelegramIconPresentation(payload.iconSource, '🏢');
      const customEmojiId =
        icon.type === 'unicode' ? icon.telegramCustomEmojiId : null;
      inline_keyboard = [
        [
          {
            text: telegramBotEditButtonText(payload.name || 'Name'),
            callback_data: callback('name'),
          },
          {
            text: telegramBotEditButtonText(
              customEmojiId ? null : icon.type === 'image' ? '🖼️' : icon.value,
            ),
            callback_data: callback('icon'),
            ...(customEmojiId ? { icon_custom_emoji_id: customEmojiId } : {}),
          },
        ],
      ];
    } else if (workflow.step === 'AWAIT_NAME')
      text += '\n\nSend the workspace name.';
    else if (workflow.step === 'AWAIT_ICON') {
      text += '\n\nSend one emoji, Telegram Premium emoji, or image.';
      if (payload.mode === 'CREATE')
        inline_keyboard = [[{ text: 'Skip', callback_data: callback('skip') }]];
    } else if (workflow.step === 'REVIEW') {
      text += `\n\nName: ${payload.name}\n\nSave changes?`;
      inline_keyboard = [
        systemBotReviewActionRow(`sbw:${workflow.id}:${workflow.version}:`),
      ];
    }
    if (
      !['COMPLETED', 'CANCELLED'].includes(workflow.status) &&
      workflow.step !== 'REVIEW'
    ) {
      const canGoBack =
        workflow.step === 'AWAIT_ICON' ||
        (payload.mode === 'CREATE' && workflow.step === 'AWAIT_NAME') ||
        (payload.mode === 'EDIT' &&
          ['CHOOSE_FIELD', 'AWAIT_NAME'].includes(workflow.step));
      inline_keyboard.push(
        telegramBotApiActionRow({
          ...(canGoBack ? { back: callback('back') } : {}),
          cancel: callback('cancel'),
        }),
      );
    }
    const card = {
      chat_id: scope.chatId,
      text: telegramMarkupToHtml(error ? `${text}\n\n⚠️ ${error}` : text),
      parse_mode: 'HTML' as const,
      ...(inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {}),
    };
    if (workflow.controlMessageId) {
      try {
        return await this.api.editMessageText(this.config.token!, {
          ...card,
          message_id: workflow.controlMessageId,
        });
      } catch {
        // Telegram can reject an old edit target; attach one replacement below.
      }
    }
    const sent = await this.api.sendMessage(this.config.token!, card);
    if (workflow.status !== 'ACTIVE' || workflow.controlMessageId) return sent;
    const attached = await this.workflows.transition({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
      step: workflow.step,
      payload: workflow.payload as Prisma.InputJsonValue,
      controlMessageId: sent.message_id,
    });
    return this.render(attached, scope, error);
  }

  private payload(value: unknown): Payload {
    return value && typeof value === 'object' ? value : {};
  }

  private async removeInput(chatId: string, messageId?: number) {
    if (!messageId) return;
    await this.api
      .deleteMessage(this.config.token!, {
        chat_id: chatId,
        message_id: messageId,
      })
      .catch(() => undefined);
  }
}
