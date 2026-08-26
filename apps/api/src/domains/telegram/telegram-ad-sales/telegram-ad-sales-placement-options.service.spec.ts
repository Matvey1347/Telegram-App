/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test doubles */
import {
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import {
  TELEGRAM_AD_SALES_PLACEMENT_OPTION_LIMIT,
  TelegramAdSalesPlacementOptionsService,
} from './telegram-ad-sales-placement-options.service';

const placement = {
  id: 'placement-1',
  telegramAdSaleId: 'sale-1',
  telegramChannelId: 'channel-1',
  telegramAdProductId: 'product-1',
  status: TelegramAdPlacementStatus.RESERVED,
  scheduledAt: new Date('2099-08-25T10:00:00.000Z'),
  timezone: 'Europe/Warsaw',
  sale: {
    id: 'sale-1',
    title: 'Launch campaign',
    advertiserName: 'Advertiser',
    advertiserNameSnapshot: null,
    status: TelegramAdSaleStatus.CONFIRMED,
  },
  telegramChannel: {
    id: 'channel-1',
    title: 'News',
    username: 'news',
  },
  product: { id: 'product-1', name: '1/24' },
};

describe('TelegramAdSalesPlacementOptionsService', () => {
  const prisma = {
    telegramAdSalePlacement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const workspace = {
    resolveWorkspaceMembershipForUser: jest.fn(),
  };
  const service = new TelegramAdSalesPlacementOptionsService(
    prisma as never,
    workspace as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.resolveWorkspaceMembershipForUser.mockResolvedValue({
      workspaceId: 'workspace-1',
    });
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([placement]);
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(placement);
  });

  it('lists at most 50 unattached placements for own active channels and non-terminal sales', async () => {
    const result = await service.list('user-1');

    expect(prisma.telegramAdSalePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: undefined,
          workspaceId: 'workspace-1',
          managedPostId: null,
          status: {
            in: [
              TelegramAdPlacementStatus.DRAFT,
              TelegramAdPlacementStatus.RESERVED,
              TelegramAdPlacementStatus.SCHEDULED,
              TelegramAdPlacementStatus.PUBLISHED,
            ],
          },
          sale: {
            workspaceId: 'workspace-1',
            status: {
              in: [
                TelegramAdSaleStatus.DRAFT,
                TelegramAdSaleStatus.RESERVED,
                TelegramAdSaleStatus.CONFIRMED,
                TelegramAdSaleStatus.IN_PROGRESS,
              ],
            },
          },
          telegramChannel: {
            workspaceId: 'workspace-1',
            isActive: true,
            archivedAt: null,
            adminLinks: { some: {} },
          },
        },
        take: TELEGRAM_AD_SALES_PLACEMENT_OPTION_LIMIT,
      }),
    );
    expect(result[0]).toMatchObject({
      placementId: 'placement-1',
      saleId: 'sale-1',
      saleLabel: 'Launch campaign',
      saleStatusLabel: 'Confirmed',
      placementStatusLabel: 'Reserved',
      channelTitle: 'News',
      productLabel: '1/24',
      scheduledAt: '2099-08-25T10:00:00.000Z',
      label: expect.stringContaining('Launch campaign · News · 1/24'),
    });
  });

  it('revalidates the selected placement with the same workspace-safe predicate', async () => {
    await expect(
      service.resolve('user-1', ' placement-1 '),
    ).resolves.toMatchObject({
      placementId: 'placement-1',
      channelId: 'channel-1',
    });
    expect(prisma.telegramAdSalePlacement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'placement-1',
          workspaceId: 'workspace-1',
          managedPostId: null,
          telegramChannel: expect.objectContaining({
            adminLinks: { some: {} },
          }),
        }),
      }),
    );
  });

  it('rejects a terminal, attached, foreign, or otherwise unavailable placement', async () => {
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(null);

    await expect(
      service.resolve('user-1', 'unavailable-placement'),
    ).rejects.toThrow('Ad placement is unavailable');
  });
});
