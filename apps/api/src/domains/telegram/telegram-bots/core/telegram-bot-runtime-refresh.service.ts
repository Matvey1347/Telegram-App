import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramBotApplicationType,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotRuntimeCheckService } from './telegram-bot-runtime-check.service';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeRegistryService } from './telegram-bot-runtime-registry.service';
import { TelegramBotRuntimeUserPresentationService } from './telegram-bot-runtime-user-presentation.service';

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
  ) {}

  async refresh(runtime: RuntimeWithBot, token: string) {
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
    const actualUrl = this.webhookUrl(webhookInfo);
    const webhookStatus =
      runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE
        ? TelegramBotWebhookStatus.NOT_CONFIGURED
        : actualUrl === runtime.webhookUrl
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
}
