import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { AuthActionType } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { sendAuthEmail } from '../../lib/mailer.js';
import { redis } from '../../lib/redis.js';
import { ApiError } from '../../utils/api-error.js';
import { hashToken } from './auth.service.js';

const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function normalizedEmail(input: unknown): string {
  if (typeof input !== 'string') throw new ApiError(400, 'Email is required.');
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
  return email;
}
function frontendUrl(): URL {
  const configured = process.env.APP_URL;
  if (!configured || !process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) throw new ApiError(503, 'Email service is not configured.');
  let url: URL;
  try { url = new URL(configured); } catch { throw new ApiError(503, 'Email service is not configured.'); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new ApiError(503, 'Email service is not configured.');
  return url;
}

export async function requestAction(email: string, type: AuthActionType): Promise<void> {
  const base = frontendUrl(); // Check configuration even for unknown accounts.
  // Per-address cooldown applies equally to existing and unknown accounts.
  try {
    if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
    if (redis.status !== 'ready') throw new Error('Redis unavailable');
    const allowed = await redis.set(`auth:email:${type}:${hashToken(email)}`, '1', 'EX', 60, 'NX');
    if (!allowed) return;
  } catch { throw new ApiError(503, 'Authentication is temporarily unavailable.'); }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || (type === 'VERIFY_EMAIL' && user.emailVerifiedAt) || (type === 'RESET_PASSWORD' && !user.passwordHash)) return;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + (type === 'VERIFY_EMAIL' ? 24 * 60 * 60 : 15 * 60) * 1000);
  await prisma.authActionToken.create({ data: { userId: user.id, type, tokenHash, expiresAt } });
  const url = new URL(type === 'VERIFY_EMAIL' ? '/verify-email' : '/reset-password', base);
  url.hash = new URLSearchParams({ token }).toString();
  try { await sendAuthEmail(user.email, type === 'VERIFY_EMAIL' ? 'Verify your ThinkWeave email' : 'Reset your ThinkWeave password', url.toString()); }
  catch {
    await prisma.authActionToken.deleteMany({ where: { tokenHash } });
    // Keep the public response generic; log no address or token.
    console.error('Authentication email delivery failed');
  }
}

function tokenHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new ApiError(400, 'Token is invalid or expired.');
  return hashToken(value);
}

export async function verifyEmail(token: unknown): Promise<void> {
  const hashed = tokenHash(token);
  await prisma.$transaction(async (tx) => {
    const action = await tx.authActionToken.findUnique({ where: { tokenHash: hashed } });
    if (!action || action.type !== 'VERIFY_EMAIL') throw new ApiError(400, 'Token is invalid or expired.');
    const consumed = await tx.authActionToken.updateMany({ where: { id: action.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new ApiError(400, 'Token is invalid or expired.');
    await tx.user.update({ where: { id: action.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.authActionToken.updateMany({ where: { userId: action.userId, type: 'VERIFY_EMAIL', consumedAt: null }, data: { consumedAt: new Date() } });
  });
}

export async function resetPassword(token: unknown, password: unknown): Promise<void> {
  const hashed = tokenHash(token);
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new ApiError(400, 'Password must be between 12 and 128 characters.');
  const passwordHash = await argon2.hash(password, passwordOptions);
  await prisma.$transaction(async (tx) => {
    const action = await tx.authActionToken.findUnique({ where: { tokenHash: hashed } });
    if (!action || action.type !== 'RESET_PASSWORD') throw new ApiError(400, 'Token is invalid or expired.');
    const consumed = await tx.authActionToken.updateMany({ where: { id: action.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new ApiError(400, 'Token is invalid or expired.');
    await tx.user.update({ where: { id: action.userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: action.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.authActionToken.updateMany({ where: { userId: action.userId, type: 'RESET_PASSWORD', consumedAt: null }, data: { consumedAt: new Date() } });
  });
}
