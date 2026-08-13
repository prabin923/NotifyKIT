import { SetMetadata } from '@nestjs/common';
import type { DashboardRole } from '@prisma/client';

export const ROLES_KEY = 'required_roles';
export const RequireRoles = (...roles: DashboardRole[]) => SetMetadata(ROLES_KEY, roles);
