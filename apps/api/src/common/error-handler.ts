import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from './api-error';
import type { PlatformRequest } from './request-context';

export const errorHandler: ErrorRequestHandler = (exception: unknown, request, response, _next) => {
  const platformRequest = request as PlatformRequest;
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';
  let details: Record<string, unknown> | undefined;

  if (exception instanceof ApiError) {
    ({ statusCode: status, code, message, details } = exception);
  } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
    status = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'A record with these values already exists.';
  } else if (exception instanceof SyntaxError && 'body' in exception) {
    status = 400;
    code = 'INVALID_REQUEST';
    message = 'Request body must contain valid JSON.';
  } else {
    console.error({ err: exception instanceof Error ? exception.message : exception, requestId: platformRequest.requestId });
  }

  response.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    request_id: platformRequest.requestId,
  });
};
