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
      register: jest.fn((resolver) => {
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

  it('materializes one idempotent terminal automation notification', async () => {
    const { projector, store } = setup();
    await projector.automationBlocked({} as never, [
      {
        id: 'execution-1',
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        telegramAdSaleId: 'deal-1',
        reason: 'RETRY_EXHAUSTED',
      },
    ]);
    expect(store.insertMany).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        type: OperationsNotificationType.CRM_AUTOMATION_BLOCKED,
        sourceKey: 'automation:execution-1',
      }),
    ]);
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
    const tx = {
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
      },
    ]);
    expect(tx.operationsNotification.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
        workspaceId: 'workspace-1',
        publishedAt: { not: null },
      },
      data: {
        recipientMemberId: 'member-1',
        visibilityMemberId: 'member-1',
      },
    });
  });
});
