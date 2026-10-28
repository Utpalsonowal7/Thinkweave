import type { Request, Response } from 'express';
import { AuthActionType } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import { cookieName, cookieOptions } from './auth.controller.js';
import * as security from './security.service.js';

function body(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new ApiError(400, 'A JSON object is required.');
  return req.body as Record<string, unknown>;
}
export async function requestVerification(req: Request, res: Response): Promise<void> {
  await security.requestAction(security.normalizedEmail(body(req).email), AuthActionType.VERIFY_EMAIL);
  res.json(new ApiResponse(200, 'If the account is eligible, an email will be sent.', null));
}
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  await security.verifyEmail(body(req).token);
  res.json(new ApiResponse(200, 'Email verified.', null));
}
export async function requestReset(req: Request, res: Response): Promise<void> {
  await security.requestAction(security.normalizedEmail(body(req).email), AuthActionType.RESET_PASSWORD);
  res.json(new ApiResponse(200, 'If the account is eligible, an email will be sent.', null));
}
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const input = body(req);
  await security.resetPassword(input.token, input.password);
  res.clearCookie(cookieName, cookieOptions);
  res.json(new ApiResponse(200, 'Password updated. Please log in again.', null));
}
export async function sessions(_req: Request, res: Response): Promise<void> {
  const { user, sessionId } = res.locals.auth;
  const rows = await prisma.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
  res.json(new ApiResponse(200, 'success', { sessions: rows.map((row) => ({ ...row, current: row.id === sessionId })) }));
}
export async function revokeSession(req: Request, res: Response): Promise<void> {
  const { user, sessionId } = res.locals.auth;
  const id = String(req.params.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'Invalid session ID.');
  const result = await prisma.session.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) throw new ApiError(404, 'Session not found.');
  if (id === sessionId) res.clearCookie(cookieName, cookieOptions);
  res.json(new ApiResponse(200, 'Session revoked.', null));
}
export async function revokeAll(_req: Request, res: Response): Promise<void> {
  const { user } = res.locals.auth;
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  res.clearCookie(cookieName, cookieOptions);
  res.json(new ApiResponse(200, 'All sessions revoked.', null));
}
