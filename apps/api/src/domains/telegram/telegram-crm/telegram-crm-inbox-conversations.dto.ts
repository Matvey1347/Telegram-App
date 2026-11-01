import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CRM_INBOX_FILTERS,
  type CrmInboxFilter,
} from '@telegram-system/shared';

export class CrmInboxConversationsQueryDto {
  @IsOptional()
  @IsIn(CRM_INBOX_FILTERS)
  filter?: CrmInboxFilter = 'ALL';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  folderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
