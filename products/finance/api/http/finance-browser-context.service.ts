import { Injectable, NotFoundException } from "@nestjs/common";
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeStatus,
} from "@prisma/client";
import { PrismaService } from "@api/prisma/prisma.service";
import { FinanceConsumerRuntimeEnvironmentService } from "@consumer-finance/api/identity/finance-consumer-runtime-environment.service";

@Injectable()
export class FinanceBrowserContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly environments: FinanceConsumerRuntimeEnvironmentService,
  ) {}

  async resolve() {
    const environment = this.environments.current();
    if (!environment) {
      throw new NotFoundException(
        "Finance bot runtime is not enabled in this process",
      );
    }
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        applicationType: TelegramBotApplicationType.FINANCE,
        isActive: true,
        runtimeInstances: {
          some: {
            environment,
            ...(environment === "LOCAL"
              ? {}
              : { runtimeStatus: TelegramBotRuntimeStatus.ACTIVE }),
          },
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!bot) throw new NotFoundException("Active Finance bot not found");
    return { financeBotId: bot.id };
  }
}
