/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- focused partial service mocks */
import { ForbiddenException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
  WorkspaceRole,
} from '@prisma/client';
import { TelegramAdSalesBotCommandExecutorService } from './telegram-ad-sales-bot-command-executor.service';
import { TelegramAdSalesBotReservationService } from './telegram-ad-sales-bot-reservation.service';
import { TelegramAdSalesBotCommandService } from './telegram-ad-sales-bot-command.service';

const baseInput = {
  commandId: 'workflow-1',
  finance: {
    accountId: 'account-1',
    amount: 125,
    paidAt: '2026-08-24T10:00:00.000Z',
  },
  assignedMemberId: 'member-2',
  channelId: 'channel-1',
  productId: 'product-1',
  advertiserLabel: '',
  scheduledAt: '2099-08-25T16:00:00.000Z',
} as const;

function setup() {
  const placement = {
    id: 'placement-1',
    telegramChannelId: 'channel-1',
    telegramAdProductId: 'product-1',
    managedPostId: null as string | null,
    status: TelegramAdPlacementStatus.RESERVED as TelegramAdPlacementStatus,
  };
  const sale = {
    id: 'sale-1',
    workspaceId: 'workspace-1',
    financeSkipped: false,
    status: TelegramAdSaleStatus.RESERVED as TelegramAdSaleStatus,
    placements: [placement],
    payments: [
      {
        id: 'payment-1',
        transactionId: 'transaction-1',
        idempotencyKey: 'system-bot-ad-sale:workflow-1',
      },
    ],
  };
  const prisma = {
    account: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'account-1', currency: 'UAH' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    telegramChannel: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'channel-1', adBaseCurrency: 'UAH' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    telegramAdProduct: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'product-1', currency: 'UAH' }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          telegramChannelId: 'channel-1',
          currency: 'UAH',
        },
      ]),
    },
    telegramAdSale: { findFirst: jest.fn() },
    telegramAdSalePayment: { findFirst: jest.fn() },
    workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const workspaceService = {
    resolveAssignedMemberId: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      assignedMemberId: 'member-2',
      currentMembership: {
        id: 'member-1',
        role: WorkspaceRole.owner,
        workspace: { timezone: 'Europe/Warsaw' },
      },
    }),
    resolveWorkspaceMembershipForUser: jest.fn(),
  };
  const checkout = {
    create: jest.fn().mockResolvedValue(sale),
    reserveWithoutPayment: jest.fn().mockResolvedValue(sale),
  };
  const sales = {
    getSale: jest.fn().mockImplementation(async () => sale),
    updateSale: jest.fn().mockImplementation(async (_userId, _saleId, dto) => {
      sale.status = dto.status;
      return sale;
    }),
    confirmSale: jest.fn().mockImplementation(async () => {
      sale.status = TelegramAdSaleStatus.CONFIRMED;
      return sale;
    }),
    createManagedPostFromPlacement: jest.fn().mockImplementation(async () => {
      placement.managedPostId = 'post-1';
      return { id: 'post-1' };
    }),
    schedulePlacement: jest.fn().mockImplementation(async () => {
      placement.status = TelegramAdPlacementStatus.SCHEDULED;
      return placement;
    }),
    publishPlacement: jest.fn().mockImplementation(async () => {
      placement.status = TelegramAdPlacementStatus.PUBLISHED;
      return placement;
    }),
    attachManagedPost: jest.fn().mockImplementation(async () => {
      placement.status = TelegramAdPlacementStatus.PUBLISHED;
      return placement;
    }),
    listChannelProducts: jest.fn(),
  };
  const targets = {
    resolve: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      networkId: null,
      networkName: null,
      channelIds: ['channel-1'],
      audienceWeightsByChannel: { 'channel-1': 0 },
      formats: [
        {
          name: '1/24',
          deleteAfterHours: 24,
          isPermanent: false,
          productIdsByChannel: { 'channel-1': 'product-1' },
        },
      ],
    }),
  };
  const deletionPreflight = { assertAvailable: jest.fn() };
  const reservations = new TelegramAdSalesBotReservationService(
    prisma as never,
    checkout as never,
    sales as never,
  );
  const executor = new TelegramAdSalesBotCommandExecutorService(
    prisma as never,
    workspaceService as never,
    sales as never,
    targets as never,
    {} as never,
    deletionPreflight as never,
    reservations,
  );
  const service = new TelegramAdSalesBotCommandService(
    prisma as never,
    workspaceService as never,
    sales as never,
    executor,
  );
  return {
    service,
    prisma,
    workspaceService,
    checkout,
    sales,
    sale,
    placement,
    targets,
    deletionPreflight,
  };
}

