import type { Request, Response } from 'express';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import * as auth from './auth.service.js';
import { parseCredentials, parseRegistration } from './auth.validation.js';
import { requestAction } from './security.service.js';
import { AuthActionType } from '../../generated/prisma/client.js';

const isProduction = process.env.NODE_ENV === 'production';
export const cookieName = isProduction ? '__Host-thinkweave_session' : 'thinkweave_session';
export const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: 'strict' as const, path: '/' };

export function getToken(req: Request): string {
  const pairs = (req.headers.cookie ?? '').split(';').map((part) => part.trim());
  const matches = pairs.filter((part) => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) throw new ApiError(401, 'Session is invalid or expired.');
  const token = matches[0]!.slice(cookieName.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, 'Session is invalid or expired.');
  return token;
}

export async function register(req: Request, res: Response): Promise<void> {
  const user = await auth.register(parseRegistration(req.body));
  try { await requestAction(user.email, AuthActionType.VERIFY_EMAIL); } catch { console.error('Verification email could not be queued'); }
  res.status(201).json(new ApiResponse(201, 'Account created. Check your email or request a verification link.', { user }));
}
export async function login(req: Request, res: Response): Promise<void> {
  const { token, expiresAt, user } = await auth.login(parseCredentials(req.body), req.get('user-agent'));
  res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
  res.status(200).json(new ApiResponse(200, 'Logged in successfully.', { user }));
}
export async function me(req: Request, res: Response): Promise<void> {
  const user = res.locals.auth.user;
  res.status(200).json(new ApiResponse(200, 'success', { user }));
}
export async function logout(req: Request, res: Response): Promise<void> {
  const token = getToken(req);
  await auth.logout(token);
  res.clearCookie(cookieName, cookieOptions);
  res.status(200).json(new ApiResponse(200, 'Logged out successfully.', null));
}
