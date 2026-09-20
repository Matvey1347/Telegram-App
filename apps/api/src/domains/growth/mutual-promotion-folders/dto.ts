import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class MutualPromotionFolderQueryDto extends PaginationQueryDto {}

export class MutualPromotionExpenseDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
}

export class MutualPromotionParticipantDto {
  @IsString() telegramChannelId!: string;
  @IsIn(['PUBLISHER', 'PAID']) role!: 'PUBLISHER' | 'PAID';
  @IsString() inviteLinkId!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => MutualPromotionExpenseDto)
  expense?: MutualPromotionExpenseDto | null;
}

export class MutualPromotionExpenseAllocationDto {
  @IsIn(['EQUAL']) mode!: 'EQUAL';
  @IsString() accountId!: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;
}

export class CreateMutualPromotionFolderDto {
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(160) titleTemplate?: string | null;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MutualPromotionParticipantDto)
  participants!: MutualPromotionParticipantDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => MutualPromotionExpenseAllocationDto)
  expenseAllocation?: MutualPromotionExpenseAllocationDto | null;
}

export class UpdateMutualPromotionFolderDto extends CreateMutualPromotionFolderDto {}

export class MutualPromotionInviteLinkEditDto {
  @IsString() participantId!: string;
  @IsString() inviteLinkId!: string;
}

export class UpdateMutualPromotionInviteLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MutualPromotionInviteLinkEditDto)
  participants!: MutualPromotionInviteLinkEditDto[];
}

export class MutualPromotionPostDraftDto {
  @IsString() @MaxLength(160) title!: string;
  @IsString() text!: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) imageUrls!: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) mediaItems?: unknown[];
  @IsArray() buttonRows!: unknown[];
}

export class MutualPromotionScheduledPostDraftDto extends MutualPromotionPostDraftDto {
  @IsDateString() scheduledAt!: string;
}

export class CreateMutualPromotionPostDto {
  @IsString() importWorkflowId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MutualPromotionScheduledPostDraftDto)
  posts!: MutualPromotionScheduledPostDraftDto[];
}

export class UpdateMutualPromotionPostDto extends MutualPromotionScheduledPostDraftDto {}

export class MutualPromotionInviteOptionsQueryDto {
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  initial?: boolean;
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value || '').split(','))
      .flatMap((part) => String(part).split(','))
      .map((part) => part.trim())
      .filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  channelIds?: string[];
}

export class ImportMutualPromotionInviteLinkDto {
  @IsString() telegramChannelId!: string;
  @IsString() @MaxLength(512) url!: string;
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
