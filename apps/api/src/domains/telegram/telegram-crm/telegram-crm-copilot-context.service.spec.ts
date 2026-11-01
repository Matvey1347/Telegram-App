import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmSalesWorkflowService } from './telegram-crm-sales-workflow.service';
import { TelegramCrmPackageSalesContextService } from './telegram-crm-package-sales-context.service';
import { TelegramCrmPurchaseContextService } from './telegram-crm-purchase-context.service';
import { TelegramCrmMessageReadService } from './telegram-crm-message-read.service';
import { TelegramCrmCopilotContextService } from './telegram-crm-copilot-context.service';

function fixture() {
  const row = {
    id: 'conversation',
    workspaceId: 'ws',
    contactId: 'contact',
    mtprotoAccountId: 'sender',
    telegramCrmPeerId: 'peer',
    state: 'ACTIVE',
    contact: {
      id: 'contact',
      displayName: 'Client',
      companyName: null,
      description: 'Verified supplied information',
      source: 'Manual source',
      manualSalesStatus: 'INTERESTED',
      ownerMemberId: 'member',
      archivedAt: null,
    },
  };
  const prisma = {
    telegramCrmConversation: { findFirst: jest.fn().mockResolvedValue(row) },
    telegramAdvertiserActivity: { findMany: jest.fn().mockResolvedValue([]) },
    telegramCrmAiDraft: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const authorization = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'ws' }),
    scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member' }),
    can: jest.fn().mockResolvedValue(true),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string): string | undefined =>
      key === 'INTERNAL_AI_SALES_PROCESSING_ENABLED'
        ? 'true'
        : JSON.stringify([
            {
              workspaceId: 'ws',
              contactIds: ['contact'],
              reference: 'consent:record_1',
              notesAllowed: true,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          ]),
    ),
  };
  const workflow = {
    read: jest.fn().mockResolvedValue({
      commercialOutreachAllowed: true,
      outreachBlockedReason: null,
      conversationState: 'ACTIVE',
      manualStatus: 'INTERESTED',
      nextFollowUp: {
        id: 'task',
        status: 'OPEN',
        effectiveAt: '2026-10-31T00:00:00Z',
      },
    }),
  };
  const messages = {
    forCopilot: jest.fn().mockResolvedValue([
      {
        id: 'message',
        direction: 'INBOUND',
        text: 'Could you send the verified price?',
        sentAt: new Date('2026-10-31T00:00:00Z'),
        editedAt: null,
      },
    ]),
  };
  const packages = {
      forCopilot: jest.fn().mockResolvedValue([]),
      forWorkspaceCopilot: jest
        .fn()
        .mockResolvedValue({ products: [], networks: [], truncated: false }),
    },
    purchases = { forCopilot: jest.fn().mockResolvedValue([]) };
  const service = new TelegramCrmCopilotContextService(
    prisma as unknown as PrismaService,
    authorization as unknown as WorkspaceAuthorizationService,
    config as unknown as ConfigService,
    workflow as unknown as TelegramCrmSalesWorkflowService,
    packages as unknown as TelegramCrmPackageSalesContextService,
    purchases as unknown as TelegramCrmPurchaseContextService,
    messages as unknown as TelegramCrmMessageReadService,
  );
  return {
    service,
    prisma,
    authorization,
    config,
    workflow,
    messages,
    packages,
    purchases,
    row,
  };
}
describe('CRM Copilot bounded context', () => {
  it('prepares one-click policy and learns only earlier feedback within the current authorized conversation', async () => {
    const h = fixture();
    expect(await h.service.suggestionOptions('author', 'conversation')).toEqual(
      { includeNotes: true, processingReference: 'consent:record_1' },
    );
    h.prisma.telegramCrmAiDraft.findMany.mockResolvedValue([
      {
        id: 'previous',
        revision: 2,
        status: 'DISCARDED',
        text: 'Too generic for this conversation',
      },
    ]);
    const cutoff = new Date().toISOString();
    const context = await h.service.build('author', 'conversation', {
      productIds: [],
      includeNotes: true,
      preset: 'WORKSPACE_NEXT_MESSAGE',
      feedbackBefore: cutoff,
    });
    expect(h.packages.forWorkspaceCopilot).toHaveBeenCalledWith('author');
    expect(h.packages.forCopilot).not.toHaveBeenCalled();
    expect(context.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'catalog:workspace', kind: 'PRODUCT' }),
        expect.objectContaining({
          id: 'feedback:previous:2',
          kind: 'NOTE',
          text: expect.stringContaining('AVOID_THIS_REPLY') as unknown,
        }),
      ]),
    );
    expect(h.prisma.telegramCrmAiDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws',
          authorUserId: 'author',
          conversationId: 'conversation',
          createdAt: { lt: new Date(cutoff) },
        }) as unknown,
        take: 3,
      }),
    );
    h.config.get.mockReturnValue(undefined);
    h.prisma.telegramCrmAiDraft.findMany.mockClear();
    const denied = await h.service.build('author', 'conversation', {
      productIds: [],
      includeNotes: true,
      preset: 'WORKSPACE_NEXT_MESSAGE',
      feedbackBefore: cutoff,
    });
    expect(denied.canGenerate).toBe(false);
    expect(h.prisma.telegramCrmAiDraft.findMany).not.toHaveBeenCalled();
  });

  it('uses scoped existing services without per-message queries or implicit catalog enumeration', async () => {
    const h = fixture();
    const result = await h.service.build('user', 'conversation', {
      productIds: [],
      includeNotes: false,
    });
    expect(result).toMatchObject({ canGenerate: true, followUpAllowed: true });
    expect(h.messages.forCopilot).toHaveBeenCalledWith('user', 'conversation');
    expect(h.packages.forCopilot).not.toHaveBeenCalled();
    expect(h.prisma.telegramAdvertiserActivity.findMany).not.toHaveBeenCalled();
    expect(h.prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws',
          contact: { ownerMemberId: 'member' },
        }) as unknown,
      }),
    );
    expect(
      await h.service.build('user', 'conversation', {
        productIds: [],
        includeNotes: false,
      }),
    ).toMatchObject({ contextVersion: result.contextVersion });
  });
  it('fits a realistic 100-channel workspace with Unicode names and long private context into the bounded model facts', async () => {
    const h = fixture();
    const products = Array.from({ length: 100 }, (_, index) => ({
      id: `product-${index}`,
      name: 'Рекламне розміщення '.repeat(10),
      channel: {
        id: `channel-${index}`,
        title: 'Психологічний канал '.repeat(10),
      },
      pricingMode: 'FIXED',
      fixedPrice: '100.00',
      cpm: null,
      minimumPrice: null,
      currency: 'UAH',
      quoteRequired: false,
      topDurationMinutes: 60,
      feedDurationHours: 24,
      deleteAfterHours: 24,
      isPermanent: false,
      updatedAt: new Date().toISOString(),
      constraints: null,
    }));
    h.packages.forWorkspaceCopilot.mockResolvedValue({
      products,
      networks: Array.from({ length: 10 }, (_, index) => ({
        id: `network-${index}`,
        name: 'Мережа каналів '.repeat(10),
        channelCount: 100,
        updatedAt: new Date().toISOString(),
      })),
      truncated: false,
    });
    h.messages.forCopilot.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        id: `message-${index}`,
        direction: 'INBOUND',
        text: 'Довга історія '.repeat(500),
        sentAt: new Date(),
        editedAt: null,
      })),
    );
    h.prisma.telegramAdvertiserActivity.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        id: `note-${index}`,
        title: 'Персональний контекст '.repeat(10),
        description: 'Важлива інформація '.repeat(100),
        occurredAt: new Date(),
      })),
    );
    h.prisma.telegramCrmAiDraft.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        id: `feedback-${index}`,
        revision: 1,
        status: 'APPROVED',
        text: 'Вдала персоналізована відповідь '.repeat(100),
      })),
    );
    const result = await h.service.build('author', 'conversation', {
      productIds: [],
      includeNotes: true,
      preset: 'WORKSPACE_NEXT_MESSAGE',
      feedbackBefore: new Date().toISOString(),
    });
    expect(result.products).toHaveLength(100);
    expect(
      (
        JSON.parse(
          result.facts.find((fact) => fact.id === 'catalog:workspace')!.text,
        ) as { rows: unknown[] }
      ).rows,
    ).toHaveLength(100);
    expect(
      Buffer.byteLength(JSON.stringify(result.facts), 'utf8'),
    ).toBeLessThan(32 * 1024);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(
      128 * 1024,
    );
  });
  it('denies privacy-disabled processing before reading messages, catalog, purchases or notes', async () => {
    const h = fixture();
    h.config.get.mockReturnValue(undefined);
    const result = await h.service.build('user', 'conversation', {
      productIds: ['product'],
      includeNotes: true,
    });
    expect(result).toMatchObject({
      canGenerate: false,
      blockedReason: 'PROCESSING_POLICY_DISABLED',
    });
    for (const mock of [
      h.messages.forCopilot,
      h.packages.forCopilot,
      h.purchases.forCopilot,
      h.prisma.telegramAdvertiserActivity.findMany,
    ])
      expect(mock).not.toHaveBeenCalled();
  });
  it('loads notes only on an explicit request and selects at most five products', async () => {
    const h = fixture();
    await h.service.build('user', 'conversation', {
      productIds: ['selected'],
      includeNotes: true,
    });
    expect(h.packages.forCopilot).toHaveBeenCalledWith('user', ['selected']);
    expect(h.prisma.telegramAdvertiserActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws',
          advertiserId: 'contact',
          type: 'NOTE_ADDED',
        },
        take: 3,
      }),
    );
    await expect(
      h.service.build('user', 'conversation', {
        productIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        includeNotes: false,
      }),
    ).rejects.toThrow('COPILOT_PRODUCTS_LIMIT');
  });
  it('bounds long Unicode history and invalidates versions when sender identity changes', async () => {
    const h = fixture();
    h.messages.forCopilot.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        id: String(index),
        direction: 'INBOUND',
        text: '💬'.repeat(5000),
        sentAt: new Date('2026-10-31T00:00:00Z'),
        editedAt: null,
      })),
    );
    const result = await h.service.build('user', 'conversation', {
      productIds: [],
      includeNotes: false,
    });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(
      24 * 1024,
    );
    h.row.mtprotoAccountId = 'different-sender';
    expect(
      (
        await h.service.build('user', 'conversation', {
          productIds: [],
          includeNotes: false,
        })
      ).contextVersion,
    ).not.toBe(result.contextVersion);
  });
  it('blocks followup after a recent refusal and refreshes cached authorization explicitly', async () => {
    const h = fixture();
    h.messages.forCopilot.mockResolvedValue([
      {
        id: 'refusal',
        direction: 'INBOUND',
        text: 'Не пишіть мені більше',
        sentAt: new Date(),
        editedAt: null,
      },
    ]);
    expect(
      await h.service.build('user', 'conversation', {
        productIds: [],
        includeNotes: false,
      }),
    ).toMatchObject({
      followUpAllowed: false,
      warnings: expect.arrayContaining(['RECENT_REFUSAL']) as unknown,
    });
    await h.service.refreshAccess('user');
    expect(h.authorization.refresh).toHaveBeenCalledWith('user');
  });
});
