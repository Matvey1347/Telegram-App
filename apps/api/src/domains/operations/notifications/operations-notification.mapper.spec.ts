import {
  OperationsNotificationPriority,
  OperationsNotificationType,
} from '@prisma/client';
import { mapOperationsNotification } from './operations-notification.mapper';

describe('mapOperationsNotification', () => {
  it('exposes the compact CRM sender presentation without another avatar read', () => {
    const timestamp = new Date('2026-09-06T10:00:00.000Z');
    const result = mapOperationsNotification({
      id: 'notification-1',
      workspaceId: 'workspace-1',
      recipientMemberId: 'member-1',
      type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
      priority: OperationsNotificationPriority.NORMAL,
      sourceKey: 'conversation:conversation-1',
      copyKey: 'crm.notification.messageReceived',
      title: 'New message from Ada',
      body: 'Hello',
      metadata: {
        presentationKind: 'crm-message',
        conversationId: 'conversation-1',
        contactId: 'contact-1',
        senderName: 'Ada',
        avatarUrl: 'https://cdn.example/ada.jpg',
        messageCount: 3,
      },
      targetUrl: '/ad-sales',
      requiredPermissionKey: 'adSales.crm.view',
      ownPermissionKey: 'adSales.crm.viewOwn',
      anyPermissionKey: 'adSales.crm.viewAny',
      visibilityMemberId: 'member-1',
      visibilityResourceKey: 'crm-contact:contact-1',
      readAt: null,
      deliverAt: timestamp,
      publishedAt: timestamp,
      expiresAt: new Date('2026-12-06T10:00:00.000Z'),
      pushAttemptedAt: null,
      createdAt: timestamp,
    });

    expect(result.presentation).toEqual({
      kind: 'crm-message',
      conversationId: 'conversation-1',
      contactId: 'contact-1',
      senderName: 'Ada',
      avatarUrl: 'https://cdn.example/ada.jpg',
      messageCount: 3,
      notificationIds: ['notification-1'],
    });
  });

  it('exposes the connected MTProto account avatar without a frontend join', () => {
    const timestamp = new Date('2026-09-06T10:00:00.000Z');
    const result = mapOperationsNotification({
      id: 'notification-1', workspaceId: 'workspace-1', recipientMemberId: 'member-1',
      type: OperationsNotificationType.TELEGRAM_ACCOUNT_REAUTH_REQUIRED,
      priority: OperationsNotificationPriority.HIGH,
      sourceKey: 'telegram-account:account-1:reauth-required',
      copyKey: 'telegram.notification.accountReauthRequired',
      title: 'Telegram account disconnected', body: '@tealist needs to be reconnected via QR.',
      metadata: { presentationKind: 'telegram-account', accountId: 'account-1', accountLabel: '@tealist', avatarUrl: 'https://cdn.example/avatar.jpg' },
      targetUrl: '/telegram-channels?tab=accounts&accountTab=mtproto',
      requiredPermissionKey: null, ownPermissionKey: null, anyPermissionKey: null,
      visibilityMemberId: null, visibilityResourceKey: null,
      readAt: null, deliverAt: timestamp, publishedAt: timestamp,
      expiresAt: new Date('2026-12-06T10:00:00.000Z'), pushAttemptedAt: null, createdAt: timestamp,
    });

    expect(result.presentation).toEqual({
      kind: 'telegram-account', accountId: 'account-1', label: '@tealist', avatarUrl: 'https://cdn.example/avatar.jpg',
    });
  });
});
