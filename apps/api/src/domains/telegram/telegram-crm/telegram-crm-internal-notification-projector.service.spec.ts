import {
  OperationsNotificationType,
  TelegramAdvertiserTaskStatus,
} from '@prisma/client';
import { TelegramCrmInternalNotificationProjector } from './telegram-crm-internal-notification-projector.service';

describe('TelegramCrmInternalNotificationProjector', () => {
  function setup() {
    const contact = {
      id: 'contact-1',
      ownerMemberId: 'member-1',
    };
    const snapshot = {
      contact: jest.fn().mockReturnValue(contact),
      recipient: jest.fn().mockReturnValue({ id: 'member-1' }),
      preferences: () => ({
        crmNotificationsEnabled: true,
        crmFollowUpEnabled: true,
      }),
    };
    const recipients = { load: jest.fn().mockResolvedValue(snapshot) };
    const store = {
      cancelPending: jest.fn(),
      insertMany: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
      reassignVisibility: jest.fn().mockResolvedValue(['member-old']),
      notifyDueWorkChanged: jest.fn(),
    };
    const publisher = { publish: jest.fn() };
    let dueResolver:
      | ((tx: unknown, facts: readonly Record<string, unknown>[]) => unknown)
      | null = null;
    const resolution = {
      register: jest.fn((resolver: NonNullable<typeof dueResolver>) => {
        dueResolver = resolver;
        return jest.fn();
      }),
    };
    const projector = new TelegramCrmInternalNotificationProjector(
      recipients as never,
      store as never,
      publisher as never,
      resolution as never,
    );
    return {
      store,
      publisher,
      projector,
      resolution,
      dueResolver: () => dueResolver,
    };
  }

  it('schedules only an explicit task fact with stable task+due source', async () => {
    const { projector, store } = setup();
    const dueAt = new Date('2026-09-02T10:00:00Z');
    await projector.refreshTask({} as never, {
      id: 'task-1',
      workspaceId: 'workspace-1',
      advertiserId: 'contact-1',
      title: 'Call the customer',
      status: TelegramAdvertiserTaskStatus.OPEN,
      dueAt,
      remindAt: null,
      snoozedUntil: null,
    });
    expect(store.cancelPending).toHaveBeenCalledTimes(1);
    expect(store.insertMany).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        type: OperationsNotificationType.CRM_FOLLOW_UP_DUE,
        sourceKey: `task:task-1:due:${dueAt.toISOString()}`,
        deliverAt: dueAt,
        publishedAt: null,
        visibilityResourceKey: 'crm-contact:contact-1',
      }),
    ]);
  });

  it.each([
    TelegramAdvertiserTaskStatus.COMPLETED,
    TelegramAdvertiserTaskStatus.SKIPPED,
    TelegramAdvertiserTaskStatus.CANCELLED,
  ])('cancels pending due work and creates none for %s', async (status) => {
    const { projector, store } = setup();
    await projector.refreshTask({} as never, {
      id: 'task-1',
      workspaceId: 'workspace-1',
      advertiserId: 'contact-1',
      title: 'Call',
      status,
      dueAt: new Date(),
      remindAt: null,
      snoozedUntil: null,
    });
    expect(store.cancelPending).toHaveBeenCalled();
    expect(store.insertMany).not.toHaveBeenCalled();
  });

  it('re-resolves current Contact ownership before transferring visibility', async () => {
    const { projector, store } = setup();
    await expect(
      projector.contactVisibilityChanged(
        {} as never,
        'workspace-1',
        'contact-1',
      ),
    ).resolves.toEqual(['member-old']);
    expect(store.reassignVisibility).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'workspace-1',
      visibilityResourceKey: 'crm-contact:contact-1',
      recipientMemberId: 'member-1',
      visibilityMemberId: 'member-1',
    });
  });

  it('re-resolves the current owner/Deal fallback before due publication', async () => {
    const { projector, dueResolver } = setup();
    const dueAt = new Date(Date.now() - 60_000);
    const tx = {
      telegramAdvertiserTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'task-1',
            advertiserId: 'contact-1',
            dueAt,
            remindAt: null,
            snoozedUntil: null,
          },
        ]),
      },
      $executeRaw: jest.fn(),
      operationsNotification: {
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    projector.onModuleInit();
    await dueResolver()?.(tx, [
      {
        id: 'notification-1',
        workspaceId: 'workspace-1',
        type: OperationsNotificationType.CRM_FOLLOW_UP_DUE,
        recipientMemberId: 'member-old',
        visibilityMemberId: 'member-old',
        visibilityResourceKey: 'crm-contact:contact-1',
        sourceKey: `task:task-1:due:${dueAt.toISOString()}`,
        metadata: { taskId: 'task-1' },
        deliverAt: dueAt,
      },
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.operationsNotification.deleteMany).not.toHaveBeenCalled();
  });
});

describe('Inbox follow-up notification destinations', () => {
  const dueAt = new Date('2030-01-01T10:00:00Z');
  function setup() {
    const notifications = {
      cancelPending: jest.fn(),
      insertMany: jest.fn().mockResolvedValue([]),
    };
    const recipients = {
      load: jest.fn().mockResolvedValue({
        contact: () => ({
          id: 'client-a',
          displayName: 'Client',
          ownerMemberId: 'member-a',
        }),
        recipient: () => ({ id: 'member-a' }),
      }),
    };
    const tx = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conversation-a' }),
      },
    };
    const service = new TelegramCrmInternalNotificationProjector(
      recipients as never,
      notifications as never,
      {} as never,
      {} as never,
    );
    const task = {
      id: 'task-a',
      workspaceId: 'workspace-a',
      advertiserId: 'client-a',
      title: 'Follow up',
      status: TelegramAdvertiserTaskStatus.OPEN,
      dueAt,
      remindAt: null,
      snoozedUntil: null,
      metadata: { conversationId: 'conversation-a' },
    };
    return { service, notifications, tx, task };
  }
  it('targets the exact current client conversation and workspace', async () => {
    const { service, notifications, tx, task } = setup();
    await service.refreshTask(tx as never, task);
    expect(tx.telegramCrmConversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'conversation-a',
        workspaceId: 'workspace-a',
        contactId: 'client-a',
        state: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(notifications.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        targetUrl:
          '/ad-sales/inbox?conversationId=conversation-a&workspaceId=workspace-a',
        metadata: expect.objectContaining({
          conversationId: 'conversation-a',
        }) as unknown,
      }),
    ]);
  });
  it('uses the client fallback if the originating conversation is no longer accessible', async () => {
    const { service, notifications, tx, task } = setup();
    tx.telegramCrmConversation.findFirst.mockResolvedValue(null);
    await service.refreshTask(tx as never, task);
    expect(notifications.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        targetUrl: '/ad-sales/clients/client-a?workspaceId=workspace-a',
        metadata: expect.objectContaining({
          conversationId: 'conversation-a',
        }) as unknown,
      }),
    ]);
  });
  it('routes an Instagram-only follow-up to the authorized client without a conversation', async () => {
    const { service, notifications, tx, task } = setup();
    const manualTask: Parameters<
      TelegramCrmInternalNotificationProjector['refreshTask']
    >[1] = {
      ...task,
      metadata: { origin: 'MANUAL_INSTAGRAM', channel: 'INSTAGRAM' },
    };
    await service.refreshTask(tx as never, manualTask);
    expect(notifications.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        targetUrl: '/ad-sales/clients/client-a?workspaceId=workspace-a',
      }),
    ]);
    expect(tx.telegramCrmConversation.findFirst).not.toHaveBeenCalled();
  });
});
