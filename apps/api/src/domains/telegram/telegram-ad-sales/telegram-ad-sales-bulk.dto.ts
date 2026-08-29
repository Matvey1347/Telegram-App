import { Transform, Type } from 'class-transformer';
import { TelegramAdPricingMode } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class TelegramAdSalesBulkAdvertiserDto {
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsString() advertiserName!: string;
  @IsOptional() @IsString() advertiserTelegram?: string | null;
  @IsOptional() @IsString() advertiserContact?: string | null;
  @IsOptional() @IsString() advertiserCompanyName?: string | null;
  @IsOptional() @IsBoolean() createAdvertiser?: boolean;
}

export class TelegramAdSalesBulkTargetDto {
  @IsIn(['CHANNEL', 'NETWORK']) type!: 'CHANNEL' | 'NETWORK';
  @ValidateIf(
    (target: TelegramAdSalesBulkTargetDto) => target.type === 'CHANNEL',
  )
  @IsString()
  channelId?: string;
  @ValidateIf(
    (target: TelegramAdSalesBulkTargetDto) => target.type === 'NETWORK',
  )
  @IsString()
  networkId?: string;
}

export class TelegramAdSalesBulkDefaultsDto extends TelegramAdSalesBulkAdvertiserDto {
  @Type(() => Number) @IsNumber() @Min(0) agreedPrice!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
  @IsString() timezone!: string;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdPricingMode)
  pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedViews?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?:
    | number
    | null;
  @IsOptional() @IsString() manualPriceReason?: string | null;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  settlementCurrency!: string;
  @IsOptional() @IsString() assignedMemberId?: string | null;
}

export class TelegramAdSalesBulkChannelOverrideDto {
  @IsString() channelId!: string;
  @IsOptional() @IsString() telegramPostId?: string | null;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdPricingMode)
  pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedViews?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?:
    | number
    | null;
  @IsOptional() @IsString() manualPriceReason?: string | null;
}

export class TelegramAdSalesBulkRowDto {
  @IsString() clientRowId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramAdSalesBulkAdvertiserDto)
  advertiserOverride?: TelegramAdSalesBulkAdvertiserDto | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) agreedPriceOverride?:
    | number
    | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSalesBulkChannelOverrideDto)
  channelOverrides?: TelegramAdSalesBulkChannelOverrideDto[];
}

export class TelegramAdSalesBulkCreateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => TelegramAdSalesBulkTargetDto)
  target!: TelegramAdSalesBulkTargetDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => TelegramAdSalesBulkDefaultsDto)
  defaults!: TelegramAdSalesBulkDefaultsDto;
  @IsDefined()
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSalesBulkRowDto)
  rows!: TelegramAdSalesBulkRowDto[];
}
