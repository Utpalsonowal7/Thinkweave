import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import type { Credentials, Registration } from './auth.validation.js';

const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const userFields = { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true, createdAt: true } as const;
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> { return dummyHash ??= argon2.hash('not-a-real-account-password', passwordOptions); }
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
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
  const valid = await argon2.verify(user?.passwordHash ?? await getDummyHash(), input.password);
  if (!user || !user.passwordHash || !valid) throw new ApiError(401, 'Invalid email or password.');
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionLifetime);
  const session = await prisma.$transaction(async (tx) => {
    const current = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { updatedAt: new Date() } });
    if (current.count !== 1) throw new ApiError(401, 'Invalid email or password.');
    return tx.session.create({ data: { userId: user.id, refreshTokenHash: tokenHash, expiresAt, ...(userAgent ? { userAgent: userAgent.slice(0, 512) } : {}), refreshTokens: { create: { tokenHash } } } });
  });
  return { token, expiresAt, sessionId: session.id, user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt } };
}

export async function createSession(userId: string, userAgent?: string) {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionLifetime);
  const session = await prisma.session.create({ data: { userId, refreshTokenHash: tokenHash, expiresAt, ...(userAgent ? { userAgent: userAgent.slice(0, 512) } : {}), refreshTokens: { create: { tokenHash } } } });
  return { token, expiresAt, sessionId: session.id };
}

export async function rotateRefresh(token: string) {
  const oldHash = hashToken(token);
  const tokenRow = await prisma.refreshToken.findUnique({ where: { tokenHash: oldHash }, select: { id: true, sessionId: true } });
  if (!tokenRow) throw new ApiError(401, 'Refresh token is invalid or expired.');
  const nextToken = newToken();
  const nextHash = hashToken(nextToken);
  const result = await prisma.$transaction(async (tx) => {
    // Serialize rotations for this session, including simultaneous reuse attempts.
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${tokenRow.sessionId}::uuid FOR UPDATE`;
    const session = await tx.session.findUnique({ where: { id: tokenRow.sessionId } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return { kind: 'invalid' as const };
    const consumed = await tx.refreshToken.updateMany({ where: { id: tokenRow.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1 || session.refreshTokenHash !== oldHash) {
      // Return rather than throw: revocation must commit before responding.
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return { kind: 'reused' as const };
    }
    await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: nextHash } });
    await tx.session.update({ where: { id: session.id }, data: { refreshTokenHash: nextHash } });
    return { kind: 'rotated' as const, userId: session.userId, sessionId: session.id, expiresAt: session.expiresAt };
  });
  if (result.kind !== 'rotated') throw new ApiError(401, 'Refresh token is invalid or expired. Please log in again.');
  return { ...result, token: nextToken };
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}
