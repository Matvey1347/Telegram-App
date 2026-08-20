import { Injectable } from '@nestjs/common';
import {
  GreeterAutomationEnvironment,
  GreeterJoinRequestStatus,
  TelegramSourceType,
} from '@prisma/client';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import { TelegramBotUsersService } from '../core/telegram-bot-users.service';
import { renderGreeterTemplate } from './greeter-template.renderer';
import type { UpdateGreeterConfigDto } from '../core/dto';
import { GreeterAutomationService } from './greeter-automation.service';
import { GreeterConfigurationService } from './greeter-configuration.service';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { telegramMarkupToHtml } from '../../../../telegram/shared/telegram-markup';
import { GreeterTestModeService } from './greeter-test-mode.service';

@Injectable()
export class GreeterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: TelegramBotUsersService,
    private readonly botApi: TelegramBotApiClient,
    private readonly encryption: TokenEncryptionService,
    private readonly automations: GreeterAutomationService,
    private readonly configuration: GreeterConfigurationService,
    private readonly delivery: TelegramBotDeliveryService,
    private readonly testMode?: GreeterTestModeService,
  ) {}

  async overview(userId: string, botId: string) {
    return this.configuration.overview(userId, botId);
  }

  async updateConfig(
    userId: string,
    botId: string,
    dto: UpdateGreeterConfigDto,
  ) {
    return this.configuration.updateConfig(userId, botId, dto);
  }

  async connectChannel(userId: string, botId: string, channelId: string) {
    return this.configuration.connectChannel(userId, botId, channelId);
  }

  async handle(context: TelegramBotApplicationContext) {
    if (context.update.chat_join_request)
      return this.handleJoinRequest(context);
    const actor =
      context.update.message?.from ||
      context.update.callback_query?.from ||
      context.update.pre_checkout_query?.from ||
      null;
    const testSession =
      actor?.id != null
        ? await this.testMode?.activeSession(context.bot.id, String(actor.id))
        : null;
    if (context.update.callback_query) {
      const user = await this.users.upsertFromUpdate({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        update: context.update,
        trackProductionActivity: !testSession,
      });
      if (user && testSession) {
        await this.testMode?.touch({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          generation: testSession.generation,
        });
      }
      return this.handleCallback(context);
    }
    const user = await this.users.upsertFromUpdate({
      workspaceId: context.bot.workspaceId,
      botIntegrationId: context.bot.id,
      update: context.update,
      trackProductionActivity: !testSession,
    });
    if (user && /^\/start(?:\s|$)/.test(context.update.message?.text || '')) {
      const claimed = testSession
        ? await this.testMode?.claimStart({
            workspaceId: context.bot.workspaceId,
            botIntegrationId: context.bot.id,
            telegramBotUserId: user.id,
            generation: testSession.generation,
          })
        : null;
      if (!testSession || claimed?.firstStart) {
        await this.automations.enrollForTrigger({
          workspaceId: context.bot.workspaceId,
          botIntegrationId: context.bot.id,
          telegramBotUserId: user.id,
          trigger: 'AFTER_START',
          environment: testSession
            ? GreeterAutomationEnvironment.TEST
            : GreeterAutomationEnvironment.PRODUCTION,
          channelId: testSession?.channelId ?? null,
          runKey: testSession
            ? `TEST:${testSession.id}:${testSession.generation}`
            : 'PRODUCTION',
        });
      }
    } else if (user && testSession) {
      await this.testMode?.touch({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        generation: testSession.generation,
      });
    }
    if (
      user &&
      user.telegramChatId &&
      context.update.message?.text?.trim() === '/help'
    ) {
      await this.delivery.enqueueSendMessage({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        chatId: user.telegramChatId,
        text: 'Send /start to begin the configured welcome flow.',
        idempotencyKey: `greeter-help:${context.updateLogId}`,
      });
    }
  }

  private token(context: TelegramBotApplicationContext) {
    return context.token;
  }

  private choiceToken(joinToken: string, choice: string) {
    return createHmac('sha256', joinToken)
      .update(choice)
      .digest('base64url')
      .slice(0, 16);
  }

  private async handleJoinRequest(context: TelegramBotApplicationContext) {
    const request = context.update.chat_join_request!;
    if (request.chat?.id == null || request.from?.id == null) return;
    const configured = await this.prisma.greeterChannel.findFirst({
      where: {
        botIntegrationId: context.bot.id,
        enabled: true,
        channel: {
          telegramChatId: String(request.chat.id),
          workspaceId: context.bot.workspaceId,
        },
      },
      include: { channel: true, config: true },
    });
    if (!configured) return;
    const access = await this.prisma.telegramChannelSourceAccess.findUnique({
      where: {
        channelId_sourceId_sourceType: {
          channelId: configured.channelId,
          sourceId: context.bot.id,
          sourceType: TelegramSourceType.BOT,
        },
      },
      select: { canInviteUsers: true },
    });
    if (configured.permissionError || !access?.canInviteUsers) return;
    const testSession = await this.testMode?.activeSession(
      context.bot.id,
      String(request.from.id),
    );
    const user = await this.users.upsertActor({
      workspaceId: context.bot.workspaceId,
      botIntegrationId: context.bot.id,
      actor: request.from,
      telegramChatId: null,
      trackProductionActivity: !testSession,
    });
    if (!user) return;
    if (
      testSession?.channelId &&
      testSession.channelId !== configured.channelId
    )
      return;
    if (testSession) {
      await this.testMode?.touch({
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        telegramBotUserId: user.id,
        generation: testSession.generation,
      });
    }
    const config = await this.configuration.effectiveConfig(
      context.bot.id,
      configured,
      testSession
        ? GreeterAutomationEnvironment.TEST
        : GreeterAutomationEnvironment.PRODUCTION,
    );
    const requestedAt = request.date
      ? new Date(request.date * 1000)
      : new Date();
    const answer =
      config.captchaType === 'SIMPLE_CHOICE'
        ? String(2 + Math.floor(Math.random() * 8))
        : null;
    const unique = {
      botIntegrationId_channelId_telegramUserId_requestedAt: {
        botIntegrationId: context.bot.id,
        channelId: configured.channelId,
        telegramUserId: String(request.from.id),
        requestedAt,
      },
    };
    const prior = await this.prisma.greeterJoinRequest.findUnique({
      where: unique,
    });
    if (prior) return;
    const join = await this.prisma.greeterJoinRequest.create({
      data: {
        workspaceId: context.bot.workspaceId,
        botIntegrationId: context.bot.id,
        greeterChannelId: configured.id,
        channelId: configured.channelId,
        telegramBotUserId: user.id,
        telegramUserId: String(request.from.id),
        requestedAt,
        callbackToken: randomBytes(12).toString('base64url'),
        captchaAnswer: answer,
        captchaChatId:
          request.user_chat_id == null ? null : String(request.user_chat_id),
        sourceInviteLink: request.invite_link?.invite_link
          ? `sha256:${createHash('sha256').update(request.invite_link.invite_link).digest('hex')}`
          : null,
        environment: testSession
          ? GreeterAutomationEnvironment.TEST
          : GreeterAutomationEnvironment.PRODUCTION,
        testSessionId: testSession?.id ?? null,
        testGeneration: testSession?.generation ?? null,
        expiredAt: config.captchaEnabled
          ? new Date(Date.now() + config.timeoutMinutes * 60000)
          : null,
      },
    });
    if (join.expiredAt) notifyScheduledTaskDueWorkChanged('greeter.expire_pending');
    if (!config.captchaEnabled) return this.approve(context, join.id);
    const text = renderGreeterTemplate(
      config.captchaType === 'SIMPLE_CHOICE'
        ? config.choicePrompt
        : config.captchaMessage,
      { channel: configured.channel, user: request.from, captcha: { answer } },
    );
    const buttons =
      config.captchaType === 'SIMPLE_CHOICE'
        ? [
            String(Number(answer) - 1),
            answer!,
            String(Number(answer) + 2),
          ].sort(() => Math.random() - 0.5)
        : [config.confirmButtonText];
    if (!join.captchaChatId) return;
    const queued = await this.delivery.enqueueSendMessage({
      workspaceId: context.bot.workspaceId,
      botIntegrationId: context.bot.id,
      telegramBotUserId: user.id,
      chatId: join.captchaChatId,
      text: telegramMarkupToHtml(text),
      parseMode: 'HTML',
      inlineButtons: [
        buttons.map((label) => ({
          text: label,
          callbackData: `g:${join.callbackToken}:${config.captchaType === 'SIMPLE_CHOICE' ? this.choiceToken(join.callbackToken, label) : 'ok'}`,
        })),
      ] as never,
      idempotencyKey: `greeter-captcha:${join.id}`,
    });
    await this.prisma.greeterJoinRequest.update({
      where: { id: join.id },
      data: { captchaDeliveryId: queued.id, captchaStartedAt: new Date() },
    });
  }

  private async handleCallback(context: TelegramBotApplicationContext) {
    const callback = context.update.callback_query!;
    const [, token, answer] = (callback.data || '').split(':');
    if (!token || !callback.from?.id) return;
    const join = await this.prisma.greeterJoinRequest.findUnique({
      where: { callbackToken: token },
    });
    if (
      !join ||
      join.workspaceId !== context.bot.workspaceId ||
      join.botIntegrationId !== context.bot.id ||
      join.telegramUserId !== String(callback.from.id) ||
      join.status !== GreeterJoinRequestStatus.PENDING_CAPTCHA ||
      (join.expiredAt && join.expiredAt <= new Date())
    ) {
      await this.botApi.answerCallbackQuery(this.token(context), {
        callback_query_id: callback.id || '',
        text: 'This verification is no longer active.',
      });
      return;
    }
    if (join.environment === GreeterAutomationEnvironment.TEST) {
      const session = await this.testMode?.activeSession(
        context.bot.id,
        join.telegramUserId,
      );
      if (
        !session ||
        session.id !== join.testSessionId ||
        session.generation !== join.testGeneration
      ) {
        await this.botApi.answerCallbackQuery(this.token(context), {
          callback_query_id: callback.id || '',
          text: 'This test was reset or disabled.',
        });
        return;
      }
    }
    if (
      join.captchaAnswer &&
      answer !== this.choiceToken(join.callbackToken, join.captchaAnswer)
    ) {
      await this.prisma.greeterJoinRequest.updateMany({
        where: {
          id: join.id,
          status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
        },
        data: {
          captchaWrongAttempts: { increment: 1 },
          captchaFailedAt: new Date(),
        },
      });
      await this.botApi.answerCallbackQuery(this.token(context), {
        callback_query_id: callback.id || '',
        text: 'Try again.',
      });
      return;
    }
    const approvalOwner = `approval:${randomUUID()}`;
    const claimed = await this.prisma.greeterJoinRequest.updateMany({
      where: {
        id: join.id,
        status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
        expiredAt: { gt: new Date() },
        expiryClaimOwner: null,
      },
      data: {
        captchaPassedAt: new Date(),
        expiryClaimOwner: approvalOwner,
        expiryClaimUntil: new Date(Date.now() + 5 * 60_000),
      },
    });
    if (claimed.count !== 1) {
      await this.botApi.answerCallbackQuery(this.token(context), {
        callback_query_id: callback.id || '',
        text: 'This verification is no longer active.',
      });
      return;
    }
    try {
      await this.approve(context, join.id, approvalOwner);
    } catch (error) {
      await this.prisma.greeterJoinRequest.updateMany({
        where: {
          id: join.id,
          status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
          expiryClaimOwner: approvalOwner,
        },
        data: { expiryClaimOwner: null, expiryClaimUntil: null },
      });
      throw error;
    }
    await this.botApi.answerCallbackQuery(this.token(context), {
      callback_query_id: callback.id || '',
      text: 'Verified.',
    });
  }

  private async approve(
    context: TelegramBotApplicationContext,
    id: string,
    approvalOwner?: string,
  ) {
    const bot = context.bot;
    const join = await this.prisma.greeterJoinRequest.findFirst({
      where: { id, workspaceId: bot.workspaceId, botIntegrationId: bot.id },
      include: {
        channel: true,
        telegramUser: true,
        greeterChannel: { include: { config: true } },
      },
    });
    if (!join || join.status !== GreeterJoinRequestStatus.PENDING_CAPTCHA)
      return;
    if (approvalOwner && join.expiryClaimOwner !== approvalOwner) return;
    const environment =
      join.environment ?? GreeterAutomationEnvironment.PRODUCTION;
    await this.botApi.approveChatJoinRequest(this.token(context), {
      chat_id: join.channel.telegramChatId!,
      user_id: join.telegramUserId,
    });
    const completed = await this.prisma.greeterJoinRequest.updateMany({
      where: {
        id,
        status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
        ...(approvalOwner ? { expiryClaimOwner: approvalOwner } : {}),
      },
      data: {
        status: GreeterJoinRequestStatus.APPROVED,
        approvedAt: new Date(),
        captchaPassedAt: join.captchaPassedAt || new Date(),
        expiryClaimOwner: null,
        expiryClaimUntil: null,
      },
    });
    if (completed.count !== 1) return;
    const config = await this.configuration.effectiveConfig(
      bot.id,
      join.greeterChannel,
      environment,
    );
    if (config.successMessage && join.telegramUser.telegramChatId) {
      const text = renderGreeterTemplate(config.successMessage, {
        channel: join.channel,
        user: join.telegramUser,
      });
      const outcome = await this.delivery.enqueueSendMessage({
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        telegramBotUserId: join.telegramBotUserId,
        chatId: join.telegramUser.telegramChatId,
        text: telegramMarkupToHtml(text),
        parseMode: 'HTML',
        idempotencyKey: `greeter-success:${join.id}`,
      });
      await this.prisma.greeterJoinRequest.update({
        where: { id: join.id },
        data: { outcomeDeliveryId: outcome.id },
      });
    }
    await this.automations.enrollForTrigger({
      workspaceId: bot.workspaceId,
      botIntegrationId: bot.id,
      telegramBotUserId: join.telegramBotUserId,
      trigger: 'AFTER_CAPTCHA_SUCCESS',
      channelId: join.channelId,
      joinRequestId: join.id,
      environment,
      runKey:
        environment === GreeterAutomationEnvironment.TEST
          ? `TEST:${join.testSessionId}:${join.testGeneration}`
          : 'PRODUCTION',
    });
  }
}
