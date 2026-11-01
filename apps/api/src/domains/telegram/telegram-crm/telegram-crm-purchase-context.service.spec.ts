import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
import { TelegramCrmPurchaseContextService } from './telegram-crm-purchase-context.service';
import { encodeSalesContextCursor } from './telegram-crm-sales-context-cursor';

const stamp = new Date('2026-10-31T09:00:00Z');
const placement = (index: number) => ({
  id: `placement-${index}`,
  status: 'PUBLISHED',
  scheduledAt: stamp,
  agreedPrice: new Prisma.Decimal('100.10'),
  currency: index % 2 ? 'USD' : 'UAH',
  telegramChannel: { id: `channel-${index}`, title: `Channel ${index}` },
  product: { name: 'Recorded product', workspaceId: 'workspace-a' },
  network: { name: 'Recorded network', workspaceId: 'workspace-a' },
});
const sale = (id: string) => ({
  id,
  title: null,
  status: 'COMPLETED',
  crmDealStage: 'COMPLETED',
  createdAt: stamp,
  settlementCurrency: 'EUR',
  placements: [placement(1), placement(2)],
});
function setup(rows = [sale('sale-c')]) {
  const tx = {
    telegramAdSale: {
      findMany: jest
        .fn<Promise<typeof rows>, [unknown]>()
        .mockResolvedValue(rows),
    },
    $queryRaw: jest.fn((query: Prisma.Sql): Promise<unknown[]> => {
      if (query.sql.includes('AS "dealCount"'))
        return Promise.resolve([
          { dealCount: 1000000, purchaseCount: 12345, lastPurchaseAt: stamp },
        ]);
      const grouped = query.sql.includes('SELECT sale."id"');
      return Promise.resolve([
        {
          saleId: grouped ? 'sale-c' : null,
          kind: 'received',
          currency: 'USD',
          amount: '20.000000000000000001',
        },
        {
          saleId: grouped ? 'sale-c' : null,
          kind: 'received',
          currency: 'UAH',
          amount: '800',
        },
        {
          saleId: grouped ? 'sale-c' : null,
          kind: 'agreed',
          currency: 'USD',
          amount: '100.10',
        },
        {
          saleId: grouped ? 'sale-c' : null,
          kind: 'agreed',
          currency: 'UAH',
          amount: '100.10',
        },
      ]);
    }),
  };
  const prisma = {
    telegramAdSale: tx.telegramAdSale,
    $transaction: jest.fn((work: (tx: unknown) => unknown) => work(tx)),
  };
  const auth = {
    require: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-a', memberId: 'member-a' }),
    can: jest.fn((_userId: string, permission: string) =>
      Promise.resolve(permission.endsWith('editOwn')),
    ),
  };
  const crm = {
    requireReadContact: jest.fn().mockResolvedValue('workspace-a'),
  };
  const service = new TelegramCrmPurchaseContextService(
    prisma as unknown as PrismaService,
    auth as unknown as WorkspaceAuthorizationService,
    crm as unknown as TelegramCrmLegacyAuthorizationService,
  );
  return { service, tx, prisma, auth, crm };
}

