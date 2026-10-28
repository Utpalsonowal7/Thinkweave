import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import type { ErrorResponse } from '../utils/api-response.js';

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // express.json() supplies these error types. Never forward its raw body/message.
  if (error instanceof Error && 'type' in error) {
    switch (error.type) {
      case 'entity.parse.failed':
        return new AppError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
      case 'entity.too.large':
        return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 1 MB limit.');
      case 'charset.unsupported':
      case 'encoding.unsupported':
        return new AppError(415, 'UNSUPPORTED_ENCODING', 'Request body encoding is not supported.');
      case 'request.aborted':
      case 'request.size.invalid':
        return new AppError(400, 'INVALID_REQUEST_BODY', 'Request body could not be read.');
    }
  }

  return new AppError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
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
      method: req.method,
      path: req.path,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  const body: ErrorResponse = {
    status: 'error',
    code: isServerError ? 'INTERNAL_SERVER_ERROR' : appError.code,
    message: isServerError ? 'An unexpected error occurred.' : appError.message,
  };

  res.status(appError.statusCode).json(body);
};
