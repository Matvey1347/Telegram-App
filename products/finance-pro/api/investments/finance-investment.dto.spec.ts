import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FinanceInvestmentQueryDto } from './finance-investment.dto';

describe('FinanceInvestmentQueryDto', () => {
  it('accepts supported investment sorts and transforms the page limit', () => {
    const dto = plainToInstance(FinanceInvestmentQueryDto, {
      sortBy: 'INVESTED',
      sortDirection: 'ASC',
      limit: '25',
    });

    expect(dto).toEqual(
      expect.objectContaining({
        sortBy: 'INVESTED',
        sortDirection: 'ASC',
        limit: 25,
      }),
    );
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects unsupported sort fields and directions', () => {
    const dto = plainToInstance(FinanceInvestmentQueryDto, {
      sortBy: 'PROFIT',
      sortDirection: 'SIDEWAYS',
    });

    expect(validateSync(dto)).toHaveLength(2);
  });
});
