import {
  groupCrmNotificationRows,
  notificationConversationIds,
} from './operations-notification-list-presentation';

describe('operations notification list presentation', () => {
  it('groups legacy message rows by sender and hydrates the sender avatar', () => {
    const timestamp = new Date('2026-09-06T10:00:00.000Z');
    const row = (id: string, body: string, readAt: Date | null = null) =>
      ({
        id,
        workspaceId: 'workspace-1',
        recipientMemberId: 'member-1',
        type: 'CRM_MESSAGE_RECEIVED',
        priority: 'LOW',
        sourceKey: `message:${id}`,
        copyKey: 'crm.notification.messageReceived',
        title: 'New CRM inbox message',
        body,
        metadata: {
          conversationId: 'conversation-1',
          peerId: 'peer-1',
        },
        targetUrl: '/ad-sales/inbox?conversationId=conversation-1',
        readAt,
        deliverAt: timestamp,
        publishedAt: timestamp,
        expiresAt: timestamp,
        pushAttemptedAt: null,
        createdAt: timestamp,
      }) as never;
    const rows = [
      row('notification-2', 'Newest'),
      row('notification-1', 'Old'),
    ];

    expect(notificationConversationIds(rows)).toEqual(['conversation-1']);
    const grouped = groupCrmNotificationRows(rows, [
      {
        id: 'conversation-1',
        contactId: null,
        unreadCount: 2,
        contact: null,
        peer: {
          id: 'peer-1',
          username: 'ada',
          firstName: 'Ada',
          lastName: 'Lovelace',
          photoUrl: 'https://cdn.example/ada.jpg',
        },
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      id: 'notification-2',
      title: 'New message from Ada Lovelace',
      body: 'Newest',
      metadata: {
        senderName: 'Ada Lovelace',
        avatarUrl: 'https://cdn.example/ada.jpg',
        messageCount: 2,
        notificationIds: 'notification-2,notification-1',
      },
    });
  });

  it('keeps unrelated notifications separate without CRM lookups', () => {
    const row = {
      id: 'failure-1',
      type: 'CRM_PLACEMENT_FAILURE',
      metadata: {},
    } as never;
    expect(notificationConversationIds([row])).toEqual([]);
    expect(groupCrmNotificationRows([row], [])).toEqual([row]);
  });
});
