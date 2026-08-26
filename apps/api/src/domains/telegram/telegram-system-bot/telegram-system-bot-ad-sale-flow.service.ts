import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  Prisma,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import type { TelegramAdSalesBotDeliveryAction } from '../telegram-ad-sales/telegram-ad-sales-bot-command.types';
import {
  parseTelegramSystemBotAdSaleAmount,
  parseTelegramSystemBotAdSaleSchedule,
  telegramSystemBotAdSaleTitle,
} from './telegram-system-bot-ad-sale-flow.helpers';
import {
  currentTelegramSystemBotAdSaleMember,
  loadTelegramSystemBotAdSaleOptions,
  resolveTelegramSystemBotAdSalePlacements,
  resolveTelegramSystemBotAdSaleTargets,
  resolveTelegramSystemBotAdSales,
  resolveTelegramSystemBotPlacementAt,
} from './telegram-system-bot-ad-sale-flow.options';
import { renderTelegramSystemBotAdSaleCard } from './telegram-system-bot-ad-sale-flow.presentation';
import {
  adSaleCommandTarget,
  adSalePayload,
  adSalePayloadJson,
  type TelegramSystemBotAdSalePayload,
  type TelegramSystemBotAdSaleScope,
  type TelegramSystemBotAdSaleWorkflow,
} from './telegram-system-bot-ad-sale-flow.types';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import { parseTelegramSystemBotPostButtonsInput } from './telegram-system-bot-post-edit-input';
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

const WORKFLOW_TTL_MS = 30 * 60_000;

