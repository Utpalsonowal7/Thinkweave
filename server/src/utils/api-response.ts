import type { Response } from 'express';

export interface SuccessResponse<T> {
  status: 'ok';
  data: T;
}

export interface ErrorResponse {
  status: 'error';
  code: string;
  message: string;
}

/** Send a JSON success response. For 204 No Content, use res.status(204).end(). */
export function sendSuccess<T>(
  res: Response<SuccessResponse<T>>,
  data: T,
  statusCode: 200 | 201 | 202 = 200,
): void {
  res.status(statusCode).json({ status: 'ok', data });
}
