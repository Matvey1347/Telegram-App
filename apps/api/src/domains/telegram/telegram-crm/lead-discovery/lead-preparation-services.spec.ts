import { AiAdmissionService } from '../../../operations/ai/ai-admission.service';
import { copilotHash } from '../telegram-crm-copilot-context.service';
import { BadRequestException } from '@nestjs/common';
import type { LeadQualificationOutput } from '@telegram-system/shared';
import { TelegramLeadQualificationService } from './lead-qualification.service';
import { TelegramLeadCandidateDraftService } from './lead-candidate-draft.service';
import { TelegramLeadPreparationReadService } from './lead-preparation-read.service';
import { defaultLeadScorePolicy } from './lead-qualification-policy';
import {
  leadDraftApprovalHash,
  leadHumanQualificationFresh,
} from './lead-preparation-state';
import type { LeadPreparationContext } from './lead-preparation-context.service';
import {
  leadCandidate as candidate,
  leadObservation as observation,
  leadSource,
} from './lead.spec-fixtures';
const op = () =>
  `${new Date().toISOString().slice(0, 10)}:bb831ba2-72e5-4ca1-aa25-8a19a908f013`;
const result: LeadQualificationOutput = {
  relevance: 'HIGH',
  thematicFit: 'HIGH',
  advertiserIdentity: 'CONFIRMED',
  evidenceQuality: 'STRONG',
  recommendedOffer: 'Review selected package placement',
  reasons: [
    {
      observationId: 'material',
      quote: 'Public business offer',
      reason: 'Evidenced commercial offer',
    },
  ],
  riskSignals: [],
  missingFacts: [],
};
function setup() {
  const row = candidate({
    reviewStatus: 'APPROVED',
    riskStatus: 'ACCEPTABLE',
    qualificationDecision: 'QUALIFIED',
    qualificationContextVersion: 'context',
    qualificationReviewedAt: new Date(),
    riskAcknowledgedAt: null,
  });
  const current = {
    workspaceId: 'workspace',
    candidate: row,
    observations: [
      {
        ...observation({
          id: 'material',
          text: 'Public business offer',
          candidateId: row.id,
        }),
        source: leadSource(),
      },
    ],
    contacts: [{ confirmed: true }],
    products: [{ id: 'product' }],
    channelFacts: { channels: [], facts: [], verifiedThemes: true },
    facts: [],
    missingFacts: [],
    warnings: [],
    contextVersion: 'context',
    scoreFacts: {
      verifiedProducts: true,
      confirmedContact: true,
      commercialOffer: true,
      fresh: true,
      repeatedEvidence: true,
    },
    policy: defaultLeadScorePolicy,
    canGenerate: true,
    blockedReason: null,
  } as unknown as LeadPreparationContext;
  const qualification = {
    id: 'qualification',
    workspaceId: 'workspace',
    candidateId: row.id,
    operationId: op(),
    contextVersion: 'context',
    policyVersion: defaultLeadScorePolicy.version,
    authorUserId: 'operator',
    status: 'READY',
    createdAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 86400000),
    requestSnapshot: { productIds: ['product'] },
    score: { riskLevel: 'RISK_LOW', status: 'SCORED' },
    output: result,
    updatedAt: new Date(),
    operationDbId: null,
  };
  const qual = {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest
      .fn()
      .mockResolvedValue({ ...qualification, status: 'GENERATING' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const draft = {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const receipt = jest.fn().mockResolvedValue(null);
  const tx = {
    telegramLeadQualification: qual,
    telegramLeadCandidateDraft: draft,
    aiOperation: { findFirst: receipt },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    ...tx,
    telegramLeadCandidate: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((work: (value: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const context = {
    prisma,
    build: jest.fn().mockResolvedValue(current),
    assert: jest.fn((value: LeadPreparationContext) => {
      if (value.blockedReason) throw new Error(value.blockedReason);
    }),
    policy: {
      access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
      refresh: jest.fn().mockResolvedValue(undefined),
    },
  };
  const read = { view: jest.fn().mockResolvedValue({ candidateId: row.id }) };
  const gateway = {
    execute: jest.fn().mockResolvedValue({
      operation: { id: 'receipt', status: 'SUCCEEDED' },
      result,
    }),
  };
  const service = new TelegramLeadQualificationService(
    context as never,
    read as never,
    gateway as never,
  );
  return {
    current,
    qualification,
    qual,
    draft,
    receipt,
    prisma,
    context,
    read,
    gateway,
    service,
    draftService: new TelegramLeadCandidateDraftService(
      context as never,
      read as never,
      gateway as never,
    ),
  };
}
describe('candidate qualification application boundaries', () => {
  it('runs only explicitly and persists a grounded score through the shared gateway', async () => {
    const h = setup();
    expect(h.gateway.execute).not.toHaveBeenCalled();
    await h.service.qualify('operator', h.current.candidate.id, {
      operationId: op(),
      productIds: ['product'],
    });
    expect(h.gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'LEAD_QUALIFICATION',
        mode: 'MANUAL',
        businessObjectId: `lead-qualification:${copilotHash({ candidateId: 'candidate', contextVersion: 'context' })}`,
      }),
    );
    expect(h.qual.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          score: expect.objectContaining({
            status: 'SCORED',
            overall: 100,
          }) as unknown,
        }) as unknown,
      }),
    );
  });
  it('reuses an existing current result without calling the gateway or writing', async () => {
    const h = setup();
    h.qual.findFirst.mockResolvedValue(h.qualification);
    await h.service.qualify('operator', h.current.candidate.id, {
      operationId: op(),
      productIds: ['product'],
    });
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(h.qual.create).not.toHaveBeenCalled();
    expect(h.qual.updateMany).not.toHaveBeenCalled();
  });
  it('denies rejected or processing-ineligible candidates before claims or disclosure', async () => {
    const h = setup();
    h.current.blockedReason = 'LEAD_CANDIDATE_NOT_ELIGIBLE';
    await expect(
      h.service.qualify('operator', 'candidate', {
        operationId: op(),
        productIds: [],
      }),
    ).rejects.toThrow('NOT_ELIGIBLE');
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('records known budget admission denial as FAILED and permits a new explicit operation', async () => {
    const h = setup();
    h.gateway.execute.mockRejectedValueOnce(
      new BadRequestException('AI_BUDGET_EXCEEDED'),
    );
    await expect(
      h.service.qualify('operator', 'candidate', {
        operationId: op(),
        productIds: ['product'],
      }),
    ).rejects.toThrow('AI_BUDGET_EXCEEDED');
    expect(h.qual.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'FAILED', operationDbId: null },
      }),
    );
    await h.service.qualify('operator', 'candidate', {
      operationId: op().replace('bb831ba2', 'cc831ba2'),
      productIds: ['product'],
    });
    expect(h.gateway.execute).toHaveBeenCalledTimes(2);
  });
  it('holds an uncertain provider attempt instead of silently claiming another generation', async () => {
    const h = setup();
    h.gateway.execute.mockRejectedValueOnce(new Error('network interrupted'));
    await expect(
      h.service.qualify('operator', 'candidate', {
        operationId: op(),
        productIds: ['product'],
      }),
    ).rejects.toThrow('network interrupted');
    expect(h.qual.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'UNKNOWN', operationDbId: null },
      }),
    );
    h.qual.findFirst.mockResolvedValue({
      ...h.qualification,
      status: 'UNKNOWN',
    });
    await h.service.qualify('operator', 'candidate', {
      operationId: op(),
      productIds: ['product'],
    });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('rejects source or price changes during generation instead of saving a current result', async () => {
    const h = setup();
    h.context.build
      .mockResolvedValueOnce(h.current)
      .mockResolvedValueOnce(h.current)
      .mockResolvedValueOnce({ ...h.current, contextVersion: 'changed' });
    await expect(
      h.service.qualify('operator', 'candidate', {
        operationId: op(),
        productIds: ['product'],
      }),
    ).rejects.toThrow('LEAD_CONTEXT_CHANGED');
    expect(h.qual.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY' }) as unknown,
      }),
    );
  });
  it('requires a distinct risk acknowledgement for high risk human qualification', async () => {
    const h = setup();
    h.qual.findFirst.mockResolvedValue({
      ...h.qualification,
      score: { status: 'SCORED', riskLevel: 'RISK_HIGH' },
    });
    await expect(
      h.service.decide('operator', 'candidate', {
        revision: 1,
        qualificationId: 'qualification',
        contextVersion: 'context',
        decision: 'QUALIFIED',
        acknowledgeHighRisk: false,
      }),
    ).rejects.toThrow('LEAD_HIGH_RISK_DECISION_REQUIRED');
    expect(h.prisma.telegramLeadCandidate.updateMany).not.toHaveBeenCalled();
  });
});
describe('candidate draft approval remains scoped to current human decisions', () => {
  it('revocation and replacement qualification invalidate the approval hash without another AI call', () => {
    const h = setup();
    const hash = leadDraftApprovalHash(
      'Current proposal',
      2,
      'context',
      h.current.candidate,
      h.qualification.id,
    );
    h.current.candidate.qualificationDecision = 'LOW_RELEVANCE';
    expect(
      leadHumanQualificationFresh(h.current.candidate, h.qualification),
    ).toBe(false);
    expect(
      leadDraftApprovalHash(
        'Current proposal',
        2,
        'context',
        h.current.candidate,
        h.qualification.id,
      ),
    ).not.toBe(hash);
    h.current.candidate.qualificationDecision = 'QUALIFIED';
    expect(
      leadDraftApprovalHash(
        'Current proposal',
        2,
        'context',
        h.current.candidate,
        'replacement',
      ),
    ).not.toBe(hash);
  });
  it('an approval before a new qualification cannot acknowledge its risks', () => {
    const h = setup();
    expect(
      leadHumanQualificationFresh(h.current.candidate, {
        ...h.qualification,
        createdAt: new Date(Date.now() + 1000),
      }),
    ).toBe(false);
  });
  it('refuses candidate draft generation when a human qualification was revoked', async () => {
    const h = setup();
    h.current.candidate.qualificationDecision = 'LOW_RELEVANCE';
    await expect(
      h.draftService.generate('operator', 'candidate', {
        operationId: op(),
        productIds: ['product'],
        tone: 'NATURAL',
        language: 'uk',
      }),
    ).rejects.toThrow('LEAD_HUMAN_QUALIFICATION_REQUIRED');
    expect(h.gateway.execute).not.toHaveBeenCalled();
  });
  it('returns revoked approvals as review required with Copy disabled', () => {
    const h = setup();
    const read = new TelegramLeadPreparationReadService(h.context as never);
    h.current.candidate.qualificationDecision = 'NEEDS_REVIEW';
    const draft = {
      id: 'draft',
      candidateId: 'candidate',
      authorUserId: 'operator',
      operationId: op(),
      status: 'APPROVED',
      text: 'Current proposal',
      tone: 'NATURAL',
      language: 'uk',
      output: null,
      warnings: [],
      evidenceRefs: [],
      contextVersion: 'context',
      revision: 2,
      approvedAt: new Date(),
      approvalHash: 'old',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    };
    expect(
      read.draft(draft as never, h.current, null, h.qualification),
    ).toMatchObject({ status: 'REVIEW_REQUIRED', canCopy: false });
  });
});

