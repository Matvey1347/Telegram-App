import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFinanceAccountDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsIn(['CASH', 'CARD', 'SAVINGS', 'OTHER']) type!:
    | 'CASH'
    | 'CARD'
    | 'SAVINGS'
    | 'OTHER';
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsNumberString() openingBalance?: string;
}
export class UpdateFinanceAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsIn(['CASH', 'CARD', 'SAVINGS', 'OTHER']) type?:
    | 'CASH'
    | 'CARD'
    | 'SAVINGS'
    | 'OTHER';
}
export class CreateFinanceTransactionDto {
  @IsString() accountId!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsIn(['INCOME', 'EXPENSE']) type!: 'INCOME' | 'EXPENSE';
  @IsNumberString() amount!: string;
  // Currency and rates are derived from the selected account by the server.
  /** @deprecated Ignored; retained temporarily for API compatibility. */
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  /** @deprecated Ignored; retained temporarily for API compatibility. */
  @IsOptional() @IsNumberString() exchangeRateToDefault?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsDateString() occurredAt!: string;
}
export class UpdateFinanceTransactionDto extends CreateFinanceTransactionDto {}
export class CreateFinanceTransferDto {
  @IsString() fromAccountId!: string;
  @IsString() toAccountId!: string;
  @IsNumberString() fromAmount!: string;
  @IsNumberString() toAmount!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
}
export class FinanceHistoryQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE']) type?: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
export class UpdateFinanceSettingsDto {
  @IsString() @MinLength(3) @MaxLength(3) defaultCurrency!: string;
  @IsString() @MinLength(1) @MaxLength(80) timezone!: string;
  @IsOptional() @IsString() @MaxLength(20) locale?: string;
}
export class CreateFinanceCategoryDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsIn(['INCOME', 'EXPENSE']) type!: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() parentId?: string;
}
export class UpsertFinanceLimitDto {
  @IsString() categoryId!: string;
  @IsNumberString() amount!: string;
  @IsString() @MinLength(3) @MaxLength(3) currency!: string;
}
export class CreateFinanceGoalDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsNumberString() targetAmount!: string;
  @IsOptional() @IsNumberString() currentAmount?: string;
  @IsString() @MinLength(3) @MaxLength(3) currency!: string;
  @IsOptional() @IsDateString() targetDate?: string;
}
export class CreateFinanceReminderDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsNumberString() amount!: string;
  @IsString() @MinLength(3) @MaxLength(3) currency!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(31) dayOfMonth!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(43200) reminderOffsetMinutes = 0;
}