@Injectable()
export class TelegramSystemBotAdSaleFlowService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly workflows: TelegramSystemBotWorkflowStore,
    private readonly postContent: TelegramSystemBotPostContentService,
    private readonly moduleRef: ModuleRef,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('sba:'));
  }

  async begin(scope: TelegramSystemBotAdSaleScope) {
    const existing = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.AD_SALE,
    );
    if (existing) return this.render(existing, scope);
    const workflow = await this.workflows.create({
      ...scope,
      kind: TelegramSystemBotWorkflowKind.AD_SALE,
      step: 'CHOOSE_SALE_MODE',
      payload: {},
      expiresAt: new Date(Date.now() + WORKFLOW_TTL_MS),
    });
    return this.render(workflow, scope);
  }

  async input(
    scope: TelegramSystemBotAdSaleScope,
    message: TelegramSystemBotIncomingMessage,
  ) {
    const workflow = await this.workflows.active(
      scope,
      TelegramSystemBotWorkflowKind.AD_SALE,
    );
    if (!workflow) return null;
    const payload = adSalePayload(workflow.payload);
    if (workflow.step === 'AWAIT_AMOUNT' && message.text) {
      await this.postContent.removeInput(scope.chatId, message.message_id);
      const amount = parseTelegramSystemBotAdSaleAmount(message.text);
      if (!amount || !payload.finance) {
        return this.render(workflow, scope, 'Enter a positive sale amount.');
      }
      return this.transition(scope, workflow, 'CHOOSE_CONTENT', {
        ...payload,
        finance: { ...payload.finance, amount },
      });
    }
    if (workflow.step === 'AWAIT_EDIT_TEXT' && message.text) {
      await this.postContent.removeInput(scope.chatId, message.message_id);
      if (!payload.content)
        return this.render(workflow, scope, 'Post content is unavailable.');
      return this.transition(scope, workflow, 'CHOOSE_FORMAT', {
        ...payload,
        content: { ...payload.content, text: message.text },
      });
    }
    if (workflow.step === 'AWAIT_EDIT_BUTTONS' && message.text) {
      await this.postContent.removeInput(scope.chatId, message.message_id);
      if (!payload.content)
        return this.render(workflow, scope, 'Post content is unavailable.');
      const parsed = parseTelegramSystemBotPostButtonsInput(message.text);
      if (!parsed.ok) return this.render(workflow, scope, parsed.error);
      return this.transition(scope, workflow, 'CHOOSE_FORMAT', {
        ...payload,
        content: { ...payload.content, buttonRows: parsed.buttonRows },
      });
    }
    if (workflow.step === 'AWAIT_SCHEDULE' && message.text) {
      await this.postContent.removeInput(scope.chatId, message.message_id);
      const at = parseTelegramSystemBotAdSaleSchedule(
        message.text,
        scope.timezone,
      );
      if (!at || at.getTime() <= Date.now()) {
        return this.render(
          workflow,
          scope,
          'Enter a future date as DD.MM.YYYY HH:mm.',
        );
      }
      return this.transition(scope, workflow, 'CONFIRM', {
        ...payload,
        scheduledAt: at.toISOString(),
      });
    }
    return this.capture(scope, workflow, message);
  }

  async callback(scope: TelegramSystemBotAdSaleScope, callback: string) {
    const match = /^sba:([^:]+):(\d+):(.+)$/.exec(callback);
    if (!match) return null;
    let workflow = await this.workflows.get(scope, match[1]);
    if (workflow.version !== Number(match[2]))
      return this.render(workflow, scope, 'This view was refreshed.');
    const action = match[3];
    if (action === 'cancel') {
      workflow = await this.workflows.cancel({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
      return this.render(workflow, scope);
    }
    if (action === 'retry') {
      workflow = await this.workflows.retry({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
      });
      return this.commit(scope, workflow);
    }
    if (action === 'back') return this.back(scope, workflow);
    if (action === 'confirm') return this.commit(scope, workflow);
    return this.action(scope, workflow, action);
  }

  private async action(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    action: string,
  ) {
    const payload = adSalePayload(workflow.payload);
    if (action === 'mode.existing')
      return this.transition(scope, workflow, 'CHOOSE_EXISTING_PLACEMENT', {
        mode: 'EXISTING',
      });
    if (action === 'mode.new') {
      const member = await currentTelegramSystemBotAdSaleMember(
        this.moduleRef,
        scope,
      );
      return this.transition(scope, workflow, 'CHOOSE_ACCOUNT', {
        mode: 'NEW',
        assignedMemberId: member.id,
        memberLabel: member.name,
      });
    }
    if (action.startsWith('placement.'))
      return this.choosePlacement(scope, workflow, Number(action.slice(10)));
    if (action.startsWith('account.') || action.startsWith('member.'))
      return this.chooseBaseOption(scope, workflow, action);
    if (action === 'finance.skip')
      return this.transition(scope, workflow, 'CHOOSE_TARGET', {
        ...payload,
        finance: undefined,
        financeSkipped: true,
      });
    if (action === 'member.change')
      return this.transition(scope, workflow, 'CHOOSE_MEMBER', payload);
    if (action.startsWith('target.'))
      return this.chooseTarget(scope, workflow, action);
    if (action === 'content.send')
      return this.transition(
        scope,
        workflow,
        'AWAIT_CONTENT',
        this.clearPost(payload),
      );
    if (action === 'content.existing')
      return this.transition(
        scope,
        workflow,
        'CHOOSE_EXISTING_POST',
        this.clearPost(payload),
      );
    if (action === 'content.skip' && payload.mode === 'EXISTING')
      return this.render(workflow, scope, 'Choose a post to attach.');
    if (action === 'content.skip')
      return this.afterContent(scope, workflow, {
        ...this.clearPost(payload),
        skipPost: true,
      });
    if (action.startsWith('managedpost.'))
      return this.chooseManagedPost(scope, workflow, Number(action.slice(12)));
    if (action.startsWith('format.'))
      return this.chooseFormat(scope, workflow, Number(action.slice(7)));
    if (action === 'content.edit_text' || action === 'content.edit_buttons') {
      if (!payload.content)
        return this.render(workflow, scope, 'Post content is unavailable.');
      return this.transition(
        scope,
        workflow,
        action.endsWith('text') ? 'AWAIT_EDIT_TEXT' : 'AWAIT_EDIT_BUTTONS',
        payload,
      );
    }
    const delivery: Record<string, TelegramAdSalesBotDeliveryAction> = {
      'delivery.draft': 'SAVE_DRAFT',
      'delivery.schedule': 'SCHEDULE',
      'delivery.publish': 'PUBLISH_NOW',
    };
    if (delivery[action]) {
      const nextPayload = {
        ...payload,
        deliveryAction: delivery[action],
        scheduledAt: undefined,
      };
      return this.transition(
        scope,
        workflow,
        delivery[action] === 'PUBLISH_NOW' ? 'CONFIRM' : 'AWAIT_SCHEDULE',
        nextPayload,
      );
    }
    return this.render(workflow, scope);
  }

  private async choosePlacement(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    index: number,
  ) {
    const option = await resolveTelegramSystemBotPlacementAt(
      this.moduleRef,
      scope,
      index,
    );
    if (!option) throw new NotFoundException('Ad placement is unavailable');
    return this.transition(scope, workflow, 'CHOOSE_CONTENT', {
      mode: 'EXISTING',
      existingPlacementId: option.placementId,
      existingSaleLabel: option.saleLabel,
      existingChannelLabel: option.channelTitle,
      existingFormatLabel: option.productLabel,
      existingScheduleLabel: option.scheduledLabel,
    });
  }

  private async chooseBaseOption(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    action: string,
  ) {
    const payload = adSalePayload(workflow.payload);
    const options = await this.options(
      scope,
      action.startsWith('account.') ? 'CHOOSE_ACCOUNT' : 'CHOOSE_MEMBER',
      payload,
    );
    if (action.startsWith('account.')) {
      const account = options.accounts?.[Number(action.slice(8))];
      if (!account) throw new NotFoundException('Account is unavailable');
      return this.transition(scope, workflow, 'CHOOSE_TARGET', {
        ...payload,
        finance: {
          accountId: account.id,
          accountLabel: account.name,
          currency: account.currency,
        },
        financeSkipped: false,
      });
    }
    const member = options.members?.[Number(action.slice(7))];
    if (!member) throw new NotFoundException('Member is unavailable');
    return this.transition(scope, workflow, 'CHOOSE_ACCOUNT', {
      ...payload,
      assignedMemberId: member.id,
      memberLabel: member.name,
    });
  }

  private async chooseTarget(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    action: string,
  ) {
    const payload = adSalePayload(workflow.payload);
    const service = await resolveTelegramSystemBotAdSaleTargets(
      this.moduleRef,
      scope.workspaceId,
    );
    const options = await service.options(scope.userId);
    if (action.startsWith('target.channel.')) {
      const channel = options.channels[Number(action.slice(15))];
      if (!channel) throw new NotFoundException('Channel is unavailable');
      const previous =
        payload.target?.kind === 'CHANNELS'
          ? payload.target
          : { kind: 'CHANNELS' as const, channelIds: [], labels: [] };
      const selected = previous.channelIds.includes(channel.id);
      return this.transition(scope, workflow, 'CHOOSE_TARGET', {
        ...payload,
        target: {
          kind: 'CHANNELS',
          channelIds: selected
            ? previous.channelIds.filter((id) => id !== channel.id)
            : [...previous.channelIds, channel.id],
          labels: selected
            ? previous.labels.filter(
                (_, index) => previous.channelIds[index] !== channel.id,
              )
            : [...previous.labels, channel.title],
        },
      });
    }
    if (action === 'target.continue') {
      if (!payload.target || payload.target.kind !== 'CHANNELS')
        throw new NotFoundException('Select a channel');
      await service.resolve(scope.userId, adSaleCommandTarget(payload.target));
      return this.transition(
        scope,
        workflow,
        payload.finance ? 'AWAIT_AMOUNT' : 'CHOOSE_CONTENT',
        payload,
      );
    }
    const network = options.networks[Number(action.slice(15))];
    if (!network?.selectable)
      throw new NotFoundException('Network is unavailable');
    const target = {
      kind: 'NETWORK' as const,
      networkId: network.id,
      label: network.name,
    };
    await service.resolve(scope.userId, adSaleCommandTarget(target));
    return this.transition(
      scope,
      workflow,
      payload.finance ? 'AWAIT_AMOUNT' : 'CHOOSE_CONTENT',
      { ...payload, target },
    );
  }

  private async chooseManagedPost(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    index: number,
  ) {
    const payload = adSalePayload(workflow.payload);
    const options = await this.options(scope, 'CHOOSE_EXISTING_POST', payload);
    const post = options.managedPosts?.[index];
    if (!post) throw new NotFoundException('Managed post is unavailable');
    return this.afterContent(scope, workflow, {
      ...this.clearPost(payload),
      existingManagedPostId: post.id,
      existingManagedPostLabel: post.title,
      skipPost: false,
    });
  }

  private async chooseFormat(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    index: number,
  ) {
    const payload = adSalePayload(workflow.payload);
    const options = await this.options(scope, 'CHOOSE_FORMAT', payload);
    const format = options.formats?.[index];
    if (!format) throw new NotFoundException('Common format is unavailable');
    const next = { ...payload, formatName: format.name };
    return this.transition(
      scope,
      workflow,
      next.skipPost ? 'AWAIT_SCHEDULE' : 'CHOOSE_DELIVERY',
      next.skipPost ? { ...next, deliveryAction: 'SKIP_POST' } : next,
    );
  }

  private async capture(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    message: TelegramSystemBotIncomingMessage,
  ) {
    const payload = adSalePayload(workflow.payload);
    const expectedAlbum =
      workflow.step !== 'AWAIT_CONTENT' &&
      Boolean(message.media_group_id) &&
      payload.content?.mediaGroupId === message.media_group_id;
    if (workflow.step !== 'AWAIT_CONTENT' && !expectedAlbum) return null;
    const captured = await this.postContent.capture(message);
    await this.postContent.removeInput(scope.chatId, message.message_id);
    if (!captured.ok)
      return this.render(workflow, scope, 'Send or forward a text/photo post.');
    const sameAlbum =
      captured.content.mediaGroupId &&
      payload.content?.mediaGroupId === captured.content.mediaGroupId;
    const content = sameAlbum
      ? {
          ...payload.content!,
          text: payload.content?.text || captured.content.text,
          imageUrls: [
            ...new Set([
              ...(payload.content?.imageUrls ?? []),
              ...captured.content.imageUrls,
            ]),
          ],
          buttonRows: payload.content?.buttonRows.length
            ? payload.content.buttonRows
            : captured.content.buttonRows,
          warnings: [
            ...new Set([
              ...(payload.content?.warnings ?? []),
              ...captured.content.warnings,
            ]),
          ],
        }
      : captured.content;
    return this.afterContent(scope, workflow, {
      ...this.clearPost(payload),
      content,
      skipPost: false,
    });
  }

  private afterContent(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    payload: TelegramSystemBotAdSalePayload,
  ) {
    return this.transition(
      scope,
      workflow,
      payload.mode === 'EXISTING' ? 'CHOOSE_DELIVERY' : 'CHOOSE_FORMAT',
      payload,
    );
  }

  private clearPost(payload: TelegramSystemBotAdSalePayload) {
    return {
      ...payload,
      content: undefined,
      existingManagedPostId: undefined,
      existingManagedPostLabel: undefined,
      skipPost: false,
    };
  }

  private async back(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
  ) {
    const payload = adSalePayload(workflow.payload);
    const previous = this.previousStep(workflow.step, payload);
    return this.transition(scope, workflow, previous, payload);
  }

  private previousStep(step: string, payload: TelegramSystemBotAdSalePayload) {
    const map: Record<string, string> = {
      CHOOSE_EXISTING_PLACEMENT: 'CHOOSE_SALE_MODE',
      CHOOSE_ACCOUNT: 'CHOOSE_SALE_MODE',
      CHOOSE_MEMBER: 'CHOOSE_ACCOUNT',
      CHOOSE_TARGET: 'CHOOSE_ACCOUNT',
      AWAIT_AMOUNT: 'CHOOSE_TARGET',
      CHOOSE_CONTENT:
        payload.mode === 'EXISTING'
          ? 'CHOOSE_EXISTING_PLACEMENT'
          : payload.finance
            ? 'AWAIT_AMOUNT'
            : 'CHOOSE_TARGET',
      AWAIT_CONTENT: 'CHOOSE_CONTENT',
      CHOOSE_EXISTING_POST: 'CHOOSE_CONTENT',
      CHOOSE_FORMAT: 'CHOOSE_CONTENT',
      AWAIT_EDIT_TEXT: 'CHOOSE_FORMAT',
      AWAIT_EDIT_BUTTONS: 'CHOOSE_FORMAT',
      CHOOSE_DELIVERY:
        payload.mode === 'EXISTING' ? 'CHOOSE_CONTENT' : 'CHOOSE_FORMAT',
      AWAIT_SCHEDULE: payload.skipPost ? 'CHOOSE_FORMAT' : 'CHOOSE_DELIVERY',
      CONFIRM:
        payload.deliveryAction === 'SCHEDULE' ||
        payload.deliveryAction === 'SKIP_POST'
          ? 'AWAIT_SCHEDULE'
          : 'CHOOSE_DELIVERY',
    };
    return map[step] ?? 'CHOOSE_SALE_MODE';
  }

  private async commit(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
  ) {
    const payload = adSalePayload(workflow.payload);
    if (payload.existingPlacementId) {
      const service = await resolveTelegramSystemBotAdSalePlacements(
        this.moduleRef,
        scope.workspaceId,
      );
      await service.resolve(scope.userId, payload.existingPlacementId);
    }
    const command = this.command(workflow.id, payload);
    if (!command) throw new NotFoundException('Ad Sale workflow is incomplete');
    const claimed = await this.workflows.claimCommit({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
    });
    try {
      const service = await resolveTelegramSystemBotAdSales(
        this.moduleRef,
        scope.workspaceId,
      );
      const result = await service.commit(scope.userId, command as never);
      const first = 'placements' in result ? result.placements?.[0] : undefined;
      const completed = await this.workflows.complete({
        ...scope,
        id: claimed.id,
        expectedVersion: claimed.version,
        resultManagedPostId: first?.managedPostId ?? result.managedPostId,
        resultAdSaleId: result.saleId,
        resultAdSalePlacementId: first?.placementId ?? result.placementId,
      });
      return this.render(completed, scope);
    } catch (error) {
      const failed = await this.workflows.fail({
        ...scope,
        id: claimed.id,
        expectedVersion: claimed.version,
        error: sanitizeOperationalError(error),
      });
      return this.render(failed, scope);
    }
  }

  private command(commandId: string, payload: TelegramSystemBotAdSalePayload) {
    if (!payload.deliveryAction) return null;
    const content = payload.content
      ? {
          post: {
            title: telegramSystemBotAdSaleTitle(payload.content),
            text: payload.content.text || undefined,
            imageUrls: payload.content.imageUrls,
            buttonRows: payload.content.buttonRows,
          },
        }
      : payload.existingManagedPostId
        ? { existingManagedPostId: payload.existingManagedPostId }
        : {};
    if (payload.existingPlacementId)
      return {
        commandId,
        existingPlacementId: payload.existingPlacementId,
        deliveryAction: payload.deliveryAction,
        scheduledAt: payload.scheduledAt,
        ...content,
      };
    if (!payload.target || !payload.formatName || !payload.assignedMemberId)
      return null;
    return {
      commandId,
      assignedMemberId: payload.assignedMemberId,
      finance: payload.finance
        ? {
            accountId: payload.finance.accountId,
            amount: payload.finance.amount,
          }
        : undefined,
      target: adSaleCommandTarget(payload.target),
      formatName: payload.formatName,
      deliveryAction: payload.deliveryAction,
      scheduledAt: payload.scheduledAt,
      ...content,
    };
  }

  private transition(
    scope: TelegramSystemBotAdSaleScope,
    workflow: TelegramSystemBotAdSaleWorkflow,
    step: string,
    payload: TelegramSystemBotAdSalePayload,
  ) {
    return this.workflows
      .transition({
        ...scope,
        id: workflow.id,
        expectedVersion: workflow.version,
        step,
        payload: adSalePayloadJson(payload),
      })
      .then((next) => this.render(next, scope));
  }

  private async render(
    workflow: TelegramSystemBotAdSaleWorkflow,
    scope: TelegramSystemBotAdSaleScope,
    notice?: string,
  ) {
    const card = await this.card(workflow, scope, notice);
    if (workflow.controlMessageId) {
      try {
        return await this.api.editMessageText(this.config.token!, {
          chat_id: scope.chatId,
          message_id: workflow.controlMessageId,
          ...card,
        });
      } catch {
        /* replace below */
      }
    }
    const sent = await this.api.sendMessage(this.config.token!, {
      chat_id: scope.chatId,
      text: 'Preparing Ad Sale…',
    });
    if (
      workflow.status !== TelegramSystemBotWorkflowStatus.ACTIVE ||
      workflow.controlMessageId
    )
      return this.api.editMessageText(this.config.token!, {
        chat_id: scope.chatId,
        message_id: sent.message_id,
        ...card,
      });
    const attached = await this.workflows.transition({
      ...scope,
      id: workflow.id,
      expectedVersion: workflow.version,
      step: workflow.step,
      payload: workflow.payload as Prisma.InputJsonValue,
      controlMessageId: sent.message_id,
    });
    return this.api.editMessageText(this.config.token!, {
      chat_id: scope.chatId,
      message_id: sent.message_id,
      ...(await this.card(attached, scope, notice)),
    });
  }

  private async card(
    workflow: TelegramSystemBotAdSaleWorkflow,
    scope: TelegramSystemBotAdSaleScope,
    notice?: string,
  ) {
    const payload = adSalePayload(workflow.payload);
    const options =
      workflow.status === TelegramSystemBotWorkflowStatus.ACTIVE
        ? await this.options(scope, workflow.step, payload)
        : undefined;
    return renderTelegramSystemBotAdSaleCard({
      workflow,
      scope,
      payload,
      options,
      notice,
    });
  }

  private options(
    scope: TelegramSystemBotAdSaleScope,
    step: string,
    payload: TelegramSystemBotAdSalePayload,
  ) {
    return loadTelegramSystemBotAdSaleOptions({
      moduleRef: this.moduleRef,
      scope,
      step,
      payload,
    });
  }
}
