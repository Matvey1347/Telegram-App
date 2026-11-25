import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TelegramCrmWorkspaceExportService } from './telegram-crm-workspace-export.service';

const workspaceId = 'test-workspace';
const ownerMemberId = 'contact-owner';
const contactId = 'client-for-export';
const sentAt = new Date('2026-01-02T03:04:05Z');

function fixture({
  salesAccess = true,
  ownSalesOnly = false,
  ownCrmOnly = false,
} = {}) {
  const prisma = {
    telegramAdvertiser: {
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.TelegramAdvertiserFindManyArgs]>()
        .mockResolvedValue([]),
    },
    telegramCrmConversation: {
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.TelegramCrmConversationFindManyArgs]>()
        .mockResolvedValue([]),
    },
    telegramCrmMessage: {
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.TelegramCrmMessageFindManyArgs]>()
        .mockResolvedValue([]),
    },
    telegramAdSale: {
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.TelegramAdSaleFindManyArgs]>()
        .mockResolvedValue([]),
    },
  };
  const authorization = {
    can: jest.fn((_userId, permission) =>
      Promise.resolve(
        permission === 'adSales.sales.view'
          ? salesAccess
          : permission === 'adSales.sales.editOwn' && ownSalesOnly,
      ),
    ),
    require: jest.fn().mockResolvedValue({
      workspaceId: workspaceId,
      memberId: 'sales-member',
    }),
  };
  const contactAuthorization = {
    readScope: jest.fn().mockResolvedValue({
      workspaceId,
      ownerMemberId: ownCrmOnly ? ownerMemberId : undefined,
    }),
  };
  const service = new TelegramCrmWorkspaceExportService(
    prisma as never,
    authorization as never,
    contactAuthorization as never,
  );
  return { service, prisma, authorization, contactAuthorization };
}

function message(
  id: string,
  conversationId: string,
  contentMetadata: object | null = null,
  deletedAt: Date | null = null,
) {
  return {
    id,
    conversationId,
    sentAt,
    direction: 'INBOUND',
    text: `Text for ${id}\nSecond line`,
    contentMetadata,
    deletedAt,
  };
}

async function collect(records: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of records) chunks.push(chunk);
  return {
    guide: chunks[0],
    records: chunks
      .slice(1)
      .map((chunk) => JSON.parse(chunk) as Record<string, unknown>),
  };
}

