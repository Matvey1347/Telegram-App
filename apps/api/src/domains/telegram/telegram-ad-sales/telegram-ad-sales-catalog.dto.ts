import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  TelegramAdPricingMode,
  TelegramAdSaleStatus,
  TelegramAdSlotStrategy,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { normalizeCurrency } from './telegram-ad-sales-dto-currency';

export class TelegramAdProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TelegramAdProductsByChannelsQueryDto {
  @IsString() channelIds!: string;
}

export class CreateTelegramAdProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) topDurationMinutes?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) feedDurationHours?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) deleteAfterHours?:
    | number
    | null;
  @IsOptional() @IsBoolean() isPermanent?: boolean;
  @IsEnum(TelegramAdPricingMode) defaultPricingMode!: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultCpm?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultFixedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?:
    | number
    | null;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateTelegramAdProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) topDurationMinutes?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) feedDurationHours?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) deleteAfterHours?:
    | number
    | null;
  @IsOptional() @IsBoolean() isPermanent?: boolean;
  @IsOptional()
  @IsEnum(TelegramAdPricingMode)
  defaultPricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultCpm?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultFixedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?:
    | number
    | null;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateTelegramAdPolicyDto {
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() autoFrequencyEnabled?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedOrganicPostsPerDay?: number | null;
  @IsOptional() @IsBoolean() useWorkspaceDefault?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  organicPostsPerAdSlot?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAdsPerDay?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minHoursBetweenAds?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minDaysBetweenAds?: number;
  @IsOptional()
  @IsEnum(TelegramAdSlotStrategy)
  slotStrategy?: TelegramAdSlotStrategy;
  @IsOptional()
  @IsArray()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  fallbackSlotTimes?: string[];
  @IsOptional() @IsBoolean() allowManualSlots?: boolean;
}

export class UpdateTelegramAdSalesWorkspaceSettingsDto {
  @IsOptional()
  @IsBoolean()
  salesCommissionEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultSalesCommissionRate?: number;
}

export class UpdateTelegramAdChannelPricingDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) baseCpm?: number | null;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class UpdateTelegramAdSalesMemberPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  selectedChannelIds?: string[];
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  selectedNetworkId?: string | null;
  @IsOptional() @IsIn(['week', 'month', 'list']) calendarView?: string;
  @IsOptional() @IsBoolean() initialized?: boolean;
}

export class RecommendTelegramAdPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  statisticsWindowDays?: number;
}

export class CreateTelegramAdQuoteDto {
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() telegramAdProductId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetCpm?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumCpm?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fixedPrice?:
    | number
    | null;
  @IsOptional()
  @IsEnum(TelegramAdPricingMode)
  pricingMode?: TelegramAdPricingMode;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class TelegramAdPriceHistoryQueryDto {
  @IsOptional() @IsString() telegramAdProductId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class TelegramAdAvailabilityQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  channelIds?: string[];
  @IsOptional() @IsString() networkId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) productIds?: string[];
  /** A one-off client nonce used only by the explicit Refresh action. */
  @IsOptional() @IsString() cacheBust?: string;
}

export class TelegramAdSalesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(TelegramAdSaleStatus) status?: TelegramAdSaleStatus;
  @IsOptional() @IsString() advertiserId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
