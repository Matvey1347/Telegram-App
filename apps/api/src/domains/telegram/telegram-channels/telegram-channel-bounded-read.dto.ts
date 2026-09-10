import {
  TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS,
  type TelegramChannelPerformanceHistoryRange,
} from '@telegram-system/shared';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class TelegramManagedPostLookupDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids!: string[];
}

export class TelegramChannelPerformanceHistoryQueryDto {
  @IsOptional()
  @IsIn(['1d', '7d', '30d', '90d', 'all'])
  range?: TelegramChannelPerformanceHistoryRange;
}
