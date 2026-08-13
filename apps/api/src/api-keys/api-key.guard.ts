import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/api-error';
import { PERMISSIONS_KEY } from '../common/permissions.decorator';
import type { PlatformRequest } from '../common/request-context';
import { ApiKeysService } from './api-keys.service';
import { RateLimiterService } from '../common/rate-limiter.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService, private readonly reflector: Reflector, private readonly rateLimiter: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new ApiError('UNAUTHORIZED', 'Bearer API key is required.', 401);
    const apiClient = await this.apiKeys.authenticate(authorization.slice(7));
    request.apiClient = apiClient;
    try {
      await this.rateLimiter.consumeRequest(apiClient.tenantId, apiClient.keyId);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        const retryAfter = error.details?.retry_after_seconds;
        context.switchToHttp().getResponse<Response>().setHeader('retry-after', String(retryAfter ?? 60));
      }
      throw error;
    }
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!required.every((permission) => apiClient.permissions.includes(permission))) {
      throw new ApiError('FORBIDDEN', 'This API key does not have the required permission.', 403, { required });
    }
    return true;
  }
}
