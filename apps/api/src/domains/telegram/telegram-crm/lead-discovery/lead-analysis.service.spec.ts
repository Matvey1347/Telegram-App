import {
  Prisma,
  type TelegramLeadObservation,
  type TelegramLeadSource,
} from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type {
  LeadClassification,
  LeadExtraction,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AiGateway } from '../../../operations/ai/ai-gateway';
import type { AiExecutionRequest } from '../../../operations/ai/ai-admission.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadCandidateService } from './lead-candidate.service';
import {
  TelegramLeadAnalysisService,
  LEAD_DISCOVERY_VERSION,
} from './lead-analysis.service';
import { leadObservation, leadSource } from './lead.spec-fixtures';
function fixture(overrides: Partial<TelegramLeadObservation> = {}) {
  const row = leadObservation(overrides),
    source = leadSource();
  const classification: LeadClassification = {
    classification: 'ADVERTISEMENT',
    commercialIntent: true,
    niche: 'Business education',
    offerType: 'Course',
    hasContact: true,
    relevance: 'POSSIBLE',
    confidence: 0.8,
    risks: ['UNVERIFIED_IDENTITY'],
    evidence: ['e1'],
  };
  const extraction: LeadExtraction = {
    projectName: '',
    productName: '',
    contacts: [
      {
        type: 'TELEGRAM',
        value: '@business_contact',
        role: 'SALES_CONTACT',
        evidence: '@business_contact',
      },
    ],
    warnings: ['MANUAL_REVIEW_REQUIRED'],
  };
  const updateMany = jest.fn(
    ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      for (const key of [
        'id',
        'workspaceId',
        'contentHash',
        'classificationOperationId',
        'extractionOperationId',
        'originalStatus',
      ] as const)
        if (key in where && row[key] !== where[key])
          return Promise.resolve({ count: 0 });
      if (row.reviewStatus === 'REJECTED' && where.reviewStatus)
        return Promise.resolve({ count: 0 });
      Object.assign(row, data);
      if (data.classification === Prisma.DbNull) row.classification = null;
      if (data.extraction === Prisma.DbNull) row.extraction = null;
      return Promise.resolve({ count: 1 });
    },
  );
  const prisma = {
    telegramLeadObservation: {
      findMany: jest.fn(() => Promise.resolve([{ ...row, source }])),
      updateMany,
    },
    telegramLeadSource: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(source),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'source' }]),
    $transaction: jest.fn(),
    aiOperation: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'ledger', status: 'SUCCEEDED' }),
    },
  };
  prisma.$transaction.mockImplementation(
    (operation: (tx: typeof prisma) => unknown) => operation(prisma),
  );
  const policy = {
    access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    assertProcessing: jest.fn(),
    recheckAi: jest.fn().mockResolvedValue(source),
  };
  const gateway = {
    execute: jest.fn((request: AiExecutionRequest) =>
      Promise.resolve({
        operation: { id: `ledger_${request.category}`, status: 'SUCCEEDED' },
        result:
          request.category === 'LEAD_AD_CLASSIFICATION'
            ? classification
            : extraction,
        replayed: false,
      }),
    ),
  };
  const candidates = {
    materialCandidate: jest.fn(() => {
      row.candidateId = 'candidate';
      return Promise.resolve('candidate');
    }),
  };
  const service = new TelegramLeadAnalysisService(
    prisma as unknown as PrismaService,
    policy as unknown as TelegramLeadPolicy,
    gateway as unknown as AiGateway,
    candidates as unknown as TelegramLeadCandidateService,
  );
  return {
    service,
    row,
    source,
    classification,
    extraction,
    prisma,
    policy,
    gateway,
    candidates,
  };
}
describe('Lead explicitly requested AI stages', () => {
  it('uses one classifier and at most one contact extractor, persists literal evidence and reuses unchanged version', async () => {
    const h = fixture();
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      analyzed: 1,
      extracted: 1,
      unknown: 0,
    });
    expect(
      h.gateway.execute.mock.calls.map(([request]) => request.category),
    ).toEqual(['LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION']);
    expect(h.row).toMatchObject({
      classificationVersion: LEAD_DISCOVERY_VERSION,
      extractionVersion: LEAD_DISCOVERY_VERSION,
      processingStatus: 'EXTRACTED',
    });
    expect(h.row.classification).toMatchObject({ evidence: [h.row.text] });
    const classifierInput = JSON.parse(
      h.gateway.execute.mock.calls[0][0].input,
    ) as {
      text?: string;
      evidenceOptions: Array<{ id: string; text: string }>;
    };
    expect(classifierInput).not.toHaveProperty('text');
    expect(classifierInput.evidenceOptions).toEqual([
      { id: 'e1', text: h.row.text },
    ]);
    expect(h.candidates.materialCandidate).toHaveBeenCalledTimes(1);
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(2);
    expect(h.policy.recheckAi).toHaveBeenCalledTimes(4);
  });
  it('does not pay again for concurrent same-observation classifier claims', async () => {
    const h = fixture();
    h.classification.hasContact = false;
    h.classification.classification = 'ORGANIC_CONTENT';
    h.classification.commercialIntent = false;
    await Promise.all([
      h.service.analyze('manager', ['observation']),
      h.service.analyze('manager', ['observation']),
    ]);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('does not extract organic irrelevant text', async () => {
    const h = fixture();
    Object.assign(h.classification, {
      classification: 'ORGANIC_CONTENT',
      commercialIntent: false,
      relevance: 'NOT_RELEVANT',
      hasContact: false,
    });
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
  });
  it('creates and restores an identified advertiser without contacts', async () => {
    const h = fixture();
    h.classification.hasContact = false;
    h.extraction.projectName = h.row.text.slice(0, 10);
    h.extraction.contacts = [];
    h.candidates.materialCandidate.mockRejectedValueOnce(
      new Error('write failed'),
    );
    await h.service.analyze('manager', ['observation']);
    expect(h.row.extraction).not.toBeNull();
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(2);
    expect(h.candidates.materialCandidate).toHaveBeenLastCalledWith(
      'workspace',
      'manager',
      'observation',
      expect.objectContaining({
        title: h.extraction.projectName,
        contacts: [],
      }),
      h.row.contentHash,
      'ai',
      false,
      undefined,
    );
  });
  it('does not invent a candidate when no project or contact is identified', async () => {
    const h = fixture();
    h.classification.hasContact = false;
    h.extraction.contacts = [];
    await h.service.analyze('manager', ['observation']);
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
  });
  it('allows UNKNOWN with relevant explicit contact need without asserting payment', async () => {
    const h = fixture();
    Object.assign(h.classification, {
      classification: 'UNKNOWN',
      commercialIntent: false,
      hasContact: true,
    });
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(2);
    expect(h.row.classification).toMatchObject({ classification: 'UNKNOWN' });
  });
  it('upgrades old classifier version once and never retries an uncertain paid attempt', async () => {
    const h = fixture({
      classification: { classification: 'ORGANIC_CONTENT' },
      classificationVersion: 'old-version',
      classificationOperationId: 'old-operation',
    });
    h.gateway.execute.mockRejectedValue(new Error('provider timeout'));
    h.prisma.aiOperation.findFirst.mockResolvedValue({
      id: 'held-ledger',
      status: 'UNKNOWN',
    });
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      unknown: 1,
    });
    expect(h.row.classification).toBeNull();
    expect(h.row.classificationVersion).toBe(LEAD_DISCOVERY_VERSION);
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('upgrades extraction version once and suppresses another paid attempt after persistence uncertainty', async () => {
    const h = fixture({
      classification: {
        classification: 'ADVERTISEMENT',
        commercialIntent: true,
        hasContact: true,
        relevance: 'POSSIBLE',
      },
      classificationVersion: LEAD_DISCOVERY_VERSION,
      classificationOperationId: 'classified',
      extraction: { contacts: [] },
      extractionVersion: 'old-version',
      extractionOperationId: 'old-extraction',
    });
    h.gateway.execute.mockRejectedValue(new Error('network uncertainty'));
    h.prisma.aiOperation.findFirst.mockResolvedValue({
      id: 'held-ledger',
      status: 'UNKNOWN',
    });
    await h.service.analyze('manager', ['observation']);
    expect(h.row.extraction).toBeNull();
    expect(h.row.extractionVersion).toBe(LEAD_DISCOVERY_VERSION);
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('refuses hallucinated evidence, preserves known billed failure metadata and does not create CRM', async () => {
    const h = fixture();
    h.classification.evidence = ['e99'];
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      failed: 1,
      failures: [
        {
          observationId: 'observation',
          stage: 'classification',
          code: 'LEAD_CLASSIFICATION_EVIDENCE_ID_INVALID',
        },
      ],
    });
    expect(h.row).toMatchObject({
      processingStatus: 'FAILED',
      classificationOperationDbId: 'ledger',
    });
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
  });
  it('refuses invented project names without reclassifying or silently paying again', async () => {
    const h = fixture();
    h.extraction.projectName = 'Invented project not present in source';
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      failed: 1,
    });
    expect(h.row.processingStatus).toBe('FAILED');
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
    await h.service.analyze('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(2);
  });
  it('restores candidate persistence from cached extraction after a failure without another paid generation', async () => {
    const h = fixture();
    h.candidates.materialCandidate.mockRejectedValueOnce(
      new Error('candidate persistence failed'),
    );
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      failed: 1,
    });
    expect(h.row.extraction).not.toBeNull();
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      extracted: 1,
    });
    expect(h.gateway.execute).toHaveBeenCalledTimes(2);
    expect(h.candidates.materialCandidate).toHaveBeenCalledTimes(2);
  });
  it('does not apply an AI response to edited material or source/permission revocation', async () => {
    const h = fixture();
    h.gateway.execute.mockImplementationOnce(() => {
      h.row.contentHash = 'edited';
      h.row.classificationOperationId = null;
      return Promise.resolve({
        operation: { id: 'ledger', status: 'SUCCEEDED' },
        result: h.classification,
        replayed: false,
      });
    });
    expect(await h.service.analyze('manager', ['observation'])).toMatchObject({
      skipped: 1,
    });
    expect(h.row.classification).toBeNull();
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
    const denied = fixture();
    denied.policy.recheckAi.mockRejectedValue(new Error('revoked'));
    expect(
      await denied.service.analyze('manager', ['observation']),
    ).toMatchObject({ failed: 1 });
    expect(denied.gateway.execute).not.toHaveBeenCalled();
  });
  it('enforces explicit size/review/deletion gates before any paid request', async () => {
    const h = fixture();
    await expect(
      h.service.analyze(
        'manager',
        Array.from({ length: 6 }, (_, i) => String(i)),
      ),
    ).rejects.toThrow('LEAD_ANALYZE_LIMIT');
    for (const status of ['REJECTED', 'DELETED']) {
      const blocked = fixture(
        status === 'REJECTED'
          ? { reviewStatus: 'REJECTED' }
          : { originalStatus: 'DELETED' },
      );
      await blocked.service.analyze('manager', ['observation']);
      expect(blocked.gateway.execute).not.toHaveBeenCalled();
    }
  });
});

