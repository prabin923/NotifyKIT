import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DevicePlatform, UserStatus } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString() @MaxLength(4096) device_token!: string;
  @IsEnum(DevicePlatform) platform!: DevicePlatform;
  @IsOptional() @IsString() @MaxLength(64) app_version?: string;
}

export class CreateUserDto {
  @IsString() @MaxLength(128) external_id!: string;
  @IsOptional() @IsString() @MaxLength(128) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(128) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
