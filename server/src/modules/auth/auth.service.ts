import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import type { Credentials, Registration } from './auth.validation.js';

const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const userFields = { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true, createdAt: true } as const;
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
// Also perform a password check when the account does not exist.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  return dummyHash ??= argon2.hash('not-a-real-account-password', passwordOptions);
}
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
function newToken(): string { return randomBytes(32).toString('base64url'); }

export async function register(input: Registration) {
  const passwordHash = await argon2.hash(input.password, passwordOptions);
  try {
    return await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash }, select: userFields });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'An account with this email already exists.');
    throw error;
  }
}

export async function login(input: Credentials, userAgent?: string) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordHash = user?.passwordHash ?? await getDummyHash();
  const valid = await argon2.verify(passwordHash, input.password);
  if (!user || !user.passwordHash || !valid) throw new ApiError(401, 'Invalid email or password.');
  const { token, expiresAt } = await createSession(user.id, userAgent);
  return {
    token,
    expiresAt,
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt },
  };
}

export async function currentUser(token: string) {
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hashToken(token) }, include: { user: { select: userFields } } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, 'Session is invalid or expired.');
  return session.user;
}

export async function logout(token: string): Promise<void> {
  await prisma.session.updateMany({ where: { refreshTokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function createSession(userId: string, userAgent?: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + sessionLifetime);
  await prisma.session.create({ data: { userId, refreshTokenHash: hashToken(token), expiresAt, ...(userAgent ? { userAgent: userAgent.slice(0, 512) } : {}) } });
  return { token, expiresAt };
}
