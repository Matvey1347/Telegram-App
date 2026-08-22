import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { deploymentValue } from '../../../../config/deployment-config';
import { timingSafeEqual } from 'node:crypto';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { telegramBotMessagePayload } from '../../../../telegram/shared/telegram-bot-message';
import { TelegramBotRuntimeEnvironmentService } from './telegram-bot-runtime-environment.service';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeRegistryService } from './telegram-bot-runtime-registry.service';
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service';

/**
 * Bounded LOCAL-only lifecycle invoked by dev:bots. It performs no recurring
 * work: one explicit activation and one explicit cleanup request.
 */
@Injectable()
export class TelegramBotLocalDevelopmentService {
  private readonly logger = new Logger(TelegramBotLocalDevelopmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly botApi: TelegramBotApiClient,
    private readonly environment: TelegramBotRuntimeEnvironmentService,
    private readonly presentation: TelegramBotRuntimePresentationService,
    private readonly registry: TelegramBotRuntimeRegistryService,
    private readonly runtime: TelegramBotRuntimeService,
  ) {}

  async start(secret: string | undefined) {
    this.assertAuthorized(secret);
    await this.runtime.reconcileLocalDevelopment();
    await this.refreshChangedFinanceKeyboards();
    return { started: true };
  }

  async stop(secret: string | undefined) {
    this.assertAuthorized(secret);
    const runtimes = await this.prisma.telegramBotRuntimeInstance.findMany({
      where: {
        environment: TelegramBotRuntimeEnvironment.LOCAL,
        runtimeStatus: { not: TelegramBotRuntimeStatus.DISABLED },
      },
      include: {
        botIntegration: true,
        users: {
          where: { blockedAt: null, telegramChatId: { not: null } },
          select: {
            id: true,
            telegramChatId: true,
            languageCode: true,
            localLifecycleMessageId: true,
            financeProfiles: { take: 1, select: { locale: true } },
          },
        },
      },
    });
    const results: Array<{ id: string; telegramCleanupFailed: boolean }> = [];
    for (const runtime of runtimes) {
      const token = this.decryptToken(runtime);
      let telegramCleanupFailed = false;
      if (
        runtime.botIntegration.applicationType ===
        TelegramBotApplicationType.FINANCE
      ) {
        const financePresentation = this.financePresentation();
        await this.forEachUser(runtime.users, async (user) => {
          const locale = financePresentation.resolveLocale(
            user.financeProfiles[0]?.locale ?? null,
            user.languageCode,
          );
          const lifecycle = financePresentation.localLifecycle!(
            'stopped',
            runtime.botIntegrationId,
            locale,
          );
          await Promise.all([
            this.replaceLifecycleMessage(
              token,
              user,
              telegramBotMessagePayload(user.telegramChatId!, {
                text: lifecycle.text,
                removeReplyKeyboard: true,
              }),
            ),
            this.botApi.setChatMenuButton(
              token,
              { type: 'commands' },
              user.telegramChatId!,
            ),
          ]);
        });
      }
      for (const operation of [
        () =>
          this.presentation.reconcile(
            token,
            TelegramBotApplicationType.NONE,
            runtime.botIntegrationId,
          ),
        () => this.botApi.deleteWebhook(token),
      ]) {
        try {
          await operation();
        } catch (error) {
          telegramCleanupFailed = true;
          this.logger.warn(
            `LOCAL runtime cleanup failed for ${runtime.id}: ${sanitizeOperationalError(error)}`,
          );
        }
      }
      await this.prisma.telegramBotRuntimeInstance.update({
        where: { id: runtime.id },
        data: {
          runtimeStatus: TelegramBotRuntimeStatus.DISABLED,
          webhookStatus: telegramCleanupFailed
            ? TelegramBotWebhookStatus.ERROR
            : TelegramBotWebhookStatus.NOT_CONFIGURED,
          webhookUrl: telegramCleanupFailed ? runtime.webhookUrl : null,
          webhookSecretEncrypted: null,
          webhookSecretIv: null,
          webhookSecretAuthTag: null,
          webhookConfiguredAt: null,
          pendingWebhookUrl: null,
          pendingWebhookSecretEncrypted: null,
          pendingWebhookSecretIv: null,
          pendingWebhookSecretAuthTag: null,
          runtimeTransitionStartedAt: null,
          lastRuntimeError: telegramCleanupFailed
            ? 'LOCAL Telegram cleanup was incomplete during dev shutdown.'
            : null,
          webAppStatus: 'NOT_CONFIGURED',
          webAppUrl: null,
          webAppError: null,
          miniAppStatus: 'NOT_CONFIGURED',
          miniAppExpectedUrl: null,
          miniAppActualUrl: null,
          miniAppError: null,
        },
      });
      this.registry.invalidate(runtime.id);
      results.push({ id: runtime.id, telegramCleanupFailed });
    }
    return { stopped: results.length, runtimes: results };
  }

