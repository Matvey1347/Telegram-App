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

@Module({
  controllers: [OperationsNotificationsController],
  providers: [
    OperationsNotificationDueService,
    OperationsNotificationDeliveryPolicyService,
    OperationsNotificationPreferencesService,
    OperationsNotificationTestService,
    OperationsNotificationDueResolutionService,
    OperationsNotificationEventHub,
    OperationsNotificationPermissionService,
    OperationsNotificationPublisherService,
    OperationsNotificationStoreService,
    OperationsNotificationsService,
    OperationsWebPushConfigService,
    OperationsWebPushService,
  ],
  exports: [
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
