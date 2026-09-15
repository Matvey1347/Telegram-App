import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import type { TelegramUnifiedImportManifest } from '@telegram-system/shared';

class GroupRowDto {
  @IsString() @MaxLength(100) ref!: string;
  @IsIn(['CREATE', 'UPDATE', 'DELETE']) action!: 'CREATE' | 'UPDATE' | 'DELETE';
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(200) icon?: string | null;
}
class HypothesisValueDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional()
  @IsIn(['ACTIVE', 'SUCCESSFUL', 'FAILED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'SUCCESSFUL' | 'FAILED' | 'ARCHIVED';
  @IsOptional() @IsString() @MaxLength(4000) conclusion?: string | null;
}
class HypothesisRowDto {
  @IsString() @MaxLength(100) ref!: string;
  @IsIn(['CREATE', 'UPDATE', 'ARCHIVE', 'DELETE']) action!:
    | 'CREATE'
    | 'UPDATE'
    | 'ARCHIVE'
    | 'DELETE';
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() @MaxLength(200) icon?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => HypothesisValueDto)
  value?: HypothesisValueDto;
}
class PostRowDto {
  @IsString() @MaxLength(100) ref!: string;
  @IsIn(['CREATE', 'UPDATE', 'DELETE']) action!: 'CREATE' | 'UPDATE' | 'DELETE';
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(200) icon?: string | null;
  @IsOptional() @IsString() @MaxLength(20000) text?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({}, { each: true })
  imageUrls?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  imageSearch?: string[];
  @IsOptional() @IsString() groupRef?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  hypothesisRefs?: string[];
  @IsOptional() @IsBoolean() imported?: boolean;
  @IsOptional() @IsBoolean() approved?: boolean;
}
class ScheduleRowDto {
  @IsOptional() @IsIn(['SCHEDULE', 'UNSCHEDULE']) action?:
    | 'SCHEDULE'
    | 'UNSCHEDULE';
  @ValidateIf(
    (row: ScheduleRowDto) => row.action !== 'UNSCHEDULE' && !row.postId?.trim(),
  )
  @IsString()
  postRef?: string;
  @ValidateIf(
    (row: ScheduleRowDto) =>
      row.action === 'UNSCHEDULE' || !row.postRef?.trim(),
  )
  @IsString()
  postId?: string;
  @ValidateIf((row: ScheduleRowDto) => row.action !== 'UNSCHEDULE')
  @IsString()
  slotId?: string;
  @ValidateIf((row: ScheduleRowDto) => row.action !== 'UNSCHEDULE')
  @IsString()
  scheduledAt?: string;
  @IsOptional() @IsIn(['CONTENT', 'AD']) slotKind?: 'CONTENT' | 'AD';
}
class DeleteTargetDto {
  @IsString() id!: string;
}
class DeleteSectionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DeleteTargetDto)
  groups?: DeleteTargetDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DeleteTargetDto)
  hypotheses?: DeleteTargetDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DeleteTargetDto)
  posts?: DeleteTargetDto[];
}

export class TelegramUnifiedImportDto implements TelegramUnifiedImportManifest {
  @IsInt() @Min(1) version!: 1;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GroupRowDto)
  groups?: GroupRowDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HypothesisRowDto)
  hypotheses?: HypothesisRowDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PostRowDto)
  posts?: PostRowDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScheduleRowDto)
  schedule?: ScheduleRowDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => DeleteSectionDto)
  delete?: DeleteSectionDto;
}
