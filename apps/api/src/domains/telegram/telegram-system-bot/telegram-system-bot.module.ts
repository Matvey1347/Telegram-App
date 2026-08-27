import { Module } from '@nestjs/common';
import { DashboardModule } from '../../operations/dashboard/dashboard.module';
import { ScheduledTasksModule } from '../../operations/scheduled-tasks/scheduled-tasks.module';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSyncModule } from '../telegram-sync/telegram-sync.module';
import { TransactionsModule } from '../../finance/transactions/transactions.module';
import { AccountsModule } from '../../finance/accounts/accounts.module';
import { TransfersModule } from '../../finance/transfers/transfers.module';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { TelegramSystemBotConnectionsService } from './telegram-system-bot-connections.service';
import { TelegramSystemBotController } from './telegram-system-bot.controller';
import { TelegramSystemBotDomainGatewayService } from './telegram-system-bot-domain-gateway.service';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';
import { TelegramSystemBotNotificationsService } from './telegram-system-bot-notifications.service';
import { TelegramSystemBotRuntimeService } from './telegram-system-bot-runtime.service';
import { TelegramSystemBotFinanceService } from './telegram-system-bot-finance.service';
import { TelegramSystemBotFinanceHandlerService } from './telegram-system-bot-finance-handler.service';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramAdSalesModule } from '../telegram-ad-sales/telegram-ad-sales.module';
import { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';
import { TelegramSystemBotPostFlowService } from './telegram-system-bot-post-flow.service';
import { TelegramSystemBotAdSaleFlowService } from './telegram-system-bot-ad-sale-flow.service';
import { TelegramSystemBotChannelAccessService } from './telegram-system-bot-channel-access.service';
import { TelegramSystemBotPostsService } from './telegram-system-bot-posts.service';
import { TelegramSystemBotPostContentService } from './telegram-system-bot-post-content.service';
import { TelegramSystemBotPostFlowOptions } from './telegram-system-bot-post-flow.options';
import { TelegramBotIconCaptureService } from '../../../telegram/shared/telegram-bot-icon-capture.service';
import { TelegramSystemBotWorkspaceFlowService } from './telegram-system-bot-workspace-flow.service';

@Module({
  imports: [
    DashboardModule,
    TelegramSyncModule,
    TransactionsModule,
    AccountsModule,
    TransfersModule,
    ScheduledTasksModule,
    TelegramChannelsModule,
    TelegramAdSalesModule,
  ],
  controllers: [TelegramSystemBotController],
  providers: [
    TelegramBotApiClient,
    TelegramSystemBotConfigService,
    TelegramSystemBotConnectionsService,
    TelegramSystemBotDomainGatewayService,
    TelegramSystemBotHandlerService,
    TelegramSystemBotRuntimeService,
    TelegramSystemBotNotificationsService,
    TelegramSystemBotFinanceService,
    TelegramSystemBotFinanceHandlerService,
    TelegramSystemBotWorkflowStore,
    TelegramSystemBotPostFlowService,
    TelegramSystemBotAdSaleFlowService,
    TelegramSystemBotChannelAccessService,
    TelegramSystemBotPostsService,
    TelegramSystemBotPostContentService,
    TelegramSystemBotPostFlowOptions,
    TelegramBotIconCaptureService,
    TelegramSystemBotWorkspaceFlowService,
  ],
  exports: [TelegramSystemBotNotificationsService],
})
export class TelegramSystemBotModule {}
