import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CRM_COPILOT_TONES,
  LEAD_WORKFLOW_STATES,
} from '@telegram-system/shared';
export class LeadQualifyDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/i)
  operationId!: string;
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  productIds!: string[];
}
export class LeadPrepareDraftDto extends LeadQualifyDto {
  @IsIn(CRM_COPILOT_TONES) tone!: (typeof CRM_COPILOT_TONES)[number];
  @IsIn(['AUTO', 'uk', 'ru', 'en']) language!: 'AUTO' | 'uk' | 'ru' | 'en';
}
export class LeadQualificationDecisionDto {
  @IsInt() @Min(1) revision!: number;
  @IsString() @MaxLength(100) qualificationId!: string;
  @IsString() @MaxLength(64) contextVersion!: string;
  @IsIn(['QUALIFIED', 'LOW_RELEVANCE', 'NEEDS_REVIEW']) decision!:
    | 'QUALIFIED'
    | 'LOW_RELEVANCE'
    | 'NEEDS_REVIEW';
  @IsBoolean() acknowledgeHighRisk!: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class LeadPreparedDraftPatchDto {
  @IsInt() @Min(1) revision!: number;
  @IsIn(['SAVE', 'APPROVE', 'DISCARD']) action!: 'SAVE' | 'APPROVE' | 'DISCARD';
  @IsOptional() @IsString() @MaxLength(3000) text?: string;
}
export class LeadPreparationQueueDto {
  @IsOptional() @IsIn([...LEAD_WORKFLOW_STATES, 'HIGH_PRIORITY']) workflow?:
    | (typeof LEAD_WORKFLOW_STATES)[number]
    | 'HIGH_PRIORITY';
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
