import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { TelegramContentHypothesisStatus } from '@prisma/client';

export class TelegramContentHypothesisInputDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional()
  @IsEnum(TelegramContentHypothesisStatus)
  status?: TelegramContentHypothesisStatus;
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() conclusion?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  postIds?: string[];
}

export class TelegramManagedPostHypothesesInputDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  hypothesisIds!: string[];
}
