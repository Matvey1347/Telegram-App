import { ResponseCacheService } from '../../../../common/response-cache.service';
import { randomUUID } from 'node:crypto';
import { Prisma, type TelegramLeadCandidate } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import { TelegramLeadCrmLinker } from './lead-crm-linker.service';
import {
  leadCandidate,
  leadObservation,
  leadSource,
} from './lead.spec-fixtures';
function fixture(
  candidates: TelegramLeadCandidate[] = [],
  cache?: ResponseCacheService,
) {
  const observation = leadObservation(),
    source = leadSource();
  const update = jest.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const row = candidates.find((candidate) => candidate.id === where.id)!;
      const revision = row.revision;
      Object.assign(row, data);
      if (typeof data.revision === 'object') row.revision = revision + 1;
      return Promise.resolve(row);
    },
  );
  const tx = {
    $executeRaw: jest.fn((query: Prisma.Sql) =>
      Promise.resolve(query.sql ? 1 : 0),
    ),
    telegramLeadObservation: {
      findFirst: jest.fn(() => Promise.resolve({ ...observation, source })),
      findMany: jest.fn().mockResolvedValue([{ id: 'observation' }]),
      update: jest.fn(({ data }: { data: { candidateId: string } }) => {
        observation.candidateId = data.candidateId;
        return Promise.resolve(observation);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    telegramLeadCandidate: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { workspaceId_identityKey: { identityKey: string } };
        }) =>
          Promise.resolve(
            candidates.find(
              (row) =>
                row.identityKey === where.workspaceId_identityKey.identityKey,
            ) ?? null,
          ),
      ),
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(candidates.find((row) => row.id === where.id) ?? null),
      ),
      findMany: jest.fn(() => Promise.resolve(candidates)),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...leadCandidate({ id: randomUUID() }),
          ...data,
        };
        candidates.push(row);
        return Promise.resolve(row);
      }),
      update,
    },
  };
  const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    },
    policy = {
      access: jest
        .fn()
        .mockResolvedValue({ workspaceId: 'workspace', memberId: 'member' }),
      assertProcessing: jest.fn(),
    },
    read = {
      candidate: jest.fn((user: string, id: string) =>
        Promise.resolve({ id, user }),
      ),
      candidateSummaries: jest.fn().mockResolvedValue([]),
    },
    linker = { link: jest.fn().mockResolvedValue('crm-client') };
  const service = new TelegramLeadCandidateService(
    prisma as unknown as PrismaService,
    policy as unknown as TelegramLeadPolicy,
    read as unknown as TelegramLeadReadService,
    linker as unknown as TelegramLeadCrmLinker,
    cache,
  );
  const input = {
    title: 'Project label',
    contacts: [
      {
        type: 'TELEGRAM' as const,
        value: '@business_contact',
        role: 'SALES_CONTACT' as const,
        evidence: '@business_contact',
      },
    ],
  };
  return {
    service,
    tx,
    policy,
    read,
    linker,
    observation,
    source,
    candidates,
    input,
  };
}
describe('Lead provisional identity grouping and human review', () => {
  it('creates only a provisional literal-contact candidate and attaches evidence without creating CRM', async () => {
    const h = fixture();
    const id = await h.service.materialCandidate(
      'workspace',
      'manager',
      'observation',
      h.input,
    );
    expect(h.observation.candidateId).toBe(id);
    expect(h.candidates[0]).toMatchObject({
      reviewStatus: 'PENDING',
      riskStatus: 'NEEDS_REVIEW',
      identityKey: 'telegram:@business_contact',
      sourceIds: ['source'],
    });
    expect(h.linker.link).not.toHaveBeenCalled();
    await h.service.materialCandidate(
      'workspace',
      'manager',
      'observation',
      h.input,
    );
    expect(h.tx.telegramLeadCandidate.create).toHaveBeenCalledTimes(1);
  });
  it('follows preserved merged identity aliases instead of creating duplicates and renews expired targets on new evidence', async () => {
    const target = leadCandidate({
        id: 'target',
        identityKey: 'telegram:@new_contact',
        reviewStatus: 'REJECTED',
        expiresAt: new Date(0),
        sourceIds: ['old-source'],
      }),
      alias = leadCandidate({
        id: 'alias',
        reviewStatus: 'MERGED',
        mergedIntoId: 'target',
      }),
      h = fixture([target, alias]);
    expect(
      await h.service.materialCandidate(
        'workspace',
        'manager',
        'observation',
        h.input,
      ),
    ).toBe('target');
    expect(h.tx.telegramLeadCandidate.create).not.toHaveBeenCalled();
    expect(target.expiresAt.getTime()).toBe(h.observation.expiresAt.getTime());
    expect(target.reviewStatus).toBe('REJECTED');
    expect(target.sourceIds).toEqual(['old-source', 'source']);
  });
  it('does not group unrelated same-name/destination-only materials by title', async () => {
    const h = fixture([
      leadCandidate({ identityKey: null, title: 'Project label' }),
    ]);
    h.observation.text = 'Читайте @public_destination';
    h.input.contacts = [
      {
        type: 'TELEGRAM',
        value: '@public_destination',
        role: 'SALES_CONTACT',
        evidence: '@public_destination',
      },
    ];
    await h.service.materialCandidate(
      'workspace',
      'manager',
      'observation',
      h.input,
    );
    expect(h.tx.telegramLeadCandidate.create).toHaveBeenCalledTimes(1);
    expect(h.candidates.at(-1)?.identityKey).toBeNull();
  });
  it('requires current revision, literal eligible evidence and explicit confirmed contact indexes', async () => {
    const row = leadCandidate(),
      h = fixture([row]);
    await expect(
      h.service.review('manager', row.id, { revision: 2, action: 'APPROVE' }),
    ).rejects.toThrow('LEAD_CANDIDATE_REVISION_CHANGED');
    await expect(
      h.service.review('manager', row.id, {
        revision: 1,
        action: 'APPROVE',
        confirmedContactIndexes: [2],
      }),
    ).rejects.toThrow('LEAD_CONFIRMED_CONTACT_INDEX_INVALID');
    await h.service.review('manager', row.id, {
      revision: 1,
      action: 'APPROVE',
      confirmedContactIndexes: [0],
    });
    expect(row).toMatchObject({ reviewStatus: 'APPROVED', revision: 2 });
    expect(row.contacts).toMatchObject([{ confirmed: true }]);
    expect(row.reviewHistory as unknown[]).toHaveLength(1);
    expect(h.linker.link).not.toHaveBeenCalled();
  });
  it('keeps human rejection effective and bounds history/merge work', async () => {
    const row = leadCandidate({
        reviewHistory: Array.from({ length: 10 }, () => ({
          at: 'old',
          action: 'OLD',
          actorUserId: 'user',
        })),
      }),
      target = leadCandidate({ id: 'target', identityKey: null }),
      h = fixture([row, target]);
    await h.service.review('manager', row.id, {
      revision: 1,
      action: 'REJECT',
    });
    expect(row).toMatchObject({
      reviewStatus: 'REJECTED',
      riskStatus: 'REJECTED',
    });
    expect(row.reviewHistory as unknown[]).toHaveLength(10);
    await expect(
      h.service.review('manager', row.id, { revision: 2, action: 'APPROVE' }),
    ).rejects.toThrow('LEAD_REJECTED_RISK_REQUIRES_REVIEW');
    row.reviewStatus = 'PENDING';
    row.riskStatus = 'NEEDS_REVIEW';
    h.tx.telegramLeadObservation.findMany.mockResolvedValue(
      Array.from({ length: 5001 }, (_, i) => ({ id: String(i) })),
    );
    await expect(
      h.service.review('manager', row.id, {
        revision: 2,
        action: 'MERGE',
        mergeIntoId: 'target',
      }),
    ).rejects.toThrow('LEAD_MERGE_TOO_LARGE');
    expect(h.tx.telegramLeadObservation.updateMany).not.toHaveBeenCalled();
  });
  it('invalidates the canonical CRM contacts cache only after committed explicit client creation', async () => {
    const cache = { clearWorkspacePath: jest.fn() },
      row = leadCandidate({ reviewStatus: 'APPROVED' }),
      h = fixture([row], cache as unknown as ResponseCacheService);
    await h.service.review('manager', row.id, {
      revision: 1,
      action: 'CREATE_CLIENT',
    });
    expect(cache.clearWorkspacePath).toHaveBeenCalledWith(
      'workspace',
      '/telegram-crm/contacts',
    );
    h.linker.link.mockRejectedValueOnce(new Error('create failed'));
    await expect(
      h.service.review('manager', row.id, {
        revision: 2,
        action: 'CREATE_CLIENT',
      }),
    ).rejects.toThrow('create failed');
    expect(cache.clearWorkspacePath).toHaveBeenCalledTimes(1);
  });
  it('merges evidence and compact sources while keeping old exact identity key resolvable', async () => {
    const row = leadCandidate({ sourceIds: ['source-a'] }),
      target = leadCandidate({
        id: 'target',
        identityKey: 'telegram:@different_contact',
        sourceIds: ['source-b'],
      }),
      h = fixture([row, target]);
    await h.service.review('manager', row.id, {
      revision: 1,
      action: 'MERGE',
      mergeIntoId: 'target',
    });
    expect(row).toMatchObject({
      reviewStatus: 'MERGED',
      identityKey: 'telegram:@business_contact',
      mergedIntoId: 'target',
    });
    expect(target.sourceIds).toEqual(
      expect.arrayContaining(['source-a', 'source-b']),
    );
    expect(h.tx.telegramLeadObservation.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace', candidateId: 'candidate' },
      data: { candidateId: 'target' },
    });
  });
});
