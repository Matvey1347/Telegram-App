import { TelegramCrmContactExportService } from './telegram-crm-contact-export.service';

describe('TelegramCrmContactExportService', () => {
  it('exports only active contacts from the current workspace and preserves purchase history', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'contact-1',
        displayName: 'Ada',
        telegramUsername: 'ada',
        tags: [{ tag: { name: 'Buyers' } }],
        sales: [
          {
            id: 'deal-1',
            title: 'Autumn placement',
            status: 'CONFIRMED',
            crmDealStage: 'WON',
            origin: 'DIRECT',
            settlementCurrency: 'USD',
            expectedCloseAt: new Date('2026-10-02T00:00:00.000Z'),
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ],
        crossPromotionPlans: [
          {
            id: 'cross-promotion-1',
            title: 'Autumn mutual promotion',
            kind: 'DIRECT_MUTUAL',
            status: 'SCHEDULED',
            scheduledAt: new Date('2026-10-03T10:00:00.000Z'),
            trackingEndsAt: new Date('2026-10-10T10:00:00.000Z'),
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ],
      },
    ]);
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      scope: jest.fn().mockResolvedValue({}),
    };
    const service = new TelegramCrmContactExportService(
      { telegramAdvertiser: { findMany } } as never,
      authorization as never,
    );

    await expect(service.export('user-1', 'TAGGED')).resolves.toEqual([
      {
        id: 'contact-1',
        displayName: 'Ada',
        telegramUsername: 'ada',
        tags: ['Buyers'],
        purchases: [
          {
            title: 'Autumn placement',
            status: 'CONFIRMED',
            currency: 'USD',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        deals: [
          {
            id: 'deal-1',
            title: 'Autumn placement',
            status: 'CONFIRMED',
            stage: 'WON',
            origin: 'DIRECT',
            currency: 'USD',
            expectedCloseAt: '2026-10-02T00:00:00.000Z',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        crossPromotions: [
          {
            id: 'cross-promotion-1',
            title: 'Autumn mutual promotion',
            kind: 'DIRECT_MUTUAL',
            status: 'SCHEDULED',
            scheduledAt: '2026-10-03T10:00:00.000Z',
            trackingEndsAt: '2026-10-10T10:00:00.000Z',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          archivedAt: null,
          tags: { some: {} },
        }),
      }),
    );
  });

  it('applies the view-own scope and the untagged segment', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TelegramCrmContactExportService(
      { telegramAdvertiser: { findMany } } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      } as never,
    );

    await service.export('user-1', 'UNTAGGED');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerMemberId: 'member-1',
          tags: { none: {} },
        }),
      }),
    );
  });
});
