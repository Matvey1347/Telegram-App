import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  Prisma,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramManagedPostCommandService } from '../telegram-channels/telegram-managed-post-command.service';
import { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
import { TelegramPostBatchCommandService } from '../telegram-channels/telegram-post-batch-command.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import {
  parseTelegramSystemBotPostSchedule,
  telegramSystemBotPostTitle,
  telegramSystemBotPostWorkflowExpiry,
  transitionTelegramSystemBotCapturedContent,
} from './telegram-system-bot-post-flow.helpers';
import { applyTelegramSystemBotPostEdit } from './telegram-system-bot-post-edit-input';
import { resolveTelegramSystemBotPostCard } from './telegram-system-bot-post-flow.presentation';
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
import { resolveTelegramSystemBotAdSaleTargets } from './telegram-system-bot-ad-sale-flow.options';
import { resolveSystemBotWorkspaceProvider } from './telegram-system-bot-workspace-provider';

export type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

function toggleId(ids: string[] | undefined, id: string) {
  const selected = new Set(ids ?? []);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return [...selected];
}

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
    const existing = await this.workflows.activeWithoutPostImport(
      scope,
      TelegramSystemBotWorkflowKind.POST_IMPORT,
    );
    if (existing) return this.render(existing, scope);
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.POST_IMPORT,
      step: 'CHOOSE_CHANNEL',
      payload: {},
      expiresAt: telegramSystemBotPostWorkflowExpiry(),
    });
    return this.render(workflow, scope);
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
                ? `Unsupported media: ${capture.unsupportedMedia.join(', ')}. Send text, photos, video or GIF.`
                : capture.reason === 'MEDIA_IMPORT_FAILED'
                  ? 'Could not download or store this media. Forward the post again to retry.'
                  : 'Forward a post with text, photos, video, or GIF.',
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
      return this.commit(scope, workflow);
    }
    if (action === 'target.channels' || action === 'target.networks') {
      return this.transitionAndRender(scope, workflow, 'CHOOSE_CHANNEL', {
        ...payload,
        targetPicker: action === 'target.networks' ? 'NETWORKS' : 'CHANNELS',
      });
    }
    if (action.startsWith('target.toggle.channel.')) {
      const channels = await this.options.channels(scope);
      const channel =
        channels[Number(action.slice('target.toggle.channel.'.length))];
      if (!channel)
        throw new NotFoundException('Channel is no longer available');
      return this.transitionAndRender(scope, workflow, 'CHOOSE_CHANNEL', {
        ...payload,
        targetPicker: 'CHANNELS',
        selectedChannelIds: toggleId(payload.selectedChannelIds, channel.id),
        selectedNetworkIds: undefined,
      });
    }
    if (action.startsWith('target.toggle.network.')) {
      const networks = await this.options.networks(scope);
      const network =
        networks[Number(action.slice('target.toggle.network.'.length))];
      if (!network)
        throw new NotFoundException('Network is no longer available');
      return this.transitionAndRender(scope, workflow, 'CHOOSE_CHANNEL', {
        ...payload,
        targetPicker: 'NETWORKS',
        selectedChannelIds: undefined,
        selectedNetworkIds: toggleId(payload.selectedNetworkIds, network.id),
      });
    }
    if (action === 'target.continue') {
      if ((payload.targetPicker ?? 'CHANNELS') === 'CHANNELS') {
        const ids = new Set(payload.selectedChannelIds ?? []);
        const channels = (await this.options.channels(scope)).filter(
          (channel) => ids.has(channel.id),
        );
        if (!channels.length)
          return this.render(workflow, scope, 'Choose at least one channel.');
        if (channels.length === 1) {
          const channel = channels[0];
          const groups = await this.options.groups(scope, channel.id);
          const group = groups.find((item) => item.isDefault);
          if (!group)
            throw new NotFoundException(
              'System Bot posts group is unavailable',
            );
          return this.transitionAndRender(scope, workflow, 'AWAIT_CONTENT', {
            ...payload,
            channelId: channel.id,
            channelTitle: channel.title,
            groupId: group.id,
            groupTitle: group.title,
            channelIds: [channel.id],
            targetLabel: undefined,
            selectedChannelIds: undefined,
          });
        }
        return this.transitionAndRender(scope, workflow, 'AWAIT_CONTENT', {
          ...payload,
          channelId: undefined,
          channelTitle: undefined,
          groupId: undefined,
          groupTitle: undefined,
          channelIds: channels.map((channel) => channel.id),
          targetLabel: `${channels.length} channels`,
          selectedChannelIds: undefined,
        });
      }
      const ids = new Set(payload.selectedNetworkIds ?? []);
      const networks = (await this.options.networks(scope)).filter((network) =>
        ids.has(network.id),
      );
      if (!networks.length)
        return this.render(workflow, scope, 'Choose at least one network.');
      const targets = await resolveTelegramSystemBotAdSaleTargets(
        this.moduleRef,
        scope.workspaceId,
      );
      const resolved = await Promise.all(
        networks.map((network) =>
          targets.resolve(scope.userId, {
            kind: 'NETWORK',
            networkId: network.id,
          }),
        ),
      );
      const channelIds = [
        ...new Set(resolved.flatMap((target) => target.channelIds)),
      ];
      if (!channelIds.length)
        return this.render(
          workflow,
          scope,
          'The selected networks have no channels.',
        );
      return this.transitionAndRender(scope, workflow, 'AWAIT_CONTENT', {
        ...payload,
        channelId: undefined,
        channelTitle: undefined,
        groupId: undefined,
        groupTitle: undefined,
        channelIds,
        networkId: networks.length === 1 ? networks[0].id : undefined,
        targetLabel:
          networks.length === 1
            ? networks[0].name
            : `${networks.length} networks`,
        selectedNetworkIds: undefined,
      });
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
      return this.transitionAndRender(scope, workflow, 'AWAIT_CONTENT', {
        ...payload,
        channelId: channel.id,
        channelTitle: channel.title,
        groupId: defaultGroup.id,
        groupTitle: defaultGroup.title,
        channelIds: [channel.id],
        networkId: undefined,
        targetLabel: undefined,
        targetPicker: undefined,
      });
    }
    if (action.startsWith('network.')) {
      const networks = await this.options.networks(scope);
      const network = networks[Number(action.slice('network.'.length))];
      if (!network)
        throw new NotFoundException('Network is no longer available');
      const targets = await resolveTelegramSystemBotAdSaleTargets(
        this.moduleRef,
        scope.workspaceId,
      );
      const resolved = await targets.resolve(scope.userId, {
        kind: 'NETWORK',
        networkId: network.id,
      });
      return this.transitionAndRender(scope, workflow, 'AWAIT_CONTENT', {
        ...payload,
        channelId: undefined,
        channelTitle: undefined,
        groupId: undefined,
        groupTitle: undefined,
        channelIds: resolved.channelIds,
        networkId: network.id,
        targetLabel: network.name,
        targetPicker: undefined,
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
            channelIds: undefined,
            networkId: undefined,
            targetLabel: undefined,
            targetPicker: undefined,
          }
        : payload;
    return this.transitionAndRender(scope, workflow, step, nextPayload);
  }

  private async commit(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
  ) {
    const payload = telegramSystemBotPostPayload(workflow.payload);
    if (!payload.content || !payload.action) {
      return this.render(workflow, scope, 'Post workflow is incomplete.');
    }
    const channelIds =
      payload.channelIds ?? (payload.channelId ? [payload.channelId] : []);
    if (!channelIds.length) {
      return this.render(workflow, scope, 'Choose a channel or network.');
    }
    if (channelIds.length > 1)
      return this.commitBatch(scope, workflow, { ...payload, channelIds });
    if (!payload.channelId || !payload.groupId) {
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
      const command = await resolveSystemBotWorkspaceProvider(
        this.moduleRef,
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
            mediaItems: payload.content.mediaItems,
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
        const publication = await resolveSystemBotWorkspaceProvider(
          this.moduleRef,
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

  private async commitBatch(
    scope: TelegramSystemBotPostFlowScope,
    workflow: TelegramSystemBotPostWorkflow,
    payload: TelegramSystemBotPostPayload,
  ) {
    if (payload.action === 'DRAFT')
      return this.render(
        workflow,
        scope,
        'Mass publications can be scheduled or published now.',
      );
    if (payload.action !== 'PUBLISH_NOW' && payload.action !== 'SCHEDULE')
      return this.render(
        workflow,
        scope,
        'Choose how to publish the mass publication.',
      );
    const action = payload.action;
    let claimed: TelegramSystemBotPostWorkflow;
    try {
      claimed = await this.workflows.claimCommit({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      return this.render(
        await this.workflows.get(scope, workflow.id),
        scope,
        'This action was already processed.',
      );
    }
    try {
      const command = await resolveSystemBotWorkspaceProvider(
        this.moduleRef,
        TelegramPostBatchCommandService,
        scope.workspaceId,
      );
      await command.createAndDispatch(scope.userId, {
        title: `Mass publication · ${new Date().toISOString().slice(0, 10)}`,
        channelIds: payload.channelIds!,
        defaultDeleteAfterHours: 24,
        posts: [
          {
            title: telegramSystemBotPostTitle(payload.content!),
            iconId: null,
            text: payload.content!.text || null,
            imageUrls: payload.content!.imageUrls,
            mediaItems: payload.content!.mediaItems ?? [],
            buttonRows: payload.content!.buttonRows,
            action,
            scheduledAt:
              action === 'SCHEDULE' ? (payload.scheduledAt ?? null) : null,
            deleteAfterHours: 24,
            longTextMode: 'IMAGES_THEN_TEXT',
            channelOverrides: [],
          },
        ],
      });
      return this.render(
        await this.workflows.complete({
          ...scope,
          id: claimed.id,
          expectedVersion: claimed.version,
          resultManagedPostId: null,
        }),
        scope,
      );
    } catch (error) {
      return this.render(
        await this.workflows.fail({
          ...scope,
          id: claimed.id,
          expectedVersion: claimed.version,
          error: sanitizeOperationalError(error),
        }),
        scope,
      );
    }
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
    const card = await resolveTelegramSystemBotPostCard({
      workflow,
      scope,
      options: this.options,
      notice,
    });
    const token = this.config.token!;
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
      ...(await resolveTelegramSystemBotPostCard({
        workflow: attached,
        scope,
        options: this.options,
        notice,
      })),
    });
  }
}
