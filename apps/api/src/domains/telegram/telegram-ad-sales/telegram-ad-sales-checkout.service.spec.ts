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
      findMany: jest.fn().mockResolvedValue([{ id: 'channel-1' }]),
    },
    telegramAdProduct: { findMany: jest.fn() },
    telegramPost: { findMany: jest.fn() },
    telegramChannelNetwork: { findMany: jest.fn() },
    telegramAdvertiser: { findFirst: jest.fn() },
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
  it('atomically creates the reserved sale, finance transaction and payment', async () => {
    const { service, prisma, tx, expectedSale } = setup();

    await expect(service.create('user-1', checkoutDto())).resolves.toEqual(
      expectedSale,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.telegramAdSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESERVED' }),
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
