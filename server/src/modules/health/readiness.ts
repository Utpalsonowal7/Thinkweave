import type { RequestHandler } from 'express';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { ApiResponse } from '../../utils/api-response.js';

async function reachable(check: () => Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out')), 2000);
        timer.unref();
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const readiness: RequestHandler = async (_req, res) => {
  const [database, cache] = await Promise.all([
    reachable(() => prisma.$queryRaw`SELECT 1`),
    reachable(async () => {
      if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
      await redis.ping();
    }),
  ]);
  const status = database && cache ? 200 : 503;
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(status)
    .json(
      new ApiResponse(status, status === 200 ? 'Ready' : 'Dependencies unavailable', {
        database,
        redis: cache,
      }),
    );
};