describe('TelegramAdSalesBotCommandService', () => {
  it('returns account emoji and member identity so equal names stay distinguishable', async () => {
    const { service, prisma, workspaceService } = setup();
    workspaceService.resolveWorkspaceMembershipForUser.mockResolvedValue({
      id: 'member-current',
      workspaceId: 'workspace-1',
      role: WorkspaceRole.owner,
      workspace: { timezone: 'Europe/Warsaw' },
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: 'account-sasha',
        name: 'Poland Card',
        currency: 'PLN',
        icon: {
          id: 'icon-pl',
          type: 'emoji',
          name: 'Poland',
          emoji: '🇵🇱',
          imageUrl: null,
        },
        assignedMember: {
          telegramUsername: null,
          user: { name: 'Sasha', email: 'sasha@example.test' },
        },
      },
      {
        id: 'account-mak',
        name: 'Poland Card',
        currency: 'PLN',
        icon: {
          id: 'icon-pl',
          type: 'emoji',
          name: 'Poland',
          emoji: '🇵🇱',
          imageUrl: null,
        },
        assignedMember: {
          telegramUsername: 'mak',
          user: { name: 'Mak', email: 'mak@example.test' },
        },
      },
    ]);
    prisma.workspaceMember.findMany.mockResolvedValue([
      {
        id: 'member-current',
        role: WorkspaceRole.owner,
        telegramUsername: null,
        user: { name: 'Current Member', email: 'current@example.test' },
      },
    ]);

    const result = await service.options('user-1');

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          isActive: true,
          OR: [
            { assignedMemberId: null },
            { assignedMember: { isHidden: false } },
          ],
        }),
      }),
    );
    expect(result.accounts).toEqual([
      expect.objectContaining({
        id: 'account-sasha',
        assignedMemberName: 'Sasha',
        iconPresentation: expect.objectContaining({
          type: 'unicode',
          value: '🇵🇱',
        }),
      }),
      expect.objectContaining({
        id: 'account-mak',
        assignedMemberName: 'Mak',
        iconPresentation: expect.objectContaining({
          type: 'unicode',
          value: '🇵🇱',
        }),
      }),
    ]);
    expect(result.currentMember).toEqual({
      id: 'member-current',
      name: 'Current Member',
    });
  });

  it('limits ordinary members to their own default assignment option', async () => {
    const { service, prisma, workspaceService } = setup();
    workspaceService.resolveWorkspaceMembershipForUser.mockResolvedValue({
      id: 'member-current',
      workspaceId: 'workspace-1',
      role: WorkspaceRole.member,
      workspace: { timezone: 'Europe/Warsaw' },
    });
    prisma.workspaceMember.findMany.mockResolvedValue([
      {
        id: 'member-current',
        role: WorkspaceRole.member,
        telegramUsername: null,
        user: { name: 'Current Member', email: 'current@example.test' },
      },
    ]);

    const result = await service.options('user-1');

    expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', id: 'member-current' },
      }),
    );
    expect(result.currentMember.id).toBe('member-current');
    expect(result.members).toHaveLength(1);
  });

  it('creates an idempotent paymentless reservation with explicit skipped-finance semantics', async () => {
    const { service, prisma, checkout, sale } = setup();
    sale.payments = [];
    sale.financeSkipped = true;

    await expect(
      service.commit('user-1', {
        commandId: 'workflow-1',
        channelId: 'channel-1',
        productId: 'product-1',
        scheduledAt: baseInput.scheduledAt,
        deliveryAction: 'SKIP_POST',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ paymentId: null, transactionId: null }),
    );

    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(checkout.create).not.toHaveBeenCalled();
    expect(checkout.reserveWithoutPayment).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        idempotencyKey: 'system-bot-ad-sale:workflow-1',
        financeSkipped: true,
        settlementCurrency: 'UAH',
        assignedMemberId: 'member-2',
        placements: [
          expect.objectContaining({
            agreedPrice: 0,
            currency: 'UAH',
            manualPriceReason: 'Price not recorded through Telegram System Bot',
          }),
        ],
      }),
    );
  });

  it('maps a bot command to one idempotent manual checkout and can skip the post', async () => {
    const { service, checkout, sales } = setup();

    await expect(
      service.commit('user-1', {
        ...baseInput,
        deliveryAction: 'SKIP_POST',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        saleId: 'sale-1',
        placementId: 'placement-1',
        paymentId: 'payment-1',
        transactionId: 'transaction-1',
        managedPostId: null,
        saleStatus: TelegramAdSaleStatus.CONFIRMED,
        placementStatus: TelegramAdPlacementStatus.RESERVED,
        deliveryAction: 'SKIP_POST',
      }),
    );

    expect(checkout.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        advertiserName: 'Telegram advertiser',
        settlementCurrency: 'UAH',
        assignedMemberId: 'member-2',
        placements: [
          expect.objectContaining({
            telegramChannelId: 'channel-1',
            telegramAdProductId: 'product-1',
            pricingMode: 'MANUAL',
            agreedPrice: 125,
            currency: 'UAH',
          }),
        ],
        payment: expect.objectContaining({
          accountId: 'account-1',
          currency: 'UAH',
          amount: 125,
          idempotencyKey: 'system-bot-ad-sale:workflow-1',
        }),
      }),
    );
    expect(sales.confirmSale).toHaveBeenCalledWith('user-1', 'sale-1');
    expect(sales.createManagedPostFromPlacement).not.toHaveBeenCalled();
  });

  it('creates, attaches and schedules a managed post through canonical services', async () => {
    const { service, sales } = setup();

    const result = await service.commit('user-1', {
      ...baseInput,
      deliveryAction: 'SCHEDULE',
      post: {
        title: 'Campaign post',
        text: 'Buy now',
        imageUrls: ['https://cdn.example/post.jpg'],
        buttonRows: [
          [{ text: 'Open', url: 'https://example.com', style: 'default' }],
        ],
      },
    });

    expect(sales.createManagedPostFromPlacement).toHaveBeenCalledWith(
      'user-1',
      'sale-1',
      'placement-1',
      expect.objectContaining({
        assignedMemberId: 'member-2',
        buttonRows: [
          [
            {
              text: 'Open',
              url: 'https://example.com',
              style: 'default',
            },
          ],
        ],
      }),
    );
    expect(sales.schedulePlacement).toHaveBeenCalledWith(
      'user-1',
      'sale-1',
      'placement-1',
      expect.objectContaining({ scheduledAt: baseInput.scheduledAt }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        managedPostId: 'post-1',
        placementStatus: TelegramAdPlacementStatus.SCHEDULED,
      }),
    );
  });

  it('publishes the attached managed post immediately', async () => {
    const { service, sales } = setup();

    const result = await service.commit('user-1', {
      ...baseInput,
      deliveryAction: 'PUBLISH_NOW',
      post: { text: 'Immediate ad' },
    });

    expect(sales.publishPlacement).toHaveBeenCalledWith(
      'user-1',
      'sale-1',
      'placement-1',
      { longTextMode: undefined },
    );
    expect(result.placementStatus).toBe(TelegramAdPlacementStatus.PUBLISHED);
  });

  it('resumes after delivery failure without duplicating checkout or post creation', async () => {
    const { service, checkout, sales, sale, placement } = setup();
    sales.schedulePlacement.mockRejectedValueOnce(new Error('Telegram down'));

    await expect(
      service.commit('user-1', {
        ...baseInput,
        deliveryAction: 'SCHEDULE',
        post: { text: 'Retry me' },
      }),
    ).rejects.toThrow('Telegram down');
    expect(placement.managedPostId).toBe('post-1');

    sale.status = TelegramAdSaleStatus.CONFIRMED;
    await expect(
      service.commit('user-1', {
        ...baseInput,
        existingSaleId: 'sale-1',
        deliveryAction: 'SCHEDULE',
        post: { text: 'Retry me' },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        saleId: 'sale-1',
        managedPostId: 'post-1',
        placementStatus: TelegramAdPlacementStatus.SCHEDULED,
      }),
    );

    expect(checkout.create).toHaveBeenCalledTimes(1);
    expect(sales.createManagedPostFromPlacement).toHaveBeenCalledTimes(1);
    expect(sales.schedulePlacement).toHaveBeenCalledTimes(2);
  });

  it('resumes a paymentless command by sale idempotency after delivery failure', async () => {
    const { service, prisma, checkout, sales, sale, placement } = setup();
    sale.payments = [];
    sale.financeSkipped = true;
    sales.schedulePlacement.mockRejectedValueOnce(new Error('Telegram down'));

    const input = {
      commandId: 'workflow-1',
      channelId: 'channel-1',
      productId: 'product-1',
      scheduledAt: baseInput.scheduledAt,
      deliveryAction: 'SCHEDULE' as const,
      post: { text: 'Retry paymentless' },
    };
    await expect(service.commit('user-1', input)).rejects.toThrow(
      'Telegram down',
    );
    sale.status = TelegramAdSaleStatus.CONFIRMED;
    checkout.reserveWithoutPayment.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.telegramAdSale.findFirst.mockResolvedValue({ id: 'sale-1' });

    await expect(service.commit('user-1', input)).resolves.toEqual(
      expect.objectContaining({
        saleId: 'sale-1',
        placementStatus: TelegramAdPlacementStatus.SCHEDULED,
      }),
    );

    expect(checkout.reserveWithoutPayment).toHaveBeenCalledTimes(2);
    expect(sales.createManagedPostFromPlacement).toHaveBeenCalledTimes(1);
    expect(placement.managedPostId).toBe('post-1');
  });

  it('delegates member assignment validation before reading scoped entities', async () => {
    const { service, prisma, workspaceService, checkout } = setup();
    workspaceService.resolveAssignedMemberId.mockRejectedValueOnce(
      new ForbiddenException('Members can only assign themselves'),
    );

    await expect(
      service.commit('user-1', {
        ...baseInput,
        deliveryAction: 'SKIP_POST',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(workspaceService.resolveAssignedMemberId).toHaveBeenCalledWith(
      'user-1',
      'member-2',
    );
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(checkout.create).not.toHaveBeenCalled();
  });
});
