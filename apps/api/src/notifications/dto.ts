import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDate, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Channel, Priority } from '@prisma/client';

class DirectNotificationContentDto {
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(100000) message!: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
}

export class CreateNotificationDto {
  @IsString() @MaxLength(255) user_id!: string;
  @ValidateNested() @Type(() => DirectNotificationContentDto) notification!: DirectNotificationContentDto;
  @IsArray() @ArrayNotEmpty() @IsEnum(Channel, { each: true }) channels!: Channel[];
  @IsOptional() @Type(() => Date) @IsDate() scheduled_at?: Date;
  @IsOptional() @Type(() => Date) @IsDate() expires_at?: Date;
}
