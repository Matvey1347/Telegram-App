import { Module } from '@nestjs/common';
import { BotBillingController } from './bot-billing.controller';
import { BotBillingService } from './bot-billing.service';
import { BotEntitlementsService } from './bot-entitlements.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeBillingProvider } from './stripe-billing.provider';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { BotBillingAnalyticsService } from './bot-billing-analytics.service';

@Module({ controllers: [BotBillingController, StripeWebhookController], providers: [BotBillingService, BotBillingAnalyticsService, BotEntitlementsService, StripeWebhookService, StripeBillingProvider, TelegramBotApiClient], exports: [BotEntitlementsService, BotBillingAnalyticsService, BotBillingService] })
export class BotBillingModule {}
