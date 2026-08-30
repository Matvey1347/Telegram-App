import { WorkspaceRoleMode } from '@prisma/client';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkspaceRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emoji?: string | null;

  @IsOptional()
  @IsString()
  iconId?: string | null;

  @IsEnum(WorkspaceRoleMode)
  mode!: WorkspaceRoleMode;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];
}

export class UpdateWorkspaceRoleDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emoji?: string | null;

  @IsOptional()
  @IsString()
  iconId?: string | null;

  @IsOptional()
  @IsEnum(WorkspaceRoleMode)
  mode?: WorkspaceRoleMode;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys?: string[];
}

export class CopyWorkspaceRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}

export class AssignWorkspaceRoleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  memberIds!: string[];
}
