import { Prisma } from '@prisma/client';
import { loadCrmContactSalesSummaries } from './telegram-crm-contact-sales-summary';

describe('loadCrmContactSalesSummaries', () => {
  it('links legacy username Deals and preserves their real payment currencies', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        advertiserId: null,
        advertiserTelegram: '@Artur_Pikhulia',
        advertiserTelegramSnapshot: null,
        status: 'COMPLETED',
        createdAt: new Date('2026-08-28T12:00:00.000Z'),
        placements: [
          { agreedPrice: new Prisma.Decimal(700) },
          { agreedPrice: new Prisma.Decimal(35) },
        ],
        payments: [{ amount: new Prisma.Decimal(735), currency: 'uah' }],
      },
    ]);

    const result = await loadCrmContactSalesSummaries(
      { telegramAdSale: { findMany } } as never,
      'workspace-1',
      [
        {
          id: 'contact-artur',
          displayName: '@Artur_Pikhulia',
          companyName: null,
          telegramUsername: 'artur_pikhulia',
        },
      ],
    );

    expect(result.get('contact-artur')).toEqual({
      totalSalesCount: 1,
      paidSalesCount: 1,
      completedSalesCount: 1,
      totalPlacementsCount: 2,
      revenueByCurrency: [{ currency: 'UAH', amount: '735' }],
      lastDealAt: '2026-08-28T12:00:00.000Z',
    });
    const [query] = findMany.mock.calls[0] as unknown as [
      { where: { workspaceId: string } },
    ];
    expect(query.where.workspaceId).toBe('workspace-1');
  });

  it('does not guess a legacy Deal when Telegram usernames are ambiguous', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await loadCrmContactSalesSummaries(
      { telegramAdSale: { findMany } } as never,
      'workspace-1',
      [
        {
          id: 'one',
          displayName: 'One',
          companyName: null,
          telegramUsername: 'same',
        },
        {
          id: 'two',
          displayName: 'Two',
          companyName: null,
          telegramUsername: '@same',
        },
      ],
    );

    const [query] = findMany.mock.calls[0] as unknown as [{ where: unknown }];
    expect(JSON.stringify(query.where)).not.toContain('@same');
  });
});
