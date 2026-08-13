import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { PlatformRequest } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: PlatformRequest, response: Response, next: NextFunction): void {
    request.requestId = request.header('x-request-id')?.slice(0, 128) || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    next();
  }
}
