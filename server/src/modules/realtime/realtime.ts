import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import * as Y from 'yjs';
import { prisma } from '../../lib/prisma.js';
import { identity } from './session.js';
import { loadRoom, enqueue, releaseEmpty, releaseRoom, publish, type Room } from './rooms.js';
import { access } from '../boards/board.service.js';
import { id } from '../workspaces/workspace.service.js';

const maxUpdateBytes = 256 * 1024;

export function attachRealtime(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: process.env.APP_ORIGIN, credentials: true },
    allowRequest: (req, callback) =>
      callback(null, !!process.env.APP_ORIGIN && req.headers.origin === process.env.APP_ORIGIN),
    maxHttpBufferSize: maxUpdateBytes,
    transports: ['websocket'],
  });
  io.use(async (socket, next) => {
    try {
      await identity(socket);
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket) => {
    let active: { id: string; epoch: number; room: Room } | undefined;
    let joining = false;
    let cursorAt = 0;
    let updateWindow = Date.now();
    let updateCount = 0;
    socket.on('board:join', async (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      try {
        if (active || joining) throw new Error('Already joined');
        joining = true;
        if (!input || typeof input !== 'object') throw new Error('Invalid board request');
        const payload = input as { boardId?: unknown; epoch?: unknown };
        const boardId = id(payload.boardId);
        const user = await identity(socket);
        const info = await access(boardId, user.id);
        if (payload.epoch !== info.board.epoch) {
          ack({
            ok: false,
            code: 'STALE_VERSION',
            message: 'Board was restored. Export unsynced notes before reloading.',
          });
          return;
        }
        const room = await loadRoom(boardId, info.board.epoch);
        try {
          await enqueue(room, async () => {
            const latest = await access(boardId, user.id);
            if (latest.board.epoch !== payload.epoch) {
              ack({
                ok: false,
                code: 'STALE_VERSION',
                message: 'Board was restored. Export unsynced notes before reloading.',
              });
              return;
            }
            if (!socket.connected) return;
            active = { id: boardId, epoch: info.board.epoch, room };
            room.members.add(socket);
            ack({
              ok: true,
              state: Y.encodeStateAsUpdate(room.doc),
              vector: Y.encodeStateVector(room.doc),
              role: latest.role,
              user: { id: user.id, name: user.name },
            });
            for (const member of room.members) member.emit('board:presence', room.members.size);
          });
        } finally {
          releaseRoom(boardId, info.board.epoch, room);
        }
      } catch {
        ack({ ok: false, message: 'Unable to join this board.' });
      } finally {
        joining = false;
      }
    });
    socket.on('board:update', (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function' || !active) return;
      if (Date.now() - updateWindow > 10000) {
        updateWindow = Date.now();
        updateCount = 0;
      }
      if (++updateCount > 120) {
        ack({ ok: false, message: 'Too many edits. Wait a few seconds, then retry sync.' });
        return;
      }
      const { id: boardId, epoch, room } = active;
      void enqueue(room, async () => {
        try {
          let user;
          try {
            user = await identity(socket);
          } catch {
            ack({ ok: false, message: 'Session expired. Reconnecting…' });
            socket.disconnect(true);
            return;
          }
          await access(boardId, user.id, true);
          if (
            !(input instanceof Uint8Array) ||
            input.byteLength < 1 ||
            input.byteLength > maxUpdateBytes
          )
            throw new Error('Invalid update');
          const check = new Y.Doc();
          try {
            Y.applyUpdate(check, input);
          } finally {
            check.destroy();
          }
          await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
            const board = await tx.board.findUnique({
              where: { id: boardId },
              select: { epoch: true, archivedAt: true },
            });
            if (!board || board.epoch !== epoch || board.archivedAt)
              throw new Error('Board version changed');
            await tx.boardUpdate.create({
              data: { boardId, epoch, payload: new Uint8Array(input) },
            });
          });
          Y.applyUpdate(room.doc, input);
          await publish(room, boardId, epoch, input, socket);
          ack({ ok: true });
        } catch {
          ack({ ok: false, message: 'Update was not saved. Check your session or access.' });
        }
      });
    });
    socket.on('board:cursor', async (point: unknown) => {
      if (!active || !point || typeof point !== 'object' || Date.now() - cursorAt < 120) return;
      cursorAt = Date.now();
      const { x, y } = point as { x?: unknown; y?: unknown };
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        Math.abs(x) > 100000 ||
        Math.abs(y) > 100000
      )
        return;
      try {
        const user = await identity(socket);
        const latest = await access(active.id, user.id);
        if (latest.board.epoch !== active.epoch) throw new Error('Stale board');
        for (const peer of active.room.members)
          if (peer !== socket) {
            try {
              const other = await identity(peer);
              await access(active.id, other.id);
              peer.emit('board:cursor', { id: socket.id, name: user.name.slice(0, 40), x, y });
            } catch {
              peer.disconnect(true);
            }
          }
      } catch {
        socket.disconnect(true);
      }
    });
    socket.on('disconnect', () => {
      if (!active) return;
      const { id: boardId, epoch, room } = active;
      room.members.delete(socket);
      for (const member of room.members) member.emit('board:cursor-leave', socket.id);
      for (const member of room.members) member.emit('board:presence', room.members.size);
      if (!room.members.size) void enqueue(room, async () => releaseEmpty(boardId, epoch, room));
    });
  });
  return io;
}
