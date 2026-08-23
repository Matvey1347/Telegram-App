import { IsIn, IsOptional, IsString } from 'class-validator';

export class StartLoginDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['APP', 'SMS']) delivery?: 'APP' | 'SMS';
}
