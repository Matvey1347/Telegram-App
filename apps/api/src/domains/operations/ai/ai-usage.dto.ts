import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AI_CATEGORIES,
  AI_OPERATION_STATUSES,
  type AiCategory,
  type AiOperationStatus,
} from '@telegram-system/shared';

export class AiWorkspaceConfigurationDto {
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsBoolean()
  enabled?: boolean;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsBoolean()
  automaticEnabled?: boolean;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) dailyBudget?:
    | string
    | null;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) monthlyBudget?:
    | string
    | null;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) maxRequestCost?:
    | string
    | null;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  warningPercent?: number;
}
export class AiCategoryConfigurationDto {
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(100)
  modelId?: string;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsBoolean()
  enabled?: boolean;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsBoolean()
  automaticEnabled?: boolean;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) dailyBudget?:
    | string
    | null;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) monthlyBudget?:
    | string
    | null;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) maxRequestCost?:
    | string
    | null;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsInt()
  @Min(64)
  @Max(32768)
  maxInputTokens?: number;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsInt()
  @Min(16)
  @Max(8000)
  maxOutputTokens?: number;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs?: number;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(8)
  concurrencyLimit?: number;
}
export class AiUsageQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unresolved?: boolean;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(AI_CATEGORIES) category?: AiCategory;
  @IsOptional() @IsIn(['openai']) provider?: 'openai';
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @IsIn(AI_OPERATION_STATUSES) status?: AiOperationStatus;
  @IsOptional() @IsIn(['ALL', 'SALES']) scope?: 'ALL' | 'SALES';
  @IsOptional() @IsString() @MaxLength(100) workspaceId?: string;
  @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
export class AiReconciliationDto {
  @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) actualCost!: string;
  @Matches(/^(invoice|provider|audit):[A-Za-z0-9_.-]{1,80}$/) evidence!: string;
}

export class AiOperationsQueryDto extends AiUsageQueryDto {
  @IsOptional() @IsIn(['ALL', 'CANDIDATE_FIRST_OFFER']) businessScope?:
    | 'ALL'
    | 'CANDIDATE_FIRST_OFFER';
}
