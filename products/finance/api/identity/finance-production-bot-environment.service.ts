import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@api/prisma/prisma.service";
import { isProductionEnvironment } from "@api/config/deployment-config";
import { TokenEncryptionService } from "@api/common/security/token-encryption.service";
import { TelegramBotApiClient } from "@api/telegram/shared/bot/telegram-bot-api.client";
import type { TelegramBotRuntimeService } from "@api/domains/telegram/telegram-bots/core/telegram-bot-runtime.service";
import { TelegramBotRuntimeEnvironmentService } from "@api/domains/telegram/telegram-bots/core/telegram-bot-runtime-environment.service";

export const RESOLVE_FINANCE_PRODUCTION_RUNTIME = Symbol("RESOLVE_FINANCE_PRODUCTION_RUNTIME");

@Injectable()
export class FinanceProductionBotEnvironmentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(
    FinanceProductionBotEnvironmentService.name,
  );

  constructor(
    private readonly config: ConfigService,
    private readonly db: PrismaService,
    private readonly telegram: TelegramBotApiClient,
    @Inject(RESOLVE_FINANCE_PRODUCTION_RUNTIME)
    private readonly resolveRuntime: () => Promise<TelegramBotRuntimeService>,
    private readonly runtimeEnvironment: TelegramBotRuntimeEnvironmentService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  onApplicationBootstrap() {
    if (
      !isProductionEnvironment() ||
      !this.runtimeEnvironment.owns("PRODUCTION")
    )
      return;
    void this.synchronize().catch(() =>
      this.logger.warn("Could not reconcile Groshly production bot from ENV"),
    );
  }

  private async synchronize() {
    const workspaceId = this.config
      .get<string>("FINANCE_BOT_DASHBOARD_WORKSPACE_ID")
      ?.trim();
    const token = this.config
      .get<string>("FINANCE_BOT_PRODUCTION_TOKEN")
      ?.trim();
    const username = this.config
      .get<string>("FINANCE_BOT_PRODUCTION_USERNAME")
      ?.trim()
      .replace(/^@/, "");
    if (!workspaceId || !token || !username) return;
    const integrations = await this.db.telegramBotIntegration.findMany({
      where: { workspaceId, applicationType: "FINANCE", isActive: true },
      select: {
        id: true,
        runtimeInstances: {
          where: { environment: "PRODUCTION" },
          select: {
            id: true,
            botId: true,
            runtimeStatus: true,
            botTokenEncrypted: true,
            botTokenIv: true,
            botTokenAuthTag: true,
          },
        },
      },
      take: 2,
    });
    if (integrations.length !== 1)
      throw new Error("Expected one managed Groshly integration");
    const [bot] = integrations;
    const [current] = bot.runtimeInstances;
    if (current?.runtimeStatus === "STARTING") return;
    if (
      current?.runtimeStatus === "ACTIVE" &&
      this.encryption.decrypt({
        encrypted: current.botTokenEncrypted,
        iv: current.botTokenIv,
        authTag: current.botTokenAuthTag,
      }) === token
    ) return;
    // The dispatcher depends on request-scoped services. Resolve the runtime
    // only for rotation so its scope cannot suppress this startup hook.
    const runtime = await this.resolveRuntime();
    const identity = await this.telegram.getMe(token);
    if (
      identity.username?.toLowerCase() !== username.toLowerCase() ||
      (current && current.botId !== String(identity.id))
    )
      throw new Error(
        "Configured Groshly identity does not match the saved runtime",
      );
    const webhook = await this.telegram.getWebhookInfo(token);
    const existingUrl = current && runtime.webhookUrlFor(current.id, "PRODUCTION");
    if (webhook.url && webhook.url !== existingUrl)
      throw new Error("Configured Groshly bot already has a webhook owner");
    const input = {
      botIntegrationId: bot.id,
      environment: "PRODUCTION" as const,
    };
    await runtime.configureRuntime({ ...input, token });
    await runtime.enableRuntime(input);
    this.logger.log("Groshly production bot credential reconciled");
  }
}
