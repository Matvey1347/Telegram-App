import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  LeadContact,
  LeadReviewStatus,
  LeadRiskStatus,
} from '@telegram-system/shared';
import { LeadPageDto } from './lead-source.dto';
export class LeadMaterialDto {
  @IsString() @MaxLength(120) externalMessageId!: string;
  @IsString() @MaxLength(4096) text!: string;
  @IsDateString() publishedAt!: string;
  @IsOptional() @IsString() @MaxLength(500) messageUrl?: string;
  @IsOptional() @IsBoolean() deleted?: boolean;
}
export class LeadMaterialsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LeadMaterialDto)
  items!: LeadMaterialDto[];
}
export class LeadAnalyzeDto {
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  observationIds!: string[];
}
export class LeadMediaPilotDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  observationIds!: string[];
}
export class LeadContactDto implements LeadContact {
  @IsIn(['TELEGRAM', 'INSTAGRAM', 'WEBSITE', 'PUBLIC_BUSINESS_CONTACT'])
  type!: LeadContact['type'];
  @IsString() @MaxLength(500) value!: string;
  @IsIn([
    'ADVERTISED_DESTINATION',
    'ADVERTISER',
    'SALES_CONTACT',
    'AGENCY',
    'UNKNOWN',
  ])
  role!: LeadContact['role'];
  @IsString() @MaxLength(300) evidence!: string;
}
export class LeadManualCandidateDto {
  @IsString() @MaxLength(300) title!: string;
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => LeadContactDto)
  contacts!: LeadContactDto[];
}
export class LeadReviewObservationDto {
  @IsIn(['APPROVED', 'REJECTED']) reviewStatus!: 'APPROVED' | 'REJECTED';
}
export class LeadCandidateReviewDto {
  @IsInt() @Min(1) revision!: number;
  @IsIn(['APPROVE', 'REJECT', 'LINK', 'CREATE_CLIENT', 'MERGE']) action!:
    | 'APPROVE'
    | 'REJECT'
    | 'LINK'
    | 'CREATE_CLIENT'
    | 'MERGE';
  @IsOptional() @IsString() @MaxLength(100) contactId?: string;
  @IsOptional() @IsString() @MaxLength(100) mergeIntoId?: string;
  @IsOptional() @IsString() @MaxLength(300) displayName?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  confirmedContactIndexes?: number[];
  @IsOptional()
  @IsIn(['SUSPICIOUS', 'NEEDS_REVIEW', 'REJECTED', 'ACCEPTABLE'])
  riskStatus?: LeadRiskStatus;
}
export class LeadBulkReviewDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
  @IsIn(['APPROVE', 'REJECT']) action!: 'APPROVE' | 'REJECT';
}
export class LeadFeedDto extends LeadPageDto {
  @IsOptional() @IsString() @MaxLength(100) sourceId?: string;
  @IsOptional()
  @IsIn(['ADVERTISEMENT', 'MUTUAL_PROMOTION', 'ORGANIC_CONTENT', 'UNKNOWN'])
  classification?: string;
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'MERGED'])
  reviewStatus?: LeadReviewStatus;
  @IsOptional()
  @IsIn(['SUSPICIOUS', 'NEEDS_REVIEW', 'REJECTED', 'ACCEPTABLE'])
  riskStatus?: LeadRiskStatus;
}
