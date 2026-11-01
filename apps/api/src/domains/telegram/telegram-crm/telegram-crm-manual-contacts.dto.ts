import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CRM_MANUAL_INSTAGRAM_ACTIONS,
  type CrmManualInstagramAction,
  type CrmManualContactsFilter,
} from '@telegram-system/shared';
export class CrmManualContactsQueryDto {
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional()
  @IsIn([
    'ALL',
    'WAITING_FOR_CLIENT',
    'FOLLOW_UP_DUE',
    'NEEDS_REPLY',
    'INTERESTED',
    'CLOSED',
    'DO_NOT_CONTACT',
    'STALE',
  ])
  status?: CrmManualContactsFilter['status'];
}
export class CrmManualActivityQueryDto {
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}
export class CrmInstagramMethodDto {
  @IsString() @MinLength(1) @MaxLength(500) value!: string;
  @IsBoolean() ownershipConfirmed!: boolean;
  @IsOptional() @IsIn(['ACTIVE', 'STALE']) state?: 'ACTIVE' | 'STALE';
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
export class CrmManualContactCreateDto {
  @IsString() @MinLength(1) @MaxLength(300) displayName!: string;
  @IsString() @MinLength(1) @MaxLength(500) instagramValue!: string;
  @IsBoolean() ownershipConfirmed!: boolean;
  @IsOptional() @IsString() @MaxLength(100) ownerMemberId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
}
export class CrmManualActivityDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/i)
  operationId!: string;
  @IsIn(CRM_MANUAL_INSTAGRAM_ACTIONS) action!: CrmManualInstagramAction;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsString() @MaxLength(100) candidateId?: string;
  @IsOptional() @IsString() @MaxLength(100) draftId?: string;
  @IsOptional() @IsInt() @Min(1) draftRevision?: number;
}
export class CrmManualFollowUpDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/i)
  operationId!: string;
  @IsDateString() at!: string;
  @IsOptional() @IsString() @MaxLength(240) title?: string;
}
