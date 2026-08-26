import { ContextIdFactory, type ModuleRef } from '@nestjs/core';
import { TelegramAdSalesBotCommandService } from '../telegram-ad-sales/telegram-ad-sales-bot-command.service';
import { TelegramAdSalesBotTargetsService } from '../telegram-ad-sales/telegram-ad-sales-bot-targets.service';
import { TelegramAdSalesPlacementOptionsService } from '../telegram-ad-sales/telegram-ad-sales-placement-options.service';
import {
  adSaleCommandTarget,
  type TelegramSystemBotAdSaleOptions,
  type TelegramSystemBotAdSalePayload,
  type TelegramSystemBotAdSaleScope,
} from './telegram-system-bot-ad-sale-flow.types';

function context(moduleRef: ModuleRef, workspaceId: string) {
  const contextId = ContextIdFactory.create();
  moduleRef.registerRequestByContextId(
    { headers: { 'x-workspace-id': workspaceId } },
    contextId,
  );
  return contextId;
}

function resolve<T>(
  moduleRef: ModuleRef,
  workspaceId: string,
  token: abstract new (...args: never[]) => T,
) {
  return moduleRef.resolve(token, context(moduleRef, workspaceId), {
    strict: false,
  });
}

export function resolveTelegramSystemBotAdSales(
  moduleRef: ModuleRef,
  workspaceId: string,
) {
  return resolve(moduleRef, workspaceId, TelegramAdSalesBotCommandService);
}

export function resolveTelegramSystemBotAdSaleTargets(
  moduleRef: ModuleRef,
  workspaceId: string,
) {
  return resolve(moduleRef, workspaceId, TelegramAdSalesBotTargetsService);
}

export function resolveTelegramSystemBotAdSalePlacements(
  moduleRef: ModuleRef,
  workspaceId: string,
) {
  return resolve(
    moduleRef,
    workspaceId,
    TelegramAdSalesPlacementOptionsService,
  );
}

export async function loadTelegramSystemBotAdSaleOptions(input: {
  moduleRef: ModuleRef;
  scope: TelegramSystemBotAdSaleScope;
  step: string;
  payload: TelegramSystemBotAdSalePayload;
}): Promise<TelegramSystemBotAdSaleOptions> {
  const { moduleRef, scope, step, payload } = input;
  if (step === 'CHOOSE_EXISTING_PLACEMENT') {
    const service = await resolveTelegramSystemBotAdSalePlacements(
      moduleRef,
      scope.workspaceId,
    );
    return { placements: await service.list(scope.userId) };
  }
  if (step === 'CHOOSE_TARGET') {
    const service = await resolveTelegramSystemBotAdSaleTargets(
      moduleRef,
      scope.workspaceId,
    );
    return service.options(scope.userId);
  }
  if (step === 'CHOOSE_FORMAT' && payload.target) {
    const service = await resolveTelegramSystemBotAdSaleTargets(
      moduleRef,
      scope.workspaceId,
    );
    const result = await service.resolve(
      scope.userId,
      adSaleCommandTarget(payload.target),
    );
    return { formats: result.formats };
  }
  if (step === 'CHOOSE_EXISTING_POST') {
    const service = await resolveTelegramSystemBotAdSaleTargets(
      moduleRef,
      scope.workspaceId,
    );
    const target = await contentTarget(moduleRef, scope, payload);
    return {
      managedPosts: await service.existingManagedPosts(scope.userId, target),
    };
  }
  if (step === 'CHOOSE_ACCOUNT' || step === 'CHOOSE_MEMBER') {
    const service = await resolveTelegramSystemBotAdSales(
      moduleRef,
      scope.workspaceId,
    );
    return service.options(scope.userId);
  }
  return {};
}

export async function currentTelegramSystemBotAdSaleMember(
  moduleRef: ModuleRef,
  scope: TelegramSystemBotAdSaleScope,
) {
  const service = await resolveTelegramSystemBotAdSales(
    moduleRef,
    scope.workspaceId,
  );
  const options = await service.options(scope.userId);
  return options.currentMember;
}

export async function resolveTelegramSystemBotPlacementAt(
  moduleRef: ModuleRef,
  scope: TelegramSystemBotAdSaleScope,
  index: number,
) {
  const service = await resolveTelegramSystemBotAdSalePlacements(
    moduleRef,
    scope.workspaceId,
  );
  const option = (await service.list(scope.userId))[index];
  return option ? service.resolve(scope.userId, option.placementId) : null;
}

export async function contentTarget(
  moduleRef: ModuleRef,
  scope: TelegramSystemBotAdSaleScope,
  payload: TelegramSystemBotAdSalePayload,
) {
  if (payload.target) return adSaleCommandTarget(payload.target);
  if (!payload.existingPlacementId) {
    throw new Error('Advertising target is not selected');
  }
  const placements = await resolveTelegramSystemBotAdSalePlacements(
    moduleRef,
    scope.workspaceId,
  );
  const placement = await placements.resolve(
    scope.userId,
    payload.existingPlacementId,
  );
  return { kind: 'CHANNELS' as const, channelIds: [placement.channelId] };
}
