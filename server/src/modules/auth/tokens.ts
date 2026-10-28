import { SignJWT, jwtVerify } from 'jose';
import { ApiError } from '../../utils/api-error.js';

const issuer = 'thinkweave-api';
const audience = 'thinkweave-web';

export function accessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || !/^[0-9a-f]{64,}$/i.test(secret) || secret.length % 2 !== 0) throw new Error('JWT_ACCESS_SECRET must be at least 32 random bytes encoded as hex');
  return Buffer.from(secret, 'hex');
}

export async function signAccess(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId, token_use: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setIssuer(issuer).setAudience(audience)
    .setIssuedAt().setExpirationTime('15m').sign(accessSecret());
}

export async function verifyAccess(token: string): Promise<{ userId: string; sessionId: string }> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, accessSecret(), {
      algorithms: ['HS256'], issuer, audience, requiredClaims: ['sub', 'sid', 'exp', 'iat', 'token_use'], maxTokenAge: '15m',
    });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (protectedHeader.typ !== 'JWT' || payload.token_use !== 'access' || typeof payload.sub !== 'string' || !uuid.test(payload.sub) || typeof payload.sid !== 'string' || !uuid.test(payload.sid)) throw new Error('Invalid claims');
    return { userId: payload.sub, sessionId: payload.sid };
  } catch { throw new ApiError(401, 'Access token is invalid or expired.'); }
}
