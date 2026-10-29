import type { Socket } from 'socket.io';
import { prisma } from '../../lib/prisma.js';
import { accessCookieName } from '../auth/cookies.js';
import { verifyAccess } from '../auth/tokens.js';

function cookie(header: string | undefined, name: string): string {
  const matches = (header ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`));
  if (matches.length !== 1) throw new Error('Authentication required');
  return matches[0]!.slice(name.length + 1);
}
export async function identity(socket: Socket) {
  const claims = await verifyAccess(cookie(socket.handshake.headers.cookie, accessCookieName));
  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    include: { user: { select: { id: true, name: true, emailVerifiedAt: true } } },
  });
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.user.emailVerifiedAt
  )
    throw new Error('Session invalid');
  return session.user;
}
