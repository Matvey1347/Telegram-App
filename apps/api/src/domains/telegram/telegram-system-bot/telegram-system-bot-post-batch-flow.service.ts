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
  TELEGRAM_POST_BATCH_MAX_POSTS,
  type TelegramSystemBotPostDraft,
} from '@telegram-system/shared';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
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
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

type PostBatchPayload = {
  contents?: TelegramSystemBotCapturedPostContent[];
};

@Injectable()
export class TelegramSystemBotPostBatchFlowService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly workflows: TelegramSystemBotWorkflowStore,
    private readonly content: TelegramSystemBotPostContentService,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('sbb:'));
  }

  async prepare(scope: TelegramSystemBotPostFlowScope) {
    await this.workflows.requireNoActiveOutsideBatchImport(scope);
    const recoverable = await this.workflows.recoverableBatchImport(scope);
    if (recoverable) {
      if (recoverable.status === TelegramSystemBotWorkflowStatus.ACTIVE) {
        await this.render(recoverable, scope);
      }
      return { workflowId: recoverable.id };
    }
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
      step: 'AWAIT_CONTENT',
      payload: this.toJson({ contents: [] }),
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    await this.render(workflow, scope);
    return { workflowId: workflow.id };
  }

  async resume(scope: TelegramSystemBotPostFlowScope, workflowId: string) {
    return this.render(await this.requireWorkflow(scope, workflowId), scope);
  }

  async result(scope: TelegramSystemBotPostFlowScope, workflowId: string) {
    const workflow = await this.requireWorkflow(scope, workflowId);
    const contents = this.contents(workflow.payload);
    if (
      workflow.status !== TelegramSystemBotWorkflowStatus.COMPLETED ||
      !contents.length
    ) {
      return { ready: false as const };
    }
    return {
      ready: true as const,
      drafts: contents.map(
        (content) =>
          ({
            title: telegramSystemBotPostTitle(content),
            text: content.text,
            plainText: content.plainText ?? content.text,
            ...(content.formattedHtml
              ? { formattedHtml: content.formattedHtml }
              : {}),
            imageUrls: content.imageUrls,
            mediaItems: content.mediaItems,
            buttonRows: content.buttonRows,
          }) satisfies TelegramSystemBotPostDraft,
      ),
    };
  }

  async input(
    scope: TelegramSystemBotPostFlowScope,
    message: TelegramSystemBotIncomingMessage,
  ) {
    const workflow = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
    );
    if (
      !workflow ||
      !['AWAIT_CONTENT', 'COLLECT_CONTENT'].includes(workflow.step)
    )
      return null;
    const capture = await this.content.capture(message);
    await this.content.removeInput(scope.chatId, message.message_id);
    if (!capture.ok) {
      return this.render(
        workflow,
        scope,
        capture.reason === 'UNSUPPORTED_MEDIA'
          ? 'Unsupported media. Forward text, photo, video or GIF.'
          : 'Could not import this post. Forward it again to retry.',
      );
    }
    const next = await this.append(scope, workflow, capture.content);
    return this.render(next, scope);
  }

  async callback(scope: TelegramSystemBotPostFlowScope, callback: string) {
    const match = /^sbb:([^:]+):(\d+):(add|finish|cancel)$/.exec(callback);
    if (!match) return null;
    const workflow = await this.requireWorkflow(scope, match[1]);
    if (
      workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE ||
      workflow.version !== Number(match[2])
    ) {
      return this.render(workflow, scope);
    }
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
        this.contents(workflow.payload).length >= TELEGRAM_POST_BATCH_MAX_POSTS
      )
        return this.render(workflow, scope);
      const next = await this.workflows.transition({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
        step: 'AWAIT_CONTENT',
        payload: workflow.payload as Prisma.InputJsonValue,
      });
      return this.render(next, scope);
    }
    if (!this.contents(workflow.payload).length)
      throw new ConflictException('Forward at least one post');
    return this.render(
      await this.workflows.completeBatchImport({
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
      const contents = this.contents(workflow.payload);
      const previous = contents.at(-1);
      const sameAlbum = Boolean(
        incoming.mediaGroupId &&
        previous?.mediaGroupId === incoming.mediaGroupId,
      );
      if (!sameAlbum && contents.length >= TELEGRAM_POST_BATCH_MAX_POSTS)
        throw new ConflictException(
          `One import can contain at most ${TELEGRAM_POST_BATCH_MAX_POSTS} posts`,
        );
      const nextContents = sameAlbum
        ? [
            ...contents.slice(0, -1),
            mergeTelegramSystemBotAlbumContent(previous!, incoming),
          ]
        : [...contents, incoming];
      try {
        return await this.workflows.transition({
          ...scope,
          id: workflow.id,
          expectedVersion: workflow.version,
          step: 'COLLECT_CONTENT',
          payload: this.toJson({ contents: nextContents }),
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
  ): Promise<unknown> {
    const count = this.contents(workflow.payload).length;
    const completed =
      workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED;
    const cancelled =
      workflow.status === TelegramSystemBotWorkflowStatus.CANCELLED;
    const text = completed
      ? `✅ ${count} post(s) captured. Return to the website to configure and publish this batch.`
      : cancelled
        ? 'Import cancelled.'
        : [
            notice ? `⚠️ ${notice}` : null,
            count
              ? `✅ ${count} post(s) captured. Add another post or finish the import.`
              : '📨 Forward the first post (text, photo, video, or GIF).',
          ]
            .filter(Boolean)
            .join('\n\n');
    const active = workflow.status === TelegramSystemBotWorkflowStatus.ACTIVE;
    const reply_markup = {
      inline_keyboard: active
        ? [
            ...(count < TELEGRAM_POST_BATCH_MAX_POSTS
              ? [
                  [
                    {
                      text: count ? '➕ Add another post' : '➕ Forward a post',
                      callback_data: `sbb:${workflow.id}:${workflow.version}:add`,
                    },
                  ],
                ]
              : []),
            ...(count
              ? [
                  [
                    {
                      text: `✅ Finish import (${count})`,
                      callback_data: `sbb:${workflow.id}:${workflow.version}:finish`,
                    },
                  ],
                ]
              : []),
            [
              {
                text: '❌ Cancel',
                callback_data: `sbb:${workflow.id}:${workflow.version}:cancel`,
              },
            ],
          ]
        : [],
    };
    if (workflow.controlMessageId) {
      return this.api.editMessageText(this.config.token!, {
        chat_id: scope.chatId,
        message_id: workflow.controlMessageId,
        text,
        reply_markup,
      });
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
    if (workflow.kind !== TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT)
      throw new NotFoundException('Post batch import is unavailable');
    return workflow;
  }

  private contents(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const contents = (value as PostBatchPayload).contents;
    return Array.isArray(contents) ? contents : [];
  }

  private toJson(value: PostBatchPayload) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
