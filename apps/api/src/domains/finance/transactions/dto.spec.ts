import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTransactionDto, UpdateTransactionDto } from './dto';

describe('Transaction DTOs', () => {
  it('omits an empty optional member id when creating a transaction', () => {
    const dto = plainToInstance(CreateTransactionDto, { memberId: '   ' });

    expect(dto.memberId).toBeUndefined();
    expect(
      validateSync(dto).some((error) => error.property === 'memberId'),
    ).toBe(false);
  });

  it('turns an empty member id into null when clearing it during update', () => {
    const dto = plainToInstance(UpdateTransactionDto, { memberId: '' });

    expect(dto.memberId).toBeNull();
    expect(validateSync(dto)).toEqual([]);
  });

  it('preserves a selected workspace member id', () => {
    const dto = plainToInstance(CreateTransactionDto, {
      memberId: 'member-1',
    });

    expect(dto.memberId).toBe('member-1');
  });
});
