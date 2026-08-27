import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  SYSTEM_ALL_NETWORK_ID,
  TelegramChannelNetworksService,
} from './telegram-channel-networks.service';

function harness() {
  const tx = {
    telegramChannelNetwork: { update: jest.fn().mockResolvedValue({}) },
    telegramChannelNetworkMember: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    icon: { findFirst: jest.fn() },
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        systemNetworkExcludedChannelIds: [],
        primaryCurrency: 'USD',
      }),
      update: jest.fn(),
    },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    telegramChannelNetwork: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(
      async (action: Array<unknown> | ((client: typeof tx) => unknown)) =>
        Array.isArray(action) ? Promise.all(action) : action(tx),
    ),
  };
  const financialRead = {
    buildChannelFinancialSummaryPreview: jest.fn().mockResolvedValue(new Map()),
  };
  const service = new TelegramChannelNetworksService(
    prisma as never,
    {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    } as never,
    financialRead as never,
  );
  return { service, prisma, tx, financialRead };
}

describe('TelegramChannelNetworksService icons', () => {
  it('stores a workspace-visible icon and returns its resolved presentation', async () => {
    const test = harness();
    test.prisma.telegramChannelNetwork.findFirst.mockResolvedValue({
      id: 'network-1',
    });
    test.prisma.icon.findFirst.mockResolvedValue({ id: 'icon-1' });
    jest.spyOn(test.service, 'getById').mockResolvedValue({
      id: 'network-1',
      iconId: 'icon-1',
      iconPresentation: { type: 'unicode', value: '🛰️' },
    } as never);

    await expect(
      test.service.update('user-1', 'network-1', { iconId: 'icon-1' }),
    ).resolves.toMatchObject({
      iconId: 'icon-1',
      iconPresentation: { type: 'unicode', value: '🛰️' },
    });

    expect(test.prisma.icon.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'icon-1',
        OR: [{ workspaceId: 'workspace-1' }, { workspaceId: null }],
      },
      select: { id: true },
    });
    expect(test.tx.telegramChannelNetwork.update).toHaveBeenCalledWith({
      where: { id: 'network-1' },
      data: expect.objectContaining({ iconId: 'icon-1' }),
    });
  });

  it('rejects an icon that is not visible to the selected workspace', async () => {
    const test = harness();
    test.prisma.telegramChannelNetwork.findFirst.mockResolvedValue({
      id: 'network-1',
    });
    test.prisma.icon.findFirst.mockResolvedValue(null);

    await expect(
      test.service.update('user-1', 'network-1', {
        iconId: 'other-workspace-icon',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps stored icon data into iconPresentation without frontend joins', async () => {
    const test = harness();
    const result = await (
      test.service as unknown as {
        enrichNetwork: (network: unknown) => Promise<Record<string, unknown>>;
      }
    ).enrichNetwork({
      id: 'network-1',
      name: 'Network',
      description: null,
      iconId: 'icon-1',
      icon: {
        id: 'icon-1',
        type: 'emoji',
        name: 'Satellite',
        emoji: '🛰️',
        imageUrl: null,
      },
      channels: [],
    });

    expect(result).toMatchObject({
      iconId: 'icon-1',
      iconPresentation: { type: 'unicode', value: '🛰️' },
    });
    expect(
      test.financialRead.buildChannelFinancialSummaryPreview,
    ).toHaveBeenCalledWith(undefined, [], { targetCurrency: 'USD' });
  });

  it('normalizes a custom network to the currency used by most channels', async () => {
    const test = harness();
    const finance = {
      currency: 'UAH',
      totalAdSpend: 0,
      campaignsCount: 0,
      totalJoinedSubscribers: 0,
      totalPendingSubscribers: 0,
      totalAttributedSubscribers: 0,
      paidActiveSubscribersEstimate: null,
      avgCpa: null,
      activeCpa: null,
      kpiStatus: 'unknown',
      kpiLabel: '-',
      assetEconomics: null,
    };
    test.financialRead.buildChannelFinancialSummaryPreview.mockResolvedValue(
      new Map([
        ['channel-1', finance],
        ['channel-2', finance],
        ['channel-3', finance],
      ]),
    );
    const channel = (id: string, kpiCurrency: string) => ({
      telegramChannel: {
        id,
        title: id,
        username: null,
        photoUrl: null,
        currentSubscribersCount: 0,
        pendingJoinRequestsCount: 0,
        activeSubscribersWindow: 5,
        audienceSnapshots: [],
        kpiCurrency,
      },
    });
    await (
      test.service as unknown as {
        enrichNetwork: (network: unknown) => Promise<Record<string, unknown>>;
      }
    ).enrichNetwork({
      id: 'network-1',
      workspaceId: 'workspace-1',
      name: 'UAH network',
      description: null,
      iconId: null,
      icon: null,
      channels: [
        channel('channel-1', 'UAH'),
        channel('channel-2', 'USD'),
        channel('channel-3', 'UAH'),
      ],
    });

    expect(
      test.financialRead.buildChannelFinancialSummaryPreview,
    ).toHaveBeenCalledWith('workspace-1', expect.any(Array), {
      targetCurrency: 'UAH',
    });
  });
});

describe('TelegramChannelNetworksService system All network', () => {
  it('places All first and counts it in paginated workspace results', async () => {
    const test = harness();

    const result = await test.service.list('user-1', {
      page: 1,
      pageSize: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: SYSTEM_ALL_NETWORK_ID,
      isSystem: true,
    });
    expect(result.pagination).toMatchObject({
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
    });
    expect(test.prisma.telegramChannelNetwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
        skip: 0,
        take: 9,
      }),
    );
    expect(test.prisma.telegramChannelNetwork.count).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
    });
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns every own channel with meaningful statistics and the Telegram logo', async () => {
    const test = harness();
    const included = {
      id: 'channel-1',
      title: 'Included',
      username: 'included',
      photoUrl: null,
      currentSubscribersCount: 100,
      pendingJoinRequestsCount: 302,
      kpiCurrency: 'UAH',
      audienceSnapshots: [
        {
          subscribersCount: 100,
          activeSubscribersEstimate: 25,
          viewRate: 25,
          postsWindow: 2,
        },
      ],
    };
    const empty = {
      id: 'channel-2',
      title: 'Empty',
      username: null,
      photoUrl: null,
      currentSubscribersCount: null,
      kpiCurrency: 'UAH',
      audienceSnapshots: [],
    };
    test.prisma.telegramChannel.findMany.mockResolvedValue([included, empty]);
    test.financialRead.buildChannelFinancialSummaryPreview.mockResolvedValue(
      new Map([
        [
          'channel-1',
          {
            currency: 'UAH',
            totalAdSpend: 100,
            campaignsCount: 1,
            totalJoinedSubscribers: 5,
            totalPendingSubscribers: 5,
            totalAttributedSubscribers: 10,
            paidActiveSubscribersEstimate: 10,
            avgCpa: 10,
            activeCpa: 10,
            kpiStatus: 'good',
            kpiLabel: 'Good',
          },
        ],
        [
          'channel-2',
          {
            currency: 'UAH',
            totalAdSpend: 0,
            campaignsCount: 0,
            totalJoinedSubscribers: 0,
            totalPendingSubscribers: 0,
            totalAttributedSubscribers: 0,
            paidActiveSubscribersEstimate: null,
            avgCpa: null,
            activeCpa: null,
            kpiStatus: 'unknown',
            kpiLabel: '-',
          },
        ],
      ]),
    );

    const result = await test.service.getById('user-1', SYSTEM_ALL_NETWORK_ID);

    expect(
      test.financialRead.buildChannelFinancialSummaryPreview,
    ).toHaveBeenCalledWith('workspace-1', expect.any(Array), {
      targetCurrency: 'UAH',
    });

    expect(result).toMatchObject({
      id: SYSTEM_ALL_NETWORK_ID,
      name: 'All',
      isSystem: true,
      canEdit: true,
      canDelete: false,
      iconPresentation: {
        type: 'image',
        url: 'https://telegram.org/img/t_logo.png',
      },
      channels: [{ id: 'channel-1', title: 'Included' }],
      summary: {
        channelsCount: 1,
        totalAttributedSubscribers: 10,
        pendingJoinRequestsCount: 302,
      },
    });
    expect(test.prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          id: { notIn: [] },
          isActive: true,
          archivedAt: null,
          adminLinks: { some: {} },
        },
      }),
    );
  });

  it('stores workspace-scoped channel exclusions for the system network', async () => {
    const test = harness();
    test.prisma.telegramChannel.findMany
      .mockResolvedValueOnce([{ id: 'test-channel' }])
      .mockResolvedValueOnce([]);
    test.prisma.workspace.findUnique.mockResolvedValue({
      systemNetworkExcludedChannelIds: ['test-channel'],
    });

    const result = await test.service.update('user-1', SYSTEM_ALL_NETWORK_ID, {
      excludedTelegramChannelIds: ['test-channel'],
    });

    expect(test.prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
      data: { systemNetworkExcludedChannelIds: ['test-channel'] },
    });
    expect(result.excludedTelegramChannelIds).toEqual(['test-channel']);
  });

  it('still rejects deleting the system network', async () => {
    const test = harness();
    await expect(
      test.service.remove('user-1', SYSTEM_ALL_NETWORK_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reserves the All name for the system network', async () => {
    const test = harness();

    await expect(
      test.service.create('user-1', {
        name: ' all ',
        telegramChannelIds: ['channel-1', 'channel-2'],
      }),
    ).rejects.toThrow('All is reserved for the system network');
  });
});
