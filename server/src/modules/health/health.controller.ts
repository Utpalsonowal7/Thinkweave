import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';

export function getHealth(_req: Request, res: Response): void {
  // Liveness only: database and Redis readiness checks come with their integrations.
  sendSuccess(res, {
    service: 'thinkweave-api',
  });
}
