import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/api-response.js';
import * as auth from './auth.service.js';
import { parseCredentials, parseRegistration } from './auth.validation.js';
import { requestAction } from './security.service.js';
import { AuthActionType } from '../../generated/prisma/client.js';
import { clearAuthCookies, getRefreshToken, setAuthCookies } from './cookies.js';
import { signAccess } from './tokens.js';

export async function register(req: Request, res: Response): Promise<void> {
  const user = await auth.register(parseRegistration(req.body));
  try { await requestAction(user.email, AuthActionType.VERIFY_EMAIL); } catch { console.error('Verification email could not be queued'); }
  res.status(201).json(new ApiResponse(201, 'Account created. Check your email or request a verification link.', { user }));
}
export async function login(req: Request, res: Response): Promise<void> {
  const { token, expiresAt, sessionId, user } = await auth.login(parseCredentials(req.body), req.get('user-agent'));
  setAuthCookies(res, await signAccess(user.id, sessionId), token, expiresAt);
  res.status(200).json(new ApiResponse(200, 'Logged in successfully.', { user }));
}
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const result = await auth.rotateRefresh(getRefreshToken(req));
    setAuthCookies(res, await signAccess(result.userId, result.sessionId), result.token, result.expiresAt);
    res.status(200).json(new ApiResponse(200, 'Session refreshed.', null));
  } catch (error) {
    // Only clear credentials for authentication failures, not a transient server error.
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 401) clearAuthCookies(res);
    throw error;
  }
}
export async function me(_req: Request, res: Response): Promise<void> {
  res.status(200).json(new ApiResponse(200, 'success', { user: res.locals.auth.user }));
}
export async function logout(_req: Request, res: Response): Promise<void> {
  await auth.logout(res.locals.auth.sessionId);
  clearAuthCookies(res);
  res.status(200).json(new ApiResponse(200, 'Logged out successfully.', null));
}
