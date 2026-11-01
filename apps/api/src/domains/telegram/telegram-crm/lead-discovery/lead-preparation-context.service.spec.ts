import { TelegramLeadPreparationContext } from './lead-preparation-context.service';
import {
  leadCandidate,
  leadObservation,
  leadSource,
} from './lead.spec-fixtures';
function setup() {
  const row = {
    ...leadCandidate({
      reviewStatus: 'APPROVED',
      riskStatus: 'ACCEPTABLE',
      contacts: [
        {
          type: 'TELEGRAM',
          value: '@public_business',
          role: 'SALES_CONTACT',
          evidence: '@public_business',
          confirmed: true,
        },
      ],
    }),
    observations: [
      {
        ...leadObservation({
          text: 'Освітня програма. Для замовлення пишіть @public_business',
          classification: {
            classification: 'ADVERTISEMENT',
            commercialIntent: true,
          },
          candidateId: 'candidate',
        }),
        source: leadSource(),
      },
    ],
  };
  const prisma = {
    telegramLeadCandidate: { findFirst: jest.fn().mockResolvedValue(row) },
    telegramAdvertiser: { findMany: jest.fn().mockResolvedValue([]) },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const policy = {
    enabled: () => true,
    access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    refresh: jest.fn().mockResolvedValue(undefined),
    assertProcessing: jest.fn(),
  };
  const config = {
    get: jest.fn((name: string) =>
      name === 'INTERNAL_LEAD_QUALIFICATION_ENABLED' ? 'true' : undefined,
    ),
  };
  const packages = {
    forCopilot: jest.fn().mockResolvedValue([
      {
        id: 'product',
        name: 'Current placement',
        channel: { id: 'own-channel', title: 'Verified topic' },
        fixedPrice: '50',
        currency: 'UAH',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ]),
  };
  const authorization = { scope: jest.fn().mockResolvedValue({}) };
  const service = new TelegramLeadPreparationContext(
    prisma as never,
    policy as never,
    config as never,
    authorization as never,
    { requireReadContact: jest.fn() } as never,
    packages as never,
    { forCopilot: jest.fn().mockResolvedValue([]) } as never,
  );
  return { row, prisma, policy, config, packages, service };
}
describe('bounded current candidate context', () => {
  it('uses confirmed exact identities and current selected product facts only', async () => {
    const h = setup();
    const result = await h.service.build('operator', 'candidate', ['product']);
    expect(result.contacts).toEqual([
      expect.objectContaining({ value: '@public_business', confirmed: true }),
    ]);
    expect(result.products).toHaveLength(1);
    expect(result.blockedReason).toBeNull();
    expect(h.packages.forCopilot).toHaveBeenCalledTimes(1);
  });
  it('removes an old confirmed contact after an advertisement edit rather than disclosing it as current', async () => {
    const h = setup();
    h.row.observations[0].text =
      'Освітня програма. Для замовлення пишіть @different_business';
    const result = await h.service.build('operator', 'candidate');
    expect(result.contacts).toEqual([]);
    expect(result.blockedReason).toBe(
      'LEAD_CONFIRMED_LITERAL_CONTACT_REQUIRED',
    );
  });
  it('never treats a product channel destination as a confirmed sales contact', async () => {
    const h = setup();
    h.row.observations[0].text = 'Наш канал @public_business';
    const result = await h.service.build('operator', 'candidate');
    expect(result.contacts).toEqual([]);
  });
  it('keeps the fingerprint stable for unrelated source checkpoint activity', async () => {
    const h = setup();
    const first = await h.service.build('operator', 'candidate');
    h.row.observations[0].source.updatedAt = new Date(Date.now() + 1000);
    h.row.observations[0].source.channelPts = 500;
    const second = await h.service.build('operator', 'candidate');
    expect(second.contextVersion).toBe(first.contextVersion);
  });
  it('invalidates semantic source changes and current product price changes', async () => {
    const h = setup();
    const first = await h.service.build('operator', 'candidate', ['product']);
    h.row.observations[0].source.processingReference = 'policy:changed';
    const second = await h.service.build('operator', 'candidate', ['product']);
    expect(second.contextVersion).not.toBe(first.contextVersion);
    h.packages.forCopilot.mockResolvedValue([
      {
        id: 'product',
        name: 'Current placement',
        channel: { id: 'own-channel', title: 'Verified topic' },
        fixedPrice: '90',
        currency: 'USD',
        updatedAt: '2026-11-02T00:00:00Z',
      },
    ]);
    const third = await h.service.build('operator', 'candidate', ['product']);
    expect(third.contextVersion).not.toBe(second.contextVersion);
  });
  it('blocks known DNC even when its exact identity was not yet linked', async () => {
    const h = setup();
    h.prisma.telegramAdvertiser.findMany.mockResolvedValue([
      {
        id: 'client',
        ownerMemberId: 'owner',
        manualSalesStatus: 'DO_NOT_CONTACT',
        archivedAt: null,
      },
    ] as never);
    const result = await h.service.build('operator', 'candidate');
    expect(result.blockedReason).toBe('LEAD_CLIENT_NOT_CONTACTABLE');
  });
  it('does not disclose denied source material into the preparation context', async () => {
    const h = setup();
    h.policy.assertProcessing.mockImplementation(() => {
      throw new Error('revoked');
    });
    const result = await h.service.build('operator', 'candidate');
    expect(result.observations).toEqual([]);
    expect(result.facts.some((fact) => fact.kind === 'MESSAGE')).toBe(false);
    expect(result.blockedReason).toBe('LEAD_PROCESSING_NOT_APPROVED');
  });
  it('distinguishes missing selected product facts from verified fit', async () => {
    const h = setup();
    const result = await h.service.build('operator', 'candidate');
    expect(result.products).toEqual([]);
    expect(result.scoreFacts.verifiedProducts).toBe(false);
    expect(h.packages.forCopilot).not.toHaveBeenCalled();
  });
});