describe('internal automatic admission', () => {
  it.each(['CLASSIFYING', 'UNKNOWN'])(
    'stops the whole batch for an existing unresolved classification (%s)',
    async (status) => {
      const h = fixture({
        processingStatus: status,
        classificationOperationId: 'previous',
        classification: null,
      });
      h.prisma.telegramLeadObservation.findMany.mockResolvedValue([
        {
          ...h.row,
          id: 'second',
          classificationOperationId: null,
          processingStatus: 'PENDING',
          source: h.source,
        },
        { ...h.row, classification: null, source: h.source },
      ]);
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(
          await h.service.analyzeAutomatically('manager', [
            'second',
            'observation',
          ]),
        ).toMatchObject({
          unknown: 1,
          failures: [
            expect.objectContaining({
              observationId: 'observation',
              stage: 'classification',
              code: 'AI_OUTCOME_UNCERTAIN',
            }),
          ],
        });
      }
      expect(h.gateway.execute).not.toHaveBeenCalled();
      expect(
        h.prisma.telegramLeadObservation.updateMany,
      ).not.toHaveBeenCalled();
    },
  );
  it.each(['EXTRACTING', 'UNKNOWN'])(
    'stops the whole batch for an existing unresolved extraction (%s)',
    async (status) => {
      const h = fixture({
        processingStatus: status,
        classification: {
          classification: 'ADVERTISEMENT',
          commercialIntent: true,
          hasContact: true,
          relevance: 'POSSIBLE',
        },
        classificationVersion: LEAD_DISCOVERY_VERSION,
        classificationOperationId: 'classified',
        extractionOperationId: 'previous',
        extraction: null,
      });
      h.prisma.telegramLeadObservation.findMany.mockResolvedValue([
        {
          ...h.row,
          id: 'second',
          classification: null,
          classificationOperationId: null,
          extractionOperationId: null,
          processingStatus: 'PENDING',
          source: h.source,
        },
        { ...h.row, extraction: null, source: h.source },
      ]);
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(
          await h.service.analyzeAutomatically('manager', [
            'second',
            'observation',
          ]),
        ).toMatchObject({
          unknown: 1,
          failures: [
            expect.objectContaining({
              observationId: 'observation',
              stage: 'extraction',
              code: 'AI_OUTCOME_UNCERTAIN',
            }),
          ],
        });
      }
      expect(h.gateway.execute).not.toHaveBeenCalled();
      expect(
        h.prisma.telegramLeadObservation.updateMany,
      ).not.toHaveBeenCalled();
    },
  );
  it('uses automatic mode for each paid stage and keeps manual requests manual', async () => {
    const automatic = fixture();
    await automatic.service.analyzeAutomatically('manager', ['observation']);
    expect(
      automatic.gateway.execute.mock.calls.map(([request]) => request.mode),
    ).toEqual(['AUTOMATIC', 'AUTOMATIC']);
    expect(automatic.policy.assertProcessing).toHaveBeenCalledWith(
      automatic.source,
      'ai',
      true,
    );
    const manual = fixture();
    await manual.service.analyze('manager', ['observation']);
    expect(
      manual.gateway.execute.mock.calls.map(([request]) => request.mode),
    ).toEqual(['MANUAL', 'MANUAL']);
    expect(manual.policy.assertProcessing).toHaveBeenCalledWith(
      manual.source,
      'ai',
      false,
    );
  });
  it('rejects a paused source before claiming or sending paid work', async () => {
    const h = fixture();
    h.source.monitoringState = 'PAUSED';
    h.policy.assertProcessing.mockImplementation(
      (source: TelegramLeadSource, _mode: string, active: boolean) => {
        if (active && source.monitoringState !== 'ACTIVE')
          throw new ForbiddenException('LEAD_PROCESSING_NOT_APPROVED');
      },
    );
    await expect(
      h.service.analyzeAutomatically('manager', ['observation']),
    ).rejects.toThrow('LEAD_PROCESSING_NOT_APPROVED');
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(h.prisma.telegramLeadObservation.updateMany).not.toHaveBeenCalled();
  });
  it('rechecks the active source after classification and stops before extraction if it was paused', async () => {
    const h = fixture();
    h.policy.assertProcessing.mockImplementation(
      (source: TelegramLeadSource, _mode: string, active: boolean) => {
        if (active && source.monitoringState !== 'ACTIVE')
          throw new ForbiddenException('LEAD_PROCESSING_NOT_APPROVED');
      },
    );
    h.gateway.execute.mockImplementationOnce(() => {
      h.source.monitoringState = 'PAUSED';
      return Promise.resolve({
        operation: { id: 'ledger', status: 'SUCCEEDED' },
        result: h.classification,
        replayed: false,
      });
    });
    expect(
      await h.service.analyzeAutomatically('manager', ['observation']),
    ).toMatchObject({ unknown: 1 });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
  });
  it('reports an automatic budget denial without hidden paid retries', async () => {
    const h = fixture();
    h.prisma.aiOperation.findFirst.mockResolvedValue(null);
    h.prisma.telegramLeadObservation.findMany.mockResolvedValue([
      { ...h.row, source: h.source },
      { ...h.row, id: 'second', source: h.source },
    ]);
    h.gateway.execute.mockRejectedValue(
      new ConflictException('AI_AUTOMATIC_DISABLED'),
    );
    expect(
      await h.service.analyzeAutomatically('manager', [
        'observation',
        'second',
      ]),
    ).toMatchObject({
      failed: 1,
      failures: [expect.objectContaining({ code: 'AI_AUTOMATIC_DISABLED' })],
    });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(h.row.classificationOperationId).toBeNull();
  });
  it('rejects changed source bindings when saving a completed automatic result', async () => {
    const h = fixture();
    h.prisma.$queryRaw.mockImplementationOnce(() => {
      h.source.channelId = '98765';
      return Promise.resolve([{ id: 'source' }]);
    });
    expect(
      await h.service.analyzeAutomatically('manager', ['observation']),
    ).toMatchObject({ failed: 1 });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(h.row.classification).toBeNull();
    expect(h.candidates.materialCandidate).not.toHaveBeenCalled();
  });
  it('does not pay again after an unknown automatic provider outcome', async () => {
    const h = fixture();
    h.gateway.execute.mockResolvedValue({
      operation: { id: 'held-ledger', status: 'UNKNOWN' },
      result: undefined as unknown as LeadClassification,
      replayed: false,
    });
    expect(
      await h.service.analyzeAutomatically('manager', ['observation']),
    ).toMatchObject({ unknown: 1 });
    await h.service.analyzeAutomatically('manager', ['observation']);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
});
