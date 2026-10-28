import type { Request, Response } from 'express';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import { setAuthCookies } from './cookies.js';
import { signAccess } from './tokens.js';
import { createSession } from './auth.service.js';
import * as oauth from './oauth.service.js';

const secure = process.env.NODE_ENV === 'production';
const stateCookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/api/v1/auth/oauth', maxAge: 10 * 60 * 1000 };
const stateCookieName = (provider: oauth.Provider) => `thinkweave_oauth_${provider}`;
function stateCookie(req: Request, provider: oauth.Provider): string {
  const name = stateCookieName(provider);
  const matches = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) throw new ApiError(400, 'Invalid OAuth state.');
  return matches[0]!.slice(name.length + 1);
}
function noCache(res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
}

export async function start(req: Request, res: Response): Promise<void> {
  const provider = oauth.providerFrom(String(req.params.provider));
  const flow = await oauth.start(provider);
  noCache(res);
  res.cookie(stateCookieName(provider), flow.state, stateCookieOptions);
  res.redirect(302, flow.url);
}

export async function link(req: Request, res: Response): Promise<void> {
  const provider = oauth.providerFrom(String(req.params.provider));
  const flow = await oauth.start(provider, res.locals.auth.sessionId);
  noCache(res);
  res.cookie(stateCookieName(provider), flow.state, stateCookieOptions);
  res.status(200).json(new ApiResponse(200, 'Continue to the provider.', { authorizationUrl: flow.url }));
}

export async function callback(req: Request, res: Response): Promise<void> {
  const provider = oauth.providerFrom(String(req.params.provider));
  noCache(res);
  const cookie = stateCookie(req, provider);
  res.clearCookie(stateCookieName(provider), { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1/auth/oauth' });
  if (typeof req.query.state !== 'string' || typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) throw new ApiError(400, 'OAuth authorization was cancelled or invalid.');
  const destination = oauth.successRedirect();
  const result = await oauth.finish(provider, req.query.state, cookie, req.query.code);
  if (!result.linked) {
    const session = await createSession(result.userId, req.get('user-agent'));
    setAuthCookies(res, await signAccess(result.userId, session.sessionId), session.token, session.expiresAt);
  }
  res.redirect(302, destination);
}
