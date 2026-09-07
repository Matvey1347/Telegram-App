import { Prisma } from '@prisma/client';
import {
  isUnassignedCrmContact,
  loadCrmContactSalesSummaries,
} from './telegram-crm-contact-sales-summary';

describe('loadCrmContactSalesSummaries', () => {
  it('recognizes only the synthetic anonymous Advertiser contact', () => {
    expect(
      isUnassignedCrmContact({
        id: 'anonymous',
        displayName: 'Advertiser',
        companyName: null,
        telegramUsername: null,
      }),
    ).toBe(true);
    expect(
      isUnassignedCrmContact({
        id: 'real',
        displayName: 'Advertiser',
        companyName: 'Company',
        telegramUsername: null,
      }),
    ).toBe(false);
  });
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
        assignedMember: {
          id: 'member-1',
          user: { name: 'First', email: 'first@example.com' },
          avatarIcon: null,
        },
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
      dealMembers: [
        {
          id: 'member-1',
          name: 'First',
          email: 'first@example.com',
          avatarPresentation: null,
        },
      ],
    });
    const [query] = findMany.mock.calls[0] as unknown as [
      { where: { workspaceId: string } },
    ];
    expect(query.where.workspaceId).toBe('workspace-1');
  });

  it('returns two unique Deal members and deduplicates repeated assignees', async () => {
    const sale = (id: string, name: string) => ({
      advertiserId: null,
      advertiserTelegram: null,
      advertiserTelegramSnapshot: null,
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-28T12:00:00.000Z'),
      placements: [],
      payments: [],
      assignedMember: {
        id,
        user: { name, email: null },
        avatarIcon: null,
      },
    });
    const findMany = jest
      .fn()
      .mockResolvedValue([
        sale('member-1', 'First'),
        sale('member-2', 'Second'),
        sale('member-1', 'First'),
      ]);

    const result = await loadCrmContactSalesSummaries(
      { telegramAdSale: { findMany } } as never,
      'workspace-1',
      [
        {
          id: 'contact-1',
          displayName: 'Advertiser',
          companyName: null,
          telegramUsername: null,
        },
      ],
    );

    expect(result.get('contact-1')?.dealMembers).toEqual([
      expect.objectContaining({ id: 'member-1', name: 'First' }),
      expect.objectContaining({ id: 'member-2', name: 'Second' }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-1' }),
        select: expect.objectContaining({ assignedMember: expect.any(Object) }),
      }),
    );
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
