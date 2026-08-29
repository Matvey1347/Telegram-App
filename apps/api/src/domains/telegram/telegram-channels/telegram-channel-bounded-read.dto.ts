import { TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS } from '@telegram-system/shared';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class TelegramManagedPostLookupDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids!: string[];
}
