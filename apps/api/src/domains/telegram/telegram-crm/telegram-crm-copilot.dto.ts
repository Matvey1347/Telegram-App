import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CRM_COPILOT_CATEGORIES,
  CRM_COPILOT_TONES,
  type CrmCopilotCategory,
  type CrmCopilotTone,
  type CrmCopilotLanguage,
} from '@telegram-system/shared';
export class CrmCopilotContextQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  productIds: string[] = [];
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeNotes = false;
}
export class CrmCopilotGenerateDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/i)
  operationId!: string;
  @IsIn(CRM_COPILOT_CATEGORIES) category!: CrmCopilotCategory;
  @IsIn(CRM_COPILOT_TONES) tone!: CrmCopilotTone;
  @IsIn(['AUTO', 'uk', 'ru', 'en']) language!: CrmCopilotLanguage;
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  productIds!: string[];
  @IsBoolean() includeNotes!: boolean;
  @IsIn(['DOCUMENTED_CONSENT', 'APPROVED_BUSINESS_PROCESSING'])
  processingBasis!: 'DOCUMENTED_CONSENT' | 'APPROVED_BUSINESS_PROCESSING';
  @IsString()
  @Matches(/^(consent|policy):[A-Za-z0-9_.-]{1,80}$/)
  processingReference!: string;
  @IsBoolean() sourceAcknowledged!: boolean;
}
export class CrmCopilotPatchDto {
  @Type(() => Number) @IsInt() @Min(1) revision!: number;
  @IsIn(['SAVE', 'APPROVE', 'DISCARD']) action!: 'SAVE' | 'APPROVE' | 'DISCARD';
  @IsOptional() @IsString() @MaxLength(3000) text?: string;
}
