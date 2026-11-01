import { randomUUID } from 'node:crypto';
import type { TelegramCrmAiDraft, Prisma } from '@prisma/client';
import type {
  CrmCopilotGenerateInput,
  CrmCopilotOutput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGateway } from '../../operations/ai/ai-gateway';
import { TelegramCrmCopilotService } from './telegram-crm-copilot.service';
import { TelegramCrmCopilotDraftsService } from './telegram-crm-copilot-drafts.service';
import {
  TelegramCrmCopilotContextService,
  type CopilotContext,
} from './telegram-crm-copilot-context.service';

function fixture() {
  const context: CopilotContext = {
    workspaceId: 'ws',
    conversationId: 'conversation',
    contactId: 'contact',
    contactName: 'Client',
    processingEnabled: true,
    processingReference: 'policy:approved',
    canGenerate: true,
    blockedReason: null,
    facts: [
      {
        id: 'message:1',
        kind: 'MESSAGE',
        text: JSON.stringify({ text: 'Private incoming source' }),
      },
    ],
    missingFacts: [],
    warnings: [],
    contextVersion: 'version',
    identityVersion: 'identity',
    followUpAllowed: true,
    products: [],
  };
  const options = (): CrmCopilotGenerateInput => ({
    operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
    category: 'SALES_REPLY_SUGGESTION',
    tone: 'NATURAL',
    language: 'uk',
    productIds: [],
    includeNotes: false,
    processingBasis: 'DOCUMENTED_CONSENT',
    processingReference: 'consent:record_1',
    sourceAcknowledged: true,
  });
  const result: CrmCopilotOutput = {
    suggestedMessage: 'Вітаю! Уточню деталі у менеджера.',
    reasoningSummary:
      'The customer requests details; ask the manager for a verified quote.',
    recommendedAction: 'CLARIFY',
    customerIntent: 'Requested more information',
    confidence: 0.8,
    usedFacts: ['message:1'],
    missingFacts: [],
    warnings: [],
    requiresHumanReview: true,
    language: 'uk',
    tone: 'NATURAL',
    contextVersion: 'version',
  };
  const rows: TelegramCrmAiDraft[] = [];
  const create = jest.fn(
    ({ data }: { data: Prisma.TelegramCrmAiDraftUncheckedCreateInput }) => {
      const row = {
        id: randomUUID(),
        text: '',
        output: null,
        revision: 1,
        approvedTextHash: null,
        approvedAt: null,
        operationDbId: null,
        sentMessageId: null,
        createdAt: new Date(),
        ...data,
      } as TelegramCrmAiDraft;
      rows.push(row);
      return Promise.resolve(row);
    },
  );
  const update = jest.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<TelegramCrmAiDraft>;
    }) => {
      const row = rows.find((row) => row.id === where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  );
  const updateMany = jest.fn(
    ({
      where,
      data,
    }: {
      where: { revision: number };
      data: Partial<Omit<TelegramCrmAiDraft, 'revision'>>;
    }) => {
      const row = rows[0];
      if (row.revision !== where.revision) return Promise.resolve({ count: 0 });
      const prior = row.revision;
      Object.assign(row, data);
      row.revision = prior + 1;
      return Promise.resolve({ count: 1 });
    },
  );
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    telegramCrmAiDraft: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { workspaceId_operationId: { operationId: string } };
        }) =>
          Promise.resolve(
            rows.find(
              (row) =>
                row.operationId === where.workspaceId_operationId.operationId,
            ) ?? null,
          ),
      ),
      findFirst: jest.fn((query: { where?: { status?: { in: string[] } } }) =>
        Promise.resolve(
          rows.find(
            (row) =>
              !query.where?.status ||
              query.where.status.in.includes(row.status),
          ) ?? null,
        ),
      ),
      count: jest.fn(() => Promise.resolve(rows.length)),
      create,
      update,
      updateMany,
    },
  };
  let tail: Promise<unknown> = Promise.resolve();
  const database = {
    ...tx,
    $transaction: (operation: (client: typeof tx) => Promise<unknown>) => {
      const current = tail.then(() => operation(tx));
      tail = current.catch(() => undefined);
      return current;
    },
    aiOperation: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const builder = {
    access: jest.fn().mockResolvedValue({ workspaceId: 'ws' }),
    suggestionOptions: jest.fn().mockResolvedValue({
      includeNotes: true,
      processingReference: 'policy:workspace',
    }),
    build: jest
      .fn<Promise<CopilotContext>, [string, string, unknown]>()
      .mockResolvedValue(context),
    refreshAccess: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    execute: jest.fn().mockResolvedValue({
      operation: { id: 'operation-db', status: 'SUCCEEDED' },
      result,
      replayed: false,
    }),
  };
  const prisma = database as unknown as PrismaService,
    contextService = builder as unknown as TelegramCrmCopilotContextService;
  const drafts = new TelegramCrmCopilotDraftsService(prisma, contextService);
  const service = new TelegramCrmCopilotService(
    prisma,
    contextService,
    drafts,
    gateway as unknown as AiGateway,
  );
  return {
    service,
    rows,
    create,
    update,
    updateMany,
    builder,
    gateway,
    options,
    context,
    result,
  };
}

