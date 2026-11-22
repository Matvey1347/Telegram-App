import { channelAvatarEmojiManagedChannelWhere } from './channel-avatar-emoji-ownership';
import { Prisma } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import {
  ChannelAvatarEmojiProcessorService,
  type ChannelAvatarEmojiProcessOptions,
} from './channel-avatar-emoji-processor.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

/** Request-scoped HTTP authorization and response facade. */
@Injectable()
export class ChannelAvatarEmojiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly catalog: TelegramChannelCatalogService,
    private readonly processor: ChannelAvatarEmojiProcessorService,
  ) {}

  private async managed(userId: string, id: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id, ...channelAvatarEmojiManagedChannelWhere(workspaceId) },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return channel;
  }

  async refresh(userId: string, id: string): Promise<unknown> {
    const channel = await this.managed(userId, id);
    // Reset bounded automatic retry admission only on an explicit command.
    await this.enqueue(channel.workspaceId, id, false);
    await this.process(channel.workspaceId, id);
    notifyScheduledTaskDueWorkChanged('channel-avatar-emoji');
    return this.catalog.findOne(userId, id);
  }

  async restore(userId: string, id: string): Promise<unknown> {
    const channel = await this.managed(userId, id);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "TelegramChannel"
      SET "avatarEmojiManual" = false, "presentationIconId" = "avatarEmojiIconId", "updatedAt" = NOW()
      WHERE "id" = ${id} AND "workspaceId" = ${channel.workspaceId}
        AND ("avatarEmojiManual" OR "presentationIconId" IS DISTINCT FROM "avatarEmojiIconId")
        AND EXISTS (
          SELECT 1 FROM "TelegramChannelSourceAccess" access
          WHERE access."channelId" = "TelegramChannel"."id"
            AND access."workspaceId" = "TelegramChannel"."workspaceId"
            AND access."sourceType" = 'MTPROTO' AND access."role" IN ('OWNER', 'ADMIN')
        )
    `);
    return this.catalog.findOne(userId, id);
  }

  enqueueInitial(workspaceId: string, id: string) {
    return this.processor.enqueueInitial(workspaceId, id);
  }

  enqueue(workspaceId: string, id: string, wake = true) {
    return this.processor.enqueue(workspaceId, id, wake);
  }

  process(
    workspaceId: string,
    id: string,
    options: ChannelAvatarEmojiProcessOptions = {},
  ) {
    return this.processor.process(workspaceId, id, options);
  }
}
