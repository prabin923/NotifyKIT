import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { ApiError } from '../common/api-error';
import { ROLES_KEY } from '../common/roles.decorator';
import type { PlatformRequest } from '../common/request-context';

@Injectable()
export class DashboardJwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', 'Dashboard bearer token is required.', 401);
    request.dashboardUser = await this.auth.verifyToken(value.slice(7));
    const roles = this.reflector.getAllAndOverride<DashboardUserContext['role'][]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(request.dashboardUser.role)) {
      throw new ApiError('FORBIDDEN', 'Your role does not have access to this resource.', 403);
    }
    return true;
  }
}

interface DashboardUserContext { role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'VIEWER' }