describe('CRM Copilot explicit generation and draft lifecycle', () => {
  it('generates a server-owned next-reply preset and replays the same operation without another paid call', async () => {
    const h = fixture();
    const input = { operationId: h.options().operationId };
    const draft = await h.service.suggest('author', 'conversation', input);
    expect(draft.status).toBe('READY');
    expect(h.rows[0].requestSnapshot).toMatchObject({
      category: 'SALES_REPLY_SUGGESTION',
      tone: 'NATURAL',
      language: 'AUTO',
      productIds: [],
      includeNotes: true,
      processingReference: 'policy:workspace',
      preset: 'WORKSPACE_NEXT_MESSAGE',
      feedbackBefore: expect.any(String) as unknown,
    });
    await h.service.suggest('author', 'conversation', input);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    const before = (h.rows[0].requestSnapshot as { feedbackBefore?: string })
      .feedbackBefore;
    for (const call of h.builder.build.mock.calls)
      expect(call[2]).toMatchObject({ feedbackBefore: before });
  });
  it('fences a new paid operation while an earlier suggestion outcome is unknown', async () => {
    const h = fixture();
    h.gateway.execute.mockResolvedValue({
      operation: { id: 'pending-provider', status: 'UNKNOWN' },
      replayed: false,
    });
    const first = await h.service.suggest('author', 'conversation', {
      operationId: h.options().operationId,
    });
    expect(first.status).toBe('UNKNOWN');
    const second = await h.service.suggest('author', 'conversation', {
      operationId: h.options().operationId,
    });
    expect(second.id).toBe(first.id);
    expect(second.operationId).toBe(first.operationId);
    expect(h.rows).toHaveLength(1);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('returns an actionable pre-generation provider error instead of an empty generic failure', async () => {
    const h = fixture();
    h.gateway.execute.mockResolvedValue({
      operation: {
        id: 'failed',
        status: 'FAILED',
        errorCategory: 'TOKEN_COUNT_AUTHENTICATION_FAILED',
      },
      replayed: false,
    });
    const draft = await h.service.suggest('author', 'conversation', {
      operationId: h.options().operationId,
    });
    expect(draft).toMatchObject({
      status: 'FAILED',
      text: '',
      warnings: ['AI_TOKEN_COUNT_AUTHENTICATION_FAILED'],
    });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });

  it('claims concurrent same-ID generation once, restores saved text and keeps source outside persistence', async () => {
    const h = fixture(),
      input = h.options();
    await Promise.all([
      h.service.generate('author', 'conversation', input),
      h.service.generate('author', 'conversation', input),
    ]);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].status).toBe('READY');
    expect(JSON.stringify(h.rows[0])).not.toContain('Private incoming source');
    expect(h.rows[0].requestSnapshot).toMatchObject({
      processingReference: 'consent:record_1',
    });
    expect(
      await h.service.generate('author', 'conversation', input),
    ).toMatchObject({ text: h.result.suggestedMessage });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(h.builder.refreshAccess).toHaveBeenCalledTimes(2);
  });
  it('rejects altered retry options, another author and old IDs before paid calls', async () => {
    const h = fixture(),
      input = h.options();
    await h.service.generate('author', 'conversation', input);
    await expect(
      h.service.generate('author', 'conversation', {
        ...input,
        tone: 'DIRECT',
      }),
    ).rejects.toThrow('COPILOT_OPERATION_CONFLICT');
    await expect(
      h.service.generate('other', 'conversation', input),
    ).rejects.toThrow('COPILOT_DRAFT_OWNER_REQUIRED');
    await expect(
      h.service.generate('author', 'conversation', {
        ...h.options(),
        operationId: `2020-01-01:${randomUUID()}`,
      }),
    ).rejects.toThrow('COPILOT_OPERATION_DATE_INVALID');
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('blocks privacy, DNC, refusal and missing followup before gateway', async () => {
    for (const mode of ['privacy', 'dnc', 'follow']) {
      const h = fixture();
      if (mode === 'privacy') h.context.processingEnabled = false;
      if (mode === 'dnc') {
        h.context.canGenerate = false;
        h.context.blockedReason = 'DO_NOT_CONTACT';
      }
      if (mode === 'follow') h.context.followUpAllowed = false;
      await expect(
        h.service.generate('author', 'conversation', {
          ...h.options(),
          category:
            mode === 'follow' ? 'SALES_FOLLOW_UP' : 'SALES_REPLY_SUGGESTION',
        }),
      ).rejects.toThrow();
      expect(h.gateway.execute).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
    }
  });
  it('retains an uncertain claim after provider/persistence errors without hidden paid retry', async () => {
    const h = fixture(),
      input = h.options();
    h.update.mockRejectedValueOnce(
      new Error('database settlement unavailable'),
    );
    await expect(
      h.service.generate('author', 'conversation', input),
    ).rejects.toThrow('database settlement unavailable');
    expect(
      await h.service.generate('author', 'conversation', input),
    ).toMatchObject({ status: 'GENERATING' });
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('reports known budget rejection without classifying it as uncertain spend', async () => {
    const h = fixture();
    h.gateway.execute.mockRejectedValue(new Error('AI_BUDGET_EXHAUSTED'));
    expect(
      await h.service.generate('author', 'conversation', h.options()),
    ).toMatchObject({ status: 'FAILED', warnings: ['AI_BUDGET_EXHAUSTED'] });
  });
  it('does not start a paid request after explicit cancellation or exceed retained draft cap', async () => {
    const h = fixture(),
      controller = new AbortController();
    controller.abort();
    expect(
      await h.service.generate(
        'author',
        'conversation',
        h.options(),
        controller.signal,
      ),
    ).toMatchObject({
      status: 'FAILED',
      warnings: ['COPILOT_CANCELLED_BEFORE_SEND'],
    });
    expect(h.gateway.execute).not.toHaveBeenCalled();
    while (h.rows.length < 20)
      h.rows.push({
        ...h.rows[0],
        id: randomUUID(),
        operationId: randomUUID(),
      });
    await expect(
      h.service.generate('author', 'conversation', h.options()),
    ).rejects.toThrow('COPILOT_DRAFT_LIMIT');
    expect(h.gateway.execute).not.toHaveBeenCalled();
  });
  it('records an unknown gateway outcome and replays metadata without another call', async () => {
    const h = fixture(),
      input = h.options();
    h.gateway.execute.mockRejectedValue(new Error('private provider error'));
    expect(
      await h.service.generate('author', 'conversation', input),
    ).toMatchObject({
      status: 'UNKNOWN',
      warnings: ['GENERATION_UNCERTAIN_NO_AUTOMATIC_RETRY'],
    });
    await h.service.generate('author', 'conversation', input);
    expect(h.gateway.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.rows)).not.toContain('private provider error');
  });
  it('marks changed context stale after paid generation and never returns output after revoked access', async () => {
    const h = fixture();
    h.builder.build
      .mockResolvedValueOnce(h.context)
      .mockResolvedValueOnce(h.context)
      .mockResolvedValueOnce({ ...h.context, contextVersion: 'changed' });
    expect(
      await h.service.generate('author', 'conversation', h.options()),
    ).toMatchObject({ status: 'STALE' });
    const revoked = fixture();
    revoked.builder.refreshAccess
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await expect(
      revoked.service.generate('author', 'conversation', revoked.options()),
    ).rejects.toThrow('COPILOT_ACCESS_CHANGED');
    expect(revoked.rows[0]).toMatchObject({ status: 'FAILED', text: '' });
  });
  it('saves only explicit changed text, approves current facts and rejects stale prices/revisions', async () => {
    const h = fixture();
    await h.service.generate('author', 'conversation', h.options());
    const draft = h.rows[0];
    await h.service.patch('author', 'conversation', draft.id, {
      action: 'SAVE',
      revision: 1,
      text: draft.text,
    });
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(
      await h.service.patch('author', 'conversation', draft.id, {
        action: 'APPROVE',
        revision: 1,
      }),
    ).toMatchObject({ status: 'APPROVED', revision: 2 });
    h.updateMany.mockClear();
    expect(
      await h.service.patch('author', 'conversation', draft.id, {
        action: 'APPROVE',
        revision: 2,
      }),
    ).toMatchObject({ status: 'APPROVED', revision: 2 });
    expect(h.updateMany).not.toHaveBeenCalled();
    await expect(
      h.service.patch('author', 'conversation', draft.id, {
        action: 'SAVE',
        revision: 1,
        text: 'Changed',
      }),
    ).rejects.toThrow('COPILOT_DRAFT_REVISION_CHANGED');
    h.context.contextVersion = 'new-price';
    await expect(
      h.service.patch('author', 'conversation', draft.id, {
        action: 'APPROVE',
        revision: 2,
      }),
    ).rejects.toThrow('COPILOT_CONTEXT_STALE');
  });
});
