import { Type, Transform } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class TelegramAdAnalyticsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean()
  allTime?: boolean;
  @Allow() @IsOptional() @IsDateString() from?: string;
  @Allow() @IsOptional() @IsDateString() to?: string;
  @IsOptional()
  @Transform(
    ({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
      typeof value === 'string'
        ? value
        : typeof obj?.from === 'string'
          ? obj.from
          : value,
  )
  @IsDateString()
  dateFrom?: string;
  @IsOptional()
  @Transform(
    ({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
      typeof value === 'string'
        ? value
        : typeof obj?.to === 'string'
          ? obj.to
          : value,
  )
  @IsDateString()
  dateTo?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  channelIds?: string[];
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  rangeDays?: number;
  @IsOptional()
  @IsIn([
    'PREVIOUS_PERIOD',
    'PREVIOUS_30_DAYS',
    'PREVIOUS_MONTH',
    'CUSTOM',
    'NONE',
  ])
  compareMode?:
    | 'PREVIOUS_PERIOD'
    | 'PREVIOUS_30_DAYS'
    | 'PREVIOUS_MONTH'
    | 'CUSTOM'
    | 'NONE';
  @IsOptional() @IsDateString() compareDateFrom?: string;
  @IsOptional() @IsDateString() compareDateTo?: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) granularity?:
    | 'day'
    | 'week'
    | 'month';
}
export class TelegramAdAnalyticsSeriesQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() telegramAdProductId?: string;
}
export class TelegramAdNetworkAnalyticsQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional() @IsIn(['SALE_CONTEXT', 'CURRENT_CHANNELS']) mode?:
    | 'SALE_CONTEXT'
    | 'CURRENT_CHANNELS';
}
export class TelegramAdAlertsQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional()
  @IsArray()
  @IsIn(
    [
      'OVERDUE_PAYMENT',
      'MISSED_PLACEMENT',
      'DELETION_FAILURE',
      'UNDERPRICED_PLACEMENT',
      'UNUSED_INVENTORY',
    ],
    { each: true },
  )
  kinds?: Array<
    | 'OVERDUE_PAYMENT'
    | 'MISSED_PLACEMENT'
    | 'DELETION_FAILURE'
    | 'UNDERPRICED_PLACEMENT'
    | 'UNUSED_INVENTORY'
  >;
}
export class TelegramAdInventoryRebuildDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  channelIds?: string[];
  @IsOptional() @IsString() networkId?: string;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsBoolean() force!: boolean;
  @IsBoolean() dryRun!: boolean;
}
export class TelegramAdPriceFillCorrelationQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsIn(['SALE_CONTEXT', 'CURRENT_CHANNELS']) networkMode?:
    | 'SALE_CONTEXT'
    | 'CURRENT_CHANNELS';
  @IsOptional() @IsIn(['DAY', 'WEEK', 'MONTH']) bucket?:
    | 'DAY'
    | 'WEEK'
    | 'MONTH';
}
export class TelegramAdRevenueScenarioDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proposedPriceChangePercent?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  proposedFixedPrice?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  assumedFillRate?: number;
  @IsOptional() @IsBoolean() useHistoricalElasticity?: boolean;
  @IsOptional() @IsIn(['SALE_CONTEXT', 'CURRENT_CHANNELS']) networkMode?:
    | 'SALE_CONTEXT'
    | 'CURRENT_CHANNELS';
}
export class TelegramAdInventoryDetailsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
