import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmPackageSalesContextService } from './telegram-crm-package-sales-context.service';
import { encodeSalesContextCursor } from './telegram-crm-sales-context-cursor';

const stamp = new Date('2026-10-31T09:00:00Z');
const product = (id: string) => ({
  id,
  name: 'Channel placement',
  defaultPricingMode: 'FIXED',
  defaultFixedPrice: new Prisma.Decimal('100.10'),
  defaultCpm: null as Prisma.Decimal | null,
  minimumPrice: null as Prisma.Decimal | null,
  currency: 'UAH',
  topDurationMinutes: 60,
  feedDurationHours: 24,
  deleteAfterHours: 24,
  isPermanent: false,
  updatedAt: stamp,
  telegramChannel: {
    id: 'channel-a',
    title: 'Channel A',
    adSchedulePolicy: {
      timezone: 'Europe/Kyiv',
      maxAdsPerDay: 2,
      minHoursBetweenAds: 6,
      minDaysBetweenAds: 1,
      allowManualSlots: false,
    },
  },
});
const network = (id: string, size = 7) => ({
  id,
  name: 'Current package network',
  updatedAt: stamp,
  channels: Array.from({ length: size }, (_, index) => ({
    telegramChannel: { id: `channel-${index}`, title: `Channel ${index}` },
  })),
});
function setup(
  products = [product('product-a')],
  networks = [network('network-a')],
) {
  const prisma = {
    telegramAdProduct: {
      findMany: jest
        .fn<Promise<typeof products>, [unknown]>()
        .mockResolvedValue(products),
    },
    telegramChannelNetwork: {
      findMany: jest
        .fn<Promise<typeof networks>, [unknown]>()
        .mockResolvedValue(networks),
    },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  const auth = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-a' }),
    scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-a' }),
  };
  const service = new TelegramCrmPackageSalesContextService(
    prisma as unknown as PrismaService,
    auth as unknown as WorkspaceAuthorizationService,
  );
  return { service, prisma, auth };
}

describe('CRM current package sales context', () => {
  it('returns current seven-channel membership, explicit price, constraints and manager-only discounts without repricing', async () => {
    const { service, prisma, auth } = setup();
    const result = await service.list('user-a', {});
    expect(result.discountPolicy).toBe('MANAGER_APPROVAL_REQUIRED');
    expect(result.networks[0].channels).toHaveLength(7);
    expect(result.products[0]).toMatchObject({
      fixedPrice: '100.1',
      currency: 'UAH',
      cpm: null,
      minimumPrice: null,
      quoteRequired: false,
      updatedAt: stamp.toISOString(),
      constraints: { maxAdsPerDay: 2, minHoursBetweenAds: 6 },
    });
    expect(Number.isFinite(new Date(result.asOf).getTime())).toBe(true);
    expect(auth.require).toHaveBeenCalledWith('user-a', 'adSales.crm.view');
    expect(auth.require).toHaveBeenCalledWith('user-a', 'adSales.sales.view');
    expect(prisma.telegramAdProduct.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramChannelNetwork.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps absent fixed price unknown and CPM separate from a quoted package total', async () => {
    const cpm = product('product-cpm');
    cpm.defaultPricingMode = 'CPM';
    cpm.defaultCpm = new Prisma.Decimal('5.5');
    cpm.defaultFixedPrice = null as unknown as Prisma.Decimal;
    const missing = product('product-missing');
    missing.defaultFixedPrice = null as unknown as Prisma.Decimal;
    const result = await setup([cpm, missing]).service.list('user-a', {});
    expect(result.products[0]).toMatchObject({
      fixedPrice: null,
      cpm: '5.5',
      quoteRequired: true,
    });
    expect(result.products[1]).toMatchObject({
      fixedPrice: null,
      cpm: null,
      quoteRequired: true,
    });
  });

  it('uses a bounded product cursor and truthful network/channel truncation', async () => {
    const { service, prisma } = setup(
      [product('product-a'), product('product-b'), product('product-c')],
      Array.from({ length: 51 }, (_, i) => network(`network-${i}`, 101)),
    );
    const first = await service.list('user-a', { limit: 2 });
    expect(first.products).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.networks).toHaveLength(50);
    expect(first.networksTruncated).toBe(true);
    expect(first.networks[0].channels).toHaveLength(100);
    expect(first.networks[0].channelsTruncated).toBe(true);
    await service.list('user-a', { cursor: first.nextCursor!, limit: 500 });
    expect(prisma.telegramAdProduct.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 51,
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          isActive: true,
          id: { gt: 'product-b' },
          telegramChannel: {
            workspaceId: 'workspace-a',
            isActive: true,
            adminLinks: { some: {} },
          },
        }) as unknown,
      }),
    );
    expect(prisma.telegramChannelNetwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        select: expect.objectContaining({
          channels: expect.objectContaining({ take: 101 }) as unknown,
        }) as unknown,
      }),
    );
  });

  it('does not expose inactive or foreign-workspace package members through its query', async () => {
    const { service, prisma } = setup();
    await service.list('user-a', {});
    expect(prisma.telegramChannelNetwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          channels: {
            some: {},
            every: {
              workspaceId: 'workspace-a',
              telegramChannel: {
                workspaceId: 'workspace-a',
                isActive: true,
                adminLinks: { some: {} },
              },
            },
          },
        },
      }),
    );
  });

  it('returns an explicit empty context without creating missing defaults', async () => {
    const { service } = setup([], []);
    expect(await service.list('user-a', {})).toMatchObject({
      products: [],
      networks: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it.each([
    'garbage',
    encodeSalesContextCursor({
      kind: 'purchases',
      id: 'sale-a',
      createdAt: stamp.toISOString(),
    }),
  ])('rejects invalid product cursors before catalog reads', async (cursor) => {
    const { service, prisma } = setup();
    await expect(service.list('user-a', { cursor })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.telegramAdProduct.findMany).not.toHaveBeenCalled();
  });

  it('rejects missing Sales visibility even when CRM scope is valid', async () => {
    const { service, auth, prisma } = setup();
    auth.require
      .mockResolvedValueOnce({ workspaceId: 'workspace-a' })
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(service.list('user-a', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.telegramChannelNetwork.findMany).not.toHaveBeenCalled();
  });

  it('requires both CRM ownership visibility and independent sales permission', async () => {
    const { service, auth, prisma } = setup();
    auth.scope.mockRejectedValue(new ForbiddenException());
    await expect(service.list('user-a', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.telegramAdProduct.findMany).not.toHaveBeenCalled();
  });
});
