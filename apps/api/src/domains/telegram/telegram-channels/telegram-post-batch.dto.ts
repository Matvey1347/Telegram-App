import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  TELEGRAM_POST_BATCH_MAX_CHANNELS,
  TELEGRAM_POST_BATCH_MAX_POSTS,
} from '@telegram-system/shared';

export class ImportTelegramPostBatchDto {
  @IsString()
  @MinLength(1)
  workflowId!: string;
}

export class ImportTelegramPostBatchPostDto extends ImportTelegramPostBatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class CreateTelegramPostBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_BATCH_MAX_CHANNELS)
  @IsString({ each: true })
  channelIds!: string[];
}

export class TelegramPostBatchListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class TelegramPostBatchDeliveriesQueryDto extends TelegramPostBatchListQueryDto {}

export class DispatchTelegramPostBatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class TelegramPostBatchChannelOverrideDto {
  @IsString()
  @MinLength(1)
  telegramChannelId!: string;

  @IsOptional()
  @IsIn(['PUBLISH_NOW', 'SCHEDULE'])
  action?: 'PUBLISH_NOW' | 'SCHEDULE';

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}

export class CreateTelegramPostBatchPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  iconId!: string | null;

  @IsOptional()
  @IsString()
  text!: string | null;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  imageUrls!: string[];

  @IsArray()
  @ArrayMaxSize(10)
  mediaItems!: unknown[];

  @IsArray()
  @ArrayMaxSize(20)
  buttonRows!: unknown[];

  @IsIn(['PUBLISH_NOW', 'SCHEDULE'])
  action!: 'PUBLISH_NOW' | 'SCHEDULE';

  @IsOptional()
  @IsDateString()
  scheduledAt!: string | null;

  @IsOptional()
  @IsIn([24, 48, 72])
  deleteAfterHours!: 24 | 48 | 72 | null;

  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode!: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';

  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_BATCH_MAX_CHANNELS)
  @ValidateNested({ each: true })
  @Type(() => TelegramPostBatchChannelOverrideDto)
  channelOverrides!: TelegramPostBatchChannelOverrideDto[];
}

export class UpdateTelegramPostBatchPostDto extends CreateTelegramPostBatchPostDto {
  @IsString()
  @MinLength(1)
  id!: string;
}

export class CreateAndDispatchTelegramPostBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_BATCH_MAX_CHANNELS)
  @IsString({ each: true })
  channelIds!: string[];

  @IsOptional()
  @IsIn([24, 48, 72])
  defaultDeleteAfterHours!: 24 | 48 | 72 | null;

  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_BATCH_MAX_POSTS)
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramPostBatchPostDto)
  posts!: CreateTelegramPostBatchPostDto[];
}

export class UpdateTelegramPostBatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_BATCH_MAX_CHANNELS)
  @IsString({ each: true })
  channelIds!: string[];

  @IsOptional()
  @IsIn([24, 48, 72])
  defaultDeleteAfterHours!: 24 | 48 | 72 | null;

  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_BATCH_MAX_POSTS)
  @ValidateNested({ each: true })
  @Type(() => UpdateTelegramPostBatchPostDto)
  posts!: UpdateTelegramPostBatchPostDto[];
}
