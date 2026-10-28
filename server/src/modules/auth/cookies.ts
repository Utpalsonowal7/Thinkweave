import type { Request, Response } from 'express';
import { ApiError } from '../../utils/api-error.js';

const production = process.env.NODE_ENV === 'production';
export const accessCookieName = production ? '__Host-thinkweave_access' : 'thinkweave_access';
export const refreshCookieName = production ? '__Host-thinkweave_refresh' : 'thinkweave_refresh';
const options = { httpOnly: true, secure: production, sameSite: 'strict' as const, path: '/' };

function readCookie(req: Request, name: string): string {
  const matches = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) throw new ApiError(401, 'Authentication is required.');
  return matches[0]!.slice(name.length + 1);
}
export function getAccessToken(req: Request): string {
  const token = readCookie(req, accessCookieName);
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new ApiError(401, 'Access token is invalid.');
  return token;
}
export function getRefreshToken(req: Request): string {
  const token = readCookie(req, refreshCookieName);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, 'Refresh token is invalid.');
  return token;
}
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, expiresAt: Date): void {
  res.cookie(accessCookieName, accessToken, { ...options, maxAge: 15 * 60 * 1000 });
  res.cookie(refreshCookieName, refreshToken, { ...options, expires: expiresAt });
}
export function clearAuthCookies(res: Response): void {
  res.clearCookie(accessCookieName, options);
  res.clearCookie(refreshCookieName, options);
}
