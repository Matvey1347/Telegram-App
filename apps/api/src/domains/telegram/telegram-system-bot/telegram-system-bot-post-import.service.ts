import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import {
  TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS,
  type CancelTelegramSystemBotPostImportResult,
  type TelegramSystemBotPostImportMode,
  type TelegramSystemBotPostImportResult,
  type TelegramSystemBotPostImportStart,
  type TelegramSystemBotPostImportStatus,
} from '@telegram-system/shared';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import {
  mergeTelegramSystemBotAlbumContent,
  telegramSystemBotPostWorkflowExpiry,
} from './telegram-system-bot-post-flow.helpers';
import type {
  TelegramSystemBotCapturedPostContent,
  TelegramSystemBotPostFlowScope,
  TelegramSystemBotPostPreviewDraft,
  TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';
import { sendTelegramSystemBotPostPreview } from './telegram-system-bot-post-preview.sender';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';
import {
  parseWebsitePostImportPayload,
  websitePostImportDraft,
  websitePostImportJson,
  websitePostImportModeFromColumn,
} from './telegram-system-bot-post-import.payload';

@Injectable()
export class TelegramSystemBotPostImportService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly workflows: TelegramSystemBotWorkflowStore,
    private readonly content: TelegramSystemBotPostContentService,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('sbi:'));
  }

  async prepare(
    scope: TelegramSystemBotPostFlowScope,
    mode: TelegramSystemBotPostImportMode,
    options: { context?: string; replaceActive?: boolean } = {},
  ): Promise<TelegramSystemBotPostImportStart> {
    const existing = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
    );
    if (existing && !options.replaceActive)
      this.workflows.throwActiveImportConflict();
    if (existing) {
      await this.workflows.cancel({
        ...scope,
        id: existing.id,
        expectedVersion: existing.version,
      });
      if (existing.controlMessageId) {
        await this.api
          .deleteMessage(this.config.token!, {
            chat_id: scope.chatId,
            message_id: existing.controlMessageId,
          })
          .catch(() => undefined);
      }
    }
    const context = options.context?.trim().slice(0, 120) || undefined;
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
      postImportMode: mode === 'single' ? 'SINGLE' : 'MULTIPLE',
      step: 'AWAIT_CONTENT',
      payload: websitePostImportJson({ mode, context, contents: [] }),
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    await this.render(workflow, scope);
    return { workflowId: workflow.id, mode };
  }

  async resume(scope: TelegramSystemBotPostFlowScope, workflowId: string) {
    return this.render(await this.requireWorkflow(scope, workflowId), scope);
  }

  async result(
    scope: TelegramSystemBotPostFlowScope,
    workflowId: string,
  ): Promise<TelegramSystemBotPostImportResult> {
    const metadata = await this.workflows.websitePostImportMetadata(
      scope,
      workflowId,
    );
    const mode = websitePostImportModeFromColumn(metadata.postImportMode);
    let status = metadata.status;
    if (
      status === TelegramSystemBotWorkflowStatus.ACTIVE &&
      metadata.expiresAt <= new Date()
    ) {
      try {
        await this.workflows.expire({
          ...scope,
          id: workflowId,
          expectedVersion: metadata.version,
        });
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        return this.result(scope, workflowId);
      }
      status = TelegramSystemBotWorkflowStatus.EXPIRED;
    }
    if (status !== TelegramSystemBotWorkflowStatus.COMPLETED) {
      return { ready: false, mode, status: this.publicStatus(status) };
    }
    const workflow = await this.requireWorkflow(scope, workflowId);
    const payload = parseWebsitePostImportPayload(workflow.payload);
    if (payload.mode !== mode)
      throw new NotFoundException('Website post import is unavailable');
    const limit =
      mode === 'single' ? 1 : TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS;
    if (!payload.contents.length || payload.contents.length > limit)
      throw new ConflictException('Captured posts are unavailable');
    return {
      ready: true,
      mode,
      status: 'COMPLETED',
      drafts: payload.contents.map(websitePostImportDraft),
    };
  }

  async cancel(
    scope: TelegramSystemBotPostFlowScope,
    workflowId: string,
  ): Promise<CancelTelegramSystemBotPostImportResult> {
    const metadata = await this.workflows.websitePostImportMetadata(
      scope,
      workflowId,
    );
    const mode = websitePostImportModeFromColumn(metadata.postImportMode);
    if (metadata.status === TelegramSystemBotWorkflowStatus.CANCELLED) {
      return { workflowId, mode, status: 'CANCELLED' };
    }
    const cancelled = await this.workflows.cancel({
      ...scope,
      id: workflowId,
      expectedVersion: metadata.version,
    });
    await this.render(cancelled, scope).catch(() => undefined);
    return { workflowId, mode, status: 'CANCELLED' };
  }

  sendPreview(
    scope: TelegramSystemBotPostFlowScope,
    draft: TelegramSystemBotPostPreviewDraft,
  ) {
    return sendTelegramSystemBotPostPreview({
      api: this.api,
      token: this.config.token!,
      scope,
      draft,
    });
  }

  async input(
    scope: TelegramSystemBotPostFlowScope,
    message: TelegramSystemBotIncomingMessage,
  ): Promise<unknown> {
    const workflow = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
    );
    if (
      !workflow ||
      !['AWAIT_CONTENT', 'COLLECT_CONTENT'].includes(workflow.step)
    )
      return null;
    const captured = await this.content.capture(message);
    await this.content.removeInput(scope.chatId, message.message_id);
    if (!captured.ok) {
      return this.render(
        workflow,
        scope,
        captured.reason === 'UNSUPPORTED_MEDIA'
          ? 'Unsupported media. Forward text, photo, video or GIF.'
          : 'Could not import this post. Forward it again to retry.',
      );
    }
    const appended = await this.append(scope, workflow, captured.content);
    const appendedPayload = parseWebsitePostImportPayload(appended.payload);
    const preview = appendedPayload.contents.at(-1);
    let previewNotice: string | undefined;
    if (preview) {
      await this.sendPreview(scope, preview).catch(() => {
        previewNotice =
          'Post captured, but its preview could not be sent. You can still finish the import.';
      });
    }
    if (
      appendedPayload.mode === 'single' &&
      preview &&
      !preview.mediaGroupId
    ) {
      const completed = await this.workflows.completeCapture({
        ...scope,
        id: appended.id,
        expectedVersion: appended.version,
      });
      return this.render(completed, scope, previewNotice, true);
    }
    return this.render(appended, scope, previewNotice, true);
  }

  async callback(
    scope: TelegramSystemBotPostFlowScope,
    callback: string,
  ): Promise<unknown> {
    const match = /^sbi:([^:]+):(\d+):(add|finish|cancel)$/.exec(callback);
    if (!match) return null;
    const workflow = await this.requireWorkflow(scope, match[1]);
    if (
      workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE ||
      workflow.version !== Number(match[2])
    ) {
      return this.render(workflow, scope);
    }
    const payload = parseWebsitePostImportPayload(workflow.payload);
    if (match[3] === 'cancel') {
      return this.render(
        await this.workflows.cancel({
          ...scope,
          id: workflow.id,
          expectedVersion: workflow.version,
        }),
        scope,
      );
    }
    if (match[3] === 'add') {
      if (
        payload.mode === 'single' ||
        payload.contents.length >= TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS
      ) {
        return this.render(workflow, scope);
      }
      return this.render(
        await this.workflows.transition({
          ...scope,
          id: workflow.id,
          expectedVersion: workflow.version,
          step: 'AWAIT_CONTENT',
          payload: workflow.payload as Prisma.InputJsonValue,
        }),
        scope,
      );
    }
    if (!payload.contents.length)
      throw new ConflictException('Forward at least one post');
    return this.render(
      await this.workflows.completeCapture({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      }),
      scope,
    );
  }

  private async append(
    scope: TelegramSystemBotPostFlowScope,
    initial: TelegramSystemBotPostWorkflow,
    incoming: TelegramSystemBotCapturedPostContent,
  ) {
    let workflow = initial;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const payload = parseWebsitePostImportPayload(workflow.payload);
      const previous = payload.contents.at(-1);
      const sameAlbum = Boolean(
        incoming.mediaGroupId &&
        previous?.mediaGroupId === incoming.mediaGroupId,
      );
      const limit =
        payload.mode === 'single'
          ? 1
          : TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS;
      if (!sameAlbum && payload.contents.length >= limit) {
        throw new ConflictException(
          `This import can contain at most ${limit} post${limit === 1 ? '' : 's'}`,
        );
      }
      const contents = sameAlbum
        ? [
            ...payload.contents.slice(0, -1),
            mergeTelegramSystemBotAlbumContent(previous!, incoming),
          ]
        : [...payload.contents, incoming];
      try {
        return await this.workflows.transition({
          ...scope,
          id: workflow.id,
          expectedVersion: workflow.version,
          step: 'COLLECT_CONTENT',
          payload: websitePostImportJson({
            mode: payload.mode,
            context: payload.context,
            contents,
          }),
        });
      } catch (error) {
        if (!(error instanceof ConflictException) || attempt === 2) throw error;
        workflow = await this.requireWorkflow(scope, workflow.id);
      }
    }
    throw new ConflictException('Could not append forwarded post');
  }

  private async render(
    workflow: TelegramSystemBotPostWorkflow,
    scope: TelegramSystemBotPostFlowScope,
    notice?: string,
    recreateControl = false,
  ): Promise<unknown> {
    const payload = parseWebsitePostImportPayload(workflow.payload);
    const count = payload.contents.length;
    const active = workflow.status === TelegramSystemBotWorkflowStatus.ACTIVE;
    const context = payload.context ? `For: ${payload.context}.` : null;
    const text =
      workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED
        ? [
            `✅ ${count} post(s) captured. Return to the website to continue.`,
            context,
          ]
            .filter(Boolean)
            .join('\n\n')
        : workflow.status === TelegramSystemBotWorkflowStatus.CANCELLED
          ? 'Import cancelled.'
          : [
              notice ? `⚠️ ${notice}` : null,
              count
                ? `✅ ${count} post(s) captured. Finish the import${payload.mode === 'multiple' ? ' or add another post' : ''}.`
                : `📨 Forward a post (text, photo, video, or GIF)${payload.context ? ` for ${payload.context}` : ''}.`,
              count ? context : null,
            ]
              .filter(Boolean)
              .join('\n\n');
    const reply_markup = {
      inline_keyboard: active
        ? [
            ...(payload.mode === 'multiple' &&
            count < TELEGRAM_SYSTEM_BOT_POST_IMPORT_MAX_POSTS
              ? [
                  [
                    {
                      text: '➕ Add another post',
                      callback_data: `sbi:${workflow.id}:${workflow.version}:add`,
                    },
                  ],
                ]
              : []),
            ...(count
              ? [
                  [
                    {
                      text: `✅ Finish import (${count})`,
                      callback_data: `sbi:${workflow.id}:${workflow.version}:finish`,
                    },
                  ],
                ]
              : []),
            [
              {
                text: '❌ Cancel',
                callback_data: `sbi:${workflow.id}:${workflow.version}:cancel`,
              },
            ],
          ]
        : [],
    };
    if (workflow.controlMessageId && !recreateControl) {
      return this.api.editMessageText(this.config.token!, {
        chat_id: scope.chatId,
        message_id: workflow.controlMessageId,
        text,
        reply_markup,
      });
    }
    if (workflow.controlMessageId) {
      await this.api
        .deleteMessage(this.config.token!, {
          chat_id: scope.chatId,
          message_id: workflow.controlMessageId,
        })
        .catch(() => undefined);
    }
    const sent = await this.api.sendMessage(this.config.token!, {
      chat_id: scope.chatId,
      text,
      reply_markup,
    });
    if (!active) return sent;
    const attached = await this.workflows.transition({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
      step: workflow.step,
      payload: workflow.payload as Prisma.InputJsonValue,
      controlMessageId: sent.message_id,
    });
    return this.render(attached, scope, notice);
  }

  private async requireWorkflow(
    scope: TelegramSystemBotPostFlowScope,
    workflowId: string,
  ) {
    const workflow = await this.workflows.get(scope, workflowId);
    if (workflow.kind !== TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT)
      throw new NotFoundException('Website post import is unavailable');
    return workflow;
  }

  private publicStatus(
    status: TelegramSystemBotWorkflowStatus,
  ): Exclude<TelegramSystemBotPostImportStatus, 'COMPLETED'> {
    if (status === TelegramSystemBotWorkflowStatus.COMMITTING) return 'FAILED';
    return status as Exclude<TelegramSystemBotPostImportStatus, 'COMPLETED'>;
  }
}
