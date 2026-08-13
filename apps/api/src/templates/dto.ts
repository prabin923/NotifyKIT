import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { Channel, TemplateStatus } from '@prisma/client';

export class CreateTemplateDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(160) event_type!: string;
  @IsEnum(Channel) channel!: Channel;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @MaxLength(100000) body!: string;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsEnum(TemplateStatus) status?: TemplateStatus;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(100000) body?: string;
  @IsOptional() @IsEnum(TemplateStatus) status?: TemplateStatus;
}
