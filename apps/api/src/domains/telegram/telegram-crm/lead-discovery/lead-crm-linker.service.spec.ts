const firstArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];
import { Prisma } from '@prisma/client';
import type { LeadContact } from '@telegram-system/shared';
import { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramLeadCrmLinker } from './lead-crm-linker.service';
import { leadCandidate } from './lead.spec-fixtures';
function fixture() {
  const client = {
    id: 'client',
    ownerMemberId: 'member',
    manualSalesStatus: null as string | null,
    archivedAt: null as Date | null,
  };
  const tx = {
    telegramLeadObservation: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { text: 'Для замовлення пишіть @business_contact' },
        ]),
    },
    telegramAdvertiser: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(client),
    },
    telegramCrmPeer: { create: jest.fn() },
    telegramCrmConversation: { create: jest.fn() },
  };
  const auth = {
    require: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace', memberId: 'member' }),
    scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member' }),
  };
  const service = new TelegramLeadCrmLinker(
    auth as unknown as WorkspaceAuthorizationService,
  );
  const candidate = leadCandidate({
      reviewStatus: 'APPROVED',
      riskStatus: 'ACCEPTABLE',
    }),
    contacts: LeadContact[] = [
      {
        type: 'TELEGRAM',
        value: '@business_contact',
        role: 'SALES_CONTACT',
        evidence: '@business_contact',
        confirmed: true,
      },
    ];
  const call = (
    action: 'LINK' | 'CREATE_CLIENT' = 'CREATE_CLIENT',
    contactId?: string,
  ) =>
    service.link(
      tx as unknown as Prisma.TransactionClient,
      'manager',
      'workspace',
      candidate,
      contacts,
      { revision: 1, action, contactId },
    );
  return { service, tx, auth, client, candidate, contacts, call };
}
describe('Lead explicit exact-identity CRM linking', () => {
  it('creates only a manually requested CRM client, never a peer/conversation or name-based match', async () => {
    const h = fixture();
    expect(await h.call()).toBe('client');
    expect(h.tx.telegramAdvertiser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramUsername: 'business_contact',
          ownerMemberId: 'member',
          source: 'LEAD_DISCOVERY',
        }) as unknown,
      }),
    );
    const query: unknown = firstArgument(h.tx.telegramAdvertiser.findMany);
    expect(JSON.stringify(query)).not.toContain('displayName');
    expect(JSON.stringify(query)).toContain('normalizedValue');
    expect(h.tx.telegramCrmPeer.create).not.toHaveBeenCalled();
    expect(h.tx.telegramCrmConversation.create).not.toHaveBeenCalled();
  });
  it('links an existing exact normalized identity without creating duplicate same-name records', async () => {
    const h = fixture();
    h.tx.telegramAdvertiser.findMany.mockResolvedValue([h.client]);
    expect(await h.call('LINK', 'client')).toBe('client');
    expect(h.tx.telegramAdvertiser.create).not.toHaveBeenCalled();
  });
  it('checks every confirmed identity including secondary Telegram handles and persists all on creation', async () => {
    const h = fixture();
    h.contacts.push({
      ...h.contacts[0],
      value: '@second_business',
      evidence: '@second_business',
    });
    h.tx.telegramLeadObservation.findMany.mockResolvedValue([
      { text: 'Контакти @business_contact. Контакти @second_business' },
    ]);
    h.tx.telegramAdvertiser.findMany.mockImplementation((query: unknown) =>
      Promise.resolve(
        JSON.stringify(query).includes('second_business') ? [h.client] : [],
      ),
    );
    expect(await h.call()).toBe('client');
    expect(h.tx.telegramAdvertiser.create).not.toHaveBeenCalled();
    h.tx.telegramAdvertiser.findMany.mockResolvedValue([]);
    await h.call();
    expect(h.tx.telegramAdvertiser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contacts: {
            create: expect.arrayContaining([
              expect.objectContaining({ normalizedValue: 'business_contact' }),
              expect.objectContaining({ normalizedValue: 'second_business' }),
            ]) as unknown,
          },
        }) as unknown,
      }),
    );
  });
  it('rejects unmatched/ambiguous exact identities and never merges by similar title', async () => {
    const missing = fixture();
    await expect(missing.call('LINK', 'same-name-client')).rejects.toThrow(
      'LEAD_EXACT_CLIENT_MATCH_REQUIRED',
    );
    const ambiguous = fixture();
    ambiguous.tx.telegramAdvertiser.findMany.mockResolvedValue([
      ambiguous.client,
      { ...ambiguous.client, id: 'second' },
    ]);
    await expect(ambiguous.call()).rejects.toThrow(
      'LEAD_EXACT_CLIENT_MATCH_REQUIRED',
    );
    expect(ambiguous.tx.telegramAdvertiser.create).not.toHaveBeenCalled();
  });
  it.each(['DO_NOT_CONTACT', 'CLOSED', 'ARCHIVED', 'OTHER_OWNER'])(
    'blocks restricted %s CRM targets',
    async (restriction) => {
      const h = fixture();
      if (restriction === 'ARCHIVED') h.client.archivedAt = new Date();
      else if (restriction === 'OTHER_OWNER') h.client.ownerMemberId = 'other';
      else h.client.manualSalesStatus = restriction;
      h.tx.telegramAdvertiser.findMany.mockResolvedValue([h.client]);
      await expect(h.call('LINK', 'client')).rejects.toThrow(
        'LEAD_CLIENT_LINK_NOT_ALLOWED',
      );
    },
  );
  it('requires approved candidate, human-confirmed strong contact and currently retained literal proof', async () => {
    const unapproved = fixture();
    unapproved.candidate.reviewStatus = 'PENDING';
    await expect(unapproved.call()).rejects.toThrow(
      'LEAD_APPROVAL_REQUIRED_BEFORE_CRM',
    );
    for (const role of [
      'UNKNOWN',
      'ADVERTISED_DESTINATION',
      'AGENCY',
    ] as const) {
      const h = fixture();
      h.contacts[0].role = role;
      await expect(h.call()).rejects.toThrow(
        'LEAD_CONFIRMED_IDENTITY_REQUIRED',
      );
    }
    const unconfirmed = fixture();
    unconfirmed.contacts[0].confirmed = false;
    await expect(unconfirmed.call()).rejects.toThrow(
      'LEAD_CONFIRMED_IDENTITY_REQUIRED',
    );
    const edited = fixture();
    edited.tx.telegramLeadObservation.findMany.mockResolvedValue([
      { text: 'Edited material without contact' },
    ]);
    await expect(edited.call()).rejects.toThrow(
      'LEAD_CURRENT_LITERAL_EVIDENCE_REQUIRED',
    );
  });
  it('explicitly attaches a confirmed literal Instagram identity to the exact linked Telegram client', async () => {
    const h = fixture();
    h.tx.telegramAdvertiser.findMany.mockResolvedValue([h.client]);
    const methods = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };
    Object.assign(h.tx, { telegramAdvertiserContact: methods });
    h.contacts.push({
      type: 'INSTAGRAM',
      value: 'https://www.instagram.com/business.profile',
      evidence: 'https://instagram.com/Business.Profile',
      role: 'SALES_CONTACT',
      confirmed: true,
    });
    h.tx.telegramLeadObservation.findMany.mockResolvedValue([
      {
        text: 'Для замовлення пишіть @business_contact. Sales contact https://instagram.com/Business.Profile',
      },
    ]);
    await h.call('LINK', 'client');
    expect(methods.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        advertiserId: 'client',
        type: 'INSTAGRAM',
        normalizedValue: 'business.profile',
        value: 'https://instagram.com/Business.Profile',
        isVerified: false,
        ownershipConfirmedByUserId: 'manager',
      }) as unknown,
    });
    expect(h.tx.telegramCrmConversation.create).not.toHaveBeenCalled();
    methods.findFirst.mockResolvedValue({
      id: 'method',
      advertiserId: 'client',
      identityState: 'STALE',
      ownershipConfirmedAt: null,
    });
    methods.create.mockClear();
    await h.call('LINK', 'client');
    expect(methods.create).not.toHaveBeenCalled();
  });
});
