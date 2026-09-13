import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MutualPromotionFolderStatus,
  Prisma,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  normalizeTelegramPostMediaItems,
  TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE,
  type TelegramSystemBotPostDraft,
} from '@telegram-system/shared';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import {
  mergeTelegramSystemBotAlbumContent,
  telegramSystemBotPostTitle,
  telegramSystemBotPostWorkflowExpiry,
} from './telegram-system-bot-post-flow.helpers';
import type {
  TelegramSystemBotCapturedPostContent,
  TelegramSystemBotPostFlowScope,
  TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import {
  escapeSystemBotHtml,
  telegramSystemBotPostPreview,
} from './telegram-system-bot-post-preview';
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';
import { TelegramSystemBotPostFlowService } from './telegram-system-bot-post-flow.service';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

type MutualPromotionPostPayload = {
  folderId?: string;
  content?: TelegramSystemBotCapturedPostContent;
  contents?: TelegramSystemBotCapturedPostContent[];
  previewMessageIds?: number[];
};

const MAX_POSTS_PER_IMPORT = 50;

@Injectable()
export class TelegramSystemBotMutualPromotionPostFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly workflows: TelegramSystemBotWorkflowStore,
    private readonly content: TelegramSystemBotPostContentService,
    private readonly postFlow: TelegramSystemBotPostFlowService,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('sbm:'));
  }

  async prepare(scope: TelegramSystemBotPostFlowScope, folderId: string) {
    const normalizedFolderId = folderId.trim();
    await this.requireFolder(scope.workspaceId, normalizedFolderId);
    const existing = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
    );
    if (existing) {
      throw new ConflictException({
        code: TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE,
        message:
          'Finish the current post import in the bot before starting a new one.',
      });
    }
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
      step: 'AWAIT_CONTENT',
      payload: this.toJson({ folderId: normalizedFolderId }),
      mutualPromotionFolderId: normalizedFolderId,
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    await this.render(workflow, scope);
    return { workflowId: workflow.id };
  }

  async resume(scope: TelegramSystemBotPostFlowScope, workflowId: string) {
    const workflow = await this.requireWorkflow(scope, workflowId);
    return this.render(workflow, scope);
  }

  async result(scope: TelegramSystemBotPostFlowScope, workflowId: string) {
    const workflow = await this.requireWorkflow(scope, workflowId);
    const payload = this.payload(workflow.payload);
    if (
      workflow.status !== TelegramSystemBotWorkflowStatus.COMPLETED ||
      !this.contents(payload).length
    ) {
      return { ready: false as const };
    }
    return {
      ready: true as const,
      drafts: this.contents(payload).map(
        (content) =>
          ({
            title: telegramSystemBotPostTitle(content),
            text: content.text,
            plainText: content.plainText ?? content.text,
            ...(content.formattedHtml
              ? { formattedHtml: content.formattedHtml }
              : {}),
            imageUrls: content.imageUrls,
            mediaItems:
              content.mediaItems ??
              content.imageUrls.map((url) => ({
                kind: 'PHOTO' as const,
                url,
              })),
            buttonRows: content.buttonRows,
          }) satisfies TelegramSystemBotPostDraft,
      ),
    };
  }

  async input(
    scope: TelegramSystemBotPostFlowScope,
    message: TelegramSystemBotIncomingMessage,
  ) {
    const active = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST,
    );
    if (!active) return null;
    const capture = await this.content.capture(message);
    if (!capture.ok) {
      await this.content.removeInput(scope.chatId, message.message_id);
      return this.render(
        active,
        scope,
        capture.reason === 'UNSUPPORTED_MEDIA'
          ? 'Unsupported media. Forward a text, photo, video or GIF post.'
          : 'Could not import this post. Forward it again to retry.',
      );
    }
    if (!['AWAIT_CONTENT', 'COLLECT_CONTENT'].includes(active.step))
      return null;
    const captured = await this.transitionCaptured(
      scope,
      active,
      capture.content,
    );
    const next = captured.workflow;
    await this.content.removeInput(scope.chatId, message.message_id);
    await this.removePreviewMessages(scope, captured.previewMessageIds);
    const latestContent = this.contents(this.payload(next.payload)).at(-1)!;
    const mediaItems = normalizeTelegramPostMediaItems(
      latestContent.mediaItems,
      latestContent.imageUrls,
    );
    const hasMotion = mediaItems.some(
      (item) => item.kind === 'VIDEO' || item.kind === 'ANIMATION',
    );
    if (hasMotion) {
      try {
        const sent = await this.postFlow.sendPostPreview(scope, {
          text: latestContent.text,
          imageUrls: [],
          mediaItems,
          buttonRows: latestContent.buttonRows,
        });
        if (next.controlMessageId) {
          await this.api.deleteMessage(this.config.token!, {
            chat_id: scope.chatId,
            message_id: next.controlMessageId,
          });
        }
        return this.render(
          {
            ...next,
            controlMessageId: null,
            payload: this.toJson({
              ...this.payload(next.payload),
              previewMessageIds: sent.messageIds,
            }) as Prisma.JsonValue,
          },
          scope,
        );
      } catch {
        return this.render(
          next,
          scope,
          'The media was saved, but Telegram could not place its preview above the controls. You can still finish the import.',
        );
      }
    }
    return this.render(next, scope);
  }

  async callback(scope: TelegramSystemBotPostFlowScope, callback: string) {
    const match = /^sbm:([^:]+):(\d+):(finish|confirm|cancel|add|next)$/.exec(
      callback,
    );
    if (!match) return null;
    const workflow = await this.requireWorkflow(scope, match[1]);
    const action = match[3];
    // Completed messages created by an older version may still contain the
    // former `next` button. Clicking it only refreshes the completed card and
    // removes that obsolete control; it never starts another import.
    if (action === 'next') return this.render(workflow, scope);
    if (action === 'add') {
      if (workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE) {
        return this.render(workflow, scope);
      }
      const payload = this.payload(workflow.payload);
      if (this.contents(payload).length >= MAX_POSTS_PER_IMPORT) {
        return this.render(workflow, scope);
      }
      if (workflow.step === 'AWAIT_CONTENT') {
        return this.render(workflow, scope);
      }
      await this.removePreviewMessages(scope, this.previewMessageIds(payload));
      const next = await this.workflows.transition({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
        step: 'AWAIT_CONTENT',
        payload: this.toJson(this.withoutPreviewMessages(payload)),
      });
      return this.render(next, scope);
    }
    if (workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE) {
      return this.render(workflow, scope);
    }
    await this.removePreviewMessages(
      scope,
      this.previewMessageIds(this.payload(workflow.payload)),
    );
    const next =
      action === 'cancel'
        ? await this.workflows.cancel({
            ...scope,
            id: workflow.id,
            expectedVersion: workflow.version,
          })
        : await this.complete(scope, workflow);
    return this.render(next, scope);
  }

  private async complete(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
  ) {
    if (!this.contents(this.payload(workflow.payload)).length) {
      throw new ConflictException('Forwarded posts are unavailable');
    }
    const claimed = await this.workflows.claimCommit({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
    });
    return this.workflows.complete({
      ...scope,
      id: claimed.id,
      expectedVersion: claimed.version,
    });
  }

  private async transitionCaptured(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
    incoming: TelegramSystemBotCapturedPostContent,
  ) {
    let current = workflow;
    for (let attempt = 0; attempt < MAX_POSTS_PER_IMPORT; attempt += 1) {
      const payload = this.payload(current.payload);
      const contents = this.contents(payload);
      const last = contents.at(-1);
      const sameAlbum = Boolean(
        incoming.mediaGroupId && last?.mediaGroupId === incoming.mediaGroupId,
      );
      if (!sameAlbum && contents.length >= MAX_POSTS_PER_IMPORT) {
        throw new ConflictException(
          `One import can contain at most ${MAX_POSTS_PER_IMPORT} posts`,
        );
      }
      const nextContents = sameAlbum
        ? [
            ...contents.slice(0, -1),
            mergeTelegramSystemBotAlbumContent(last!, incoming),
          ]
        : [...contents, incoming];
      try {
        const next = await this.workflows.transition({
          ...scope,
          id: current.id,
          expectedVersion: current.version,
          step: 'COLLECT_CONTENT',
          payload: this.toJson({
            folderId: payload.folderId,
            contents: nextContents,
          }),
        });
        return {
          workflow: next,
          previewMessageIds: this.previewMessageIds(payload),
        };
      } catch (error) {
        if (
          !(error instanceof ConflictException) ||
          attempt === MAX_POSTS_PER_IMPORT - 1
        ) {
          throw error;
        }
        current = await this.requireWorkflow(scope, current.id);
      }
    }
    throw new ConflictException('Could not append the forwarded post');
  }

  private async render(
    workflow: TelegramSystemBotPostWorkflow,
    scope: TelegramSystemBotPostFlowScope,
    notice?: string,
  ): Promise<unknown> {
    const token = this.config.token!;
    const payload = this.payload(workflow.payload);
    const completed =
      workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED;
    const cancelled =
      workflow.status === TelegramSystemBotWorkflowStatus.CANCELLED;
    const contents = this.contents(payload);
    const latestContent = contents.at(-1);
    const preview = telegramSystemBotPostPreview(latestContent);
    const motionKind = normalizeTelegramPostMediaItems(
      latestContent?.mediaItems,
      latestContent?.imageUrls,
    ).find((item) => item.kind === 'VIDEO' || item.kind === 'ANIMATION')?.kind;
    const count = contents.length;
    const text = completed
      ? `✅ ${count} post(s) captured. Return to the website to set publication times and add them to the folder.`
      : cancelled
        ? 'Import cancelled.'
        : workflow.step === 'COLLECT_CONTENT' && count
          ? motionKind
            ? [
                notice ? `⚠️ ${escapeSystemBotHtml(notice)}` : null,
                `✅ Post ${count} captured with ${motionKind === 'VIDEO' ? 'video' : 'GIF'}.`,
              ]
                .filter(Boolean)
                .join('\n\n')
            : preview.html
          : [
              notice ? `⚠️ ${escapeSystemBotHtml(notice)}` : null,
              count
                ? '🤝 Forward the next post (text, photo, video, or GIF). It will be added to this import.'
                : '🤝 Forward a post with text, photos, video, or GIF for this folder.',
            ]
              .filter(Boolean)
              .join('\n\n');
    const reply_markup = {
      inline_keyboard: completed
        ? []
        : workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE
          ? []
          : workflow.step === 'COLLECT_CONTENT'
            ? [
                ...preview.buttonRows,
                ...(count < MAX_POSTS_PER_IMPORT
                  ? [
                      [
                        {
                          text: '➕ Add another post',
                          callback_data: `sbm:${workflow.id}:${workflow.version}:add`,
                        },
                      ],
                    ]
                  : []),
                [
                  {
                    text: `✅ Finish import (${count})`,
                    callback_data: `sbm:${workflow.id}:${workflow.version}:finish`,
                  },
                  {
                    text: '❌ Cancel',
                    callback_data: `sbm:${workflow.id}:${workflow.version}:cancel`,
                  },
                ],
              ]
            : count
              ? [
                  [
                    {
                      text: `✅ Finish import (${count})`,
                      callback_data: `sbm:${workflow.id}:${workflow.version}:finish`,
                    },
                    {
                      text: '❌ Cancel',
                      callback_data: `sbm:${workflow.id}:${workflow.version}:cancel`,
                    },
                  ],
                ]
              : [
                  [
                    {
                      text: '❌ Cancel',
                      callback_data: `sbm:${workflow.id}:${workflow.version}:cancel`,
                    },
                  ],
                ],
    };
    const linkPreview =
      workflow.step === 'COLLECT_CONTENT'
        ? {
            link_preview_options:
              !motionKind && preview.imageUrl
                ? {
                    url: preview.imageUrl,
                    prefer_large_media: true,
                    show_above_text: true,
                  }
                : { is_disabled: true },
          }
        : {};
    if (workflow.controlMessageId) {
      return this.api.editMessageText(token, {
        chat_id: scope.chatId,
        message_id: workflow.controlMessageId,
        text,
        ...(workflow.step === 'COLLECT_CONTENT' ? { parse_mode: 'HTML' } : {}),
        ...linkPreview,
        reply_markup,
      });
    }
    const sent = await this.api.sendMessage(token, {
      chat_id: scope.chatId,
      text,
      ...(workflow.step === 'COLLECT_CONTENT' ? { parse_mode: 'HTML' } : {}),
      ...linkPreview,
      reply_markup,
    });
    if (workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE) return sent;
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
    if (workflow.kind !== TelegramSystemBotWorkflowKind.MUTUAL_PROMOTION_POST) {
      throw new NotFoundException(
        'Mutual promotion post import is unavailable',
      );
    }
    const folderId = this.payload(workflow.payload).folderId;
    if (!folderId) {
      throw new NotFoundException('Mutual promotion folder is unavailable');
    }
    await this.requireFolder(scope.workspaceId, folderId);
    return workflow;
  }

  private async requireFolder(workspaceId: string, folderId: string) {
    const folder = await this.prisma.mutualPromotionFolder.findFirst({
      where: {
        id: folderId,
        workspaceId,
        status: MutualPromotionFolderStatus.DRAFT,
      },
      select: { id: true },
    });
    if (!folder)
      throw new NotFoundException('Mutual promotion folder not found');
    return folder;
  }

  private payload(value: Prisma.JsonValue): MutualPromotionPostPayload {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private contents(payload: MutualPromotionPostPayload) {
    return payload.contents?.length
      ? payload.contents
      : payload.content
        ? [payload.content]
        : [];
  }

  private previewMessageIds(payload: MutualPromotionPostPayload) {
    return Array.isArray(payload.previewMessageIds)
      ? payload.previewMessageIds.filter(
          (messageId) => Number.isInteger(messageId) && messageId > 0,
        )
      : [];
  }

  private withoutPreviewMessages(payload: MutualPromotionPostPayload) {
    const { previewMessageIds: _previewMessageIds, ...rest } = payload;
    return rest;
  }

  private async removePreviewMessages(
    scope: TelegramSystemBotPostFlowScope,
    messageIds: number[],
  ) {
    for (const messageId of messageIds) {
      try {
        await this.api.deleteMessage(this.config.token!, {
          chat_id: scope.chatId,
          message_id: messageId,
        });
      } catch {
        // A missing/already removed preview must not break the import workflow.
      }
    }
  }

  private toJson(value: MutualPromotionPostPayload) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
