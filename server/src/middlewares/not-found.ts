import type { RequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'Route not found'));
};
