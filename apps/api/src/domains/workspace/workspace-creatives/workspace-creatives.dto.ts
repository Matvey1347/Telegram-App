import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { creativeSections, creativeTargets } from '@telegram-system/shared';
import type {
  CreateWorkspaceCreative,
  CreativeSection,
  CreativeTarget,
  WorkspaceCreativePost,
} from '@telegram-system/shared';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreativeListDto {
  @IsIn(creativeSections)
  section!: CreativeSection;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  cursor?: string;
}

export class CreateCreativeDto implements CreateWorkspaceCreative {
  @IsIn(creativeSections)
  section!: CreativeSection;

  @IsOptional()
  @IsIn(creativeTargets)
  target?: CreativeTarget;

  @Transform(trim)
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(12000)
  text?: string;

  @IsOptional()
  @IsObject()
  post?: WorkspaceCreativePost;

  @IsOptional()
  @Transform(trim)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  mentorComment?: string;
}

export class CreateCreativeCommentDto {
  @Transform(trim)
  @IsString()
  @Length(1, 4000)
  text!: string;
}
