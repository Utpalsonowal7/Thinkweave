import type { Socket } from 'socket.io';
import * as Y from 'yjs';
import { prisma } from '../../lib/prisma.js';
import { identity } from './session.js';
import { access } from '../boards/board.service.js';

export type Room = { doc: Y.Doc; members: Set<Socket>; queue: Promise<void> };
type Entry = { pending: Promise<Room>; leases: number };
const rooms = new Map<string, Entry>();
export async function loadRoom(boardId: string, epoch: number): Promise<Room> {
  const key = `${boardId}:${epoch}`;
  let entry = rooms.get(key);
  if (!entry) {
    const pending = (async () => {
      const doc = new Y.Doc();
      try {
        const updates = await prisma.boardUpdate.findMany({
          where: { boardId, epoch },
          select: { payload: true },
          orderBy: { id: 'asc' },
        });
        for (const update of updates) Y.applyUpdate(doc, update.payload);
        return { doc, members: new Set<Socket>(), queue: Promise.resolve() };
      } catch (error) {
        doc.destroy();
        throw error;
      }
    })();
    entry = { pending, leases: 0 };
    rooms.set(key, entry);
  }
  // Acquire before awaiting so eviction cannot destroy a room being opened.
  entry.leases++;
  try {
    return await entry.pending;
  } catch (error) {
    entry.leases--;
    if (rooms.get(key) === entry) rooms.delete(key);
    throw error;
  }
}
export function releaseRoom(boardId: string, epoch: number, room: Room): void {
  const entry = rooms.get(`${boardId}:${epoch}`);
  if (entry) entry.leases--;
  releaseEmpty(boardId, epoch, room);
}
export function enqueue<T>(room: Room, work: () => Promise<T>): Promise<T> {
  const task = room.queue.then(work);
  room.queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
export function releaseEmpty(boardId: string, epoch: number, room: Room): void {
  const key = `${boardId}:${epoch}`;
  const entry = rooms.get(key);
  if (!entry || entry.leases || room.members.size) return;
  const timer = setTimeout(() => {
    void enqueue(room, async () => {
      if (rooms.get(key) === entry && entry.leases === 0 && !room.members.size) {
        rooms.delete(key);
        room.doc.destroy();
      }
    });
  }, 60000);
  timer.unref();
}

export async function publish(
  room: Room,
  boardId: string,
  epoch: number,
  update: Uint8Array,
  except?: Socket,
) {
  for (const peer of room.members)
    if (peer !== except) {
      try {
        const user = await identity(peer);
        const current = await access(boardId, user.id);
        if (current.board.epoch !== epoch) throw new Error('Stale board');
        peer.emit('board:update', update);
      } catch {
        peer.disconnect(true);
      }
    }
}

export async function drainRooms(): Promise<void> {
  await Promise.all(
    [...rooms.values()].map(async (entry) => {
      const room = await entry.pending;
      await room.queue;
      room.doc.destroy();
    }),
  );
  rooms.clear();
}
