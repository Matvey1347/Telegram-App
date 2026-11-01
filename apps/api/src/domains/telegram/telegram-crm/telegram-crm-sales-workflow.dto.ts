import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CRM_MANUAL_SALES_STATUSES,
  type CrmFollowUpActionInput,
  type CrmManualSalesStatus,
} from '@telegram-system/shared';

export class CrmSalesStatusDto {
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsIn(CRM_MANUAL_SALES_STATUSES)
  manualStatus!: CrmManualSalesStatus | null;
}
export class CrmScheduleFollowUpDto {
  @IsDateString() at!: string;
  @IsOptional() @IsString() @MaxLength(240) title?: string;
}
export class CrmFollowUpActionDto {
  @IsIn(['RESCHEDULE', 'SNOOZE', 'CANCEL', 'COMPLETE'])
  action!: CrmFollowUpActionInput['action'];
  @IsOptional() @IsDateString() at?: string;
}
export class CrmSalesContextQueryDto {
  @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number =
    20;
}
