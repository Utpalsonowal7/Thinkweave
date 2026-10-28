import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { getToken } from '../modules/auth/auth.controller.js';
import { hashToken } from '../modules/auth/auth.service.js';
import { ApiError } from '../utils/api-error.js';

export const authenticate: RequestHandler = async (req, res, next) => {
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hashToken(getToken(req)) }, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true, createdAt: true } } } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, 'Session is invalid or expired.');
  res.locals.auth = { user: session.user, sessionId: session.id };
  next();
};

export const requireVerifiedEmail: RequestHandler = (_req, res, next) => {
  if (!res.locals.auth?.user?.emailVerifiedAt) return next(new ApiError(403, 'Verify your email first.'));
  next();
};
