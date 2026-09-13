import { PromoStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  TelegramPostButtonRows,
  TelegramPostMediaItem,
} from '@telegram-system/shared';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CreatePromoDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() iconId?: string | null;
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(20_000) text?: string;
  @IsOptional() @IsString() plainText?: string | null;
  @IsOptional() @IsString() formattedHtml?: string | null;
  @IsOptional() @IsString() imageData?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  imageUrls?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  mediaItems?: TelegramPostMediaItem[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  buttonRows?: TelegramPostButtonRows;
  @IsOptional() @IsString() defaultInviteLinkId?: string | null;
  @IsOptional() @IsEnum(PromoStatus) status?: PromoStatus;
}
export class UpdatePromoDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(20_000) text?: string;
  @IsOptional() @IsString() plainText?: string | null;
  @IsOptional() @IsString() formattedHtml?: string | null;
  @IsOptional() @IsString() imageData?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  imageUrls?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  mediaItems?: TelegramPostMediaItem[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  buttonRows?: TelegramPostButtonRows;
  @IsOptional() @IsString() defaultInviteLinkId?: string | null;
  @IsOptional() @IsEnum(PromoStatus) status?: PromoStatus;
}

export class PromoQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() @MaxLength(10_000) telegramChannelIds?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
