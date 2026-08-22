import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceTransferService } from './finance-transfer.service';

const date = new Date('2026-08-01T10:00:00.000Z');
const account = (
  id: string,
  currency: string,
  archivedAt: Date | null = null,
) => ({
  id,
  name: id,
  currency,
  archivedAt,
});
const row = {
  id: 'transfer-1',
  fromAccountId: 'from',
  toAccountId: 'to',
  fromAmount: new Prisma.Decimal(10),
  toAmount: new Prisma.Decimal(11),
  fromCurrency: 'EUR',
  toCurrency: 'USD',
  exchangeRate: new Prisma.Decimal(1.1),
  occurredAt: date,
  description: 'Trip',
  deletedAt: null,
  fromAccount: account('from', 'EUR'),
  toAccount: account('to', 'USD'),
};

describe('FinanceTransferService', () => {
  it('creates a cross-currency snapshot from the server rate', async () => {
    const prisma: any = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([account('from', 'EUR'), account('to', 'USD')]),
      },
      financeTransfer: { create: jest.fn().mockResolvedValue(row) },
    };
    const conversion = {
      getRateMetadata: jest
        .fn()
        .mockResolvedValue({ available: true, rate: 1.1, rateAt: date }),
    };
    const result = await new FinanceTransferService(
      prisma,
      conversion as never,
    ).create('profile-1', {
      fromAccountId: 'from',
      toAccountId: 'to',
      amount: '10',
      occurredAt: date.toISOString(),
      description: ' Trip ',
    });
    expect(result).toMatchObject({
      fromAmount: '10',
      toAmount: '11',
      exchangeRate: '1.1',
    });
    expect(conversion.getRateMetadata).toHaveBeenCalledWith(
      'EUR',
      'USD',
      'workspace-1',
      date,
    );
    expect(prisma.financeTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: 'profile-1',
          fromCurrency: 'EUR',
          toCurrency: 'USD',
          description: 'Trip',
        }),
      }),
    );
  });

  it('rejects self transfers before doing database work', async () => {
    const service = new FinanceTransferService({} as never, {} as never);
    await expect(
      service.create('profile-1', {
        fromAccountId: 'same',
        toAccountId: 'same',
        amount: '1',
        occurredAt: date.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows unchanged archived account references on edit but rejects switching to one', async () => {
    const prisma: any = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            account('from', 'EUR', date),
            account('to', 'USD'),
          ]),
      },
      financeTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'transfer-1',
          fromAccountId: 'from',
          toAccountId: 'to',
        }),
        update: jest.fn().mockResolvedValue(row),
      },
    };
    const conversion = {
      getRateMetadata: jest
        .fn()
        .mockResolvedValue({ available: true, rate: 1.1, rateAt: date }),
    };
    const service = new FinanceTransferService(prisma, conversion as never);
    await expect(
      service.update('profile-1', 'transfer-1', {
        fromAccountId: 'from',
        toAccountId: 'to',
        amount: '10',
        occurredAt: date.toISOString(),
      }),
    ).resolves.toMatchObject({ id: 'transfer-1' });
    prisma.financeTransfer.findFirst.mockResolvedValue({
      id: 'transfer-1',
      fromAccountId: 'other',
      toAccountId: 'to',
    });
    await expect(
      service.update('profile-1', 'transfer-1', {
        fromAccountId: 'from',
        toAccountId: 'to',
        amount: '10',
        occurredAt: date.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes filtered history to the profile and returns a cursor page', async () => {
    const prisma: any = {
      financeTransfer: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const result = await new FinanceTransferService(
      prisma,
      {} as never,
    ).history('profile-1', {
      accountId: 'from',
      search: 'trip',
      limit: 30,
    });
    expect(result).toMatchObject({
      items: [{ id: 'transfer-1' }],
      nextCursor: null,
    });
    expect(prisma.financeTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: 'profile-1',
          deletedAt: null,
        }),
      }),
    );
  });

  it('includes a complete date-only end day and preserves timestamp precision', async () => {
    const prisma: any = {
      financeTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceTransferService(prisma, {} as never);
    await service.history('profile-1', { to: '2026-08-21', limit: 30 });
    expect(
      prisma.financeTransfer.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      occurredAt: { lt: new Date('2026-08-22T00:00:00.000Z') },
    });
    await service.history('profile-1', {
      to: '2026-08-21T18:30:00.000Z',
      limit: 30,
    });
    expect(
      prisma.financeTransfer.findMany.mock.calls[1][0].where,
    ).toMatchObject({
      occurredAt: { lte: new Date('2026-08-21T18:30:00.000Z') },
    });
  });

  it('soft-deletes only an owned transfer and returns the archived read model', async () => {
    const deleted = { ...row, deletedAt: date };
    const prisma: any = {
      financeTransfer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'transfer-1' }),
        update: jest.fn().mockResolvedValue(deleted),
      },
    };
    await expect(
      new FinanceTransferService(prisma, {} as never).remove(
        'profile-1',
        'transfer-1',
      ),
    ).resolves.toMatchObject({ id: 'transfer-1', deletedAt: date });
    expect(prisma.financeTransfer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'transfer-1', profileId: 'profile-1', deletedAt: null },
      }),
    );
  });
});
