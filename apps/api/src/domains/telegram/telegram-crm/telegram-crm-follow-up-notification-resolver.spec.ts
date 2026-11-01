import { resolveCrmFollowUpNotifications } from './telegram-crm-follow-up-notification-resolver';
import type { OperationsNotificationDueFact } from '../../operations/notifications/operations-notification-due-resolution.service';

const dueAt = new Date('2026-10-31T08:00:00.000Z');
const fact = (
  id = 'n-a',
  workspaceId = 'workspace-a',
): OperationsNotificationDueFact => ({
  id,
  workspaceId,
  type: 'CRM_FOLLOW_UP_DUE',
  recipientMemberId: 'owner-a',
  visibilityMemberId: 'owner-a',
  visibilityResourceKey: 'crm-contact:client-a',
  sourceKey: `task:task-a:due:${dueAt.toISOString()}`,
  deliverAt: dueAt,
  metadata: { taskId: 'task-a' },
});
function setup() {
  const tasks = [
    {
      id: 'task-a',
      advertiserId: 'client-a',
      dueAt,
      remindAt: null,
      snoozedUntil: null,
    },
  ];
  const tx = {
    telegramAdvertiserTask: { findMany: jest.fn().mockResolvedValue(tasks) },
    operationsNotification: { deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const snapshot = {
    contact: jest
      .fn()
      .mockReturnValue({ id: 'client-a', ownerMemberId: 'owner-a' }),
    recipient: jest.fn().mockReturnValue({ id: 'owner-a' }),
    preferences: jest.fn().mockReturnValue({
      crmNotificationsEnabled: true,
      crmFollowUpEnabled: true,
    }),
  };
  const recipients = { load: jest.fn().mockResolvedValue(snapshot) };
  const resolve = (facts: OperationsNotificationDueFact[]) =>
    resolveCrmFollowUpNotifications(tx as never, facts, recipients as never);
  return { tx, snapshot, recipients, resolve };
}

describe('due follow-up occurrence validation', () => {
  it('does no work with zero due events and no writes for an unchanged valid recipient', async () => {
    const { tx, recipients, resolve } = setup();
    await expect(resolve([])).resolves.toBe(false);
    expect(tx.telegramAdvertiserTask.findMany).not.toHaveBeenCalled();
    await expect(resolve([fact()])).resolves.toBe(false);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.operationsNotification.deleteMany).not.toHaveBeenCalled();
    expect(recipients.load).toHaveBeenCalledTimes(1);
  });
  it.each([
    'completed or deleted task',
    'rescheduled occurrence',
    'archived or unavailable client',
    'disabled reminders',
  ])('cancels %s instead of publishing stale work', async (reason) => {
    const { tx, snapshot, resolve } = setup();
    if (reason === 'completed or deleted task')
      tx.telegramAdvertiserTask.findMany.mockResolvedValue([]);
    if (reason === 'rescheduled occurrence')
      tx.telegramAdvertiserTask.findMany.mockResolvedValue([
        {
          id: 'task-a',
          advertiserId: 'client-a',
          dueAt: new Date(dueAt.getTime() + 60_000),
          remindAt: null,
          snoozedUntil: null,
        },
      ]);
    if (reason === 'archived or unavailable client')
      snapshot.contact.mockReturnValue(null);
    if (reason === 'disabled reminders')
      snapshot.preferences.mockReturnValue({
        crmNotificationsEnabled: true,
        crmFollowUpEnabled: false,
      });
    await expect(resolve([fact()])).resolves.toBe(true);
    expect(tx.operationsNotification.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-a', id: { in: ['n-a'] } },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('validates 100 due events in a batch and changes ownership with one statement', async () => {
    const { tx, snapshot, resolve } = setup();
    snapshot.recipient.mockReturnValue({ id: 'new-owner' });
    await expect(
      resolve(Array.from({ length: 100 }, (_, i) => fact(`notification-${i}`))),
    ).resolves.toBe(true);
    expect(tx.telegramAdvertiserTask.findMany).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.operationsNotification.deleteMany).not.toHaveBeenCalled();
  });
  it('keeps workspace lookups isolated and ignores future unrelated projector facts', async () => {
    const { tx, recipients, resolve } = setup();
    await resolve([
      fact(),
      fact('n-b', 'workspace-b'),
      { ...fact(), type: 'CRM_AI_LEAD_QUALIFIED' },
    ]);
    expect(
      tx.telegramAdvertiserTask.findMany.mock.calls.map(
        ([args]) =>
          (args as { where: { workspaceId: string } }).where.workspaceId,
      ),
    ).toEqual(['workspace-a', 'workspace-b']);
    expect(
      recipients.load.mock.calls.map(([, workspace]) => workspace as string),
    ).toEqual(['workspace-a', 'workspace-b']);
  });
});
