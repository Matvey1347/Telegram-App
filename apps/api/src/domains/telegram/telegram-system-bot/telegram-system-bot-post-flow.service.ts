import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import {
  Prisma,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { telegramMarkupToHtml } from '../../../telegram/shared/telegram-markup';
import { TelegramManagedPostCommandService } from '../telegram-channels/telegram-managed-post-command.service';
import { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import {
  parseTelegramSystemBotPostSchedule,
  telegramSystemBotPostTitle,
  telegramSystemBotPostWorkflowExpiry,
  transitionTelegramSystemBotCapturedContent,
} from './telegram-system-bot-post-flow.helpers';
import { applyTelegramSystemBotPostEdit } from './telegram-system-bot-post-edit-input';
import { renderTelegramSystemBotPostCard } from './telegram-system-bot-post-flow.presentation';
import {
  telegramSystemBotPostJson,
  telegramSystemBotPostPayload,
  type TelegramSystemBotPostFlowScope,
  type TelegramSystemBotPostPayload,
  type TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';
import { TelegramSystemBotPostFlowOptions } from './telegram-system-bot-post-flow.options';

export type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

@Injectable()
export class TelegramSystemBotPostFlowService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly workflows: TelegramSystemBotWorkflowStore,
    private readonly options: TelegramSystemBotPostFlowOptions,
    private readonly content: TelegramSystemBotPostContentService,
    private readonly moduleRef: ModuleRef,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('sbp:'));
  }

  async begin(scope: TelegramSystemBotPostFlowScope) {
    const existing = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.POST_IMPORT,
    );
    if (existing) return this.render(existing, scope);
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
      step: 'AWAIT_CONTENT',
      payload: {},
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    return this.render(workflow, scope);
  }

  async prepareAdSaleImport(scope: TelegramSystemBotPostFlowScope) {
    const conflictingAdSale = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.AD_SALE,
    );
    if (conflictingAdSale) {
      await this.workflows.cancel({
        ...scope,
        id: conflictingAdSale.id,
        expectedVersion: conflictingAdSale.version,
      });
    }
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
      step: 'AWAIT_CONTENT',
      payload: telegramSystemBotPostJson({ destination: 'AD_SALE_MODAL' }),
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    await this.render(workflow, scope);
    return { workflowId: workflow.id };
  }

  async sendAdSalePreview(
    scope: TelegramSystemBotPostFlowScope,
    draft: {
      text?: string;
      imageUrls?: string[];
      buttonRows?: Array<Array<{ text?: string; url?: string }>>;
    },
  ) {
    const text = String(draft.text ?? '').trim();
    const formattedText = telegramMarkupToHtml(text);
    const imageUrls = (draft.imageUrls ?? [])
      .map((url) => String(url).trim())
      .filter(Boolean)
      .slice(0, 10);
    if (!text && !imageUrls.length)
      throw new ConflictException('Advertising post is empty');
    const replyMarkup = {
      inline_keyboard: (draft.buttonRows ?? [])
        .map((row) =>
          row
            .map((button) => ({
              text: String(button.text ?? '').trim(),
              url: String(button.url ?? '').trim(),
            }))
            .filter((button) => button.text && button.url),
        )
        .filter((row) => row.length),
    };
    const token = this.config.token!;
    if (imageUrls.length === 1 && text.length <= 1024) {
      await this.api.sendPhoto(token, {
        chat_id: scope.chatId,
        photo: imageUrls[0],
        caption: formattedText || undefined,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    } else {
      if (imageUrls.length) {
        await this.api.sendMediaGroup(token, {
          chat_id: scope.chatId,
          media: imageUrls.map((media) => ({ type: 'photo', media })),
        });
      }
      if (text || replyMarkup.inline_keyboard.length) {
        await this.api.sendMessage(token, {
          chat_id: scope.chatId,
          text: formattedText || 'Advertising post',
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    }
    return { status: 'SENT' as const };
  }

  async resumeAdSaleImport(
    scope: TelegramSystemBotPostFlowScope,
    workflowId: string,
  ) {
    const workflow = await this.workflows.get(scope, workflowId);
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (payload.destination !== 'AD_SALE_MODAL')
      throw new NotFoundException('Ad Sale post import is unavailable');
    return this.render(workflow, scope);
  }

  async adSaleImportResult(
    scope: TelegramSystemBotPostFlowScope,
    workflowId: string,
  ) {
    const workflow = await this.workflows.get(scope, workflowId);
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (
      payload.destination !== 'AD_SALE_MODAL' ||
      workflow.status !== TelegramSystemBotWorkflowStatus.COMPLETED ||
      !payload.content
    )
      return { ready: false as const };
    return {
      ready: true as const,
      draft: {
        title: telegramSystemBotPostTitle(payload.content),
        text: payload.content.text,
        imageUrls: payload.content.imageUrls,
        buttonRows: payload.content.buttonRows,
      },
    };
  }

  async input(
    scope: TelegramSystemBotPostFlowScope,
    message: TelegramSystemBotIncomingMessage,
  ) {
    const active = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.POST_IMPORT,
    );
    if (
      active &&
      (active.step === 'AWAIT_EDIT_TEXT' ||
        active.step === 'AWAIT_EDIT_BUTTONS')
    ) {
      if (message.text === undefined) return null;
      const edit = applyTelegramSystemBotPostEdit(
        active.step,
        telegramSystemBotPostPayload(active.payload),
        message.text,
      );
      await this.content.removeInput(scope.chatId, message.message_id);
      return edit.ok
        ? this.transitionAndRender(scope, active, 'CHOOSE_ACTION', edit.payload)
        : this.render(active, scope, edit.error);
    }
    if (active?.step === 'AWAIT_SCHEDULE' && message.text) {
      const scheduledAt = parseTelegramSystemBotPostSchedule(
        message.text,
        scope.timezone,
      );
      if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
        await this.content.removeInput(scope.chatId, message.message_id);
        return this.render(
          active,
          scope,
          'Enter a future date as DD.MM.YYYY HH:mm.',
        );
      }
      const next = await this.workflows.transition({
        ...scope,
        id: active.id,
        expectedVersion: active.version,
        step: 'CONFIRM',
        payload: telegramSystemBotPostJson({
          ...telegramSystemBotPostPayload(active.payload),
          action: 'SCHEDULE',
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
      await this.content.removeInput(scope.chatId, message.message_id);
      return this.render(next, scope);
    }

    const capture = await this.content.capture(message);
    if (!capture.ok) {
      if (!active || active.step === 'AWAIT_CONTENT') {
        await this.content.removeInput(scope.chatId, message.message_id);
        return active
          ? this.render(
              active,
              scope,
              capture.reason === 'UNSUPPORTED_MEDIA'
                ? `Unsupported media: ${capture.unsupportedMedia.join(', ')}. Send text or photos.`
                : capture.reason === 'PHOTO_IMPORT_FAILED'
                  ? 'Could not download or store this photo. Forward the post again to retry.'
                  : 'Forward a text or photo post.',
            )
          : null;
      }
      return null;
    }

    const incoming = capture.content;
    if (!active && incoming.warnings.includes('NOT_FORWARDED')) return null;
    if (active) {
      const payload = telegramSystemBotPostPayload(active.payload);
      const sameAlbum =
        incoming.mediaGroupId &&
        payload.content?.mediaGroupId === incoming.mediaGroupId;
      if (active.step !== 'AWAIT_CONTENT' && !sameAlbum) return null;
      const next = await transitionTelegramSystemBotCapturedContent({
        workflows: this.workflows,
        scope,
        active,
        incoming,
        sameAlbum: Boolean(sameAlbum),
      });
      await this.content.removeInput(scope.chatId, message.message_id);
      return this.render(next, scope);
    }

    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
      step: 'CHOOSE_CHANNEL',
      payload: telegramSystemBotPostJson({ content: incoming }),
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    await this.content.removeInput(scope.chatId, message.message_id);
    return this.render(workflow, scope);
  }

  async callback(scope: TelegramSystemBotPostFlowScope, callback: string) {
    const match = /^sbp:([^:]+):(\d+):(.+)$/.exec(callback);
    if (!match) return null;
    const workflow = await this.workflows.get(scope, match[1]);
    const version = Number(match[2]);
    if (workflow.version !== version)
      return this.render(workflow, scope, 'This view was refreshed.');
    const action = match[3];
    if (action === 'cancel') {
      const cancelled = await this.workflows.cancel({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
      return this.render(cancelled, scope);
    }
    if (action === 'retry') {
      const retrying = await this.workflows.retry({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
      return this.commit(scope, retrying);
    }
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (action === 'back') return this.back(scope, workflow);
    if (action === 'confirm') {
      if (payload.destination === 'AD_SALE_MODAL')
        return this.completeAdSaleImport(scope, workflow);
      return this.commit(scope, workflow);
    }
    if (action.startsWith('channel.')) {
      const channels = await this.options.channels(scope);
      const channel = channels[Number(action.slice('channel.'.length))];
      if (!channel)
        throw new NotFoundException('Channel is no longer available');
      const groups = await this.options.groups(scope, channel.id);
      const defaultGroup = groups.find((group) => group.isDefault);
      if (!defaultGroup)
        throw new NotFoundException('System Bot posts group is unavailable');
      return this.transitionAndRender(scope, workflow, 'CHOOSE_ACTION', {
        ...payload,
        channelId: channel.id,
        channelTitle: channel.title,
        groupId: defaultGroup.id,
        groupTitle: defaultGroup.title,
      });
    }
    if (action === 'group.change') {
      return this.transitionAndRender(scope, workflow, 'CHOOSE_GROUP', payload);
    }
    if (action.startsWith('group.') && payload.channelId) {
      const groups = await this.options.groups(scope, payload.channelId);
      const group = groups[Number(action.slice('group.'.length))];
      if (!group)
        throw new NotFoundException('Post group is no longer available');
      return this.transitionAndRender(scope, workflow, 'CHOOSE_ACTION', {
        ...payload,
        groupId: group.id,
        groupTitle: group.title,
      });
    }
    if (action === 'draft') {
      return this.transitionAndRender(scope, workflow, 'CONFIRM', {
        ...payload,
        action: 'DRAFT',
        scheduledAt: undefined,
      });
    }
    if (action === 'publish') {
      return this.transitionAndRender(scope, workflow, 'CONFIRM', {
        ...payload,
        action: 'PUBLISH_NOW',
        scheduledAt: undefined,
      });
    }
    if (action === 'edit.text') {
      return this.transitionAndRender(
        scope,
        workflow,
        'AWAIT_EDIT_TEXT',
        payload,
      );
    }
    if (action === 'edit.buttons') {
      return this.transitionAndRender(
        scope,
        workflow,
        'AWAIT_EDIT_BUTTONS',
        payload,
      );
    }
    if (action === 'schedule') {
      return this.transitionAndRender(scope, workflow, 'AWAIT_SCHEDULE', {
        ...payload,
        action: 'SCHEDULE',
      });
    }
    return this.render(workflow, scope);
  }

  private async back(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
  ) {
    const previous: Record<string, string> = {
      CHOOSE_CHANNEL: 'AWAIT_CONTENT',
      CHOOSE_ACTION: 'CHOOSE_CHANNEL',
      CHOOSE_GROUP: 'CHOOSE_ACTION',
      AWAIT_EDIT_TEXT: 'CHOOSE_ACTION',
      AWAIT_EDIT_BUTTONS: 'CHOOSE_ACTION',
      AWAIT_SCHEDULE: 'CHOOSE_ACTION',
      CONFIRM:
        telegramSystemBotPostPayload(workflow.payload).action === 'SCHEDULE'
          ? 'AWAIT_SCHEDULE'
          : 'CHOOSE_ACTION',
    };
    const step = previous[workflow.step] ?? 'AWAIT_CONTENT';
    const payload = telegramSystemBotPostPayload(workflow.payload);
    const nextPayload =
      workflow.step === 'CHOOSE_ACTION'
        ? {
            ...payload,
            channelId: undefined,
            channelTitle: undefined,
            groupId: undefined,
            groupTitle: undefined,
          }
        : payload;
    return this.transitionAndRender(scope, workflow, step, nextPayload);
  }

  private async commit(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
  ) {
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (
      !payload.content ||
      !payload.channelId ||
      !payload.groupId ||
      !payload.action
    ) {
      return this.render(workflow, scope, 'Post workflow is incomplete.');
    }
    const groups = await this.options.groups(scope, payload.channelId);
    if (!groups.some((group) => group.id === payload.groupId)) {
      return this.transitionAndRender(
        scope,
        workflow,
        'CHOOSE_GROUP',
        { ...payload, groupId: undefined, groupTitle: undefined },
        'The selected post group is no longer available.',
      );
    }
    let claimed: TelegramSystemBotPostWorkflow;
    try {
      claimed = await this.workflows.claimCommit({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      const latest = await this.workflows.get(scope, workflow.id);
      return this.render(latest, scope, 'This action was already processed.');
    }
    let committing = claimed;
    try {
      const command = await this.resolveForWorkspace(
        TelegramManagedPostCommandService,
        scope.workspaceId,
      );
      let managedPostId = committing.resultManagedPostId;
      if (!managedPostId) {
        const post = await command.createManagedPost(
          scope.userId,
          payload.channelId,
          {
            title: telegramSystemBotPostTitle(payload.content),
            text: payload.content.text || undefined,
            imageUrls: payload.content.imageUrls,
            buttonRows: payload.content.buttonRows,
          },
          { groupId: payload.groupId },
        );
        managedPostId = post.id;
        committing = await this.workflows.recordManagedPost({
          ...scope,
          id: committing.id,
          expectedVersion: committing.version,
          managedPostId,
        });
      }
      if (payload.action !== 'DRAFT') {
        const publication = await this.resolveForWorkspace(
          TelegramManagedPostPublicationService,
          scope.workspaceId,
        );
        if (payload.action === 'PUBLISH_NOW') {
          await publication.publishManagedPostNow(
            scope.userId,
            payload.channelId,
            managedPostId,
            {},
          );
        } else {
          await publication.scheduleManagedPost(
            scope.userId,
            payload.channelId,
            managedPostId,
            { scheduledAt: payload.scheduledAt! },
          );
        }
      }
      const completed = await this.workflows.complete({
        ...scope,
        id: committing.id,
        expectedVersion: committing.version,
        resultManagedPostId: managedPostId,
      });
      return this.render(completed, scope);
    } catch (error) {
      const failed = await this.workflows.fail({
        ...scope,
        id: committing.id,
        expectedVersion: committing.version,
        error: sanitizeOperationalError(error),
      });
      return this.render(failed, scope);
    }
  }

  private async completeAdSaleImport(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
  ) {
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (!payload.content)
      return this.render(workflow, scope, 'Post content is unavailable.');
    const claimed = await this.workflows.claimCommit({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
    });
    const completed = await this.workflows.complete({
      ...scope,
      id: claimed.id,
      expectedVersion: claimed.version,
    });
    return this.render(completed, scope);
  }

  private async transitionAndRender(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
    step: string,
    payload: TelegramSystemBotPostPayload,
    notice?: string,
  ) {
    let current = workflow;
    let next: TelegramSystemBotPostWorkflow;
    try {
      next = await this.workflows.transition({
        ...scope,
        id: current.id,
        expectedVersion: current.version,
        step,
        payload: telegramSystemBotPostJson(payload),
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      current = await this.workflows.get(scope, workflow.id);
      if (
        current.status !== TelegramSystemBotWorkflowStatus.ACTIVE ||
        (current.step !== workflow.step && current.step !== step)
      ) {
        return this.render(current, scope, 'This view was refreshed.');
      }
      next = await this.workflows.transition({
        ...scope,
        id: current.id,
        expectedVersion: current.version,
        step,
        payload: telegramSystemBotPostJson(payload),
      });
    }
    return this.render(next, scope, notice);
  }

  private async render(
    workflow: TelegramSystemBotPostWorkflow,
    scope: TelegramSystemBotPostFlowScope,
    notice?: string,
  ) {
    const card = await this.card(workflow, scope, notice);
    const token = this.config.token!;
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (
      payload.destination === 'AD_SALE_MODAL' &&
      workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED
    ) {
      if (workflow.controlMessageId) {
        await this.api
          .editMessageReplyMarkup(token, {
            chat_id: scope.chatId,
            message_id: workflow.controlMessageId,
            reply_markup: { inline_keyboard: [] },
          })
          .catch(() => undefined);
      }
      return this.api.sendMessage(token, {
        chat_id: scope.chatId,
        text: '✅ Post added to the Ad Sale form. Return to the website.',
      });
    }
    const previewImageUrl =
      payload.destination === 'AD_SALE_MODAL'
        ? payload.content?.imageUrls[0]
        : undefined;
    if (previewImageUrl) {
      const nativeCard = {
        chat_id: scope.chatId,
        photo: previewImageUrl,
        caption: card.text,
        parse_mode: 'parse_mode' in card ? card.parse_mode : undefined,
        reply_markup: 'reply_markup' in card ? card.reply_markup : undefined,
      };
      if (workflow.controlMessageId) {
        try {
          return await this.api.editMessageCaption(token, {
            chat_id: scope.chatId,
            message_id: workflow.controlMessageId,
            caption: nativeCard.caption,
            parse_mode: nativeCard.parse_mode,
            reply_markup: nativeCard.reply_markup,
          });
        } catch {
          // The current control may still be a text card. Keep it until the
          // native photo replacement has been created successfully.
        }
      }
      let sent: { message_id: number };
      try {
        sent = await this.api.sendPhoto(token, nativeCard);
      } catch {
        if (workflow.controlMessageId) {
          try {
            return await this.api.editMessageText(token, {
              chat_id: scope.chatId,
              message_id: workflow.controlMessageId,
              ...card,
            });
          } catch {
            // The previous card may already have been removed by an older
            // failed render. Recreate it below without losing the workflow.
          }
        }
        const textCard = await this.api.sendMessage(token, {
          chat_id: scope.chatId,
          ...card,
        });
        if (workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE)
          return textCard;
        const attached = await this.workflows.transition({
          ...scope,
          id: workflow.id,
          expectedVersion: workflow.version,
          step: workflow.step,
          payload: workflow.payload as Prisma.InputJsonValue,
          controlMessageId: textCard.message_id,
        });
        return this.api.editMessageText(token, {
          chat_id: scope.chatId,
          message_id: textCard.message_id,
          ...(await this.card(attached, scope, notice)),
        });
      }
      if (workflow.controlMessageId) {
        await this.api
          .deleteMessage(token, {
            chat_id: scope.chatId,
            message_id: workflow.controlMessageId,
          })
          .catch(() => undefined);
      }
      if (workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE)
        return sent;
      const attached = await this.workflows.transition({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
        step: workflow.step,
        payload: workflow.payload as Prisma.InputJsonValue,
        controlMessageId: sent.message_id,
      });
      const attachedCard = await this.card(attached, scope, notice);
      return this.api.editMessageCaption(token, {
        chat_id: scope.chatId,
        message_id: sent.message_id,
        caption: attachedCard.text,
        parse_mode:
          'parse_mode' in attachedCard ? attachedCard.parse_mode : undefined,
        reply_markup:
          'reply_markup' in attachedCard
            ? attachedCard.reply_markup
            : undefined,
      });
    }
    if (workflow.controlMessageId) {
      try {
        return await this.api.editMessageText(token, {
          chat_id: scope.chatId,
          message_id: workflow.controlMessageId,
          ...card,
        });
      } catch {
        // The user may have deleted the card; replace it below.
      }
    }
    const sent = await this.api.sendMessage(token, {
      chat_id: scope.chatId,
      text: 'Preparing post…',
    });
    if (
      workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE ||
      workflow.controlMessageId
    ) {
      return this.api.editMessageText(token, {
        chat_id: scope.chatId,
        message_id: sent.message_id,
        ...card,
      });
    }
    const attached = await this.workflows.transition({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
      step: workflow.step,
      payload: workflow.payload as Prisma.InputJsonValue,
      controlMessageId: sent.message_id,
    });
    return this.api.editMessageText(token, {
      chat_id: scope.chatId,
      message_id: sent.message_id,
      ...(await this.card(attached, scope, notice)),
    });
  }

  private async card(
    workflow: TelegramSystemBotPostWorkflow,
    scope: TelegramSystemBotPostFlowScope,
    notice?: string,
  ) {
    const channels =
      workflow.step === 'CHOOSE_CHANNEL'
        ? await this.options.channels(scope)
        : undefined;
    const groups =
      workflow.step === 'CHOOSE_GROUP' &&
      telegramSystemBotPostPayload(workflow.payload).channelId
        ? await this.options.groups(
            scope,
            telegramSystemBotPostPayload(workflow.payload).channelId!,
          )
        : undefined;
    return renderTelegramSystemBotPostCard({
      workflow,
      scope,
      payload: telegramSystemBotPostPayload(workflow.payload),
      channels,
      groups,
      notice,
    });
  }

  private async resolveForWorkspace<T>(
    provider: new (...args: never[]) => T,
    workspaceId: string,
  ) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId } },
      contextId,
    );
    return this.moduleRef.resolve(provider, contextId, { strict: false });
  }
}
