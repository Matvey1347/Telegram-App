import { NotFoundException } from '@nestjs/common';
import { FinanceInvestmentReadService } from './finance-investment-read.service';

describe('FinanceInvestmentReadService', () => {
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
