import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
  IsArray,
  ArrayUnique,
  Matches,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BOT_AD_PLACEMENT_LIMIT } from '@telegram-system/shared';
import type {
  BotAdsEnvironment,
  BotAdLinkKind,
  CreateBotAdPlacements,
} from '@telegram-system/shared';

export class BotAdsScopeDto {
  @IsIn(['LOCAL', 'PRODUCTION'])
  environment!: BotAdsEnvironment;
}

export class BotAdsPageDto extends BotAdsScopeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  offset = 0;
}

export class BotAdsPromoQueryDto extends BotAdsPageDto {
  @IsOptional()
  @IsIn(['active', 'archive'])
  state: 'active' | 'archive' = 'active';
}

export class BotAdChannelsDto extends BotAdsScopeDto {
  @IsIn(['link', 'placement'])
  kind!: BotAdLinkKind;
}

export class BotAdsLinkQueryDto extends BotAdsPageDto {
  @IsOptional()
  @IsIn(['link', 'placement'])
  kind?: BotAdLinkKind;

  @IsOptional()
  @IsUUID('4')
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoId?: string;
}

export class SaveBotAdPromoDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(32000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  plainText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(48000)
  formattedHtml?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iconId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  mediaItems?: unknown[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  buttonRows?: unknown[];
}

export class ArchiveBotAdPromoDto {
  @IsBoolean()
  archived!: boolean;
}

export class CreateBotAdLinkDto {
  @IsUUID('4')
  id!: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoId?: string;
}

class BotAdPlacementTargetDto {
  @IsUUID('4')
  id!: string;

  @IsString()
  @MaxLength(64)
  channelId!: string;
}

export class CreateBotAdPlacementsDto implements CreateBotAdPlacements {
  @IsUUID('4')
  campaignId!: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(64)
  promoId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iconId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  plannedAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BOT_AD_PLACEMENT_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  networkIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BOT_AD_PLACEMENT_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => BotAdPlacementTargetDto)
  targets!: BotAdPlacementTargetDto[];
}

export class PublishBotAdDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  scheduledAt?: string;
}
