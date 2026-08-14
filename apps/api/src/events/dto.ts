import { Type } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

class EventUserDto {
  @IsString() @MaxLength(255) id!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(255) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
}

export class CreateEventDto {
  @IsString() @Matches(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*)+$/) @MaxLength(160) event!: string;
  @IsOptional() @IsString() @MaxLength(255) idempotency_key?: string;
  @IsOptional() @IsString() @MaxLength(255) external_event_id?: string;
  @ValidateNested() @Type(() => EventUserDto) user!: EventUserDto;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*)+$/) @MaxLength(160) event?: string;
  @IsOptional() @IsString() @MaxLength(255) external_event_id?: string | null;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
