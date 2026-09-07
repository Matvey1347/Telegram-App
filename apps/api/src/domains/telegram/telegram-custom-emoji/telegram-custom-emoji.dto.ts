import { IsString } from 'class-validator';

export class ImportTelegramCustomEmojiPackDto {
  @IsString() source!: string;
}
