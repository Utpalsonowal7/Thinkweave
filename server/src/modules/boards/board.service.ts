import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { editors, membership } from '../workspaces/workspace.service.js';

export async function access(boardId: string, userId: string, write = false) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, title: true, workspaceId: true, epoch: true, archivedAt: true },
  });
  if (!board || board.archivedAt) throw new ApiError(404, 'Board not found.');
  const member = await membership(board.workspaceId, userId, write ? editors : undefined);
  return { board, role: member.role };
}
export async function list(workspaceId: string, userId: string) {
  await membership(workspaceId, userId);
  return prisma.board.findMany({
    where: { workspaceId, archivedAt: null },
    select: { id: true, title: true, description: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}
export async function create(workspaceId: string, userId: string, title: string) {
  await membership(workspaceId, userId, editors);
  return prisma.board.create({
    data: { workspaceId, createdById: userId, title },
    select: { id: true, title: true, workspaceId: true, epoch: true },
  });
}
export async function rename(boardId: string, userId: string, title: string) {
  await access(boardId, userId, true);
  return prisma.board.update({
    where: { id: boardId },
    data: { title },
    select: { id: true, title: true, workspaceId: true, epoch: true },
  });
}
export async function archive(boardId: string, userId: string) {
  const { board } = await access(boardId, userId);
  await membership(board.workspaceId, userId, ['OWNER', 'ADMIN']);
  await prisma.board.update({ where: { id: boardId }, data: { archivedAt: new Date() } });
}
