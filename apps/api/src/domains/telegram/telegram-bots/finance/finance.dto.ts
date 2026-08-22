import { Type } from 'class-transformer';
import {
  IsDateString,
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateFinanceAccountDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string | null;
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
  @IsOptional() @IsString() @MaxLength(16) emoji?: string | null;
  @IsOptional() @IsIn(['CASH', 'CARD', 'SAVINGS', 'OTHER']) type?:
    | 'CASH'
    | 'CARD'
    | 'SAVINGS'
    | 'OTHER';
}
export class FinanceTransactionItemDto {
  @IsString() @MinLength(1) @MaxLength(240) displayName!: string;
  @IsOptional() @IsNumberString() quantity?: string;
  @IsOptional() @IsNumberString() unitPrice?: string;
  @IsNumberString() totalAmount!: string;
  @IsString() @MinLength(3) @MaxLength(3) currency!: string;
  @IsOptional() @IsString() categoryId?: string;
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
  @IsOptional() @IsString() @MaxLength(240) merchantDisplay?: string;
  @IsOptional()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FinanceTransactionItemDto)
  items?: FinanceTransactionItemDto[];
  @IsDateString() occurredAt!: string;
}
export class UpdateFinanceTransactionDto extends CreateFinanceTransactionDto {}
export class CreateFinanceTransferDto {
  @IsString() fromAccountId!: string;
  @IsString() toAccountId!: string;
  @IsNumberString() amount!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
}
export class UpdateFinanceTransferDto extends CreateFinanceTransferDto {}
export class FinanceHistoryQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE']) type?: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
/** All Ultimate reads are deliberately bounded so analytical requests remain index-friendly. */
export class FinanceUltimateQueryDto {
  @IsOptional()
  @IsIn(['LAST_3_MONTHS', 'LAST_6_MONTHS', 'LAST_12_MONTHS'])
  period?: 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'LAST_12_MONTHS';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(120) merchant?: string;
  @IsOptional() @IsString() categoryId?: string;
}
export class FinanceUltimateQuestionDto extends FinanceUltimateQueryDto {
  @IsString() @MinLength(3) @MaxLength(500) question!: string;
}
export class UpdateFinanceSettingsDto {
  @IsString() @MinLength(3) @MaxLength(3) defaultCurrency!: string;
  @IsString() @MinLength(1) @MaxLength(80) timezone!: string;
  @IsOptional() @IsIn(['uk', 'ru', 'en']) locale?: 'uk' | 'ru' | 'en' | null;
}
export class CreateFinanceCategoryDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string | null;
  @IsIn(['INCOME', 'EXPENSE']) type!: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() parentId?: string;
}
export class UpdateFinanceCategoryDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string | null;
  @IsIn(['INCOME', 'EXPENSE']) type!: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() parentId?: string | null;
}
export class FinanceTransferQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
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
