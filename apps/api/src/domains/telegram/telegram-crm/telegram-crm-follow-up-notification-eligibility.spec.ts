import type { OperationsNotificationDueFact } from '../../operations/notifications/operations-notification-due-resolution.service';
import { eligibleCrmFollowUpNotifications } from './telegram-crm-follow-up-notification-eligibility';

const dueAt = new Date('2020-01-01T12:00:00Z');
function setup() {
  const tx = {
    telegramAdvertiserTask: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'task-a',
          advertiserId: 'client-a',
          dueAt,
          snoozedUntil: null,
          remindAt: null,
        },
      ]),
    },
    telegramCrmConversation: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'conversation-a', contactId: 'client-a' }]),
    },
  };
  const snapshot = {
    contact: () => ({ id: 'client-a', ownerMemberId: 'member-a' }),
    recipient: () => ({ id: 'member-a' }),
    preferences: () => ({
      crmNotificationsEnabled: true,
      crmFollowUpEnabled: true,
    }),
  };
  const recipients = { load: jest.fn().mockResolvedValue(snapshot) };
  const fact: OperationsNotificationDueFact = {
    id: 'notification-a',
    workspaceId: 'workspace-a',
    type: 'CRM_FOLLOW_UP_DUE',
    recipientMemberId: 'member-a',
    visibilityMemberId: 'member-a',
    visibilityResourceKey: 'crm-contact:client-a',
    sourceKey: `task:task-a:due:${dueAt.toISOString()}`,
    deliverAt: dueAt,
    metadata: { taskId: 'task-a', conversationId: 'conversation-a' },
  };
  const allowed = (facts = [fact]) =>
    eligibleCrmFollowUpNotifications(
      tx as never,
      'workspace-a',
      facts,
      recipients as never,
    );
  return { tx, recipients, fact, allowed };
}

describe('shared follow-up eligibility at publication and ready dispatch', () => {
  it('requires current active origin conversation and connected CRM account in one bounded read', async () => {
    const { allowed, tx } = setup();
    expect((await allowed()).has('notification-a')).toBe(true);
    expect(tx.telegramCrmConversation.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        state: 'ACTIVE',
        OR: [{ id: 'conversation-a', contactId: 'client-a' }],
        mtprotoAccount: {
          workspaceId: 'workspace-a',
          isActive: true,
          status: 'connected',
          crmSyncEnabled: true,
        },
      },
      select: { id: true, contactId: true },
    });
  });
  it.each(['archived', 'reassigned', 'disconnected'])(
    'vetoes an %s origin while retaining the task record',
    async (reason) => {
      const { allowed, tx } = setup();
      tx.telegramCrmConversation.findMany.mockResolvedValue(
        reason === 'reassigned'
          ? [{ id: 'conversation-a', contactId: 'other-client' }]
          : [],
      );
      expect((await allowed()).size).toBe(0);
      expect(tx.telegramAdvertiserTask.findMany).toHaveBeenCalledTimes(1);
    },
  );
  it('excludes CLOSED and DNC clients in the current task selection', async () => {
    const { tx, allowed } = setup();
    tx.telegramAdvertiserTask.findMany.mockResolvedValue([]);
    expect((await allowed()).size).toBe(0);
    const call = (
      tx.telegramAdvertiserTask.findMany.mock.calls[0] as unknown[]
    )[0] as { where: { advertiser: unknown } };
    expect(call.where.advertiser).toEqual({
      workspaceId: 'workspace-a',
      archivedAt: null,
      OR: [
        { manualSalesStatus: null },
        { manualSalesStatus: { notIn: ['CLOSED', 'DO_NOT_CONTACT'] } },
      ],
    });
  });
  it('preserves legacy task eligibility without fabricating an origin conversation', async () => {
    const { allowed, fact, tx } = setup();
    expect(
      (await allowed([{ ...fact, metadata: { taskId: 'task-a' } }])).size,
    ).toBe(1);
    expect(tx.telegramCrmConversation.findMany).not.toHaveBeenCalled();
  });
  it('validates a hundred origins in one query rather than one query per task', async () => {
    const { allowed, fact, tx, recipients } = setup();
    expect(
      (
        await allowed(
          Array.from({ length: 100 }, (_, i) => ({ ...fact, id: `n-${i}` })),
        )
      ).size,
    ).toBe(100);
    expect(tx.telegramCrmConversation.findMany).toHaveBeenCalledTimes(1);
    expect(tx.telegramAdvertiserTask.findMany).toHaveBeenCalledTimes(1);
    expect(recipients.load).toHaveBeenCalledTimes(1);
  });
});
