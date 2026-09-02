import { TelegramCrmRecipientSnapshot } from './telegram-crm-notification-recipient.service';

const member = (id: string, role: 'owner' | 'admin' = 'admin') => ({
  id,
  workspaceId: 'workspace-1',
  userId: `user-${id}`,
  role,
  createdAt: new Date(),
  roleDefinition: null,
});

describe('TelegramCrmRecipientSnapshot', () => {
  const permissions = {
    canReceive: jest.fn().mockReturnValue(true),
    has: jest.fn((value: { id: string }, key: string) => {
      if (key === 'adSales.crm.view') return true;
      if (key === 'adSales.crm.viewAny') return value.id !== 'owner-contact';
      return key === 'adSales.crm.viewOwn' && value.id === 'owner-contact';
    }),
  };
  const contact = {
    id: 'contact-1',
    displayName: 'Contact',
    stage: 'LEAD',
    ownerMemberId: 'owner-contact',
    sales: [
      {
        id: 'deal-1',
        status: 'RESERVED',
        assignedMemberId: 'deal-assignee',
      },
    ],
    tasks: [],
  };

  it('orders Contact owner before Deal assignee, workspace owner, and viewAny', () => {
    const snapshot = new TelegramCrmRecipientSnapshot(
      [contact] as never,
      [
        member('fallback'),
        member('workspace-owner', 'owner'),
        member('deal-assignee'),
        member('owner-contact'),
      ] as never,
      permissions as never,
    );
    expect(snapshot.recipient(snapshot.contact('contact-1'))?.id).toBe(
      'owner-contact',
    );
  });

  it('implements LOW/no Contact, HIGH qualified/deal/overdue, otherwise NORMAL', () => {
    const snapshot = new TelegramCrmRecipientSnapshot(
      [contact] as never,
      [] as never,
      permissions as never,
    );
    expect(snapshot.priority(null, new Date())).toBe('LOW');
    expect(snapshot.priority(contact as never, new Date())).toBe('HIGH');
    expect(
      snapshot.priority(
        { ...contact, sales: [], stage: 'LEAD', tasks: [] } as never,
        new Date(),
      ),
    ).toBe('NORMAL');
    expect(
      snapshot.priority(
        {
          ...contact,
          sales: [],
          tasks: [{ dueAt: new Date(Date.now() - 1_000) }],
        } as never,
        new Date(),
      ),
    ).toBe('HIGH');
  });
});
