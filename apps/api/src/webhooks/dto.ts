import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { WebhookStatus } from '@prisma/client';

export class CreateWebhookDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }) url!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) events!: string[];
  @IsOptional() @IsString() @MaxLength(512) secret?: string;
}

export class UpdateWebhookDto {
  @IsOptional() @IsEnum(WebhookStatus) status?: WebhookStatus;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsString({ each: true }) events?: string[];
}