describe('candidate first-offer happy path and explicit lifecycle', () => {
  function lifecycle() {
    const h = setup();
    const state = {
      id: 'draft',
      workspaceId: 'workspace',
      candidateId: 'candidate',
      authorUserId: 'operator',
      operationId: op(),
      operationDbId: null,
      category: 'SALES_FIRST_DRAFT',
      requestFingerprint: 'fingerprint',
      contextVersion: 'context',
      requestSnapshot: {
        productIds: ['product'],
        tone: 'NATURAL',
        language: 'uk',
      },
      evidenceRefs: ['material'],
      status: 'READY',
      tone: 'NATURAL',
      language: 'uk',
      text: 'Вітаю! Можу запропонувати пакетне розміщення. Надіслати деталі?',
      output: null,
      warnings: [],
      revision: 1,
      approvedAt: null,
      approvalHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    };
    h.qual.findFirst.mockResolvedValue(h.qualification);
    h.draft.findFirst.mockResolvedValue(state);
    h.draft.create.mockResolvedValue(state);
    h.draft.updateMany.mockImplementation((request: unknown) => {
      const data = (request as { data: Record<string, unknown> }).data;
      const revision =
        state.revision +
        ((data.revision as { increment?: number } | undefined)?.increment ?? 0);
      Object.assign(state, data, data.revision ? { revision } : {});
      return Promise.resolve({ count: 1 });
    });
    const read = new TelegramLeadPreparationReadService(h.context as never);
    h.read.view.mockImplementation(() =>
      Promise.resolve({
        candidateId: 'candidate',
        draft: read.draft(state as never, h.current, null, h.qualification),
      }),
    );
    return { ...h, state };
  }
  it('generates a candidate-scoped first offer using SALES_FIRST_DRAFT without a conversation or send', async () => {
    const h = lifecycle();
    h.draft.findFirst.mockResolvedValueOnce(null);
    h.gateway.execute.mockResolvedValue({
      operation: { id: 'receipt', status: 'SUCCEEDED' },
      result: {
        suggestedMessage: h.state.text,
        reasoningSummary: 'Review current evidence',
        recommendedAction: 'PREPARE_PACKAGE',
        customerIntent: 'Public offer',
        confidence: 0.7,
        usedFacts: [],
        missingFacts: [],
        warnings: [],
        requiresHumanReview: true,
        language: 'uk',
        tone: 'NATURAL',
        contextVersion: 'context',
      },
    });
    await h.draftService.generate('operator', 'candidate', {
      operationId: op(),
      productIds: ['product'],
      tone: 'NATURAL',
      language: 'AUTO',
    });
    expect(h.state.status).toBe('READY');
    expect(h.state.text).toContain('пакетне розміщення');
    expect(h.state.approvedAt).toBeNull();
    const calls = h.gateway.execute.mock.calls as unknown as Array<
      [
        {
          category: string;
          businessObjectId: string;
          input: string;
        },
      ]
    >;
    const request = calls[0][0];
    expect(request.category).toBe('SALES_FIRST_DRAFT');
    expect(request.businessObjectId).toMatch(/^lead-candidate-draft:/);
    expect(request.businessObjectId.length).toBeLessThanOrEqual(100);
    expect(request.input).not.toContain('conversationId');
  });
  it('saves only explicit edits, approves exact text, no-ops repeated approval, and removes approval on an edit', async () => {
    const h = lifecycle();
    expect(h.draft.updateMany).not.toHaveBeenCalled();
    await h.draftService.patch('operator', 'candidate', 'draft', {
      revision: 1,
      action: 'APPROVE',
    });
    expect(h.state.status).toBe('APPROVED');
    expect(h.state.revision).toBe(2);
    expect(h.state.approvalHash).toBeTruthy();
    const calls = h.draft.updateMany.mock.calls.length;
    await h.draftService.patch('operator', 'candidate', 'draft', {
      revision: 2,
      action: 'APPROVE',
    });
    expect(h.draft.updateMany.mock.calls.length).toBe(calls);
    await h.draftService.patch('operator', 'candidate', 'draft', {
      revision: 2,
      action: 'SAVE',
      text: 'Вітаю! Можу надіслати умови пакетного розміщення для вашої програми?',
    });
    expect(h.state.status).toBe('REVIEW_REQUIRED');
    expect(h.state.approvedAt).toBeNull();
    expect(h.state.approvalHash).toBeNull();
    expect(h.state.revision).toBe(3);
    await h.draftService.patch('operator', 'candidate', 'draft', {
      revision: 3,
      action: 'APPROVE',
    });
    expect(h.state.status).toBe('APPROVED');
    expect(h.state.revision).toBe(4);
    expect(h.gateway.execute).not.toHaveBeenCalled();
  });
  it('requires editing unverified package prices and cannot approve expired drafts', async () => {
    const h = lifecycle();
    h.state.text = 'Пакет коштує 999 USD';
    await expect(
      h.draftService.patch('operator', 'candidate', 'draft', {
        revision: 1,
        action: 'APPROVE',
      }),
    ).rejects.toThrow('LEAD_DRAFT_ASSERTIONS_REQUIRE_EDIT');
    expect(h.draft.updateMany).not.toHaveBeenCalled();
    h.state.expiresAt = new Date(0);
    await expect(
      h.draftService.patch('operator', 'candidate', 'draft', {
        revision: 1,
        action: 'APPROVE',
      }),
    ).rejects.toThrow('LEAD_DRAFT_NOT_EDITABLE');
  });
  it('a same-text save is a no-op, while stale revisions and source-policy loss fail', async () => {
    const h = lifecycle();
    await h.draftService.patch('operator', 'candidate', 'draft', {
      revision: 1,
      action: 'SAVE',
      text: h.state.text,
    });
    expect(h.draft.updateMany).not.toHaveBeenCalled();
    await expect(
      h.draftService.patch('operator', 'candidate', 'draft', {
        revision: 9,
        action: 'SAVE',
        text: 'New text',
      }),
    ).rejects.toThrow('LEAD_REVISION_CONFLICT');
    h.current.blockedReason = 'LEAD_PROCESSING_NOT_APPROVED';
    await expect(
      h.draftService.patch('operator', 'candidate', 'draft', {
        revision: 1,
        action: 'APPROVE',
      }),
    ).rejects.toThrow('LEAD_PROCESSING_NOT_APPROVED');
  });
  it('requires a fresh decision for a replacement qualification even when its recommendation is unchanged', async () => {
    const h = lifecycle();
    h.current.candidate.qualificationReviewedAt = new Date(0);
    h.qual.findFirst.mockResolvedValue(h.qualification);
    await h.service.decide('operator', 'candidate', {
      revision: 1,
      qualificationId: 'qualification',
      contextVersion: 'context',
      decision: 'QUALIFIED',
      acknowledgeHighRisk: false,
    });
    expect(h.prisma.telegramLeadCandidate.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('real AI admission business identity bounds', () => {
  it('accepts candidate qualification IDs for realistic CUIDs before entering the admission transaction', async () => {
    const h = setup();
    const id = 'clz3mr6hs0000u4c7xki03x2v';
    h.current.candidate.id = id;
    await h.service.qualify('operator', id, {
      operationId: op(),
      productIds: ['product'],
    });
    const calls = h.gateway.execute.mock.calls as unknown as Array<
      [
        {
          userId: string;
          workspaceId: string;
          category: 'LEAD_QUALIFICATION';
          operationId: string;
          mode: 'MANUAL';
          businessObjectId: string;
          input: string;
          instructions: string;
        },
      ]
    >;
    expect(calls[0][0].businessObjectId.length).toBeLessThanOrEqual(100);
    const transaction = jest
      .fn()
      .mockRejectedValue(new Error('ADMISSION_BOUNDARY_ACCEPTED'));
    const admission = new AiAdmissionService(
      { $transaction: transaction } as never,
      {} as never,
      {} as never,
    );
    await expect(admission.admit(calls[0][0])).rejects.toThrow(
      'ADMISSION_BOUNDARY_ACCEPTED',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
