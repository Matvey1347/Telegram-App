import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChannelReminderTemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() iconId?: string | null;
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(30, { each: true })
  daysBefore!: number[];
  @IsBoolean() notifyEmpty!: boolean;
}

export class ChannelReminderAssignmentItemDto {
  @IsString() channelId!: string;
  @IsOptional() @IsString() templateId!: string | null;
  @IsOptional() @IsString() memberId!: string | null;
}

export class ChannelReminderAssignmentsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ChannelReminderAssignmentItemDto)
  items?: ChannelReminderAssignmentItemDto[];

  // Kept for compatibility with existing clients while the UI moves to per-channel rows.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  channelIds!: string[];
  @IsOptional() @IsString() templateId!: string | null;
  @IsOptional() @IsString() memberId?: string | null;
}
