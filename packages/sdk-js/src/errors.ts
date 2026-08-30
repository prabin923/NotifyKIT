// Part of the public contract: consumers catch this type and read .code/.status/.details.
// Keep the shape stable even as internal request handling (retries, timeouts) evolves.
export class NotificationApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    // Error subclasses built with `super(message)` alone still report name === 'Error'
    // under CJS/ES5 targets; set it explicitly so `error.name` and stack traces are useful.
    this.name = 'NotificationApiError';
  }
}
