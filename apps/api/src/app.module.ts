import { APP_INTERCEPTOR } from '@nestjs/core';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './domains/finance/accounts/accounts.module';
import { AdCampaignsModule } from './domains/growth/ad-campaigns/ad-campaigns.module';
import { AdHypothesesModule } from './domains/growth/ad-hypotheses/ad-hypotheses.module';
import { AdvertisingSourcesModule } from './domains/growth/advertising-sources/advertising-sources.module';
import { AppController } from './app.controller';
import { AuthModule } from './domains/identity/auth/auth.module';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './domains/operations/dashboard/dashboard.module';
import { ExchangeRatesModule } from './domains/finance/exchange-rates/exchange-rates.module';
import { CurrenciesModule } from './domains/finance/currencies/currencies.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromosModule } from './domains/growth/promos/promos.module';
import { TelegramChannelsModule } from './domains/telegram/telegram-channels/telegram-channels.module';
import { TelegramChannelNetworksModule } from './domains/telegram/telegram-channel-networks/telegram-channel-networks.module';
import { TransactionsModule } from './domains/finance/transactions/transactions.module';
import { TransfersModule } from './domains/finance/transfers/transfers.module';
import { FinanceCategoriesModule } from './domains/finance/finance-categories/finance-categories.module';
import { GlobalSearchModule } from './domains/operations/global-search/global-search.module';
import { WorkspaceMembersModule } from './domains/workspace/workspace-members/workspace-members.module';
import { AccountModule } from './domains/identity/account/account.module';
import { TelegramSyncModule } from './domains/telegram/telegram-sync/telegram-sync.module';
import { TelegramUserAccountsModule } from './domains/telegram/telegram-user-accounts/telegram-user-accounts.module';
import { TelegramBotsModule } from './domains/telegram/telegram-bots/telegram-bots.module';
import { WorkspacesModule } from './domains/workspace/workspaces/workspaces.module';
import { IconsModule } from './domains/operations/icons/icons.module';
import { ResponseCacheInterceptor } from './common/response-cache.interceptor';
import { PromptNotesModule } from './domains/operations/prompt-notes/prompt-notes.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';
import { ApplicationLogsModule } from './domains/operations/application-logs/application-logs.module';
import { StreamModule } from './common/stream/stream.module';
import { TelegramAdSalesModule } from './domains/telegram/telegram-ad-sales/telegram-ad-sales.module';
import { ScheduledTasksModule } from './domains/operations/scheduled-tasks/scheduled-tasks.module';
import { TelegramSystemBotModule } from './domains/telegram/telegram-system-bot/telegram-system-bot.module';
import { BotBillingModule } from './domains/telegram/bot-billing/bot-billing.module';
import { TelegramCustomEmojiModule } from './domains/telegram/telegram-custom-emoji/telegram-custom-emoji.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    RequestContextModule,
    StreamModule,
    PrismaModule,
    CommonModule,
    ApplicationLogsModule,
    AuthModule,
    AccountsModule,
    ExchangeRatesModule,
    CurrenciesModule,
    TransactionsModule,
    TransfersModule,
    TelegramChannelsModule,
    TelegramChannelNetworksModule,
    PromosModule,
    AdvertisingSourcesModule,
    AdCampaignsModule,
    AdHypothesesModule,
    DashboardModule,
    GlobalSearchModule,
    FinanceCategoriesModule,
    WorkspaceMembersModule,
    AccountModule,
    TelegramSyncModule,
    TelegramUserAccountsModule,
    TelegramBotsModule,
    WorkspacesModule,
    IconsModule,
    PromptNotesModule,
    TelegramAdSalesModule,
    ScheduledTasksModule,
    TelegramSystemBotModule,
    BotBillingModule,
    TelegramCustomEmojiModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ResponseCacheInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
