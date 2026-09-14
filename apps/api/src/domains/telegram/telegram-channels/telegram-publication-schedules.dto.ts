import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { TelegramPublicationScheduleSelectionMode, TelegramPublicationSlotKind } from '@prisma/client';

export class TelegramPublicationScheduleSlotInputDto {
  @IsOptional() @IsString() id?: string;
  @IsString() title!: string;
  @IsEnum(TelegramPublicationSlotKind) kind!: TelegramPublicationSlotKind;
  @IsInt() @Min(1) @Max(7) weekday!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() iconId?: string | null;
}

export class TelegramPublicationScheduleInputDto {
  @IsString() name!: string;
  @IsString() timezone!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TelegramPublicationScheduleSlotInputDto)
  slots!: TelegramPublicationScheduleSlotInputDto[];
}

export class TelegramPublicationScheduleAssignmentInputDto {
  @IsString() scheduleId!: string;
  @IsEnum(TelegramPublicationScheduleSelectionMode) selectionMode!: TelegramPublicationScheduleSelectionMode;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) selectedSlotIds?: string[];
}

export class TelegramPublicationOccurrenceQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}
