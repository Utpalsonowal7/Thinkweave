import type { RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { redis } from '../lib/redis.js';
import { ApiError } from '../utils/api-error.js';

// State-changing browser requests must come from the explicitly configured origin.
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  const allowed = process.env.APP_ORIGIN;
  const origin = req.get('origin');
  if (!allowed || !origin || origin !== allowed) return next(new ApiError(403, 'Request origin is not allowed.'));
  try {
    const url = new URL(allowed);
    const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.origin !== allowed || url.username || url.password || (url.protocol !== 'https:' && !local)) throw new Error('Invalid origin');
  } catch { return next(new ApiError(403, 'Request origin is not allowed.')); }
  next();
};

export const requireJson: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json')) return next(new ApiError(415, 'Content-Type must be application/json.'));
  next();
};

// Fixed window increments and TTL are atomic and shared across API instances.
export function redisLimit(scope: string, limit: number, seconds: number): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
      if (redis.status !== 'ready') throw new Error('Redis unavailable');
      const identity = createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
      const key = `ratelimit:${scope}:${identity}`;
      const count = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, seconds);
      if (typeof count !== 'number') throw new Error('Invalid rate limiter response');
      if (count > limit) return next(new ApiError(429, 'Too many attempts. Please try again later.'));
      next();
    } catch {
      next(new ApiError(503, 'Authentication is temporarily unavailable.'));
    }
  };
}
