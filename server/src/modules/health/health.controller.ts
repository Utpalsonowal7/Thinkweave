import type { Request, Response } from 'express';

export function getHealth(_req: Request, res: Response): void {
  // Liveness only: database and Redis readiness checks come with their integrations.
  res.status(200).json({
    status: 'ok',
    service: 'thinkweave-api',
  });
}
