import {
  TelegramAdCrmOwnerMode,
  TelegramAdvertiserTaskPriority,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class TelegramAdCrmMemberSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultFollowUpDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultReactivationDays?: number;
  @IsOptional() @IsBoolean() autoCreateFollowUpAfterPlacement?: boolean;
  @IsOptional() @IsBoolean() autoCreateFeedbackTask?: boolean;
  @IsOptional() @IsBoolean() autoCreatePaymentFollowUp?: boolean;
  @IsOptional() @IsBoolean() dailyDigestEnabled?: boolean;
  @IsOptional() @IsBoolean() overdueDigestEnabled?: boolean;
  @IsOptional() @IsBoolean() reminderNotificationsEnabled?: boolean;
  @IsOptional() @IsString() preferredReminderTime?: string | null;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional()
  @IsEnum(TelegramAdvertiserTaskPriority)
  defaultTaskPriority?: TelegramAdvertiserTaskPriority;
  @IsOptional()
  @IsEnum(TelegramAdCrmOwnerMode)
  defaultAdvertiserOwnerMode?: TelegramAdCrmOwnerMode;
}
