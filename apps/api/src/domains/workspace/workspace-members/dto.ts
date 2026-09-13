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
  IsNumber,
  Max,
  Min,
  ValidateIf,
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

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  salesCommissionRate?: number | null;
}
