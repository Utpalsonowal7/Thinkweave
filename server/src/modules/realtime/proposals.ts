import * as Y from 'yjs';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { access } from '../boards/board.service.js';
import { taskList } from '../boards/ai.service.js';
import { loadRoom, enqueue, publish, releaseRoom } from './rooms.js';

// Persist the generated Yjs update and approval together. A lost HTTP response can
// be retried without adding the same tasks twice.
export async function reviewProposal(
  boardId: string,
  proposalId: string,
  userId: string,
  approve: boolean,
) {
  const { board } = await access(boardId, userId, true);
  const room = await loadRoom(boardId, board.epoch);
  try {
    return await enqueue(room, async () => {
      await access(boardId, userId, true);
      let update: Uint8Array | undefined;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
        const current = await tx.board.findUnique({
          where: { id: boardId },
          select: { epoch: true, archivedAt: true },
        });
        if (!current || current.archivedAt || current.epoch !== board.epoch)
          throw new ApiError(409, 'Board version changed. Reload the board.');
        const proposal = await tx.aIProposal.findFirst({
          where: { id: proposalId, boardId, requestedById: userId },
        });
        if (!proposal) throw new ApiError(404, 'Proposal not found.');
        const status = approve ? 'APPLIED' : 'REJECTED';
        if (proposal.status === status) return { status };
        if (proposal.status !== 'PENDING')
          throw new ApiError(409, 'This proposal has already been reviewed.');
        const data = proposal.proposal as { epoch?: unknown; tasks?: unknown };
        if (data.epoch !== board.epoch)
          throw new ApiError(
            409,
            'This proposal belongs to an older board version. Generate a new plan.',
          );
        if (approve) {
          const tasks = taskList(data.tasks);
          const next = new Y.Doc();
          try {
            Y.applyUpdate(next, Y.encodeStateAsUpdate(room.doc));
            const notes = next.getMap<Y.Map<unknown>>('notes');
            next.transact(() =>
              tasks.forEach((text, i) => {
                const note = new Y.Map<unknown>();
                note.set('text', text);
                note.set('x', 400 + (i % 3) * 230);
                note.set('y', 140 + Math.floor(i / 3) * 150);
                note.set('color', '#e5edff');
                notes.set(`${proposalId}:${i}`, note);
              }),
            );
            update = Y.encodeStateAsUpdate(next, Y.encodeStateVector(room.doc));
            await tx.boardUpdate.create({
              data: { boardId, epoch: board.epoch, payload: new Uint8Array(update) },
            });
          } finally {
            next.destroy();
          }
        }
        await tx.aIProposal.update({ where: { id: proposalId }, data: { status } });
        return { status };
      });
      if (update) {
        Y.applyUpdate(room.doc, update);
        await publish(room, boardId, board.epoch, update);
      }
      return result;
    });
  } finally {
    releaseRoom(boardId, board.epoch, room);
  }
}
