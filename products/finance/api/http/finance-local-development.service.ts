import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from "@prisma/client";
import { timingSafeEqual } from "crypto";
import { PrismaService } from "@api/prisma/prisma.service";
import { deploymentValue } from "@api/config/deployment-config";
import { TelegramBotRuntimeService } from "@api/domains/telegram/telegram-bots/core/telegram-bot-runtime.service";
import { FinanceConsumerRuntimeEnvironmentService } from "@consumer-finance/api/identity/finance-consumer-runtime-environment.service";

/** Bounded LOCAL-only credential sync before the dev runtime is activated. */
@Injectable()
export class FinanceLocalDevelopmentService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly runtime: TelegramBotRuntimeService,
    private readonly environments: FinanceConsumerRuntimeEnvironmentService,
  ) {}

  async synchronize(secret: string | undefined) {
    this.assertAuthorized(secret);
    const token = this.config.get<string>("FINANCE_BOT_LOCAL_TOKEN")?.trim();
    const username = this.config
      .get<string>("FINANCE_BOT_LOCAL_USERNAME")
      ?.trim()
      .replace(/^@/u, "")
      .toLowerCase();
    if (!token || !username) {
      throw new NotFoundException(
        "Finance LOCAL bot credentials are unavailable",
      );
    }
    const integrations = await this.prisma.telegramBotIntegration.findMany({
      where: {
        applicationType: TelegramBotApplicationType.FINANCE,
        isActive: true,
      },
      select: {
        id: true,
        runtimeInstances: {
          select: { environment: true },
        },
      },
      take: 3,
    });
    // The logical consumer Finance bot is the one already serving production.
    // Its LOCAL token is intentionally replaceable: the username in a prior
    // LOCAL runtime is historical state, not a selector for today's dev bot.
    const productionBacked = integrations.filter((integration) =>
      integration.runtimeInstances.some(
        (runtime) =>
          runtime.environment === TelegramBotRuntimeEnvironment.PRODUCTION,
      ),
    );
    let integration =
      productionBacked.length === 1
        ? productionBacked[0]
        : integrations.length === 1
          ? integrations[0]
          : null;
    if (!integration && integrations.length === 0) {
      const workspaceId = this.config
        .get<string>("FINANCE_BOT_DASHBOARD_WORKSPACE_ID")
        ?.trim();
      if (!workspaceId) {
        throw new NotFoundException(
          "Finance dashboard workspace is not configured for LOCAL development",
        );
      }
      integration = await this.prisma.telegramBotIntegration.create({
        data: {
          workspaceId,
          label: "Groshly",
          isActive: true,
          applicationType: TelegramBotApplicationType.FINANCE,
        },
        select: {
          id: true,
          runtimeInstances: { select: { environment: true } },
        },
      });
    }
    if (!integration) {
      throw new NotFoundException(
        "Exactly one production-backed Finance integration must be configured for LOCAL development",
      );
    }
    const runtime = await this.runtime.configureRuntime({
      botIntegrationId: integration.id,
      environment: TelegramBotRuntimeEnvironment.LOCAL,
      token,
    });
    return { username: runtime.username, synchronized: true };
  }

  private assertAuthorized(secret: string | undefined) {
    if (this.environments.current() !== TelegramBotRuntimeEnvironment.LOCAL) {
      throw new ForbiddenException("LOCAL Finance runtime is not selected");
    }
    const expected = deploymentValue("LOCAL_DEV_BOTS_CONTROL_SECRET");
    if (!expected || !secret)
      throw new ForbiddenException("Invalid dev control secret");
    const actualBytes = Buffer.from(secret);
    const expectedBytes = Buffer.from(expected);
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw new ForbiddenException("Invalid dev control secret");
    }
  }
}
