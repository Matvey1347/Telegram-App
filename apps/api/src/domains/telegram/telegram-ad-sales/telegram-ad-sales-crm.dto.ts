import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  TelegramAdCrmOwnerMode,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdvertiserTaskType,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { normalizeCurrency } from './telegram-ad-sales-dto-currency';

export class TelegramAdvertiserSearchDto {
  @IsString() q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}

export class CreateTelegramAdvertiserDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() telegramUsername?: string | null;
  @IsOptional() @IsString() telegramUserId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdvertiserStatus)
  status?: TelegramAdvertiserStatus;
  @IsOptional()
  @IsEnum(TelegramAdvertiserLifecycleStage)
  lifecycleStage?: TelegramAdvertiserLifecycleStage;
  @IsOptional() @IsString() ownerMemberId?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  nextContactAt?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultFollowUpDays?: number | null;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  preferredCurrency?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdvertiserContactType)
  preferredContactMethod?: TelegramAdvertiserContactType | null;
}

export class UpdateTelegramAdvertiserDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() telegramUsername?: string | null;
  @IsOptional() @IsString() telegramUserId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdvertiserStatus)
  status?: TelegramAdvertiserStatus;
  @IsOptional()
  @IsEnum(TelegramAdvertiserLifecycleStage)
  lifecycleStage?: TelegramAdvertiserLifecycleStage;
  @IsOptional() @IsString() ownerMemberId?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  nextContactAt?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultFollowUpDays?: number | null;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  preferredCurrency?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdvertiserContactType)
  preferredContactMethod?: TelegramAdvertiserContactType | null;
}

export class CreateTelegramAdvertiserContactDto {
  @IsEnum(TelegramAdvertiserContactType) type!: TelegramAdvertiserContactType;
  @IsString() value!: string;
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isVerified?: boolean;
}

export class UpdateTelegramAdvertiserContactDto {
  @IsOptional()
  @IsEnum(TelegramAdvertiserContactType)
  type?: TelegramAdvertiserContactType;
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isVerified?: boolean;
}

export class TelegramAdvertiserActivitiesQueryDto extends PaginationQueryDto {}

export class CreateTelegramAdvertiserActivityDto {
  @IsEnum(TelegramAdvertiserActivityType) type!: TelegramAdvertiserActivityType;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() metadata?: Record<string, unknown> | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  occurredAt?: string | null;
}

export class CreateTelegramAdvertiserTaskDto {
  @IsEnum(TelegramAdvertiserTaskType) type!: TelegramAdvertiserTaskType;
  @IsOptional() @IsString() saleId?: string | null;
  @IsOptional() @IsString() placementId?: string | null;
  @IsString() assignedMemberId!: string;
  @IsOptional()
  @IsEnum(TelegramAdvertiserTaskPriority)
  priority?: TelegramAdvertiserTaskPriority;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsDateString() dueAt!: string;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  remindAt?: string | null;
  @IsOptional() metadata?: Record<string, unknown> | null;
}

export class TelegramAdvertiserTasksQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() advertiserId?: string;
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional()
  @IsEnum(TelegramAdvertiserTaskStatus)
  status?: TelegramAdvertiserTaskStatus;
  @IsOptional()
  @IsEnum(TelegramAdvertiserTaskType)
  type?: TelegramAdvertiserTaskType;
}

export class UpdateTelegramAdvertiserTaskDto {
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional()
  @IsEnum(TelegramAdvertiserTaskStatus)
  status?: TelegramAdvertiserTaskStatus;
  @IsOptional()
  @IsEnum(TelegramAdvertiserTaskPriority)
  priority?: TelegramAdvertiserTaskPriority;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  dueAt?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  remindAt?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  snoozedUntil?: string | null;
}

export class CompleteTelegramAdvertiserTaskDto {
  @IsOptional() @IsString() completionNote?: string | null;
}

export class SkipTelegramAdvertiserTaskDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class TelegramAdCrmWorkspaceSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultFollowUpDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultReactivationDays?: number;
  @IsOptional()
  @IsEnum(TelegramAdCrmOwnerMode)
  defaultSaleOwnerAssignment?: TelegramAdCrmOwnerMode;
  @IsOptional() @IsBoolean() autoCreateAdvertiserFromSale?: boolean;
  @IsOptional() @IsBoolean() requireAdvertiserForConfirmedSale?: boolean;
  @IsOptional() @IsBoolean() duplicateDetectionEnabled?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  inactivityThresholdDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  highValueCustomerThreshold?: number;
}
