import { TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS } from '@telegram-system/shared';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}
