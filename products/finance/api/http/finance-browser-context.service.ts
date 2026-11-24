import { Injectable, NotFoundException } from "@nestjs/common";
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeStatus,
} from "@prisma/client";
import type { ConsumerFinanceBrowserContext } from "@telegram-system/shared";
import { SupportBotsService } from "@api/domains/telegram/telegram-support/support-bots.service";
import { PrismaService } from "@api/prisma/prisma.service";
import { FinanceConsumerRuntimeEnvironmentService } from "@consumer-finance/api/identity/finance-consumer-runtime-environment.service";

@Injectable()
export class FinanceBrowserContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly environments: FinanceConsumerRuntimeEnvironmentService,
    private readonly supportBots: SupportBotsService,
  ) {}

  async resolve(): Promise<ConsumerFinanceBrowserContext> {
    const environment = this.environments.current();
    if (!environment) {
      throw new NotFoundException(
        "Finance bot runtime is not enabled in this process",
      );
    }
    const localUsername =
      environment === "LOCAL"
        ? this.environments.browserLoginBotUsername()
        : null;
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        applicationType: TelegramBotApplicationType.FINANCE,
        isActive: true,
        runtimeInstances: {
          some: {
            environment,
            ...(localUsername
              ? { username: { equals: localUsername, mode: "insensitive" } }
              : {}),
            ...(environment === "LOCAL"
              ? {}
              : { runtimeStatus: TelegramBotRuntimeStatus.ACTIVE }),
          },
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, workspaceId: true },
    });
    if (!bot) throw new NotFoundException("Active Finance bot not found");
    const supportBotUsername = this.supportBots.publicUsername(
      "GROSHLY",
      bot.workspaceId,
    );
    return {
      financeBotId: bot.id,
      ...(supportBotUsername ? { supportBotUsername } : {}),
    };
  }
}
