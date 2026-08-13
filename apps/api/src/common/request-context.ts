import type { DashboardRole } from '@prisma/client';
import type { Request } from 'express';

export interface ApiClientContext {
  keyId: string;
  tenantId: string;
  permissions: string[];
}

export interface DashboardUserContext {
  id: string;
  tenantId: string;
  role: DashboardRole;
  email: string;
}

export interface PlatformRequest extends Request {
  requestId: string;
  apiClient?: ApiClientContext;
  dashboardUser?: DashboardUserContext;
}
