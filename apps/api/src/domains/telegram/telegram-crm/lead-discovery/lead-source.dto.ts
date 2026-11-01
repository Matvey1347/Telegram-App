import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
} from 'class-validator';
import type { LeadMonitoringState } from '@telegram-system/shared';
export class LeadPageDto {
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn([
    'ACTIVE',
    'PAUSED',
    'DISABLED',
    'ACCESS_LOST',
    'LOW_YIELD',
    'NO_ADS_30D',
    'INSUFFICIENT_COVERAGE',
  ])
  status?: string;
}
export class LeadSourceInputDto {
  @IsIn(['TELEGRAM_CHANNEL', 'MANUAL_IMPORT']) type!:
    | 'TELEGRAM_CHANNEL'
    | 'MANUAL_IMPORT';
  @IsString() @MaxLength(200) reference!: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(100) accountId?: string;
  @IsString()
  @Matches(/^(policy|consent):[A-Za-z0-9_.-]{1,80}$/)
  processingReference!: string;
  @IsOptional() @IsBoolean() allowOwnChannel?: boolean;
}
export class LeadSourcePatchDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'DISABLED', 'ACCESS_LOST'])
  monitoringState?: LeadMonitoringState;
  @IsOptional()
  @IsString()
  @Matches(/^(policy|consent):[A-Za-z0-9_.-]{1,80}$/)
  processingReference?: string;
  @IsOptional() @IsString() @MaxLength(100) accountId?: string | null;
  @IsOptional() @IsBoolean() allowOwnChannel?: boolean;
}
export class LeadImportPreviewDto {
  @IsString() @MaxLength(65536) text!: string;
  @IsIn(['TEXT', 'CSV']) format!: 'TEXT' | 'CSV';
}
export class LeadImportDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LeadSourceInputDto)
  items!: LeadSourceInputDto[];
}
export class LeadScanDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsInt() @Min(1) beforeId?: number;
}
export class LeadExportDto {
  @IsIn(['csv', 'xlsx']) format!: 'csv' | 'xlsx';
}
