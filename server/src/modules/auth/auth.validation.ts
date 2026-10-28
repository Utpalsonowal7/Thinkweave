import { ApiError } from '../../utils/api-error.js';

export interface Credentials { email: string; password: string }
export interface Registration extends Credentials { name: string }

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'A JSON object is required.');
  return input as Record<string, unknown>;
}

export function parseCredentials(input: unknown): Credentials {
  const body = record(input);
  if (typeof body.email !== 'string' || typeof body.password !== 'string') throw new ApiError(400, 'Email and password are required.');
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
  if (body.password.length < 12 || body.password.length > 128) throw new ApiError(400, 'Password must be between 12 and 128 characters.');
  return { email, password: body.password };
}

export function parseRegistration(input: unknown): Registration {
  const body = record(input);
  const credentials = parseCredentials(body);
  if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 100) throw new ApiError(400, 'Name must be between 2 and 100 characters.');
  return { ...credentials, name: body.name.trim() };
}
