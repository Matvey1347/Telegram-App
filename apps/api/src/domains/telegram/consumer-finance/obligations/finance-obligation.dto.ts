import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export class FinanceDebtInputDto {
  @IsIn(['I_OWE', 'OWED_TO_ME']) direction!: 'I_OWE' | 'OWED_TO_ME';
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/u) name!: string;
  @IsNumberString() amount!: string;
  @IsString() accountId!: string;
  @IsString() @Matches(DATE_ONLY) dueDate!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class FinanceDebtQueryDto {
  @IsOptional() @IsIn(['OPEN', 'SETTLED']) status?: 'OPEN' | 'SETTLED';
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class FinanceRegularPaymentInputDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/u) name!: string;
  @IsNumberString() amount!: string;
  @IsString() accountId!: string;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsIn(['WEEKLY', 'MONTHLY', 'YEARLY']) recurrence!:
    | 'WEEKLY'
    | 'MONTHLY'
    | 'YEARLY';
  @IsString() @Matches(DATE_ONLY) nextPaymentDate!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class FinanceRegularPaymentQueryDto {
  @IsOptional() @IsString() @Matches(/\S/u) id?: string;
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'CANCELED'])
  status?: 'ACTIVE' | 'PAUSED' | 'CANCELED';
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class FinanceRegularPaymentRevisionQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class FinanceRegularPaymentConfirmDto {
  @IsDateString() expectedOccurrenceAt!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsNumberString() amount?: string;
}

export class FinanceApplyOccurrenceAmountDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
