import { ArrayMaxSize, IsArray, IsString, Matches } from 'class-validator';

export class ImportTelegramCustomEmojiPackDto {
  @IsString() source!: string;
}

export class ResolveTelegramCustomEmojiDocumentsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^\d{1,20}$/, { each: true })
  documentIds!: string[];
}
