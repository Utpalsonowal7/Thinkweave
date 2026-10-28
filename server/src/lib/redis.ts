import { Redis } from 'ioredis';

// Connect on first use; cache outages do not prevent the API from starting.
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
redis.on('error', () => console.error('Redis connection error'));
