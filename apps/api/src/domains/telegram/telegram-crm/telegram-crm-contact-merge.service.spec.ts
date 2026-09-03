import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TelegramCrmContactMergeService } from './telegram-crm-contact-merge.service';

const callArgument = (
  mock: { mock: { calls: unknown[][] } },
  index = 0,
): unknown => mock.mock.calls[index]?.[0];

const contact = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  displayName: id === 'target' ? 'Target' : 'Source',
  companyName: null,
  telegramUsername: null,
  phone: null,
  email: null,
  website: null,
  description: null,
  source: null,
  stage: 'LEAD',
  archivedAt: null,
  ownerMemberId: 'member-1',
  lastContactAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  lastPurchaseAt: null,
  nextContactAt: null,
  firstPurchaseAt: null,
  repeatCustomerAt: null,
  totalSalesCount: 0,
  completedSalesCount: 0,
  totalPlacementsCount: 0,
  totalRevenueInPrimaryCurrency: new Prisma.Decimal(0),
  averageOrderValueInPrimaryCurrency: new Prisma.Decimal(0),
  preferredCurrency: null,
  preferredContactMethod: null,
  defaultFollowUpDays: null,
  ...overrides,
});

describe('TelegramCrmContactMergeService', () => {
  it('moves the complete Contact graph transactionally', async () => {
    const target = contact('target', {
      companyName: 'Keep target',
      totalSalesCount: 1,
      completedSalesCount: 1,
      totalPlacementsCount: 2,
      totalRevenueInPrimaryCurrency: new Prisma.Decimal(100),
    });
    const source = contact('source', {
      companyName: 'Source conflict',
      telegramUsername: 'fill_from_source',
      totalSalesCount: 3,
      completedSalesCount: 2,
      totalPlacementsCount: 4,
      totalRevenueInPrimaryCurrency: new Prisma.Decimal(300),
    });
    const moved = () => jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: jest.fn(),
      telegramAdvertiser: {
        findMany: jest.fn().mockResolvedValue([target, source]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([{ tagId: 'tag-shared' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: moved(),
      },
      telegramCrmPeer: { updateMany: moved() },
      telegramCrmConversation: { updateMany: moved() },
      telegramAdSale: { updateMany: moved() },
      telegramAdvertiserTask: { updateMany: moved() },
      telegramAdvertiserActivity: { updateMany: moved(), create: jest.fn() },
      telegramAdvertiserContact: { updateMany: moved() },
      telegramAdvertiserAutomationExecution: { updateMany: moved() },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (value: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const authorization = {
      requireEditContact: jest.fn().mockResolvedValue('workspace-1'),
    };
    const events = { emit: jest.fn() };
    const service = new TelegramCrmContactMergeService(
      prisma as never,
      authorization as never,
      events as never,
    );

    await expect(
      service.merge('user-1', 'target', 'source'),
    ).resolves.toMatchObject({
      targetContactId: 'target',
      sourceContactId: 'source',
      moved: {
        peers: 1,
        conversations: 1,
        deals: 1,
        tasks: 1,
        activities: 2,
        contactMethods: 1,
        tags: 2,
        internalAutomationExecutions: 1,
      },
    });
    expect(tx.telegramCrmPeer.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', contactId: 'source' },
      data: { contactId: 'target' },
    });
    expect(tx.telegramCrmConversation.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', contactId: 'source' },
      data: { contactId: 'target' },
    });
    const internalAutomationCall = callArgument(
      tx.telegramAdvertiserAutomationExecution.updateMany,
    );
    expect(internalAutomationCall).toMatchObject({
      where: { workspaceId: 'workspace-1', advertiserId: 'source' },
      data: { advertiserId: 'target' },
    });
    const targetUpdateCall = callArgument(tx.telegramAdvertiser.update);
    expect(targetUpdateCall).toMatchObject({
      data: {
        companyName: 'Keep target',
        telegramUsername: 'fill_from_source',
        totalSalesCount: 4,
        totalRevenueInPrimaryCurrency: new Prisma.Decimal(400),
        averageOrderValueInPrimaryCurrency: new Prisma.Decimal(100),
      },
    });
    const activityCall = callArgument(tx.telegramAdvertiserActivity.create);
    expect(activityCall).toMatchObject({
      data: {
        type: 'ADVERTISER_MERGED',
        metadata: { sourceContactId: 'source' },
      },
    });
    expect(tx.telegramAdvertiser.delete).toHaveBeenCalledWith({
      where: { id: 'source' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'contact.updated', contactId: 'target' }),
    );
  });

  it('rejects a cross-workspace merge before opening a transaction', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new TelegramCrmContactMergeService(
      prisma as never,
      {
        requireEditContact: jest
          .fn()
          .mockResolvedValueOnce('workspace-1')
          .mockResolvedValueOnce('workspace-2'),
      } as never,
      { emit: jest.fn() } as never,
    );

    await expect(
      service.merge('user-1', 'target', 'source'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
