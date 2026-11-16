import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export const TELEGRAM_POST_RESCHEDULE_BATCH_SIZE = 5;

export class TelegramManagedPostRescheduleBatchDto {
  @IsArray()
  @ArrayMaxSize(TELEGRAM_POST_RESCHEDULE_BATCH_SIZE)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  postIds!: string[];
}
