import { TelegramLeadPreparationContext } from './lead-preparation-context.service';
import {
  leadCandidate,
  leadObservation,
  leadSource,
} from './lead.spec-fixtures';
const text = 'Для замовлення пишіть @business_contact';
function setup() {
  const row = {
    ...leadCandidate({
      reviewStatus: 'APPROVED',
      riskStatus: 'ACCEPTABLE',
      contacts: [
        {
          type: 'TELEGRAM',
          value: '@business_contact',
          role: 'SALES_CONTACT',
          evidence: text,
          confirmed: true,
        },
      ],
    }),
    observations: [
      {
        ...leadObservation({
          text,
          classification: {
            classification: 'ADVERTISEMENT',
            commercialIntent: true,
          },
        }),
        source: leadSource(),
      },
    ],
  };
  const candidateRead = jest
    .fn()
    .mockImplementation(
      (input: { where: { id: string; workspaceId: string } }) =>
        Promise.resolve(
          input.where.workspaceId === 'workspace' && input.where.id === row.id
            ? row
            : null,
        ),
    );
  const identities = jest.fn().mockResolvedValue([]);
  const ownChannels = jest.fn().mockResolvedValue([]);
  const prisma = {
    telegramLeadCandidate: { findFirst: candidateRead },
    telegramAdvertiser: { findMany: identities },
    telegramChannel: { findMany: ownChannels },
  };
  const policy = {
    access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    refresh: jest.fn().mockResolvedValue(undefined),
    enabled: () => true,
    assertProcessing: jest.fn(),
  };
  const crm = { requireReadContact: jest.fn().mockResolvedValue(undefined) };
  const packages = {
    forCopilot: jest.fn().mockResolvedValue([
      {
        id: 'product',
        name: 'Placement',
        channel: { id: 'channel', title: 'Psychology' },
        pricingMode: 'FIXED',
        fixedPrice: '100',
        cpm: null,
        minimumPrice: null,
        currency: 'UAH',
        quoteRequired: false,
        topDurationMinutes: 60,
        feedDurationHours: 24,
        deleteAfterHours: null,
        isPermanent: false,
        updatedAt: '2026-11-01T00:00:00Z',
        constraints: null,
      },
    ]),
  };
  const purchases = { forCopilot: jest.fn().mockResolvedValue([]) };
  const config = {
    get: (key: string) =>
      key === 'INTERNAL_LEAD_QUALIFICATION_ENABLED' ? 'true' : undefined,
  };
  const service = new TelegramLeadPreparationContext(
    prisma as never,
    policy as never,
    config as never,
    { scope: () => Promise.resolve({}) } as never,
    crm as never,
    packages as never,
    purchases as never,
  );
  return {
    service,
    row,
    policy,
    crm,
    packages,
    purchases,
    identities,
    ownChannels,
    candidateRead,
  };
}
describe('actual candidate preparation context boundaries', () => {
  it('accepts a confirmed current literal contact with full-sentence evidence and reuses semantic fingerprints without writes', async () => {
    const h = setup();
    const first = await h.service.build(
      'operator',
      h.row.id,
      ['product'],
      true,
    );
    expect(first.canGenerate).toBe(true);
    expect(first.contacts).toMatchObject([
      { value: '@business_contact', role: 'SALES_CONTACT' },
    ]);
    expect(first.products).toHaveLength(1);
    expect(h.purchases.forCopilot).not.toHaveBeenCalled();
    h.row.observations[0].source.updatedAt = new Date(Date.now() + 60000);
    const repeated = await h.service.build(
      'operator',
      h.row.id,
      ['product'],
      true,
    );
    expect(repeated.contextVersion).toBe(first.contextVersion);
    expect(h.policy.refresh).toHaveBeenCalledTimes(2);
  });
  it('drops an old confirmed identity after the current post changes to another business contact', async () => {
    const h = setup();
    h.row.observations[0].text = 'Для замовлення пишіть @different_business';
    const context = await h.service.build('operator', h.row.id, ['product']);
    expect(context.contacts).toEqual([]);
    expect(context.blockedReason).toBe(
      'LEAD_CONFIRMED_LITERAL_CONTACT_REQUIRED',
    );
  });
  it('rejects cross-workspace candidate lookup before loading business history or products', async () => {
    const h = setup();
    h.policy.access.mockResolvedValue({ workspaceId: 'foreign' });
    await expect(
      h.service.build('operator', h.row.id, ['product']),
    ).rejects.toThrow('LEAD_CANDIDATE_NOT_FOUND');
    expect(h.packages.forCopilot).not.toHaveBeenCalled();
    expect(h.purchases.forCopilot).not.toHaveBeenCalled();
  });
  it('does not disclose unapproved source text and stops a known DNC identity', async () => {
    const denied = setup();
    denied.policy.assertProcessing.mockImplementation(() => {
      throw new Error('grant revoked');
    });
    const context = await denied.service.build('operator', denied.row.id, []);
    expect(context.observations).toEqual([]);
    expect(context.blockedReason).toBe('LEAD_PROCESSING_NOT_APPROVED');
    const dnc = setup();
    dnc.identities.mockResolvedValue([
      {
        id: 'existing-client',
        ownerMemberId: null,
        manualSalesStatus: 'DO_NOT_CONTACT',
        archivedAt: null,
      },
    ]);
    expect(
      (await dnc.service.build('operator', dnc.row.id, [])).blockedReason,
    ).toBe('LEAD_CLIENT_NOT_CONTACTABLE');
    expect(dnc.purchases.forCopilot).not.toHaveBeenCalled();
  });
  it('requires current linked-client ownership before private purchases and fingerprints actual product prices', async () => {
    const h = setup();
    const before = await h.service.build('operator', h.row.id, ['product']);
    h.packages.forCopilot.mockResolvedValue([
      { ...before.products[0], fixedPrice: '200' },
    ]);
    expect(
      (await h.service.build('operator', h.row.id, ['product'])).contextVersion,
    ).not.toBe(before.contextVersion);
    h.row.contactId = 'linked-client';
    h.identities.mockResolvedValue([
      {
        id: 'linked-client',
        ownerMemberId: 'other-owner',
        manualSalesStatus: null,
        archivedAt: null,
      },
    ]);
    h.crm.requireReadContact.mockRejectedValue(new Error('CONTACT_FORBIDDEN'));
    await expect(
      h.service.build('operator', h.row.id, ['product']),
    ).rejects.toThrow('CONTACT_FORBIDDEN');
    expect(h.purchases.forCopilot).not.toHaveBeenCalled();
  });
  it('bounds product selection and treats an absent real catalog as insufficient fit evidence', async () => {
    const h = setup();
    await expect(
      h.service.build(
        'operator',
        h.row.id,
        Array.from({ length: 6 }, (_, i) => `p${i}`),
      ),
    ).rejects.toThrow('LEAD_PRODUCT_LIMIT');
    expect(h.candidateRead).not.toHaveBeenCalled();
    const context = await h.service.build('operator', h.row.id, []);
    expect(context.scoreFacts.verifiedProducts).toBe(false);
    expect(context.missingFacts).toContain(
      'CURRENT_PACKAGE_QUOTE_AND_AUDIENCE_NOT_VERIFIED',
    );
  });
});
