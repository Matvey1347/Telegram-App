import type { CrmCopilotGenerateInput } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmCopilotDraftsService } from './telegram-crm-copilot-drafts.service';
import {
  TelegramCrmCopilotContextService,
  type CopilotContext,
  copilotHash,
} from './telegram-crm-copilot-context.service';
import { TelegramCrmCopilotSendGuard } from './telegram-crm-copilot-send-guard.service';

function fixture() {
  const input: CrmCopilotGenerateInput = {
    operationId: '2026-10-31:00000000-0000-4000-8000-000000000000',
    category: 'SALES_REPLY_SUGGESTION',
    tone: 'NATURAL',
    language: 'uk',
    productIds: [],
    includeNotes: false,
    sourceAcknowledged: true,
    processingBasis: 'APPROVED_BUSINESS_PROCESSING',
    processingReference: 'policy:approved_source',
  };
  const current: CopilotContext = {
    workspaceId: 'ws',
    conversationId: 'conversation',
    contactId: 'contact',
    contactName: 'Client',
    processingEnabled: true,
    processingReference: 'policy:approved',
    canGenerate: true,
    blockedReason: null,
    facts: [],
    missingFacts: [],
    warnings: [],
    contextVersion: 'version',
    identityVersion: 'identity',
    followUpAllowed: true,
    products: [],
  };
  const text = 'Вітаю! Уточню умови у менеджера.';
  const draft = {
    id: 'draft',
    workspaceId: 'ws',
    contactId: 'contact',
    authorUserId: 'user',
    status: 'APPROVED',
    revision: 3,
    approvedTextHash: copilotHash(text),
    contextVersion: 'version',
    expiresAt: new Date(Date.now() + 60000),
    requestSnapshot: input,
    sentMessageId: null as string | null,
  };
  const drafts = { own: jest.fn().mockResolvedValue(draft) },
    context = {
      refreshAccess: jest.fn().mockResolvedValue(undefined),
      build: jest.fn().mockResolvedValue(current),
    },
    authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'ws' }),
    },
    prisma = {
      telegramCrmAiDraft: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  const guard = new TelegramCrmCopilotSendGuard(
    prisma as unknown as PrismaService,
    drafts as unknown as TelegramCrmCopilotDraftsService,
    context as unknown as TelegramCrmCopilotContextService,
    authorization as unknown as WorkspaceAuthorizationService,
  );
  const approval = { aiDraftId: 'draft', aiDraftRevision: 3 };
  return {
    guard,
    current,
    draft,
    drafts,
    context,
    authorization,
    prisma,
    text,
    approval,
  };
}
describe('CRM Copilot approval at manual-send network boundary', () => {
  it('refreshes rights and validates current approved text/facts without invoking AI or send', async () => {
    const h = fixture();
    await h.guard.assertCanSend('user', 'conversation', h.text, h.approval);
    expect(h.context.refreshAccess).toHaveBeenCalledWith('user');
    expect(h.authorization.require).toHaveBeenCalledWith(
      'user',
      'adSales.crm.sendManualMessages',
    );
    expect(h.context.refreshAccess.mock.invocationCallOrder[0]).toBeLessThan(
      h.drafts.own.mock.invocationCallOrder[0],
    );
    expect(h.prisma.telegramCrmAiDraft.updateMany).not.toHaveBeenCalled();
  });
  it.each(['revision', 'text', 'expired', 'unapproved'])(
    'rejects changed %s before fresh source reads',
    async (kind) => {
      const h = fixture();
      if (kind === 'revision') h.draft.revision++;
      if (kind === 'expired') h.draft.expiresAt = new Date(0);
      if (kind === 'unapproved') h.draft.status = 'READY';
      await expect(
        h.guard.assertCanSend(
          'user',
          'conversation',
          kind === 'text' ? 'Changed text' : h.text,
          h.approval,
        ),
      ).rejects.toThrow('COPILOT_APPROVAL_REQUIRED');
      expect(h.context.build).not.toHaveBeenCalled();
    },
  );
  it('blocks revoked permission, DNC, relinked identity, changed prices and privacy grants', async () => {
    const denied = fixture();
    denied.authorization.require.mockRejectedValue(new Error('revoked'));
    await expect(
      denied.guard.assertCanSend(
        'user',
        'conversation',
        denied.text,
        denied.approval,
      ),
    ).rejects.toThrow('revoked');
    expect(denied.drafts.own).not.toHaveBeenCalled();
    for (const condition of ['dnc', 'identity', 'price', 'privacy']) {
      const h = fixture();
      if (condition === 'dnc') {
        h.current.canGenerate = false;
        h.current.blockedReason = 'DO_NOT_CONTACT';
      }
      if (condition === 'identity') h.current.contactId = 'other';
      if (condition === 'price') h.current.contextVersion = 'new-price';
      if (condition === 'privacy') h.current.processingEnabled = false;
      await expect(
        h.guard.assertCanSend('user', 'conversation', h.text, h.approval),
      ).rejects.toThrow();
    }
  });
  it('treats a verified receipt as idempotent even after draft TTL deletion', async () => {
    const h = fixture();
    h.drafts.own.mockRejectedValue(new Error('draft deleted'));
    h.prisma.telegramCrmAiDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      h.guard.markSent('user', 'conversation', h.approval, 'message', 'ws'),
    ).resolves.toBeUndefined();
    expect(h.drafts.own).not.toHaveBeenCalled();
    expect(h.prisma.telegramCrmAiDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'draft',
          workspaceId: 'ws',
          conversationId: 'conversation',
          authorUserId: 'user',
          revision: 3,
          status: 'APPROVED',
        },
      }),
    );
  });
  it('marks SENT only after a known receipt and makes identical receipt replay a no-op', async () => {
    const h = fixture();
    await h.guard.markSent('user', 'conversation', h.approval, 'message');
    expect(h.prisma.telegramCrmAiDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revision: 3,
          status: 'APPROVED',
        }) as unknown,
        data: { status: 'SENT', sentMessageId: 'message' },
      }),
    );
    h.prisma.telegramCrmAiDraft.updateMany.mockClear();
    h.draft.status = 'SENT';
    h.draft.sentMessageId = 'message';
    await h.guard.markSent('user', 'conversation', h.approval, 'message');
    expect(h.prisma.telegramCrmAiDraft.updateMany).not.toHaveBeenCalled();
  });
});
