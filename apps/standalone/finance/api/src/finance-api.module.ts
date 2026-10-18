import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import {
  FinanceRuntimeConfig,
  validateFinanceEnvironment,
} from "./config/finance-runtime-config";
import { FinanceHealthController } from "./health/finance-health.controller";
import { FinanceAuthController } from "./identity/finance-auth.controller";
import { FinanceAuthService } from "./identity/finance-auth.service";
import { FinanceSessionService } from "./identity/finance-session.service";
import { FinanceLedgerController } from "./ledger/finance-ledger.controller";
import { FinanceLedgerService } from "./ledger/finance-ledger.service";
import { FinancePrismaService } from "./prisma/finance-prisma.service";
import { FinanceTelegramWebhookController } from "./telegram/finance-telegram-webhook.controller";
import { FinanceTelegramWebhookService } from "./telegram/finance-telegram-webhook.service";
import { FinancePrimaryBotService } from "./telegram/finance-primary-bot.service";
import { FinanceContextController } from "./telegram/finance-context.controller";
import { FinanceTelegramBotApiClient } from "./telegram/finance-telegram-bot-api.client";
import { FinanceTelegramRuntimeService } from "./telegram/finance-telegram-runtime.service";
import { FinanceAdminAnalyticsController } from "./admin/finance-admin-analytics.controller";
import { FinanceAdminAnalyticsService } from "./admin/finance-admin-analytics.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Finance owns one product-local profile. Railway injects variables into
      // process.env, while local hosts read products/finance/.env.local.
      envFilePath: [
        resolve(
          __dirname,
          "..",
          "..",
          "..",
          "..",
          "products",
          "finance",
          ".env.local",
        ),
        resolve(
          __dirname,
          "..",
          "..",
          "..",
          "..",
          "products",
          "finance",
          ".env",
        ),
      ],
      validate: validateFinanceEnvironment,
    }),
  ],
  controllers: [
    FinanceHealthController,
    FinanceTelegramWebhookController,
    FinanceContextController,
    FinanceAuthController,
    FinanceLedgerController,
    FinanceAdminAnalyticsController,
  ],
  providers: [
    FinanceRuntimeConfig,
    FinancePrismaService,
    FinanceTelegramWebhookService,
    FinancePrimaryBotService,
    FinanceTelegramBotApiClient,
    FinanceTelegramRuntimeService,
    FinanceSessionService,
    FinanceAuthService,
    FinanceLedgerService,
    FinanceAdminAnalyticsService,
  ],
})
export class FinanceApiModule {}
