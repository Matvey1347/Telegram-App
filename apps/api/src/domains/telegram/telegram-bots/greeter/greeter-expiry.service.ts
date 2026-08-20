import { Injectable, Logger } from '@nestjs/common';
import {
  GreeterFailureBehavior,
  GreeterJoinRequestStatus,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { GreeterConfigurationService } from './greeter-configuration.service';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { renderGreeterTemplate } from './greeter-template.renderer';
import { telegramMarkupToHtml } from '../../../../telegram/shared/telegram-markup';
import {
  GREETER_EXPIRY_RETRY_MS,
  greeterExpiryClaimableWhere,
} from '../../../operations/scheduled-tasks/due-work-predicates';

@Injectable()
export class GreeterExpiryService {
  private readonly logger = new Logger(GreeterExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botApi: TelegramBotApiClient,
    private readonly encryption: TokenEncryptionService,
    private readonly configuration: GreeterConfigurationService,
    private readonly delivery: TelegramBotDeliveryService,
  ) {}

  async processDueBatch(limit = 50) {
    const now = new Date();
    const owner = randomUUID();
    const candidates = await this.prisma.greeterJoinRequest.findMany({
      where: greeterExpiryClaimableWhere(now),
      orderBy: { expiredAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    const claimedIds: string[] = [];
    for (const candidate of candidates) {
      const claim = await this.prisma.greeterJoinRequest.updateMany({
        where: {
          id: candidate.id,
          ...greeterExpiryClaimableWhere(now),
        },
        data: {
          expiryClaimOwner: owner,
          expiryClaimUntil: new Date(now.getTime() + 5 * 60_000),
        },
      });
      if (claim.count === 1) claimedIds.push(candidate.id);
    }
    const joins = await this.prisma.greeterJoinRequest.findMany({
      where: { id: { in: claimedIds }, expiryClaimOwner: owner },
      include: {
        botIntegration: {
          include: {
            runtimeInstances: {
              where: {
                environment: TelegramBotRuntimeEnvironment.PRODUCTION,
                runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
              },
              take: 1,
            },
          },
        },
        channel: {
          select: { telegramChatId: true, title: true, username: true },
        },
        telegramUser: true,
        greeterChannel: { include: { config: true } },
      },
    });
    let processed = 0;
    let failed = 0;
    for (const join of joins) {
      try {
        const config = await this.configuration.effectiveConfig(
          join.botIntegrationId,
          join.greeterChannel,
          join.environment,
        );
        const behavior =
          config.failureBehavior ?? GreeterFailureBehavior.KEEP_PENDING;
        if (behavior === GreeterFailureBehavior.DECLINE) {
          if (!join.channel.telegramChatId) {
            throw new Error('Telegram channel chat id is unavailable');
          }
          await this.botApi.declineChatJoinRequest(
            this.encryption.decrypt({
              encrypted:
                join.botIntegration.runtimeInstances[0]?.botTokenEncrypted ||
                '',
              iv: join.botIntegration.runtimeInstances[0]?.botTokenIv || '',
              authTag:
                join.botIntegration.runtimeInstances[0]?.botTokenAuthTag || '',
            }),
            {
              chat_id: join.channel.telegramChatId,
              user_id: join.telegramUserId,
            },
          );
          await this.prisma.greeterJoinRequest.updateMany({
            where: { id: join.id, expiryClaimOwner: owner },
            data: { decisionAppliedAt: new Date(), lastDecisionError: null },
          });
        }
        const completed = await this.prisma.greeterJoinRequest.updateMany({
          where: {
            id: join.id,
            status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
            expiryClaimOwner: owner,
          },
          data: {
            status:
              behavior === GreeterFailureBehavior.DECLINE
                ? GreeterJoinRequestStatus.DECLINED
                : GreeterJoinRequestStatus.EXPIRED,
            declinedAt:
              behavior === GreeterFailureBehavior.DECLINE ? new Date() : null,
            expiryClaimOwner: null,
            expiryClaimUntil: null,
          },
        });
        processed += completed.count;
        if (completed.count === 1) {
          if (config.failureMessage && join.telegramUser.telegramChatId) {
            const text = renderGreeterTemplate(config.failureMessage, {
              channel: join.channel,
              user: join.telegramUser,
            });
            const outcome = await this.delivery.enqueueSendMessage({
              workspaceId: join.workspaceId,
              botIntegrationId: join.botIntegrationId,
              telegramBotUserId: join.telegramBotUserId,
              chatId: join.telegramUser.telegramChatId,
              text: telegramMarkupToHtml(text),
              parseMode: 'HTML',
              idempotencyKey: `greeter-failure:${join.id}`,
            });
            await this.prisma.greeterJoinRequest.update({
              where: { id: join.id },
              data: { outcomeDeliveryId: outcome.id },
            });
          }
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Greeter expiry ${join.id} failed: ${sanitizeOperationalError(error)}`,
        );
        await this.prisma.greeterJoinRequest.updateMany({
          where: { id: join.id, expiryClaimOwner: owner },
          data: {
            expiryClaimOwner: null,
            expiryClaimUntil: new Date(Date.now() + GREETER_EXPIRY_RETRY_MS),
            lastDecisionError: sanitizeOperationalError(error),
          },
        });
      }
    }
    return { claimed: joins.length, processed, failed };
  }
}
