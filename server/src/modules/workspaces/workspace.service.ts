import { randomBytes, createHash } from 'node:crypto';
import { WorkspaceRole, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { sendAuthEmail } from '../../lib/mailer.js';
import { ApiError } from '../../utils/api-error.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value))
    throw new ApiError(400, 'Invalid identifier.');
  return value;
}
export function text(value: unknown, label: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new ApiError(400, `${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
export async function membership(workspaceId: string, userId: string, roles?: WorkspaceRole[]) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member || (roles && !roles.includes(member.role)))
    throw new ApiError(403, 'You do not have access to this workspace.');
  return member;
}
export const editors: WorkspaceRole[] = ['OWNER', 'ADMIN', 'EDITOR'];
export const managers: WorkspaceRole[] = ['OWNER', 'ADMIN'];
export async function list(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true, createdAt: true } },
    },
    orderBy: { joinedAt: 'desc' },
  });
}
export async function create(userId: string, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'workspace';
  const slug = `${base}-${randomBytes(5).toString('hex')}`;
  return prisma.workspace.create({
    data: { name, slug, members: { create: { userId, role: 'OWNER' } } },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
}
export async function members(workspaceId: string, userId: string) {
  await membership(workspaceId, userId);
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      id: true,
      userId: true,
      role: true,
      joinedAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });
}
export async function invite(
  workspaceId: string,
  inviterId: string,
  emailInput: unknown,
  roleInput: unknown,
) {
  await membership(workspaceId, inviterId, managers);
  const email = text(emailInput, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Invalid email.');
  if (roleInput !== 'EDITOR' && roleInput !== 'VIEWER')
    throw new ApiError(400, 'Invitation role must be EDITOR or VIEWER.');
  const sender = process.env.EMAIL_FROM,
    key = process.env.BREVO_API_KEY,
    origin = process.env.APP_ORIGIN;
  if (!sender || !key || !origin) throw new ApiError(503, 'Invitation email is not configured.');
  const url = new URL('/invitations/accept', origin);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      invitedById: inviterId,
      email,
      role: roleInput,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
    select: { id: true },
  });
  url.hash = new URLSearchParams({ token }).toString();
  try {
    await sendAuthEmail(email, 'Invitation to a ThinkWeave workspace', url.toString());
  } catch {
    await prisma.workspaceInvitation.delete({ where: { id: invitation.id } });
    throw new ApiError(503, 'Could not send the invitation.');
  }
}
export async function accept(userId: string, token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(400, 'Invalid invitation.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    const invite = await tx.workspaceInvitation.findUnique({ where: { tokenHash } });
    if (
      !user?.emailVerifiedAt ||
      !invite ||
      invite.email !== user.email ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt <= new Date()
    )
      throw new ApiError(400, 'Invitation is invalid, expired, or belongs to another account.');
    const consumed = await tx.workspaceInvitation.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (consumed.count !== 1) throw new ApiError(400, 'Invitation is invalid or already used.');
    try {
      await tx.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId, role: invite.role },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ApiError(409, 'Already a workspace member.');
      throw e;
    }
    return { workspaceId: invite.workspaceId };
  });
}
export async function changeMember(
  workspaceId: string,
  actorId: string,
  targetId: string,
  role: unknown,
  remove = false,
) {
  const actor = await membership(workspaceId, actorId, managers);
  const target = await membership(workspaceId, targetId);
  if (target.userId === actorId || target.role === 'OWNER')
    throw new ApiError(403, 'The owner and your own membership cannot be changed here.');
  if (actor.role !== 'OWNER' && target.role === 'ADMIN')
    throw new ApiError(403, 'Only the owner can manage admins.');
  if (remove) {
    await prisma.workspaceMember.delete({ where: { id: target.id } });
    return;
  }
  if (role !== 'ADMIN' && role !== 'EDITOR' && role !== 'VIEWER')
    throw new ApiError(400, 'Invalid role.');
  if (role === 'ADMIN' && actor.role !== 'OWNER')
    throw new ApiError(403, 'Only the owner can assign admins.');
  await prisma.workspaceMember.update({ where: { id: target.id }, data: { role } });
}
