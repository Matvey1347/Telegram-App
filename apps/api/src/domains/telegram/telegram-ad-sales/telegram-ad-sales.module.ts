import { Module } from '@nestjs/common';
import { ApplicationLogsModule } from '../../operations/application-logs/application-logs.module';
import { FinanceCategoriesModule } from '../../finance/finance-categories/finance-categories.module';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramChannelNetworksModule } from '../telegram-channel-networks/telegram-channel-networks.module';
import { TelegramAdSalesBulkService } from './telegram-ad-sales-bulk.service';
import { TelegramAdSalesCheckoutService } from './telegram-ad-sales-checkout.service';
import { TelegramAdSalesCrmAdvertisersService } from './telegram-ad-sales-crm-advertisers.service';
import { TelegramAdSalesCrmSettingsService } from './telegram-ad-sales-crm-settings.service';
import { TelegramAdSalesController } from './telegram-ad-sales.controller';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { TelegramAdPlacementLifecycleService } from './telegram-ad-placement-lifecycle.service';
import { TelegramAdSalesBotCommandService } from './telegram-ad-sales-bot-command.service';
import { TelegramAdSalesBotCommandExecutorService } from './telegram-ad-sales-bot-command-executor.service';
import { TelegramAdSalesBotDeletionPreflightService } from './telegram-ad-sales-bot-deletion-preflight.service';
import { TelegramAdSalesBotExistingPlacementService } from './telegram-ad-sales-bot-existing-placement.service';
import { TelegramAdSalesBotReservationService } from './telegram-ad-sales-bot-reservation.service';
import { TelegramAdSalesBotTargetsService } from './telegram-ad-sales-bot-targets.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramAdSalesPlacementOptionsService } from './telegram-ad-sales-placement-options.service';

@Module({
  imports: [
    TelegramChannelsModule,
    TelegramChannelNetworksModule,
    ApplicationLogsModule,
    FinanceCategoriesModule,
  ],
  controllers: [TelegramAdSalesController],
  providers: [
    TelegramAdSalesService,
    TelegramAdSalesBulkService,
    TelegramAdSalesCheckoutService,
    TelegramAdSalesCrmAdvertisersService,
    TelegramAdSalesCrmSettingsService,
    TelegramAdPlacementLifecycleService,
    TelegramAdSalesBotCommandService,
    TelegramAdSalesBotCommandExecutorService,
    TelegramAdSalesBotDeletionPreflightService,
    TelegramAdSalesBotExistingPlacementService,
    TelegramAdSalesBotReservationService,
    TelegramAdSalesBotTargetsService,
    TelegramAdSalesPlacementOptionsService,
    TelegramBotApiClient,
  ],
  exports: [
    TelegramAdSalesService,
    TelegramAdPlacementLifecycleService,
    TelegramAdSalesBotCommandService,
    TelegramAdSalesBotTargetsService,
    TelegramAdSalesPlacementOptionsService,
  ],
})
export class TelegramAdSalesModule {}
