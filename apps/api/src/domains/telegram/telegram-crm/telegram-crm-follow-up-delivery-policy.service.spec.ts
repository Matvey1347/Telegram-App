import { OperationsNotificationDeliveryPolicyService } from '../../operations/notifications/operations-notification-delivery-policy.service';
import { TelegramCrmFollowUpDeliveryPolicy } from './telegram-crm-follow-up-delivery-policy.service';

const occurrence = new Date(Date.now() - 60_000);
const task = {
  id: 'task-current',
  advertiserId: 'contact-current',
  dueAt: occurrence,
  remindAt: null,
  snoozedUntil: null,
};
const fact = {
  id: 'notification-current',
  type: 'CRM_FOLLOW_UP_DUE' as const,
  workspaceId: 'workspace-current',
  recipientMemberId: 'member-current',
  metadata: { taskId: task.id },
  visibilityMemberId: 'member-current',
  visibilityResourceKey: 'crm-contact:contact-current',
  sourceKey: `task:${task.id}:due:${occurrence.toISOString()}`,
  deliverAt: occurrence,
};

function setup() {
  const registry = new OperationsNotificationDeliveryPolicyService();
  const snapshot = {
    contact: () => ({ id: 'contact-current', ownerMemberId: 'member-current' }),
    recipient: jest.fn().mockReturnValue({ id: 'member-current' }),
    preferences: jest.fn().mockReturnValue({
      crmNotificationsEnabled: true,
      crmFollowUpEnabled: true,
    }),
  };
  const tx = {
    telegramAdvertiserTask: { findMany: jest.fn().mockResolvedValue([task]) },
  };
  const policy = new TelegramCrmFollowUpDeliveryPolicy(registry, {
    load: jest.fn().mockResolvedValue(snapshot),
  } as never);
  policy.onModuleInit();
  return { registry, snapshot, tx };
}

describe('TelegramCrmFollowUpDeliveryPolicy', () => {
  it('allows the current due task occurrence and responsible recipient using a bounded current-state batch', async () => {
    const { registry, tx } = setup();
    expect(await registry.filter(tx as never, [fact])).toEqual(
      new Set([fact.id]),
    );
    expect(tx.telegramAdvertiserTask.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-current',
        id: { in: ['task-current'] },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        advertiser: {
          workspaceId: 'workspace-current',
          archivedAt: null,
          OR: [
            { manualSalesStatus: null },
            { manualSalesStatus: { notIn: ['CLOSED', 'DO_NOT_CONTACT'] } },
          ],
        },
      },
      select: {
        id: true,
        advertiserId: true,
        dueAt: true,
        remindAt: true,
        snoozedUntil: true,
      },
    });
  });

  it.each(['completed', 'archived', 'snoozed', 'reassigned', 'opted-out'])(
    'rejects a follow-up that became %s after publication',
    async (change) => {
      const { registry, tx, snapshot } = setup();
      if (change === 'completed' || change === 'archived')
        tx.telegramAdvertiserTask.findMany.mockResolvedValue([]);
      if (change === 'snoozed')
        tx.telegramAdvertiserTask.findMany.mockResolvedValue([
          { ...task, snoozedUntil: new Date(Date.now() + 60_000) },
        ]);
      if (change === 'reassigned')
        snapshot.recipient.mockReturnValue({ id: 'member-other' });
      if (change === 'opted-out')
        snapshot.preferences.mockReturnValue({
          crmNotificationsEnabled: true,
          crmFollowUpEnabled: false,
        });
      expect(await registry.filter(tx as never, [fact])).toEqual(new Set());
    },
  );
});
