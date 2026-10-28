import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// Connect on first use; cache outages do not prevent the API from starting.
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
redis.on('error', () => console.error('Redis connection error'));
