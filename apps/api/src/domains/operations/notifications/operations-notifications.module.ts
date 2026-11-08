import { ChannelReminderDeliveryService } from './channel-reminder-delivery.service';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from '../../telegram/telegram-system-bot/telegram-system-bot-config.service';
import { Module } from '@nestjs/common';
import { OperationsNotificationDueService } from './operations-notification-due.service';
import { OperationsNotificationEventHub } from './operations-notification-event-hub.service';
import { OperationsNotificationPermissionService } from './operations-notification-permission.service';
import { OperationsNotificationPublisherService } from './operations-notification-publisher.service';
import { OperationsNotificationStoreService } from './operations-notification-store.service';
import { OperationsNotificationsController } from './operations-notifications.controller';
import { OperationsNotificationsService } from './operations-notifications.service';
import { OperationsWebPushConfigService } from './operations-web-push-config.service';
import { OperationsWebPushService } from './operations-web-push.service';
import { OperationsNotificationDueResolutionService } from './operations-notification-due-resolution.service';
import { OperationsNotificationDeliveryPolicyService } from './operations-notification-delivery-policy.service';
import { OperationsNotificationPreferencesService } from './operations-notification-preferences.service';
import { OperationsNotificationTestService } from './operations-notification-test.service';
import { OperationsEmailAdapterService } from './operations-email-adapter.service';
import { AiPostingAutopilotNotificationsService } from './ai-posting-autopilot-notifications.service';

@Module({
  controllers: [OperationsNotificationsController],
  providers: [
    ChannelReminderDeliveryService,
    TelegramBotApiClient,
    TelegramSystemBotConfigService,
    OperationsNotificationDueService,
    OperationsNotificationDeliveryPolicyService,
    OperationsNotificationPreferencesService,
    OperationsNotificationTestService,
    OperationsEmailAdapterService,
    AiPostingAutopilotNotificationsService,
    OperationsNotificationDueResolutionService,
    OperationsNotificationEventHub,
    OperationsNotificationPermissionService,
    OperationsNotificationPublisherService,
    OperationsNotificationStoreService,
    AiPostingAutopilotNotificationsService,
    OperationsNotificationsService,
    OperationsWebPushConfigService,
    OperationsWebPushService,
  ],
  exports: [
    ChannelReminderDeliveryService,
    OperationsNotificationDeliveryPolicyService,
    OperationsWebPushService,
    OperationsNotificationDueService,
    OperationsNotificationDueResolutionService,
    OperationsNotificationPermissionService,
    OperationsNotificationPublisherService,
    OperationsNotificationStoreService,
  ],
})
export class OperationsNotificationsModule {}
