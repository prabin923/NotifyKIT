import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { PlatformRequest } from './request-context';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    return next.handle().pipe(map((value: unknown) => {
      if (value && typeof value === 'object' && 'success' in value) return value;
      return { success: true, data: value, request_id: request.requestId };
    }));
  }
}
