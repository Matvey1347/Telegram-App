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
  const packages = { forCopilot: jest.fn().mockResolvedValue([]) },
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
