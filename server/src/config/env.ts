import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(ql)?:\/\//.test(value), 'Expected a PostgreSQL URL'),
  REDIS_URL: z.string().url().refine((value) => /^rediss?:\/\//.test(value), 'Expected a Redis URL'),
  GEMINI_API_KEY: z.string().optional().transform((value) => value || undefined),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  throw new Error('Invalid environment configuration');
}
export const env = parsed.data;
