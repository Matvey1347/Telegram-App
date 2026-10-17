import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFinanceCustomIconDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  imageUrl!: string;
}
