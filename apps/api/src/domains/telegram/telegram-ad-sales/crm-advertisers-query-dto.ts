import {
  TELEGRAM_AD_CRM_ADVERTISER_SORT_BY,
  TELEGRAM_AD_CRM_SORT_DIRECTION,
  type TelegramAdCrmAdvertiserSortBy,
  type TelegramAdCrmSortDirection,
} from '@telegram-system/shared';
import {
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class TelegramAdvertisersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional()
  @IsEnum(TelegramAdvertiserStatus)
  status?: TelegramAdvertiserStatus;
  @IsOptional()
  @IsEnum(TelegramAdvertiserLifecycleStage)
  lifecycleStage?: TelegramAdvertiserLifecycleStage;
  @IsOptional() @IsString() ownerMemberId?: string;
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  archived?: boolean;
  @IsOptional()
  @IsIn(TELEGRAM_AD_CRM_ADVERTISER_SORT_BY)
  sortBy?: TelegramAdCrmAdvertiserSortBy;
  @IsOptional()
  @IsIn(TELEGRAM_AD_CRM_SORT_DIRECTION)
  sortDirection?: TelegramAdCrmSortDirection;
}
