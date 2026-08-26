import { NotFoundException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import {
  loadTelegramSystemBotAdSaleOptions,
  resolveTelegramSystemBotAdSalePlacements,
  resolveTelegramSystemBotAdSaleTargets,
} from './telegram-system-bot-ad-sale-flow.options';
import {
  adSaleCommandTarget,
  type TelegramSystemBotAdSalePayload,
  type TelegramSystemBotAdSaleScope,
} from './telegram-system-bot-ad-sale-flow.types';

export type AdSaleSelection = {
  step: string;
  payload: TelegramSystemBotAdSalePayload;
};

export async function selectAdSalePlacement(
  moduleRef: ModuleRef,
  scope: TelegramSystemBotAdSaleScope,
  placementId: string,
): Promise<AdSaleSelection> {
  const service = await resolveTelegramSystemBotAdSalePlacements(
    moduleRef,
    scope.workspaceId,
  );
  const option = await service.resolve(scope.userId, placementId);
  return {
    step: 'CHOOSE_CONTENT',
    payload: {
      mode: 'EXISTING',
      existingPlacementId: option.placementId,
      existingSaleLabel: option.saleLabel,
      existingChannelLabel: option.channelTitle,
      existingFormatLabel: option.productLabel,
      existingScheduleLabel: option.scheduledLabel,
    },
  };
}

export async function selectAdSaleBaseOption(input: {
  moduleRef: ModuleRef;
  scope: TelegramSystemBotAdSaleScope;
  payload: TelegramSystemBotAdSalePayload;
  kind: 'account' | 'member';
  id: string;
}): Promise<AdSaleSelection> {
  const options = await loadTelegramSystemBotAdSaleOptions({
    moduleRef: input.moduleRef,
    scope: input.scope,
    step: input.kind === 'account' ? 'CHOOSE_ACCOUNT' : 'CHOOSE_MEMBER',
    payload: input.payload,
  });
  if (input.kind === 'account') {
    const account = options.accounts?.find((item) => item.id === input.id);
    if (!account) throw new NotFoundException('Account is unavailable');
    return {
      step: 'CHOOSE_TARGET',
      payload: {
        ...input.payload,
        finance: {
          accountId: account.id,
          accountLabel: account.name,
          currency: account.currency,
        },
        financeSkipped: false,
      },
    };
  }
  const member = options.members?.find((item) => item.id === input.id);
  if (!member) throw new NotFoundException('Member is unavailable');
  return {
    step: 'CHOOSE_ACCOUNT',
    payload: {
      ...input.payload,
      assignedMemberId: member.id,
      memberLabel: member.name,
    },
  };
}

export async function selectAdSaleTarget(input: {
  moduleRef: ModuleRef;
  scope: TelegramSystemBotAdSaleScope;
  payload: TelegramSystemBotAdSalePayload;
  kind: 'channel' | 'network' | 'continue';
  id?: string;
}): Promise<AdSaleSelection> {
  const service = await resolveTelegramSystemBotAdSaleTargets(
    input.moduleRef,
    input.scope.workspaceId,
  );
  if (input.kind === 'continue') {
    if (
      input.payload.target?.kind !== 'CHANNELS' ||
      input.payload.target.channelIds.length === 0
    )
      throw new NotFoundException('Select a channel');
    await service.resolve(
      input.scope.userId,
      adSaleCommandTarget(input.payload.target),
    );
    return {
      step: input.payload.finance ? 'AWAIT_AMOUNT' : 'CHOOSE_CONTENT',
      payload: input.payload,
    };
  }
  const options = await service.options(input.scope.userId);
  if (input.kind === 'channel') {
    const channel = options.channels.find((item) => item.id === input.id);
    if (!channel) throw new NotFoundException('Channel is unavailable');
    const previous =
      input.payload.target?.kind === 'CHANNELS'
        ? input.payload.target
        : { kind: 'CHANNELS' as const, channelIds: [], labels: [] };
    const pairs = previous.channelIds.map((id, index) => ({
      id,
      label: previous.labels[index] ?? id,
    }));
    const selected = pairs.some((item) => item.id === channel.id);
    const nextPairs = selected
      ? pairs.filter((item) => item.id !== channel.id)
      : [...pairs, { id: channel.id, label: channel.title }];
    return {
      step: 'CHOOSE_TARGET',
      payload: {
        ...input.payload,
        target: {
          kind: 'CHANNELS',
          channelIds: nextPairs.map((item) => item.id),
          labels: nextPairs.map((item) => item.label),
        },
      },
    };
  }
  const network = options.networks.find((item) => item.id === input.id);
  if (!network?.selectable)
    throw new NotFoundException('Network is unavailable');
  const target = {
    kind: 'NETWORK' as const,
    networkId: network.id,
    label: network.name,
  };
  await service.resolve(input.scope.userId, adSaleCommandTarget(target));
  return {
    step: input.payload.finance ? 'AWAIT_AMOUNT' : 'CHOOSE_CONTENT',
    payload: { ...input.payload, target },
  };
}

export async function selectAdSaleManagedPost(input: {
  moduleRef: ModuleRef;
  scope: TelegramSystemBotAdSaleScope;
  payload: TelegramSystemBotAdSalePayload;
  postId: string;
}): Promise<TelegramSystemBotAdSalePayload> {
  const options = await loadTelegramSystemBotAdSaleOptions({
    moduleRef: input.moduleRef,
    scope: input.scope,
    step: 'CHOOSE_EXISTING_POST',
    payload: input.payload,
  });
  const post = options.managedPosts?.find((item) => item.id === input.postId);
  if (!post) throw new NotFoundException('Managed post is unavailable');
  return {
    ...clearAdSalePost(input.payload),
    existingManagedPostId: post.id,
    existingManagedPostLabel: post.title,
  };
}

export function clearAdSalePost(payload: TelegramSystemBotAdSalePayload) {
  return {
    ...payload,
    content: undefined,
    existingManagedPostId: undefined,
    existingManagedPostLabel: undefined,
    skipPost: false,
  };
}
