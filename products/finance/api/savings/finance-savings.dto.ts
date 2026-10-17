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

const CURRENCY = /^[A-Za-z]{3}$/u;

export class FinanceSavingsGoalQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class FinanceSavingsGoalInputDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/u) name!: string;
  @IsNumberString() targetAmount!: string;
  @IsString() @Matches(CURRENCY) currency!: string;
  @IsOptional() @IsDateString() targetDate?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class FinanceSavingsAllocationDto {
  @IsString() accountId!: string;
  @IsNumberString() amount!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() linkedTransferId?: string;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
}

export class FinanceSavingsReallocationDto {
  @IsString() fromGoalId!: string;
  @IsString() toGoalId!: string;
  @IsString() accountId!: string;
  @IsNumberString() amount!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
}

export class FinanceSavingsMovementQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
