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
import { TelegramAdSalesReadController } from './telegram-ad-sales-read.controller';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { TelegramAdSalesQuotePreviewService } from './telegram-ad-sales-quote-preview.service';
import { TelegramAdSalesSaleReadService } from './telegram-ad-sales-sale-read.service';
import { TelegramAdPlacementLifecycleService } from './telegram-ad-placement-lifecycle.service';
import { TelegramAdSalesBotCommandService } from './telegram-ad-sales-bot-command.service';
import { TelegramAdSalesBotCommandExecutorService } from './telegram-ad-sales-bot-command-executor.service';
import { TelegramAdSalesBotDeletionPreflightService } from './telegram-ad-sales-bot-deletion-preflight.service';
import { TelegramAdSalesBotExistingPlacementService } from './telegram-ad-sales-bot-existing-placement.service';
import { TelegramAdSalesBotReservationService } from './telegram-ad-sales-bot-reservation.service';
import { TelegramAdSalesBotTargetsService } from './telegram-ad-sales-bot-targets.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramAdSalesPlacementOptionsService } from './telegram-ad-sales-placement-options.service';
import { TelegramAdvertiserCheckoutResolverService } from './telegram-advertiser-checkout-resolver.service';
import { TelegramCrmModule } from '../telegram-crm/telegram-crm.module';
import { TelegramAdSalesLegacyCrmService } from './telegram-ad-sales-legacy-crm.service';
import { TelegramAdSalesCustomerAutomationFactsService } from './telegram-ad-sales-customer-automation-facts.service';

@Module({
  imports: [
    TelegramChannelsModule,
    TelegramChannelNetworksModule,
    ApplicationLogsModule,
    FinanceCategoriesModule,
    TelegramCrmModule,
  ],
  controllers: [TelegramAdSalesReadController, TelegramAdSalesController],
  providers: [
    TelegramAdSalesService,
    TelegramAdSalesQuotePreviewService,
    TelegramAdSalesSaleReadService,
    TelegramAdSalesBulkService,
    TelegramAdSalesCheckoutService,
    TelegramAdSalesCrmAdvertisersService,
    TelegramAdSalesCrmSettingsService,
    TelegramAdSalesLegacyCrmService,
    TelegramAdPlacementLifecycleService,
    TelegramAdSalesBotCommandService,
    TelegramAdSalesBotCommandExecutorService,
    TelegramAdSalesBotDeletionPreflightService,
    TelegramAdSalesBotExistingPlacementService,
    TelegramAdSalesBotReservationService,
    TelegramAdSalesBotTargetsService,
    TelegramAdSalesPlacementOptionsService,
    TelegramAdvertiserCheckoutResolverService,
    TelegramBotApiClient,
    TelegramAdSalesCustomerAutomationFactsService,
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
