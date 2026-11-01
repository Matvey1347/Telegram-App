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
  manualInstagramContactAt: null,
  manualInstagramReplyAt: null,
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
  it.each([
    ['INTERESTED', 'DO_NOT_CONTACT'],
    ['DO_NOT_CONTACT', 'INTERESTED'],
  ])(
    'moves the Contact graph without losing DNC (%s, %s)',
    async (targetStatus, sourceStatus) => {
      const target = contact('target', {
        companyName: 'Keep target',
        manualInstagramContactAt: new Date('2030-01-02T00:00:00Z'),
        manualSalesStatus: targetStatus,
        totalSalesCount: 1,
        completedSalesCount: 1,
        totalPlacementsCount: 2,
        totalRevenueInPrimaryCurrency: new Prisma.Decimal(100),
      });
      const source = contact('source', {
        companyName: 'Source conflict',
        manualInstagramContactAt: new Date('2030-01-01T00:00:00Z'),
        manualInstagramReplyAt: new Date('2030-01-03T00:00:00Z'),
        manualSalesStatus: sourceStatus,
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
        telegramLeadCandidate: { updateMany: moved() },
        telegramAdSale: { updateMany: moved() },
        telegramAdvertiserTask: { updateMany: moved() },
        telegramAdvertiserActivity: { updateMany: moved(), create: jest.fn() },
        telegramAdvertiserContact: { updateMany: moved() },
        telegramAdvertiserAutomationExecution: { updateMany: moved() },
        crossPromotionPlan: { updateMany: moved() },
      };
      const prisma = {
        $transaction: jest.fn(
          async (operation: (value: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      };
      const authorization = {
        requireEditContact: jest.fn().mockResolvedValue('workspace-1'),
        refreshEditScope: jest
          .fn()
          .mockResolvedValue({ workspaceId: 'workspace-1' }),
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
          crossPromotionPlans: 1,
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
      expect(tx.crossPromotionPlan.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'workspace-1', advertiserId: 'source' },
        data: { advertiserId: 'target' },
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
          manualSalesStatus: 'DO_NOT_CONTACT',
          manualInstagramContactAt: new Date('2030-01-02T00:00:00Z'),
          manualInstagramReplyAt: new Date('2030-01-03T00:00:00Z'),
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
      expect(tx.telegramLeadCandidate.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'workspace-1', contactId: 'source' },
        data: { contactId: 'target' },
      });
      expect(tx.telegramAdvertiser.delete).toHaveBeenCalledWith({
        where: { id: 'source' },
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'contact.updated',
          contactId: 'target',
        }),
      );
    },
  );

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
  it.each(['source', 'target'])(
    'rejects changed %s ownership after row-lock wait without moving any graph',
    async (changedId) => {
      const tx = {
        $queryRaw: jest.fn(),
        telegramAdvertiser: {
          findMany: jest.fn().mockResolvedValue([
            contact('target', {
              ownerMemberId:
                changedId === 'target' ? 'another-member' : 'member-1',
            }),
            contact('source', {
              ownerMemberId:
                changedId === 'source' ? 'another-member' : 'member-1',
            }),
          ]),
          update: jest.fn(),
        },
        telegramCrmPeer: { updateMany: jest.fn() },
      };
      const auth = {
        requireEditContact: jest.fn().mockResolvedValue('workspace-1'),
        refreshEditScope: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
        }),
      };
      const service = new TelegramCrmContactMergeService(
        {
          $transaction: jest.fn((fn: (value: typeof tx) => Promise<unknown>) =>
            fn(tx),
          ),
        } as never,
        auth as never,
        { emit: jest.fn() } as never,
      );
      await expect(service.merge('user-1', 'target', 'source')).rejects.toThrow(
        'CRM merge ownership or permissions changed',
      );
      expect(auth.refreshEditScope.mock.invocationCallOrder[0]).toBeGreaterThan(
        tx.$queryRaw.mock.invocationCallOrder[0],
      );
      expect(tx.telegramCrmPeer.updateMany).not.toHaveBeenCalled();
      expect(tx.telegramAdvertiser.update).not.toHaveBeenCalled();
    },
  );
  it('does not mutate after edit permission is revoked while waiting for locks', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      telegramAdvertiser: {
        findMany: jest
          .fn()
          .mockResolvedValue([contact('target'), contact('source')]),
        update: jest.fn(),
      },
    };
    const service = new TelegramCrmContactMergeService(
      {
        $transaction: jest.fn((fn: (value: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
      } as never,
      {
        requireEditContact: jest.fn().mockResolvedValue('workspace-1'),
        refreshEditScope: jest
          .fn()
          .mockRejectedValue(new Error('permission revoked')),
      } as never,
      { emit: jest.fn() } as never,
    );
    await expect(service.merge('user-1', 'target', 'source')).rejects.toThrow(
      'permission revoked',
    );
    expect(tx.telegramAdvertiser.update).not.toHaveBeenCalled();
  });
});
