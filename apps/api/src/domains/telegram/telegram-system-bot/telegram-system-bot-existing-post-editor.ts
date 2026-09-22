import { ConflictException, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TelegramSystemBotWorkflowKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramManagedPostHistoryService } from '../telegram-channels/telegram-managed-post-history.service';
import { resolveSystemBotWorkspaceProvider } from './telegram-system-bot-workspace-provider';
import {
  telegramSystemBotPostTitle,
  telegramSystemBotPostWorkflowExpiry,
} from './telegram-system-bot-post-flow.helpers';
import {
  telegramSystemBotPostJson,
  type TelegramSystemBotCapturedPostContent,
  type TelegramSystemBotPostFlowScope,
  type TelegramSystemBotPostPayload,
  type TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import { TelegramSystemBotPostFlowOptions } from './telegram-system-bot-post-flow.options';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

export async function beginEditingExistingPost(input: {
  scope: TelegramSystemBotPostFlowScope;
  channelIndex: number;
  postId: string;
  controlMessageId?: number;
  options: TelegramSystemBotPostFlowOptions;
  moduleRef: ModuleRef;
  workflows: TelegramSystemBotWorkflowStore;
}) {
  const { scope, options, moduleRef, workflows } = input;
  const channel = (await options.channels(scope))[input.channelIndex];
  if (!channel) throw new NotFoundException('Channel is no longer available');
  const prisma = moduleRef.get(PrismaService, { strict: false });
  const post = await prisma.telegramManagedPost.findFirst({
    where: {
      id: input.postId,
      workspaceId: scope.workspaceId,
      telegramChannelId: channel.id,
    },
    select: {
      id: true,
      text: true,
      imageUrls: true,
      mediaItems: true,
      buttonRows: true,
      group: { select: { title: true } },
    },
  });
  if (!post) throw new NotFoundException('Post is no longer available');
  const active = await workflows.activeWithoutPostImport(
    scope,
    TelegramSystemBotWorkflowKind.POST_IMPORT,
  );
  if (active) return active;
  const content: TelegramSystemBotCapturedPostContent = {
    text: post.text ?? '',
    imageUrls: post.imageUrls,
    mediaItems: Array.isArray(post.mediaItems)
      ? (post.mediaItems as TelegramSystemBotCapturedPostContent['mediaItems'])
      : [],
    buttonRows: Array.isArray(post.buttonRows)
      ? (post.buttonRows as TelegramSystemBotCapturedPostContent['buttonRows'])
      : [],
    mediaGroupId: null,
    sourceTitle: null,
    warnings: [],
  };
  return workflows.create({
    ...scope,
    kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
    step: 'CHOOSE_ACTION',
    controlMessageId: input.controlMessageId,
    payload: telegramSystemBotPostJson({
      existingPostId: post.id,
      channelId: channel.id,
      channelTitle: channel.title,
      groupTitle: post.group?.title,
      content,
    }),
    expiresAt: telegramSystemBotPostWorkflowExpiry(),
  });
}

export async function commitExistingPostEdit(input: {
  scope: TelegramSystemBotPostFlowScope;
  workflow: TelegramSystemBotPostWorkflow;
  payload: TelegramSystemBotPostPayload;
  moduleRef: ModuleRef;
  workflows: TelegramSystemBotWorkflowStore;
}) {
  const { scope, workflow, payload, moduleRef, workflows } = input;
  if (!payload.content || !payload.channelId || !payload.existingPostId)
    throw new NotFoundException('Post workflow is incomplete');
  let claimed: TelegramSystemBotPostWorkflow;
  try {
    claimed = await workflows.claimCommit({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
    });
  } catch (error) {
    if (!(error instanceof ConflictException)) throw error;
    return workflows.get(scope, workflow.id);
  }
  try {
    const history = await resolveSystemBotWorkspaceProvider(
      moduleRef,
      TelegramManagedPostHistoryService,
      scope.workspaceId,
    );
    await history.updateManagedPost(
      scope.userId,
      payload.channelId,
      payload.existingPostId,
      {
        title: telegramSystemBotPostTitle(payload.content),
        text: payload.content.text,
        buttonRows: payload.content.buttonRows,
      },
    );
    return workflows.complete({
      ...scope,
      id: claimed.id,
      expectedVersion: claimed.version,
      resultManagedPostId: payload.existingPostId,
    });
  } catch (error) {
    return workflows.fail({
      ...scope,
      id: claimed.id,
      expectedVersion: claimed.version,
      error: sanitizeOperationalError(error),
    });
  }
}
