import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
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
  @IsIn(['DRAFT', 'ACTIVE', 'SUCCESSFUL', 'FAILED', 'ARCHIVED'])
  status?: 'DRAFT' | 'ACTIVE' | 'SUCCESSFUL' | 'FAILED' | 'ARCHIVED';
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) conclusion?: string | null;
}
class HypothesisRowDto {
  @IsString() @MaxLength(100) ref!: string;
  @IsIn(['CREATE', 'UPDATE', 'ARCHIVE']) action!:
    | 'CREATE'
    | 'UPDATE'
    | 'ARCHIVE';
  @IsOptional() @IsString() id?: string;
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
  @IsOptional() @IsString() @MaxLength(20000) text?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({}, { each: true })
  imageUrls?: string[];
  @IsOptional() @IsString() groupRef?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  hypothesisRefs?: string[];
}
class ScheduleRowDto {
  @IsString() postRef!: string;
  @IsString() slotId!: string;
  @IsString() scheduledAt!: string;
  @IsOptional() @IsIn(['CONTENT', 'AD']) slotKind?: 'CONTENT' | 'AD';
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
}
