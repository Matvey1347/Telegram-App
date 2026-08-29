import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { TelegramAdPricingMode } from '@prisma/client';
import { TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS } from '@telegram-system/shared';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class TelegramAdQuotePreviewRequestDto {
  @IsString() requestId!: string;
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
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class TelegramAdQuotePreviewBatchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdQuotePreviewRequestDto)
  requests!: TelegramAdQuotePreviewRequestDto[];
}
