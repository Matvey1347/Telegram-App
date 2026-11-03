import type { CrmReactionAssetsResponse } from '@telegram-system/shared';
import { Injectable, Optional } from '@nestjs/common';
import { crmLocalReactionAssetsEnabled } from '../../../config/deployment-config';
import { TelegramBotReactionAssets } from '@api/telegram/shared/bot/telegram-bot-reaction-assets';
import { TelegramSystemBotConfigService } from '../telegram-system-bot/telegram-system-bot-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmChatAccess } from './telegram-crm-chat-access.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

@Injectable()
export class TelegramCrmReactionAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TelegramCrmChatAccess,
    private readonly runtime: TelegramCrmRuntimeManager,
    @Optional() private readonly botAssets?: TelegramBotReactionAssets,
    @Optional() private readonly botConfig?: TelegramSystemBotConfigService,
  ) {}

  async get(
    userId: string,
    conversationId: string,
    messageIds: string[],
    signal?: AbortSignal,
    documentIds?: string[],
  ): Promise<CrmReactionAssetsResponse> {
    const { row } = await this.access.conversation(userId, conversationId);
    const messages = await this.prisma.telegramCrmMessage.findMany({
      where: {
        workspaceId: row.workspaceId,
        conversationId,
        id: { in: [...new Set(messageIds)].slice(0, 50) },
        deletedAt: null,
      },
      select: { contentMetadata: true },
      take: 50,
    });
    const ids = new Set<string>();
    for (const message of messages) {
      const metadata = message.contentMetadata;
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata) ||
        !Array.isArray(metadata.reactions)
      )
        continue;
      for (const reaction of metadata.reactions) {
        if (
          !reaction ||
          typeof reaction !== 'object' ||
          Array.isArray(reaction)
        )
          continue;
        const match =
          typeof reaction.emoji === 'string' &&
          /^custom:(\d{1,20})$/.exec(reaction.emoji);
        if (match) ids.add(match[1]);
      }
    }
    if (documentIds) {
      const requested = new Set(documentIds);
      for (const id of ids) if (!requested.has(id)) ids.delete(id);
    }
    if (!ids.size) return { items: {} };
    if (
      crmLocalReactionAssetsEnabled() &&
      this.botAssets &&
      this.botConfig?.localToken
    ) {
      const items = await this.botAssets.get(
        this.botConfig.localToken,
        [...ids].slice(0, 50),
        signal,
      );
      await this.access.conversation(userId, conversationId);
      return { items };
    }
    const items = await this.runtime.withAccountHandle(
      row.workspaceId,
      row.mtprotoAccountId,
      'sync',
      async (handle) => {
        // Account access can change while waiting for the runtime lease.
        await this.access.conversation(userId, conversationId);
        if (signal?.aborted) return {};
        return handle.getReactionAssets
          ? handle.getReactionAssets([...ids].slice(0, 50), signal)
          : {};
      },
    );
    await this.access.conversation(userId, conversationId);
    return { items };
  }
}
