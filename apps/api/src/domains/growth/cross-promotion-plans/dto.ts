import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { CrossPromotionPlacementPost } from '@telegram-system/shared';

export class CrossPromotionTargetDto {
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() promoId?: string | null;
  @IsString() inviteLinkId!: string;
}

export class CreateCrossPromotionPlanDto {
  @IsIn(['DIRECT_MUTUAL', 'OWN_CHANNELS'])
  kind!: 'DIRECT_MUTUAL' | 'OWN_CHANNELS';
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsString() @MaxLength(160) title!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  publisherChannelIds!: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  partnerChannelIds!: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CrossPromotionTargetDto)
  targets!: CrossPromotionTargetDto[];
  @IsObject() publicationPost!: CrossPromotionPlacementPost;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsDateString() trackingEndsAt?: string | null;
}

export class CrossPromotionPlacementDto {
  @IsString() telegramChannelId!: string;
  @IsString() managedPostId!: string;
  @IsOptional() @IsString() postGroupId?: string | null;
}

export class SaveCrossPromotionPlacementsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CrossPromotionPlacementDto)
  placements!: CrossPromotionPlacementDto[];
  @IsOptional() @IsString() lastError?: string | null;
}
