import { NotFoundException } from '@nestjs/common';
import { FinanceInvestmentReadService } from './finance-investment-read.service';

describe('FinanceInvestmentReadService', () => {
  it.each([
    ['UPDATED', 'DESC', 'updatedAt', 'desc'],
    ['NAME', 'ASC', 'name', 'asc'],
    ['INVESTED', 'DESC', 'totalInvestedInValuationCurrency', 'desc'],
    ['CURRENT_VALUE', 'ASC', 'currentValueInValuationCurrency', 'asc'],
  ] as const)(
    'sorts %s %s before the cursor page and keeps the profile scope',
    async (sortBy, sortDirection, field, direction) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new FinanceInvestmentReadService({
        financeInvestment: { findMany },
      } as never);

      await service.list('profile-a', {
        status: 'ACTIVE',
        sortBy,
        sortDirection,
        cursor: 'investment-cursor',
        limit: 20,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { profileId: 'profile-a', status: 'ACTIVE' },
          orderBy: [{ [field]: direction }, { id: direction }],
          cursor: { id: 'investment-cursor' },
          skip: 1,
          take: 21,
        }),
      );
    },
  );

  it('does not expose an investment owned by another profile', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new FinanceInvestmentReadService({
      financeInvestment: { findFirst },
    } as never);

    await expect(
      service.investment('profile-a', 'investment-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'investment-b', profileId: 'profile-a' },
      }),
    );
  });
});
