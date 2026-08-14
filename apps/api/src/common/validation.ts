import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { ApiError } from './api-error';

function messages(errors: ValidationError[], path = ''): string[] {
  return errors.flatMap((error) => {
    const property = path ? `${path}.${error.property}` : error.property;
    const ownMessages = Object.values(error.constraints ?? {}).map((message) => `${property}: ${message}`);
    return [...ownMessages, ...messages(error.children ?? [], property)];
  });
}

export async function validateBody<T extends object>(type: ClassConstructor<T>, input: unknown): Promise<T> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('INVALID_REQUEST', 'Request body must be a JSON object.', 400, { validation_errors: ['body: Request body must be a JSON object.'] });
  }
  const value = plainToInstance(type, input);
  const errors = await validate(value, { whitelist: true, forbidNonWhitelisted: true, validationError: { target: false, value: false } });
  if (errors.length) throw new ApiError('INVALID_REQUEST', 'Request validation failed.', 400, { validation_errors: messages(errors) });
  return value;
}
