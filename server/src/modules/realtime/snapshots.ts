import * as Y from 'yjs';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { access } from '../boards/board.service.js';
import { loadRoom, enqueue, releaseRoom } from './rooms.js';

// Snapshot operations share the same queue as edits so the recorded state is consistent.
export async function createSnapshot(boardId: string, userId: string) {
  const { board } = await access(boardId, userId, true);
  const room = await loadRoom(boardId, board.epoch);
  try {
    return await enqueue(room, async () =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
        const current = await tx.board.findUnique({
          where: { id: boardId },
          select: { epoch: true, archivedAt: true },
        });
        if (!current || current.archivedAt || current.epoch !== board.epoch)
          throw new ApiError(409, 'Board version changed. Reload the board.');
        const latest = await tx.boardUpdate.findFirst({
          where: { boardId, epoch: board.epoch },
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        return tx.boardSnapshot.create({
          data: {
            boardId,
            epoch: board.epoch,
            state: new Uint8Array(Y.encodeStateAsUpdate(room.doc)),
            lastUpdateId: latest?.id ?? null,
          },
          select: { id: true, createdAt: true, epoch: true },
        });
      }),
    );
  } finally {
    releaseRoom(boardId, board.epoch, room);
  }
}

export async function restoreSnapshot(boardId: string, snapshotId: string, userId: string) {
  const { board, role } = await access(boardId, userId);
  if (role !== 'OWNER' && role !== 'ADMIN')
    throw new ApiError(403, 'Only an owner or admin can restore a snapshot.');
  const snapshot = await prisma.boardSnapshot.findFirst({
    where: { id: snapshotId, boardId },
    select: { state: true },
  });
  if (!snapshot) throw new ApiError(404, 'Snapshot not found.');
  const check = new Y.Doc();
  try {
    Y.applyUpdate(check, snapshot.state);
  } catch {
    throw new ApiError(500, 'Snapshot is invalid.');
  } finally {
    check.destroy();
  }
  const room = await loadRoom(boardId, board.epoch);
  try {
    return await enqueue(room, async () => {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
        const current = await tx.board.findUnique({
          where: { id: boardId },
          select: { epoch: true, archivedAt: true },
        });
        if (!current || current.archivedAt || current.epoch !== board.epoch)
          throw new ApiError(409, 'Board version changed. Reload the board.');
        const next = await tx.board.update({
          where: { id: boardId },
          data: { epoch: { increment: 1 } },
          select: { epoch: true },
        });
        await tx.boardUpdate.create({
          data: { boardId, epoch: next.epoch, payload: new Uint8Array(snapshot.state) },
        });
        return next;
      });
      for (const peer of [...room.members]) {
        peer.emit('board:restored');
        peer.disconnect(true);
      }
      return updated;
    });
  } finally {
    releaseRoom(boardId, board.epoch, room);
  }
}