describe('CRM compact purchase context', () => {
  it('provides five qualifying Copilot purchase receipts without lifetime totals or placement joins', async () => {
    const { service, tx, prisma } = setup();
    expect(await service.forCopilot('user-a', 'contact-a')).toMatchObject([
      { id: 'sale-c', status: 'COMPLETED' },
    ]);
    expect(tx.telegramAdSale.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        advertiserId: 'contact-a',
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        OR: [
          { status: 'COMPLETED' },
          {
            payments: {
              some: {
                workspaceId: 'workspace-a',
                status: { not: 'VOIDED' },
                amount: { gt: 0 },
              },
            },
          },
        ],
        assignedMemberId: 'member-a',
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        settlementCurrency: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('refuses Copilot receipts across CRM and sales workspace contexts', async () => {
    const { service, auth, tx } = setup();
    auth.require.mockResolvedValue({
      workspaceId: 'other-workspace',
      memberId: 'member-a',
    });
    await expect(service.forCopilot('user-a', 'contact-a')).rejects.toThrow(
      'CRM and sales workspace contexts differ',
    );
    expect(tx.telegramAdSale.findMany).not.toHaveBeenCalled();
  });

  it('returns a real multi-channel deal, separate actual currencies and linked-only aggregate history', async () => {
    const { service, tx } = setup();
    const result = await service.list('user-a', 'contact-a', {});
    expect(result.summary).toEqual({
      dealCount: 1000000,
      purchaseCount: 12345,
      lastPurchaseAt: stamp.toISOString(),
      attribution: 'LINKED_SALES_ONLY',
      receivedByCurrency: [
        { currency: 'UAH', amount: '800' },
        { currency: 'USD', amount: '20.000000000000000001' },
      ],
      agreedByCurrency: [
        { currency: 'UAH', amount: '100.1' },
        { currency: 'USD', amount: '100.1' },
      ],
    });
    expect(result.items[0].placements.map((row) => row.channel.id)).toEqual([
      'channel-1',
      'channel-2',
    ]);
    expect(result.items[0].receivedByCurrency).not.toEqual([
      { currency: 'EUR', amount: '820' },
    ]);
    expect(tx.telegramAdSale.findMany).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect(query.values).toContain('workspace-a');
      expect(query.values).toContain('contact-a');
      expect(query.values).toContain('member-a');
      expect(query.sql).not.toContain('settlementCurrency');
      expect(query.sql).not.toContain('advertiserTelegram');
    }
  });

  it('bounds large histories, uses keysets with tied dates, and skips summary aggregates on subsequent pages', async () => {
    const { service, tx } = setup([
      sale('sale-c'),
      sale('sale-b'),
      sale('sale-a'),
    ]);
    const first = await service.list('user-a', 'contact-a', { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    tx.$queryRaw.mockClear();
    await service.list('user-a', 'contact-a', {
      cursor: first.nextCursor!,
      limit: 1000,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.telegramAdSale.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          advertiserId: 'contact-a',
          assignedMemberId: 'member-a',
          OR: [
            { createdAt: { lt: stamp } },
            { createdAt: stamp, id: { lt: 'sale-b' } },
          ],
        },
        take: 51,
      }),
    );
  });

  it('keeps missing historical product/network data explicit and caps placements instead of fabricating a package', async () => {
    const row = sale('sale-c');
    row.placements = Array.from({ length: 101 }, (_, index) =>
      placement(index),
    );
    row.placements[0].product.workspaceId = 'foreign-workspace';
    const { service } = setup([row]);
    const result = await service.list('user-a', 'contact-a', {});
    expect(result.items[0].placements).toHaveLength(100);
    expect(result.items[0].hasMorePlacements).toBe(true);
    expect(result.items[0].historicalDataIncomplete).toBe(true);
    expect(result.items[0].placements[0].productName).toBeNull();
  });

  it('does not present absent placement records as known history', async () => {
    const row = sale('sale-c');
    row.placements = [];
    const { service } = setup([row]);
    expect(
      (await service.list('user-a', 'contact-a', {})).items[0]
        .historicalDataIncomplete,
    ).toBe(true);
  });

  it.each([
    'invalid',
    encodeSalesContextCursor({ kind: 'products', id: 'product-a' }),
    encodeSalesContextCursor({
      kind: 'purchases',
      id: 'sale-a',
      createdAt: 'not-a-date',
    }),
  ])(
    'rejects malformed or wrong-kind cursors before history access: %s',
    async (cursor) => {
      const { service, tx } = setup();
      await expect(
        service.list('user-a', 'contact-a', { cursor }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.telegramAdSale.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([new ForbiddenException(), new NotFoundException()])(
    'requires scoped contact access before loading sales',
    async (error) => {
      const { service, crm, tx } = setup();
      crm.requireReadContact.mockRejectedValue(error);
      await expect(service.list('user-a', 'contact-a', {})).rejects.toBe(error);
      expect(tx.telegramAdSale.findMany).not.toHaveBeenCalled();
    },
  );

  it('requires independent Sales visibility and does not broaden own-only sale scope', async () => {
    const { service, auth, tx } = setup();
    auth.require.mockRejectedValue(new ForbiddenException());
    await expect(
      service.list('user-a', 'contact-a', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.telegramAdSale.findMany).not.toHaveBeenCalled();
  });

  it('rejects divergent workspace contexts before constructing history queries', async () => {
    const { service, auth, tx } = setup();
    auth.require.mockResolvedValue({
      workspaceId: 'workspace-b',
      memberId: 'member-b',
    });
    await expect(
      service.list('user-a', 'contact-a', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.telegramAdSale.findMany).not.toHaveBeenCalled();
  });

  it('fails explicitly if corrupted currency cardinality exceeds the bounded summary result', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockImplementation((query) =>
      Promise.resolve(
        query.sql.includes('AS "dealCount"')
          ? []
          : Array.from({ length: 501 }, () => ({
              saleId: null,
              kind: 'received',
              currency: 'USD',
              amount: '1',
            })),
      ),
    );
    await expect(service.list('user-a', 'contact-a', {})).rejects.toThrow(
      'Too many currency groups',
    );
  });

  it('builds aggregate rules excluding voided payments and unpurchased draft/cancelled deals', async () => {
    const { service, tx } = setup();
    await service.list('user-a', 'contact-a', {});
    const stats = tx.$queryRaw.mock.calls.find(([query]) =>
      query.sql.includes('AS "dealCount"'),
    )?.[0].sql;
    expect(stats).toContain('sale."status" NOT IN (\'DRAFT\'');
    expect(stats).toContain('payment."amount" > 0');
    expect(stats).toContain('payment."status" <> \'VOIDED\'');
    const amountSql = tx.$queryRaw.mock.calls
      .filter(([query]) => query.sql.includes('UNION ALL'))
      .map(([query]) => query.sql)
      .join('\n');
    expect(amountSql).toMatch(
      /GROUP BY\s+UPPER\(TRIM\(payment\."currency"\)\)/,
    );
    expect(amountSql).toContain('UPPER(TRIM(placement."currency"))');
  });
});
