import { IsBoolean, IsEnum, IsString, MaxLength } from 'class-validator';
import { Channel } from '@prisma/client';

export class UpsertPreferenceDto {
  @IsString() @MaxLength(120) category!: string;
  @IsEnum(Channel) channel!: Channel;
  @IsBoolean() enabled!: boolean;
}
