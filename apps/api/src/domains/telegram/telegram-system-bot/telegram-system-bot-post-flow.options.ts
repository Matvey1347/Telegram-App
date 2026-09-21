import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { TelegramSystemPostGroupsService } from '../telegram-channels/telegram-system-post-groups.service';
import { TelegramSystemBotDomainGatewayService } from './telegram-system-bot-domain-gateway.service';
import { resolveTelegramSystemBotAdSaleTargets } from './telegram-system-bot-ad-sale-flow.options';
import type { TelegramSystemBotPostFlowScope } from './telegram-system-bot-post-flow.types';

@Injectable()
export class TelegramSystemBotPostFlowOptions {
  constructor(
    private readonly domain: TelegramSystemBotDomainGatewayService,
    private readonly moduleRef: ModuleRef,
  ) {}

  channels(scope: TelegramSystemBotPostFlowScope) {
    return this.domain
      .channels(scope.workspaceId, scope.telegramUserId)
      .then((channels) =>
        channels.filter((channel) => channel.isActive).slice(0, 8),
      );
  }

  async networks(scope: TelegramSystemBotPostFlowScope) {
    const targets = await resolveTelegramSystemBotAdSaleTargets(
      this.moduleRef,
      scope.workspaceId,
    );
    const options = await targets.options(scope.userId);
    return options.networks.filter((network) => network.selectable).slice(0, 8);
  }

  async groups(scope: TelegramSystemBotPostFlowScope, channelId: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': scope.workspaceId } },
      contextId,
    );
    const groups = await this.moduleRef.resolve(
      TelegramSystemPostGroupsService,
      contextId,
      { strict: false },
    );
    return groups.optionsForSystemBotPost(scope.userId, channelId);
  }
}
