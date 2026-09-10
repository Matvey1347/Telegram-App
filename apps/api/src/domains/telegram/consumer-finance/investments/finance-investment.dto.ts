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
  ValidateNested,
} from 'class-validator';

const TYPES = [
  'BUSINESS',
  'REAL_ESTATE',
  'SECURITIES',
  'CRYPTO',
  'DIGITAL_ASSET',
  'PHYSICAL_ASSET',
  'OTHER',
] as const;
const CURRENCY = /^[A-Za-z]{3}$/u;

export class FinanceInvestmentQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'CLOSED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class FinanceInvestmentInputDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/u) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsIn(TYPES) type!: (typeof TYPES)[number];
  @IsString() @Matches(CURRENCY) currency!: string;
  @IsDateString() startedAt!: string;
}

export class FinanceInvestmentUpdateDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/u) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsIn(TYPES) type!: (typeof TYPES)[number];
  @IsDateString() startedAt!: string;
}

export class FinanceInvestmentCashFlowDto {
  @IsIn(['CONTRIBUTION', 'RETURN']) kind!: 'CONTRIBUTION' | 'RETURN';
  @IsString() accountId!: string;
  @IsNumberString() amount!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
}

export class FinanceInvestmentValuationDto {
  @IsNumberString() value!: string;
  @IsDateString() valuedAt!: string;
  @IsOptional() @IsString() correctsValuationId?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
}

class FinanceInvestmentFinalReturnDto {
  @IsString() accountId!: string;
  @IsNumberString() amount!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class FinanceInvestmentCloseDto {
  @IsDateString() closedAt!: string;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => FinanceInvestmentFinalReturnDto)
  finalReturn?: FinanceInvestmentFinalReturnDto;
}

export class FinanceInvestmentHistoryQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
