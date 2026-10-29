import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  // express.json() supplies these error types. Never forward its raw body/message.
  if (error instanceof Error && 'type' in error) {
    switch (error.type) {
      case 'entity.parse.failed':
        return new ApiError(400, 'Request body must contain valid JSON.');
      case 'entity.too.large':
        return new ApiError(413, 'Request body exceeds the 1 MB limit.');
      case 'charset.unsupported':
      case 'encoding.unsupported':
        return new ApiError(415, 'Request body encoding is not supported.');
      case 'request.aborted':
      case 'request.size.invalid':
        return new ApiError(400, 'Request body could not be read.');
    }
  }

  return new ApiError(500, 'An unexpected error occurred.');
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  // Express must finish/close a response that has already started.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalizeError(error);
  const isServerError = appError.statusCode >= 500;

  if (isServerError) {
    // Keep raw exceptions, request bodies, headers, and query strings out of this log.
    console.error('Request failed', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  const body = {
    statusCode: appError.statusCode,
    message: isServerError ? 'An unexpected error occurred.' : appError.message,
    data: null,
    errors: isServerError ? [] : appError.errors,
    success: false,
  };

  res.status(appError.statusCode).json(body);
};
