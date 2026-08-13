import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions!: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expires_at?: Date;

  @IsOptional()
  @IsIn(['test', 'live'])
  environment?: 'test' | 'live';
}
