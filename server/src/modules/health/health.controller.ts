import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/api-response.js';

export function getHealth(_req: Request, res: Response): void {
  // Liveness only: database and Redis readiness checks come with their integrations.
  const response = new ApiResponse(200, 'success', {
    service: 'thinkweave-api',
  });

  res.status(response.statusCode).json(response);
}
