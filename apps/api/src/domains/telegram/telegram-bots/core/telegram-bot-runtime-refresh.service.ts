import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramBotApplicationType,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { publicApiOrigin } from '../../../../config/deployment-config';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotRuntimeCheckService } from './telegram-bot-runtime-check.service';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeRegistryService } from './telegram-bot-runtime-registry.service';
import { TelegramBotRuntimeUserPresentationService } from './telegram-bot-runtime-user-presentation.service';
import { assertSafeTelegramWebhookBase } from './telegram-bot-webhook-url';

type RuntimeWithBot = Prisma.TelegramBotRuntimeInstanceGetPayload<{
  include: { botIntegration: true };
}>;

@Injectable()
export class TelegramBotRuntimeRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botApi: TelegramBotApiClient,
    private readonly presentation: TelegramBotRuntimePresentationService,
    private readonly checks: TelegramBotRuntimeCheckService,
    private readonly registry: TelegramBotRuntimeRegistryService,
    private readonly userPresentation: TelegramBotRuntimeUserPresentationService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async refresh(runtime: RuntimeWithBot, token: string) {
    const expectedWebhook = this.expectedWebhook(runtime);
    if (runtime.runtimeStatus === TelegramBotRuntimeStatus.ACTIVE) {
      await this.presentation.reconcile(
        token,
        runtime.botIntegration.applicationType,
        runtime.botIntegrationId,
      );
      await this.userPresentation.reconcile({
        runtimeId: runtime.id,
        botIntegrationId: runtime.botIntegrationId,
        applicationType: runtime.botIntegration.applicationType,
        token,
      });
    }
    const [identity, webhookInfo, presentation] = await Promise.all([
      this.botApi.getMe(token),
      runtime.runtimeStatus === TelegramBotRuntimeStatus.ACTIVE
        ? this.botApi.getWebhookInfo(token)
        : Promise.resolve(null),
      this.checks.presentation(
        token,
        runtime.botIntegrationId,
        runtime.botIntegration.applicationType ===
          TelegramBotApplicationType.FINANCE,
      ),
    ]);
    let actualUrl = this.webhookUrl(webhookInfo);
    const webhookRepaired = Boolean(
      expectedWebhook &&
      runtime.runtimeStatus === TelegramBotRuntimeStatus.ACTIVE &&
      actualUrl !== expectedWebhook.url,
    );
    if (webhookRepaired && expectedWebhook) {
      await this.botApi.setWebhook(
        token,
        expectedWebhook.url,
        expectedWebhook.secret,
      );
      actualUrl = expectedWebhook.url;
    }
    const configuredWebhookUrl = expectedWebhook?.url ?? runtime.webhookUrl;
    const webhookStatus =
      runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE
        ? TelegramBotWebhookStatus.NOT_CONFIGURED
        : actualUrl === configuredWebhookUrl
          ? TelegramBotWebhookStatus.CONFIGURED
          : actualUrl
            ? TelegramBotWebhookStatus.ERROR
            : TelegramBotWebhookStatus.NOT_CONFIGURED;
    const checked = await this.prisma.telegramBotRuntimeInstance.update({
      where: { id: runtime.id },
      data: {
        botId: String(identity.id),
        username: identity.username || null,
        firstName: identity.first_name || null,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
        webhookStatus,
        ...(webhookRepaired && expectedWebhook
          ? {
              webhookUrl: expectedWebhook.url,
              webhookConfiguredAt: new Date(),
            }
          : {}),
        lastRuntimeError:
          webhookStatus === TelegramBotWebhookStatus.ERROR
            ? 'Telegram is delivering updates to a different webhook URL.'
            : null,
        webAppStatus: presentation.webApp.status,
        webAppUrl: presentation.webApp.url,
        webAppError: presentation.webApp.error,
        miniAppStatus: presentation.miniApp.status,
        miniAppExpectedUrl: presentation.miniApp.expectedUrl,
        miniAppActualUrl: presentation.miniApp.actualUrl,
        miniAppError: presentation.miniApp.error,
      },
    });
    await this.registry.refresh(runtime.id, runtime.environment);
    return checked;
  }

  private webhookUrl(info: Record<string, unknown> | null) {
    return typeof info?.url === 'string' && info.url ? info.url : null;
  }

  private expectedWebhook(runtime: RuntimeWithBot) {
    if (runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE)
      return undefined;
    const base = publicApiOrigin();
    if (!base)
      throw new Error('Telegram bot webhook base URL is not configured');
    assertSafeTelegramWebhookBase(base, runtime.environment);
    if (
      !runtime.webhookSecretEncrypted ||
      !runtime.webhookSecretIv ||
      !runtime.webhookSecretAuthTag
    ) {
      throw new Error('Telegram bot webhook secret is not configured');
    }
    return {
      url: `${base.endsWith('/api') ? base : `${base}/api`}/telegram/bots/runtime/${runtime.id}/webhook`,
      secret: this.encryption.decrypt({
        encrypted: runtime.webhookSecretEncrypted,
        iv: runtime.webhookSecretIv,
        authTag: runtime.webhookSecretAuthTag,
      }),
    };
  }
}
