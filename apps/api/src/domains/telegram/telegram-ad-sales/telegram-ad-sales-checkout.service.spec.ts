/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- Prisma transaction and Jest asymmetric matcher mocks are intentionally partial. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPricingMode,
  TelegramAdSaleOrigin,
} from '@prisma/client';
import { TelegramAdSalesCheckoutService } from './telegram-ad-sales-checkout.service';

function checkoutDto() {
  return {
    advertiserName: 'Advertiser',
    origin: TelegramAdSaleOrigin.DIRECT,
    settlementCurrency: 'UAH',
    placements: [
      {
        telegramChannelId: 'channel-1',
        scheduledAt: '2026-08-25T16:00:00.000Z',
        timezone: 'Europe/Warsaw',
        pricingMode: TelegramAdPricingMode.FIXED,
        agreedPrice: 102,
        expectedViews: 569,
        recommendedPrice: 170.7,
        minimumPrice: 100,
        currency: 'UAH',
      },
    ],
    payment: {
      accountId: 'account-1',
      amount: 102,
      currency: 'UAH',
      paidAt: '2026-08-24T10:00:00.000Z',
      idempotencyKey: 'checkout-1',
    },
  };
}

function setup(overrides?: { account?: unknown }) {
  const tx = {
    telegramAdSale: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'sale-1', advertiserName: 'Advertiser' }),
    },
    telegramAdSalePlacement: {
      create: jest.fn().mockResolvedValue({
        id: 'placement-1',
        telegramChannelId: 'channel-1',
        agreedPrice: new Prisma.Decimal(102),
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
    },
    telegramAdSalePayment: {
      create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    },
    telegramAdvertiser: { create: jest.fn() },
    telegramAdvertiserActivity: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
    },
    account: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides && 'account' in overrides
            ? overrides.account
            : { id: 'account-1', currency: 'UAH' },
        ),
    },
    telegramChannel: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'channel-1', currentSubscribersCount: 10_000 },
        ]),
    },
    telegramAdProduct: { findMany: jest.fn() },
    telegramPost: { findMany: jest.fn() },
    telegramChannelNetwork: { findMany: jest.fn() },
    telegramAdvertiser: { findFirst: jest.fn() },
    telegramAdSale: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramAdSalePayment: { findFirst: jest.fn().mockResolvedValue(null) },
    transactionCategory: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'category-1',
        name: 'Channel Advertising Revenue',
      }),
    },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const workspaceService = {
    resolveAssignedMemberId: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      assignedMemberId: 'member-1',
    }),
  };
  const currencyConversionService = { getRate: jest.fn().mockResolvedValue(1) };
  const financeCategoriesService = {
    ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { info: jest.fn() };
  const responseCache = { clearByPrefix: jest.fn() };
  const expectedSale = {
    id: 'sale-1',
    payments: [{ transactionId: 'transaction-1' }],
  };
  const salesService = { getSale: jest.fn().mockResolvedValue(expectedSale) };
  const service = new TelegramAdSalesCheckoutService(
    prisma as never,
    workspaceService as never,
    currencyConversionService as never,
    financeCategoriesService as never,
    logger as never,
    responseCache as never,
    salesService as never,
  );
  return { service, prisma, tx, expectedSale };
}

describe('TelegramAdSalesCheckoutService', () => {
  it('returns the existing paymentless reservation for the same workspace key', async () => {
    const { service, prisma, expectedSale } = setup();
    const { payment: _payment, ...reservation } = checkoutDto();
    void _payment;
    prisma.telegramAdSale.findFirst.mockResolvedValue({ id: 'sale-1' });

    await expect(
      service.reserveWithoutPayment('user-1', {
        ...reservation,
        idempotencyKey: 'system-bot-ad-sale:workflow-1',
        financeSkipped: true,
      }),
    ).resolves.toEqual(expectedSale);

    expect(prisma.telegramAdSale.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        idempotencyKey: 'system-bot-ad-sale:workflow-1',
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('atomically reserves a sale without Finance side effects', async () => {
    const { service, prisma, tx, expectedSale } = setup();
    const { payment: _payment, ...reservation } = checkoutDto();
    void _payment;

    await expect(
      service.reserveWithoutPayment('user-1', {
        ...reservation,
        idempotencyKey: 'system-bot-ad-sale:workflow-1',
        financeSkipped: true,
      }),
    ).resolves.toEqual(expectedSale);

    expect(tx.telegramAdSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'system-bot-ad-sale:workflow-1',
          financeSkipped: true,
          status: 'RESERVED',
        }),
      }),
    );
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.transactionCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.telegramAdSalePayment.create).not.toHaveBeenCalled();
  });

  it('atomically creates the reserved sale, finance transaction and payment', async () => {
    const { service, prisma, tx, expectedSale } = setup();

    await expect(service.create('user-1', checkoutDto())).resolves.toEqual(
      expectedSale,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.telegramAdSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          financeSkipped: false,
          status: 'RESERVED',
        }),
      }),
    );
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(102),
        accountId: 'account-1',
        categoryId: 'category-1',
        type: 'income',
      }),
    });
    expect(tx.telegramAdSalePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telegramAdSaleId: 'sale-1',
        transactionId: 'transaction-1',
        allocations: {
          create: [
            expect.objectContaining({
              telegramAdSalePlacementId: 'placement-1',
            }),
          ],
        },
      }),
    });
  });

  it('splits one total price by channel audience with an exact payment balance', async () => {
    const { service, prisma, tx } = setup();
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1', currentSubscribersCount: 30_000 },
      { id: 'channel-2', currentSubscribersCount: 70_000 },
    ]);
    tx.telegramAdSalePlacement.create
      .mockResolvedValueOnce({
        id: 'placement-1',
        telegramChannelId: 'channel-1',
        agreedPrice: new Prisma.Decimal(220.5),
      })
      .mockResolvedValueOnce({
        id: 'placement-2',
        telegramChannelId: 'channel-2',
        agreedPrice: new Prisma.Decimal(514.5),
      });
    const dto = checkoutDto();

    await service.create('user-1', {
      ...dto,
      placements: [
        dto.placements[0],
        { ...dto.placements[0], telegramChannelId: 'channel-2' },
      ],
      priceAllocation: {
        mode: 'PROPORTIONAL_BY_AUDIENCE',
        totalAmount: 735,
      },
      payment: { ...dto.payment, amount: 735 },
    });

    expect(tx.telegramAdSalePlacement.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          agreedPrice: new Prisma.Decimal(220.5),
        }),
      }),
    );
    expect(tx.telegramAdSalePlacement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          agreedPrice: new Prisma.Decimal(514.5),
        }),
      }),
    );
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: new Prisma.Decimal(735) }),
    });
  });

  it('rejects a payment that does not match the requested total price', async () => {
    const { service, prisma } = setup();
    const dto = checkoutDto();

    await expect(
      service.create('user-1', {
        ...dto,
        priceAllocation: {
          mode: 'PROPORTIONAL_BY_AUDIENCE',
          totalAmount: 735,
        },
      }),
    ).rejects.toThrow('Payment amount must equal the total placement price');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not create a partial sale when the finance account is unavailable', async () => {
    const { service, prisma } = setup({ account: null });

    await expect(
      service.create('user-1', checkoutDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a currency that differs from the selected finance account', async () => {
    const { service, prisma } = setup({
      account: { id: 'account-1', currency: 'USD' },
    });

    await expect(
      service.create('user-1', checkoutDto()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
