const firstArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];
import { ConflictException } from '@nestjs/common';
import type { CrmManualActivityInput } from '@telegram-system/shared';
import { TelegramCrmManualActivityService } from './telegram-crm-manual-activity.service';
const operationId = '2030-02-10:6bc30dd6-05c7-4f2c-a4a8-4e9f7efde002';
function setup() {
  const contact = {
    id: 'client',
    ownerMemberId: 'member',
    archivedAt: null,
    manualSalesStatus: null as string | null,
    lastContactAt: null as Date | null,
    manualInstagramContactAt: null as Date | null,
    manualInstagramReplyAt: null as Date | null,
  };
  const receipts = new Map<string, unknown>();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    telegramAdvertiser: {
      findFirst: jest.fn().mockResolvedValue(contact),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Object.assign(contact, data),
        ),
    },
    telegramAdvertiserContact: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ normalizedValue: 'business.profile' }]),
    },
    telegramAdvertiserActivity: {
      findUnique: jest
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: { workspaceId_operationId: { operationId: string } };
          }) => receipts.get(where.workspaceId_operationId.operationId) ?? null,
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { operationId: string } }) => {
          receipts.set(data.operationId, data);
          return data;
        }),
    },
    telegramLeadCandidate: {
      findFirst: jest.fn().mockResolvedValue({ id: 'candidate', contacts: [] }),
    },
  };
  const scope = { workspaceId: 'workspace', ownerMemberId: 'member' };
  const crm = {
    editScope: jest.fn().mockResolvedValue(scope),
    readScope: jest.fn().mockResolvedValue(scope),
  };
  const preparations = {
    view: jest.fn().mockResolvedValue({
      drafts: [
        {
          id: 'draft',
          authorUserId: 'user',
          revision: 1,
          status: 'APPROVED',
          canCopy: true,
        },
      ],
    }),
  };
  const events = { emit: jest.fn() };
  const prisma = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
  };
  const service = new TelegramCrmManualActivityService(
    prisma as never,
    crm as never,
    { require: jest.fn().mockResolvedValue({ memberId: 'member' }) } as never,
    preparations as never,
    events as never,
  );
  return { service, tx, contact, preparations, events };
}
describe('manual Instagram activity', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2030-02-10T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());
  it('records a manual fact without Telegram timestamps/messages and exact retry performs no writes', async () => {
    const f = setup(),
      input: CrmManualActivityInput = { operationId, action: 'CONTACTED' };
    await f.service.record('user', 'client', input);
    await f.service.record('user', 'client', input);
    expect(f.contact.manualInstagramContactAt?.toISOString()).toBe(
      '2030-02-10T12:00:00.000Z',
    );
    expect(f.tx.telegramAdvertiser.update).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(firstArgument(f.tx.telegramAdvertiser.update)),
    ).not.toContain('lastOutboundAt');
    expect(f.tx.telegramAdvertiserActivity.create).toHaveBeenCalledTimes(1);
    expect(firstArgument(f.tx.telegramAdvertiserActivity.create)).toMatchObject(
      {
        data: {
          metadata: {
            kind: 'MANUAL_ACTIVITY',
            channel: 'INSTAGRAM',
            reportedManually: true,
          },
          actorMemberId: 'member',
        },
      },
    );
    expect(f.preparations.view).not.toHaveBeenCalled();
  });
  it('rejects changed payload reuse and another actor', async () => {
    const f = setup();
    await f.service.record('user', 'client', {
      operationId,
      action: 'CONTACTED',
    });
    await expect(
      f.service.record('user', 'client', { operationId, action: 'REPLIED' }),
    ).rejects.toThrow('MANUAL_OPERATION_CONFLICT');
    await expect(
      f.service.record('another', 'client', {
        operationId,
        action: 'CONTACTED',
      }),
    ).rejects.toThrow('MANUAL_OPERATION_CONFLICT');
  });
  it('rejects new expired keys and future reported dates without writes', async () => {
    const f = setup();
    await expect(
      f.service.record('user', 'client', {
        operationId: operationId.replace('2030-02-10', '2029-02-10'),
        action: 'CONTACTED',
      }),
    ).rejects.toThrow('MANUAL_OPERATION_EXPIRED');
    await expect(
      f.service.record('user', 'client', {
        operationId,
        action: 'CONTACTED',
        occurredAt: '2030-02-11T00:00:00Z',
      }),
    ).rejects.toThrow('MANUAL_ACTIVITY_DATE_INVALID');
    expect(f.tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
  });
  it('preserves DNC on inbound reply, forbids commercial actions and implicit interested reset', async () => {
    const f = setup();
    f.contact.manualSalesStatus = 'DO_NOT_CONTACT';
    await expect(
      f.service.record('user', 'client', { operationId, action: 'CONTACTED' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      f.service.record('user', 'client', { operationId, action: 'INTERESTED' }),
    ).rejects.toThrow('DO_NOT_CONTACT');
    await f.service.record('user', 'client', {
      operationId,
      action: 'REPLIED',
    });
    expect(f.contact.manualSalesStatus).toBe('DO_NOT_CONTACT');
    expect(f.contact.manualInstagramReplyAt).not.toBeNull();
  });
  it('requires confirmed active Instagram ownership', async () => {
    const f = setup();
    f.tx.telegramAdvertiserContact.findMany.mockResolvedValue([]);
    await expect(
      f.service.record('user', 'client', { operationId, action: 'OFFER_SENT' }),
    ).rejects.toThrow('INSTAGRAM_IDENTITY_REVIEW_REQUIRED');
    expect(f.tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
  });
  it('rejects stale AI approval and never marks a draft sent', async () => {
    const f = setup();
    f.preparations.view.mockResolvedValue({
      drafts: [
        {
          id: 'draft',
          authorUserId: 'user',
          revision: 1,
          status: 'STALE',
          canCopy: false,
        },
      ],
    });
    await expect(
      f.service.record('user', 'client', {
        operationId,
        action: 'OFFER_SENT',
        candidateId: 'candidate',
        draftId: 'draft',
        draftRevision: 1,
      }),
    ).rejects.toThrow('MANUAL_DRAFT_FRESH_APPROVAL_REQUIRED');
    expect(f.tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
  });
  it('uses monotonic facts for backdated reports and leaves unchanged statuses write free', async () => {
    const f = setup();
    f.contact.manualInstagramContactAt = new Date('2030-02-10T11:00:00Z');
    await f.service.record('user', 'client', {
      operationId,
      action: 'CONTACTED',
      occurredAt: '2030-02-09T11:00:00Z',
    });
    expect(f.contact.manualInstagramContactAt.toISOString()).toBe(
      '2030-02-10T11:00:00.000Z',
    );
    f.tx.telegramAdvertiser.update.mockClear();
    f.tx.telegramAdvertiserActivity.create.mockClear();
    f.contact.manualSalesStatus = 'CLOSED';
    await f.service.record('user', 'client', {
      operationId: operationId.replace('e002', 'e003'),
      action: 'CLOSED',
    });
    expect(f.tx.telegramAdvertiser.update).not.toHaveBeenCalled();
    expect(f.tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
  });
  it('accepts an approved draft for the second confirmed Instagram identity as a manual report only', async () => {
    const f = setup();
    f.tx.telegramAdvertiserContact.findMany.mockResolvedValue([
      { normalizedValue: 'other.profile' },
      { normalizedValue: 'business.profile' },
    ]);
    f.tx.telegramLeadCandidate.findFirst.mockResolvedValue({
      id: 'candidate',
      contacts: [
        {
          type: 'INSTAGRAM',
          role: 'SALES_CONTACT',
          value: 'https://www.instagram.com/business.profile/',
          confirmed: true,
        },
      ],
    });
    await f.service.record('user', 'client', {
      operationId,
      action: 'OFFER_SENT',
      candidateId: 'candidate',
      draftId: 'draft',
      draftRevision: 1,
    });
    expect(firstArgument(f.tx.telegramAdvertiserActivity.create)).toMatchObject(
      {
        data: {
          metadata: {
            action: 'OFFER_SENT',
            reportedManually: true,
            draftId: 'draft',
          },
        },
      },
    );
    await f.service.record('user', 'client', {
      operationId,
      action: 'OFFER_SENT',
      candidateId: 'candidate',
      draftId: 'draft',
      draftRevision: 1,
    });
    expect(f.preparations.view).toHaveBeenCalledTimes(1);
  });
  it('records a newly reported older fact without rewriting unchanged compact timestamps', async () => {
    const f = setup();
    f.contact.manualInstagramContactAt = new Date('2030-02-10T11:00:00Z');
    f.contact.lastContactAt = new Date('2030-02-10T11:30:00Z');
    await f.service.record('user', 'client', {
      operationId,
      action: 'CONTACTED',
      occurredAt: '2030-02-09T10:00:00Z',
    });
    expect(f.tx.telegramAdvertiser.update).not.toHaveBeenCalled();
    expect(f.tx.telegramAdvertiserActivity.create).toHaveBeenCalledTimes(1);
    expect(f.contact.manualInstagramContactAt.toISOString()).toBe(
      '2030-02-10T11:00:00.000Z',
    );
    expect(f.contact.lastContactAt.toISOString()).toBe(
      '2030-02-10T11:30:00.000Z',
    );
  });
});
