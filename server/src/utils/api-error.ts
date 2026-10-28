class ApiError extends Error {
  readonly statusCode: number;
  readonly data = null;
  readonly errors: unknown[];
  readonly success = false;

  constructor(statusCode: number, message = 'Something went wrong', errors: unknown[] = [], stack = '') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
