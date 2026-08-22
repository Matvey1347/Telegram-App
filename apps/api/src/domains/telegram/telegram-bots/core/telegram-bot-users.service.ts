import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  TelegramBotUpdateActor,
  TelegramBotWebhookUpdate,
} from './telegram-bot-update.types';

@Injectable()
export class TelegramBotUsersService {
  private static readonly INTERACTION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

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
    const telegramUserId = String(input.actor.id);
    let existing = await this.prisma.telegramBotUser.findUnique({
      where: {
        runtimeInstanceId_telegramUserId: {
          runtimeInstanceId: input.runtimeInstanceId,
          telegramUserId,
        },
      },
    });

    if (!existing) {
      try {
        return await this.prisma.telegramBotUser.create({
          data: {
            workspaceId: input.workspaceId,
            botIntegrationId: input.botIntegrationId,
            runtimeInstanceId: input.runtimeInstanceId,
            telegramUserId,
            telegramChatId: input.telegramChatId || null,
            username: input.actor.username || null,
            firstName: input.actor.first_name || null,
            lastName: input.actor.last_name || null,
            languageCode: input.actor.language_code || null,
            startedAt: input.startedAt || null,
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        existing = await this.prisma.telegramBotUser.findUnique({
          where: {
            runtimeInstanceId_telegramUserId: {
              runtimeInstanceId: input.runtimeInstanceId,
              telegramUserId,
            },
          },
        });
        if (!existing) throw error;
      }
    }

    const data: Prisma.TelegramBotUserUpdateInput = {};
    const username = input.actor.username || null;
    const firstName = input.actor.first_name || null;
    const lastName = input.actor.last_name || null;
    const languageCode = input.actor.language_code || null;
    if (existing.username !== username) data.username = username;
    if (existing.firstName !== firstName) data.firstName = firstName;
    if (existing.lastName !== lastName) data.lastName = lastName;
    if (existing.languageCode !== languageCode)
      data.languageCode = languageCode;
    if (
      input.telegramChatId &&
      input.telegramChatId !== existing.telegramChatId
    ) {
      data.telegramChatId = input.telegramChatId;
    }
    if (input.startedAt && !existing.startedAt) data.startedAt = input.startedAt;
    if (
      input.trackProductionActivity !== false &&
      existing.lastInteractionAt.getTime() <=
        now.getTime() - TelegramBotUsersService.INTERACTION_TOUCH_INTERVAL_MS
    ) {
      data.lastInteractionAt = now;
    }
    if (!Object.keys(data).length) return existing;
    return this.prisma.telegramBotUser.update({
      where: { id: existing.id },
      data,
    });
  }
}
