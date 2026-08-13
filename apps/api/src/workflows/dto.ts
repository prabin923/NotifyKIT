import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkflowStatus } from '@prisma/client';

export class CreateWorkflowDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(160) event_type!: string;
  @IsObject() definition!: Record<string, unknown>;
  @IsOptional() @IsEnum(WorkflowStatus) status?: WorkflowStatus;
}

export class UpdateWorkflowDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsObject() definition?: Record<string, unknown>;
  @IsOptional() @IsEnum(WorkflowStatus) status?: WorkflowStatus;
}