  private async refreshChangedFinanceKeyboards() {
    const financePresentation = this.financePresentation();
    if (!financePresentation.localDevelopmentActive!()) return;
    const runtimes = await this.prisma.telegramBotRuntimeInstance.findMany({
      where: {
        environment: TelegramBotRuntimeEnvironment.LOCAL,
        runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
        lastRuntimeError: null,
        botIntegration: {
          isActive: true,
          applicationType: TelegramBotApplicationType.FINANCE,
        },
      },
      include: {
        users: {
          where: { blockedAt: null, telegramChatId: { not: null } },
          select: {
            id: true,
            telegramChatId: true,
            languageCode: true,
            localLifecycleMessageId: true,
            financeProfiles: { take: 1, select: { locale: true } },
          },
        },
      },
    });
    for (const runtime of runtimes) {
      const expectedUrl = financePresentation.miniAppUrl(
        runtime.botIntegrationId,
      );
      if (!expectedUrl || runtime.miniAppExpectedUrl === expectedUrl) continue;
      const token = this.decryptToken(runtime);
      await this.forEachUser(runtime.users, async (user) => {
        const locale = financePresentation.resolveLocale(
          user.financeProfiles[0]?.locale ?? null,
          user.languageCode,
        );
        const lifecycle = financePresentation.localLifecycle!(
          'started',
          runtime.botIntegrationId,
          locale,
        );
        await Promise.all([
          this.replaceLifecycleMessage(
            token,
            user,
            telegramBotMessagePayload(user.telegramChatId!, {
              text: lifecycle.text,
              replyKeyboard: lifecycle.replyKeyboard,
            }),
          ),
          this.botApi.setChatMenuButton(
            token,
            financePresentation.menuButton(runtime.botIntegrationId, locale),
            user.telegramChatId!,
          ),
        ]);
      });
      await this.prisma.telegramBotRuntimeInstance.update({
        where: { id: runtime.id },
        data: {
          miniAppStatus: 'CONFIGURED',
          miniAppExpectedUrl: expectedUrl,
          miniAppActualUrl: expectedUrl,
          miniAppError: null,
        },
      });
      await this.registry.refresh(
        runtime.id,
        TelegramBotRuntimeEnvironment.LOCAL,
      );
    }
  }

  private async forEachUser<T>(
    users: T[],
    action: (user: T) => Promise<unknown>,
  ) {
    for (let index = 0; index < users.length; index += 10) {
      const batch = users.slice(index, index + 10);
      const outcomes = await Promise.allSettled(batch.map(action));
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          this.logger.warn(
            `Unable to refresh a LOCAL Finance keyboard: ${sanitizeOperationalError(outcome.reason)}`,
          );
        }
      }
    }
  }

  private financePresentation() {
    const presentation = this.presentation.application(
      TelegramBotApplicationType.FINANCE,
    );
    if (!presentation?.localDevelopmentActive || !presentation.localLifecycle) {
      throw new Error('Finance local presentation is not registered');
    }
    return presentation;
  }

  private async replaceLifecycleMessage(
    token: string,
    user: {
      id: string;
      telegramChatId: string | null;
      localLifecycleMessageId: number | null;
    },
    payload: { chat_id: string; text: string; reply_markup?: unknown },
  ) {
    if (user.localLifecycleMessageId) {
      try {
        await this.botApi.deleteMessage(token, {
          chat_id: payload.chat_id,
          message_id: user.localLifecycleMessageId,
        });
      } catch (error) {
        this.logger.warn(
          `Unable to replace a LOCAL Finance status message: ${sanitizeOperationalError(error)}`,
        );
      }
    }
    const message = await this.botApi.sendMessage(token, payload);
    await this.prisma.telegramBotUser.update({
      where: { id: user.id },
      data: { localLifecycleMessageId: message.message_id },
    });
  }

  private assertAuthorized(secret: string | undefined) {
    if (this.environment.current() !== TelegramBotRuntimeEnvironment.LOCAL) {
      throw new ForbiddenException('LOCAL Telegram runtime is not selected');
    }
    const expected = deploymentValue('LOCAL_DEV_BOTS_CONTROL_SECRET');
    if (!expected || !secret)
      throw new ForbiddenException('Invalid dev control secret');
    const actualBuffer = Buffer.from(secret);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid dev control secret');
    }
  }

  private decryptToken(runtime: {
    botTokenEncrypted: string;
    botTokenIv: string;
    botTokenAuthTag: string;
  }) {
    return this.encryption.decrypt({
      encrypted: runtime.botTokenEncrypted,
      iv: runtime.botTokenIv,
      authTag: runtime.botTokenAuthTag,
    });
  }
}
