import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  TelegramBotUpdateActor,
  TelegramBotWebhookUpdate,
} from './telegram-bot-update.types';

@Injectable()
export class TelegramBotUsersService {
  constructor(private readonly prisma: PrismaService) {}

  actorFromUpdate(update: TelegramBotWebhookUpdate) {
    return (
      update.message?.from ||
      update.callback_query?.from ||
      update.pre_checkout_query?.from ||
      update.chat_join_request?.from ||
      null
    );
  }

  chatIdFromUpdate(update: TelegramBotWebhookUpdate) {
    const chatId =
      update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    return chatId == null ? null : String(chatId);
  }

  async upsertFromUpdate(input: {
    workspaceId: string;
    botIntegrationId: string;
    runtimeInstanceId: string;
    update: TelegramBotWebhookUpdate;
    trackProductionActivity?: boolean;
  }) {
    const actor = this.actorFromUpdate(input.update);
    if (!actor?.id) return null;
    return this.upsertActor({
      workspaceId: input.workspaceId,
      botIntegrationId: input.botIntegrationId,
      runtimeInstanceId: input.runtimeInstanceId,
      actor,
      telegramChatId: this.chatIdFromUpdate(input.update),
      startedAt:
        input.trackProductionActivity === false
          ? undefined
          : /^\/start(?:\s|$)/.test(input.update.message?.text || '')
            ? new Date()
            : undefined,
      trackProductionActivity: input.trackProductionActivity,
    });
  }

  async upsertActor(input: {
    workspaceId: string;
    botIntegrationId: string;
    runtimeInstanceId: string;
    actor: TelegramBotUpdateActor;
    telegramChatId?: string | null;
    startedAt?: Date;
    trackProductionActivity?: boolean;
  }) {
    if (!input.actor.id) return null;
    const now = new Date();
    const user = await this.prisma.telegramBotUser.upsert({
      where: {
        runtimeInstanceId_telegramUserId: {
          runtimeInstanceId: input.runtimeInstanceId,
          telegramUserId: String(input.actor.id),
        },
      },
      create: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        runtimeInstanceId: input.runtimeInstanceId,
        telegramUserId: String(input.actor.id),
        telegramChatId: input.telegramChatId || null,
        username: input.actor.username || null,
        firstName: input.actor.first_name || null,
        lastName: input.actor.last_name || null,
        languageCode: input.actor.language_code || null,
        startedAt: input.startedAt || null,
        lastInteractionAt:
          input.trackProductionActivity === false ? undefined : now,
      },
      update: {
        telegramChatId: input.telegramChatId || undefined,
        username: input.actor.username || null,
        firstName: input.actor.first_name || null,
        lastName: input.actor.last_name || null,
        languageCode: input.actor.language_code || null,
        lastInteractionAt:
          input.trackProductionActivity === false ? undefined : now,
      },
    });
    if (input.startedAt && !user.startedAt) {
      await this.prisma.telegramBotUser.updateMany({
        where: { id: user.id, workspaceId: input.workspaceId, startedAt: null },
        data: { startedAt: input.startedAt },
      });
      return { ...user, startedAt: input.startedAt };
    }
    return user;
  }
}
