import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinanceCoreService } from './finance-core.service';
import { Prisma } from '@prisma/client';

describe('FinanceCoreService consumer read models', () => {
  it('maps an explicit locale override and Telegram fallback deterministically', async () => {
    const prisma: any = {
      financeProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'p',
            defaultCurrency: 'USD',
            timezone: 'UTC',
            locale: null,
            onboardingCompletedAt: null,
            telegramUser: { languageCode: 'uk-UA' },
          })
          .mockResolvedValueOnce({
            id: 'p',
            defaultCurrency: 'USD',
            timezone: 'UTC',
            locale: 'ru',
            onboardingCompletedAt: null,
            telegramUser: { languageCode: 'uk-UA' },
          }),
      },
    };
    const service = new FinanceCoreService(prisma);
    await expect(service.profile('p')).resolves.toMatchObject({
      locale: 'uk',
      localeOverride: null,
    });
    await expect(service.profile('p')).resolves.toMatchObject({
      locale: 'ru',
      localeOverride: 'ru',
    });
  });

  it('preserves an omitted locale on settings PATCH and returns the mapped profile', async () => {
    const profile = {
      id: 'p',
      defaultCurrency: 'USD',
      timezone: 'UTC',
      locale: 'en',
      onboardingCompletedAt: null,
      telegramUser: { languageCode: 'uk' },
    };
    const prisma: any = {
      financeProfile: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(profile),
      },
    };
    const result = await new FinanceCoreService(prisma).updateSettings('p', {
      defaultCurrency: 'USD',
      timezone: 'UTC',
    });
    expect(
      prisma.financeProfile.update.mock.calls[0][0].data,
    ).not.toHaveProperty('locale');
    expect(result).toMatchObject({ locale: 'en', localeOverride: 'en' });
  });

  it('rejects cross-profile parents and category cycles', async () => {
    const prisma: any = {
      financeCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'child', type: 'EXPENSE' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        update: jest.fn(),
      },
      financeTransaction: { count: jest.fn() },
      financeSpendingLimit: { count: jest.fn() },
      financeMerchantMapping: { count: jest.fn() },
    };
    const service = new FinanceCoreService(prisma);
    await expect(
      service.updateCategory('profile-a', 'child', {
        name: 'Child',
        type: 'EXPENSE',
        parentId: 'foreign',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.financeCategory.findMany.mockResolvedValue([
      { id: 'parent', parentId: 'child', type: 'EXPENSE', archivedAt: null },
      { id: 'child', parentId: null, type: 'EXPENSE', archivedAt: null },
    ]);
    await expect(
      service.updateCategory('profile-a', 'child', {
        name: 'Child',
        type: 'EXPENSE',
        parentId: 'parent',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks a referenced category type change so history is not corrupted', async () => {
    const prisma: any = {
      financeCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'category', type: 'EXPENSE' }),
        count: jest.fn().mockResolvedValue(0),
      },
      financeTransaction: { count: jest.fn().mockResolvedValue(1) },
      financeSpendingLimit: { count: jest.fn().mockResolvedValue(0) },
      financeMerchantMapping: { count: jest.fn().mockResolvedValue(0) },
    };
    await expect(
      new FinanceCoreService(prisma).updateCategory('profile', 'category', {
        name: 'Salary',
        type: 'INCOME',
        parentId: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an omitted parent that would become cross-type', async () => {
    const prisma: any = {
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'child',
          parentId: 'expense-parent',
          name: 'Child',
          key: null,
          type: 'EXPENSE',
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'expense-parent',
            parentId: null,
            type: 'EXPENSE',
            archivedAt: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(0),
      },
      financeTransaction: { count: jest.fn().mockResolvedValue(0) },
      financeSpendingLimit: { count: jest.fn().mockResolvedValue(0) },
      financeMerchantMapping: { count: jest.fn().mockResolvedValue(0) },
    };
    await expect(
      new FinanceCoreService(prisma).updateCategory('profile', 'child', {
        name: 'Child',
        type: 'INCOME',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears a default category key when the user gives it a custom name', async () => {
    const prisma: any = {
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'category',
          name: 'Food',
          key: 'food',
          type: 'EXPENSE',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'category',
          name: 'Dining',
          key: null,
          type: 'EXPENSE',
          parentId: null,
          archivedAt: null,
        }),
      },
    };
    await expect(
      new FinanceCoreService(prisma).updateCategory('profile', 'category', {
        name: 'Dining',
        type: 'EXPENSE',
      }),
    ).resolves.toMatchObject({ name: 'Dining', key: null });
    expect(prisma.financeCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Dining', key: null }),
      }),
    );
  });

  it('returns a hydrated saved limit and calculates spend in the profile calendar month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-31T10:30:00.000Z'));
    const stored = {
      id: 'limit-1',
      categoryId: 'food',
      amount: new Prisma.Decimal(500),
      currency: 'UAH',
      category: { id: 'food', name: 'Food', key: 'food' },
    };
    const prisma: any = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          timezone: 'Pacific/Kiritimati',
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'food' }),
      },
      financeSpendingLimit: {
        upsert: jest.fn().mockResolvedValue({ id: 'limit-1' }),
        findMany: jest.fn().mockResolvedValue([stored]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          categoryId: 'food',
          currency: 'EUR',
          valuedAmount: new Prisma.Decimal(5),
          legacyNativeAmount: new Prisma.Decimal(0),
          legacyTransactionCount: BigInt(0),
        },
      ]),
    };
    const conversion = {
      getRateMetadata: jest.fn().mockResolvedValue({
        available: true,
        rate: 25,
      }),
    };

    try {
      await expect(
        new FinanceCoreService(prisma, conversion as never).upsertLimit(
          'profile-1',
          {
            categoryId: 'food',
            amount: '500',
            currency: 'uah',
          },
        ),
      ).resolves.toEqual({
        ...stored,
        amount: '500',
        spent: '125',
        remaining: '375',
        percentage: 25,
        legacyFallback: null,
      });
      expect(conversion.getRateMetadata).toHaveBeenCalledWith(
        'USD',
        'UAH',
        'workspace-1',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails a limit read when its profile scope no longer exists', async () => {
    const prisma: any = {
      financeProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      financeSpendingLimit: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    };

    await expect(
      new FinanceCoreService(prisma).limits('missing-profile'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.financeSpendingLimit.findMany).not.toHaveBeenCalled();
  });
});
