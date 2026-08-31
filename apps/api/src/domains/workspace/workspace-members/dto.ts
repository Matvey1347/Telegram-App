import { WorkspaceRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ArrayUnique,
} from 'class-validator';

export class CreateWorkspaceMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;

  @IsOptional()
  @IsString()
  roleDefinitionId?: string;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;

  @IsOptional()
  @IsString()
  telegramUsername?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  telegramUserAccountIds?: string[];
}

export class UpdateWorkspaceMemberDto {
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;

  @IsOptional()
  @IsString()
  roleDefinitionId?: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;

  @IsOptional()
  @IsString()
  telegramUsername?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  telegramUserAccountIds?: string[];
}
