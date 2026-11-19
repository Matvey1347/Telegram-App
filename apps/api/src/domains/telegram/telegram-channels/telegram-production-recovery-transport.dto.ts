import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  IsISO8601,
} from 'class-validator';

export class TelegramProductionRecoveryTransportDto {
  @IsIn(['scheduled', 'history', 'delete', 'publish', 'replace', 'profile'])
  operation!:
    | 'scheduled'
    | 'history'
    | 'delete'
    | 'publish'
    | 'replace'
    | 'profile';

  @IsString()
  @MaxLength(64)
  accountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  postId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  claimOwner?: string;

  @IsOptional()
  @IsISO8601()
  scheduleAt?: string;

  @IsOptional()
  @IsISO8601()
  historyFrom?: string;

  @IsOptional()
  @IsISO8601()
  historyUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  messageIds?: string[];

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
