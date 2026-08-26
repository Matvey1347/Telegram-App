import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { TelegramSystemPostGroupsService } from '../telegram-channels/telegram-system-post-groups.service';
import { TelegramSystemBotDomainGatewayService } from './telegram-system-bot-domain-gateway.service';
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