describe('TelegramCrmWorkspaceExportService', () => {
  it('explains the format and includes all stored pages across dialogs with actual payment dates', async () => {
    const { service, prisma } = fixture();
    const clients = Array.from({ length: 50 }, (_, i) => ({
      id: `client-${i}`,
      ownerMember: null,
    }));
    const archived = {
      id: 'old-client',
      archivedAt: sentAt,
      ownerMember: null,
    };
    prisma.telegramAdvertiser.findMany
      .mockResolvedValueOnce(clients)
      .mockResolvedValueOnce([
        {
          id: contactId,
          ownerMember: { workspaceId, user: { name: 'Owner' } },
          activities: [{ description: 'CRM note' }],
        },
        archived,
      ]);
    prisma.telegramCrmConversation.findMany.mockResolvedValue([
      { id: 'chat-a', contactId, state: 'ACTIVE', historyExhausted: false },
      {
        id: 'chat-b',
        contactId: null,
        state: 'ARCHIVED',
        historyExhausted: true,
      },
    ]);
    const firstBatch = Array.from({ length: 500 }, (_, i) =>
      message(`a-${i}`, 'chat-a'),
    );
    prisma.telegramCrmMessage.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([
        message('reply', 'chat-a', {
          replyToTelegramMessageId: 42,
          media: { kind: 'audio' },
        }),
        message('protected', 'chat-b', { protectedContent: true }),
        message('deleted', 'chat-b', null, sentAt),
      ]);
    prisma.telegramAdSale.findMany.mockResolvedValue([
      {
        id: 'billable-deal',
        advertiserId: contactId,
        status: 'CONFIRMED',
        createdAt: new Date('2025-12-26T10:00:00Z'),
        placements: [
          {
            id: 'ad-placement',
            network: {
              workspaceId: 'other-workspace',
              name: 'Restricted data',
            },
          },
        ],
        payments: [
          {
            id: 'cancelled-payment',
            status: 'VOIDED',
            amount: new Prisma.Decimal('40'),
            paidAt: new Date('2025-12-30T09:00:00Z'),
          },
          {
            id: 'valid-payment',
            status: 'ACTIVE',
            amount: new Prisma.Decimal('18.37'),
            currency: 'EUR',
            paidAt: sentAt,
          },
        ],
      },
    ]);

    const { guide, records } = await collect(await service.open('member'));

    expect(guide).toMatch(/^# Экспорт CRM для анализа\n\n## Инструкция для ИИ/);
    expect(guide).toContain('Как найти, кому нужно написать');
    expect(guide).toContain('historyExhausted');
    expect(records[0]).toMatchObject({
      type: 'export',
      crmAccess: 'all',
      salesAccess: 'all',
    });
    expect(
      records.filter(({ type }) => type === 'client').slice(-2),
    ).toMatchObject([
      {
        id: contactId,
        ownerName: 'Owner',
        activities: [{ description: 'CRM note' }],
      },
      { id: archived.id, archivedAt: sentAt.toISOString() },
    ]);
    expect(records.find(({ type }) => type === 'deal')).toMatchObject({
      id: 'billable-deal',
      advertiserId: contactId,
      placements: [{ id: 'ad-placement', network: null }],
      payments: [{ status: 'VOIDED' }, { amount: '18.37', currency: 'EUR' }],
      purchaseEvidence: { confirmed: true, firstPaidAt: sentAt.toISOString() },
    });
    expect(records.find(({ id }) => id === 'chat-b')).toMatchObject({
      contactId: null,
    });
    const [secondClientsPage] =
      prisma.telegramAdvertiser.findMany.mock.calls[1];
    expect(secondClientsPage.where).toMatchObject({
      workspaceId,
      id: { gt: 'client-49' },
    });
    const [salesRead] = prisma.telegramAdSale.findMany.mock.calls[0];
    expect(salesRead.where?.OR).toContainEqual({ advertiserId: null });
    expect(records.slice(-4)).toMatchObject([
      {
        type: 'message',
        id: 'reply',
        text: 'Text for reply\nSecond line',
        contentMetadata: {
          replyToTelegramMessageId: 42,
          media: { kind: 'audio' },
        },
      },
      {
        type: 'message',
        id: 'protected',
        text: null,
        contentMetadata: null,
        protectedContent: true,
      },
      {
        type: 'message',
        id: 'deleted',
        text: null,
        contentMetadata: null,
        deletedAt: sentAt.toISOString(),
      },
      { type: 'end', clients: 52, conversations: 2, deals: 1, messages: 503 },
    ]);
    const [nextPage] = prisma.telegramCrmMessage.findMany.mock.calls[1];
    expect(nextPage.where).toMatchObject({
      workspaceId: workspaceId,
      conversationId: { in: ['chat-a', 'chat-b'] },
      conversation: { workspaceId },
    });
    expect(nextPage.where?.OR).toContainEqual({
      conversationId: 'chat-a',
      sentAt,
      id: { gt: 'a-499' },
    });
  });

  it('keeps sales inaccessible without permission and exports an empty history explicitly', async () => {
    const { service, prisma } = fixture({ salesAccess: false });
    const { records } = await collect(await service.open('member'));
    expect(records[0]).toMatchObject({ salesAccess: 'unavailable' });
    expect(records.at(-1)).toEqual({
      type: 'end',
      clients: 0,
      conversations: 0,
      deals: 0,
      messages: 0,
    });
    expect(prisma.telegramAdSale.findMany).not.toHaveBeenCalled();
    const [contactRead] = prisma.telegramAdvertiser.findMany.mock.calls[0];
    expect(contactRead.select).toMatchObject({
      firstPurchaseAt: false,
      lastPurchaseAt: false,
    });
  });

  it('limits sales to the assigned member when the sales scope is restricted', async () => {
    const { service, prisma } = fixture({
      ownSalesOnly: true,
      ownCrmOnly: true,
    });
    const { records } = await collect(await service.open('member'));
    expect(records[0]).toMatchObject({
      crmAccess: 'own',
      salesAccess: 'assigned',
    });
    const [salesRead] = prisma.telegramAdSale.findMany.mock.calls[0];
    expect(salesRead.where).toMatchObject({
      assignedMemberId: 'sales-member',
      workspaceId: workspaceId,
      advertiser: { workspaceId, ownerMemberId },
    });
    const [conversationsRead] =
      prisma.telegramCrmConversation.findMany.mock.calls[0];
    expect(conversationsRead.where).toMatchObject({
      workspaceId,
      contact: { workspaceId, ownerMemberId },
    });
    const [clientsRead] = prisma.telegramAdvertiser.findMany.mock.calls[0];
    expect(clientsRead.where).toMatchObject({ workspaceId, ownerMemberId });
  });

  it('uses bounded conversation batches, without one message query per conversation', async () => {
    const { service, prisma } = fixture();
    const firstBatch = Array.from({ length: 50 }, (_, i) => ({
      id: `chat-${i}`,
    }));
    prisma.telegramCrmConversation.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([{ id: 'last-chat' }]);
    prisma.telegramCrmMessage.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([message('last-message', 'last-chat')]);

    const { records } = await collect(await service.open('member'));

    expect(prisma.telegramCrmMessage.findMany).toHaveBeenCalledTimes(2);
    const [nextPage] = prisma.telegramCrmConversation.findMany.mock.calls[1];
    expect(nextPage.where).toMatchObject({
      workspaceId,
      id: { gt: 'chat-49' },
    });
    expect(records.at(-2)).toMatchObject({
      type: 'message',
      conversationId: 'last-chat',
    });
    expect(records.at(-1)).toMatchObject({
      clients: 0,
      conversations: 51,
      messages: 1,
    });
  });

  it('rejects inconsistent workspace authorization before reading records', async () => {
    const { service, prisma, authorization } = fixture();
    authorization.require.mockResolvedValue({
      workspaceId: 'other-workspace',
      memberId: 'sales-member',
    });
    await expect(service.open('member')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.telegramAdvertiser.findMany).not.toHaveBeenCalled();
  });
});
