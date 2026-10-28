import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuthProvider, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { ApiError } from '../../utils/api-error.js';
import { hashToken } from './auth.service.js';

export type Provider = 'google' | 'github';
type Flow = { provider: Provider; verifier: string; sessionHash?: string };
type Profile = { id: string; email: string; name: string; avatar: string | null };
const stateTtl = 600;
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
const random = () => randomBytes(32).toString('base64url');

export function providerFrom(value: string): Provider {
  if (value !== 'google' && value !== 'github') throw new ApiError(404, 'OAuth provider not found.');
  return value;
}

function config(provider: Provider) {
  const prefix = provider === 'google' ? 'GOOGLE' : 'GITHUB';
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const callback = process.env[`${prefix}_CALLBACK_URL`];
  if (!clientId || !clientSecret || !callback) throw new ApiError(503, 'OAuth provider is not configured.');
  let url: URL;
  try { url = new URL(callback); } catch { throw new ApiError(503, 'OAuth provider is not configured.'); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new ApiError(503, 'OAuth callback URL is invalid.');
  return { clientId, clientSecret, callback };
}

export function successRedirect(): string {
  const value = process.env.OAUTH_SUCCESS_REDIRECT;
  if (!value) throw new ApiError(503, 'OAuth redirect is not configured.');
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(503, 'OAuth redirect is not configured.'); }
  if (url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new ApiError(503, 'OAuth redirect is invalid.');
  return url.toString();
}

async function readyRedis(): Promise<void> {
  try {
    if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
    if (redis.status !== 'ready') throw new Error('Redis unavailable');
  } catch { throw new ApiError(503, 'OAuth is temporarily unavailable.'); }
}

export async function start(provider: Provider, sessionToken?: string) {
  const { clientId, callback } = config(provider);
  successRedirect();
  let sessionHash: string | undefined;
  if (sessionToken) {
    sessionHash = hashToken(sessionToken);
    const session = await prisma.session.findUnique({ where: { refreshTokenHash: sessionHash } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, 'Session is invalid or expired.');
  }
  const state = random();
  const verifier = random();
  const flow: Flow = { provider, verifier, ...(sessionHash ? { sessionHash } : {}) };
  await readyRedis();
  try {
    const stored = await redis.set(`oauth:state:${hash(state)}`, JSON.stringify(flow), 'EX', stateTtl, 'NX');
    if (stored !== 'OK') throw new Error('Could not store OAuth state');
  }
  catch { throw new ApiError(503, 'OAuth is temporarily unavailable.'); }
  const url = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'read:user user:email', state, code_challenge: hash(verifier), code_challenge_method: 'S256' }).toString();
  return { state, url: url.toString() };
}

async function requestJson(url: string, options: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' }); }
  catch { throw new ApiError(502, 'OAuth provider is unavailable.'); }
  if (!response.ok) throw new ApiError(502, 'OAuth provider request failed.');
  try { return await response.json(); } catch { throw new ApiError(502, 'OAuth provider returned an invalid response.'); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(502, 'OAuth provider returned an invalid response.');
  return value as Record<string, unknown>;
}

async function profile(provider: Provider, token: string): Promise<Profile> {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'ThinkWeave' };
  if (provider === 'google') {
    const data = object(await requestJson('https://openidconnect.googleapis.com/v1/userinfo', { headers }));
    if (typeof data.sub !== 'string' || !data.sub || typeof data.email !== 'string' || data.email_verified !== true) throw new ApiError(403, 'A verified Google email is required.');
    return { id: data.sub, email: data.email.trim().toLowerCase(), name: typeof data.name === 'string' ? data.name.slice(0, 100) : 'Google user', avatar: typeof data.picture === 'string' ? data.picture : null };
  }
  const data = object(await requestJson('https://api.github.com/user', { headers }));
  const emails = await requestJson('https://api.github.com/user/emails', { headers });
  if (!Number.isSafeInteger(data.id) || !Array.isArray(emails)) throw new ApiError(502, 'GitHub returned an invalid profile.');
  const primary = emails.find((entry: unknown) => { const e = object(entry); return e.primary === true && e.verified === true && typeof e.email === 'string'; });
  if (!primary) throw new ApiError(403, 'A verified primary GitHub email is required.');
  const email = object(primary).email as string;
  return { id: String(data.id), email: email.trim().toLowerCase(), name: typeof data.name === 'string' && data.name ? data.name.slice(0, 100) : typeof data.login === 'string' ? data.login.slice(0, 100) : 'GitHub user', avatar: typeof data.avatar_url === 'string' ? data.avatar_url : null };
}

export async function finish(provider: Provider, state: string, cookie: string, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookie) || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) throw new ApiError(400, 'Invalid OAuth state.');
  const { clientId, clientSecret, callback } = config(provider);
  await readyRedis();
  let raw: string | null;
  try { raw = await redis.getdel(`oauth:state:${hash(state)}`); } catch { throw new ApiError(503, 'OAuth is temporarily unavailable.'); }
  if (!raw) throw new ApiError(400, 'OAuth state expired or was already used.');
  let flow: Flow;
  try { flow = JSON.parse(raw) as Flow; } catch { throw new ApiError(400, 'Invalid OAuth state.'); }
  if (flow.provider !== provider || typeof flow.verifier !== 'string') throw new ApiError(400, 'Invalid OAuth state.');
  const tokenData = object(await requestJson(provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'ThinkWeave' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callback, code_verifier: flow.verifier, grant_type: 'authorization_code' }),
  }));
  if (typeof tokenData.access_token !== 'string' || !tokenData.access_token) throw new ApiError(401, 'OAuth authorization failed.');
  const data = await profile(provider, tokenData.access_token);
  if (!data.email || data.email.length > 254) throw new ApiError(403, 'A valid verified email is required.');
  const providerEnum = provider === 'google' ? OAuthProvider.GOOGLE : OAuthProvider.GITHUB;
  try {
    if (flow.sessionHash) {
      const session = await prisma.session.findUnique({ where: { refreshTokenHash: flow.sessionHash } });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, 'Session is invalid or expired.');
      const existing = await prisma.oAuthAccount.findUnique({ where: { provider_providerUserId: { provider: providerEnum, providerUserId: data.id } } });
      if (existing && existing.userId !== session.userId) throw new ApiError(409, 'This social account is linked to another user.');
      if (!existing) await prisma.oAuthAccount.create({ data: { provider: providerEnum, providerUserId: data.id, userId: session.userId } });
      return { userId: session.userId, linked: true };
    }
    const existing = await prisma.oAuthAccount.findUnique({ where: { provider_providerUserId: { provider: providerEnum, providerUserId: data.id } } });
    if (existing) return { userId: existing.userId, linked: false };
    const account = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: data.email } })) throw new ApiError(409, 'An account already uses this email. Log in and connect the provider from your account.');
      return tx.user.create({ data: { name: data.name || 'User', email: data.email, avatarUrl: data.avatar, oauthAccounts: { create: { provider: providerEnum, providerUserId: data.id } } }, select: { id: true } });
    });
    return { userId: account.id, linked: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'This email or social account is already in use.');
    throw error;
  }
}
