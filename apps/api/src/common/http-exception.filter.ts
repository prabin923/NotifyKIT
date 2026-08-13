import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from './api-error';
import type { PlatformRequest } from './request-context';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<PlatformRequest>();
    const requestId = request.requestId;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof ApiError) {
      ({ statusCode: status, code, message, details } = exception);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const responseBody = body as { message?: string | string[] };
        message = Array.isArray(responseBody.message) ? 'Request validation failed.' : String(responseBody.message ?? message);
        code = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : 'INVALID_REQUEST';
        if (Array.isArray(responseBody.message)) details = { validation_errors: responseBody.message };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_RESOURCE';
        message = 'A record with these values already exists.';
      }
    } else {
      this.logger.error({ err: exception instanceof Error ? exception.message : exception, requestId });
    }

    response.status(status).json({
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
      request_id: requestId,
    });
  }
}
