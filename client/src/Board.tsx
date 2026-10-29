import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Background,
  Controls,
  ReactFlow,
  ViewportPortal,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { io, type Socket } from 'socket.io-client';
import { API, post, refreshSession, request } from './api';
import type { BoardAccess, User } from './types';

type Note = { text: string; x: number; y: number; color: string };
type Proposal = { id: string; tasks: string[] };
type Wire = { source: string; target: string };
type Ack = {
  ok: boolean;
  code?: string;
  state?: Uint8Array;
  vector?: Uint8Array;
  message?: string;
  role?: string;
};
const colors = ['#fff4c3', '#e5edff', '#e0f3e6', '#fbe6df'];
const localOrigin = 'thinkweave-local';

export function Board({ user }: { user: User }) {
  const { boardId = '' } = useParams();
  const navigate = useNavigate();
  const [access, setAccess] = useState<BoardAccess | null>(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [status, setStatus] = useState('Connecting');
  const [presence, setPresence] = useState(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<
    Array<{ id: string; createdAt: string; epoch: number }>
  >([]);
  const [cursors, setCursors] = useState<Record<string, { name: string; x: number; y: number }>>(
    {},
  );
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const cursorSent = useRef(0);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const docRef = useRef<Y.Doc | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const undoRef = useRef<Y.UndoManager | null>(null);
  const canEdit = access && access.role !== 'VIEWER' && !stale;
  const epoch = access?.board.epoch;
  useEffect(() => {
    let cancelled = false;
    setAccess(null);
    setError('');
    void request<BoardAccess>(`/api/v1/boards/${boardId}`)
      .then((result) => {
        if (!cancelled) setAccess(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);
  useEffect(() => {
    if (epoch === undefined) return;
    setStale(false);
    let disposed = false;
    let joined = false;
    let pending = 0;
    let failed = false;
    let generation = 0;
    let versionChanged = false;
    const doc = new Y.Doc();
    const notes = doc.getMap<Y.Map<unknown>>('notes');
    const wires = doc.getMap<Wire>('edges');
    const persistence = new IndexeddbPersistence(`thinkweave:${user.id}:${boardId}:${epoch}`, doc);
    const undo = new Y.UndoManager([notes, wires], { trackedOrigins: new Set([localOrigin]) });
    docRef.current = doc;
    undoRef.current = undo;
    function render() {
      const nextNodes: Node[] = [];
      notes.forEach((value, key) => {
        if (!(value instanceof Y.Map)) return;
        const n = value.toJSON() as Note;
        if (
          typeof n.text !== 'string' ||
          typeof n.x !== 'number' ||
          typeof n.y !== 'number' ||
          !Number.isFinite(n.x) ||
          !Number.isFinite(n.y)
        )
          return;
        nextNodes.push({
          id: key,
          position: { x: n.x, y: n.y },
          data: { label: n.text },
          style: {
            background:
              typeof n.color === 'string' && colors.includes(n.color) ? n.color : colors[0],
            border: '1px solid #d7d4c7',
            borderRadius: 12,
            padding: '18px',
            width: 190,
            minHeight: 90,
            fontSize: 14,
            textAlign: 'left',
            boxShadow: '0 4px 12px #1b1e1210',
          },
        });
      });
      const nextEdges: Edge[] = [];
      wires.forEach((w, key) => {
        if (w && typeof w.source === 'string' && typeof w.target === 'string')
          nextEdges.push({ id: key, source: w.source, target: w.target });
      });
      setNodes((previous) =>
        nextNodes.map((node) => ({
          ...node,
          selected: previous.find((old) => old.id === node.id)?.selected,
        })),
      );
      setEdges(nextEdges);
    }
    doc.on('update', render);
    render();
    const socket = io(API, {
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
    });
    socketRef.current = socket;
    const send = (update: Uint8Array) => {
      if (!socket.connected || !joined) {
        setStatus('Offline · unsynced changes');
        return;
      }
      const sentGeneration = generation;
      pending++;
      setStatus('Saving…');
      socket.timeout(10000).emit('board:update', update, (err: Error | null, reply?: Ack) => {
        if (disposed || sentGeneration !== generation) return;
        pending--;
        if (err || !reply?.ok) {
          failed = true;
          setStatus('Not synced · retry needed');
          setError(reply?.message || 'Could not save changes. Use Retry sync.');
        } else if (!failed && pending === 0) setStatus('All changes saved');
      });
    };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === localOrigin || origin === undo) send(update);
    };
    doc.on('update', onUpdate);
    socket.on('connect', () => {
      joined = false;
      generation++;
      pending = 0;
      failed = false;
      setStatus('Syncing…');
      socket
        .timeout(10000)
        .emit('board:join', { boardId, epoch }, (err: Error | null, reply?: Ack) => {
          if (disposed) return;
          if (reply?.code === 'STALE_VERSION') {
            versionChanged = true;
            setStale(true);
          }
          if (err || !reply?.ok || !reply.state) {
            setStatus('Could not connect');
            setError(reply?.message || 'Unable to join the board.');
            return;
          }
          Y.applyUpdate(doc, new Uint8Array(reply.state), 'remote');
          joined = true;
          if (reply.role)
            setAccess((previous) =>
              previous ? { ...previous, role: reply.role as BoardAccess['role'] } : previous,
            );
          if (reply.role !== 'VIEWER' && reply.vector) {
            const update = Y.encodeStateAsUpdate(doc, new Uint8Array(reply.vector));
            if (update.byteLength > 2) send(update);
            else setStatus('All changes saved');
          } else setStatus('Connected · view only');
        });
    });
    socket.on('board:update', (update: Uint8Array) => {
      try {
        Y.applyUpdate(doc, new Uint8Array(update), 'remote');
      } catch {
        setError('A board update could not be read.');
      }
    });
    socket.on('board:restored', () => {
      versionChanged = true;
      setStale(true);
      setStatus('Board restored · reload required');
      setError('This board was restored. Export any unsynced notes before reloading.');
    });
    socket.on('board:presence', (count: number) => setPresence(count));
    socket.on('board:cursor', (point: { id: string; name: string; x: number; y: number }) =>
      setCursors((current) => ({
        ...current,
        [point.id]: { name: point.name, x: point.x, y: point.y },
      })),
    );
    socket.on('board:cursor-leave', (id: string) =>
      setCursors((current) => {
        const copy = { ...current };
        delete copy[id];
        return copy;
      }),
    );
    socket.on('disconnect', (reason) => {
      joined = false;
      generation++;
      setCursors({});
      setStatus(versionChanged ? 'Board restored · reload required' : 'Offline · unsynced changes');
      if (reason === 'io server disconnect' && !versionChanged)
        void refreshSession().then((ok) => {
          if (ok && !disposed) socket.connect();
        });
    });
    socket.on('connect_error', async () => {
      setStatus('Reconnecting…');
      if (!socket.active && !versionChanged && (await refreshSession()) && !disposed)
        socket.connect();
    });
    void persistence.whenSynced
      .then(() => {
        if (!disposed) socket.connect();
      })
      .catch(() => {
        if (!disposed) {
          setError(
            'Local storage is unavailable. Offline edits cannot be recovered on this browser.',
          );
          socket.connect();
        }
      });
    return () => {
      disposed = true;
      doc.off('update', onUpdate);
      doc.off('update', render);
      socket.disconnect();
      undo.destroy();
      void persistence.destroy();
      doc.destroy();
      docRef.current = null;
      socketRef.current = null;
      undoRef.current = null;
    };
  }, [epoch, boardId, user.id]);
  const addNote = useCallback(
    (
      text = 'New idea',
      x = 100 + Math.random() * 300,
      y = 100 + Math.random() * 200,
      color = colors[0],
    ) => {
      const doc = docRef.current;
      if (!doc || !canEdit) return;
      const notes = doc.getMap<Y.Map<unknown>>('notes');
      doc.transact(() => {
        const note = new Y.Map<unknown>();
        note.set('text', text);
        note.set('x', x);
        note.set('y', y);
        note.set('color', color);
        notes.set(crypto.randomUUID(), note);
      }, localOrigin);
    },
    [canEdit],
  );
  function changeNote(key: string, field: string, value: unknown) {
    const doc = docRef.current;
    if (!doc || !canEdit) return;
    doc.transact(() => {
      doc.getMap<Y.Map<unknown>>('notes').get(key)?.set(field, value);
    }, localOrigin);
  }
  function deleteNotes() {
    const doc = docRef.current;
    if (!doc || !canEdit) return;
    doc.transact(() => {
      const notes = doc.getMap('notes');
      const wires = doc.getMap<Wire>('edges');
      selected.forEach((id) => notes.delete(id));
      selectedEdges.forEach((id) => wires.delete(id));
      wires.forEach((w, id) => {
        if (selected.includes(w.source) || selected.includes(w.target)) wires.delete(id);
      });
    }, localOrigin);
    setSelected([]);
    setSelectedEdges([]);
  }
  async function loadSnapshots() {
    try {
      setSnapshots(
        await request<Array<{ id: string; createdAt: string; epoch: number }>>(
          `/api/v1/boards/${boardId}/snapshots`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load history.');
    }
  }
  async function saveSnapshot() {
    try {
      await post(`/api/v1/boards/${boardId}/snapshots`);
      await loadSnapshots();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save snapshot.');
    }
  }
  async function restoreSnapshot(id: string) {
    if (
      !window.confirm(
        'Restore this snapshot? Connected users will need to reload. Offline edits from the current version will not be merged.',
      )
    )
      return;
    try {
      await post(`/api/v1/boards/${boardId}/snapshots/${id}/restore`);
      setStale(true);
      setStatus('Board restored · reload required');
      setError('Snapshot restored. Export any unsynced notes before reloading.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to restore snapshot.');
    }
  }
  function exportNotes() {
    const doc = docRef.current;
    if (!doc) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { notes: doc.getMap('notes').toJSON(), edges: doc.getMap('edges').toJSON() },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'thinkweave-board-export.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  async function retrySync() {
    const socket = socketRef.current;
    if (!socket || stale) return;
    setError('');
    setStatus('Reconnecting…');
    socket.disconnect();
    await refreshSession();
    socket.connect();
  }
  async function renameBoard() {
    const title = window.prompt('Board name', access?.board.title);
    if (!title?.trim()) return;
    try {
      const board = await post<BoardAccess['board']>(`/api/v1/boards/${boardId}/rename`, { title });
      setAccess((previous) => (previous ? { ...previous, board } : previous));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to rename board.');
    }
  }
  async function archiveBoard() {
    if (!window.confirm('Archive this board? It will disappear from your workspace.')) return;
    try {
      await post(`/api/v1/boards/${boardId}/archive`);
      navigate(`/workspace/${access?.board.workspaceId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to archive board.');
    }
  }
  function connect(c: Connection) {
    const doc = docRef.current;
    if (!doc || !canEdit || !c.source || !c.target || c.source === c.target) return;
    doc.transact(
      () =>
        doc
          .getMap<Wire>('edges')
          .set(crypto.randomUUID(), { source: c.source!, target: c.target! }),
      localOrigin,
    );
  }
  function nodeChanges(changes: NodeChange[]) {
    setNodes((current) => applyNodeChanges(changes, current));
    for (const change of changes)
      if (change.type === 'position' && change.position && change.dragging === false) {
        changeNote(change.id, 'x', change.position.x);
        changeNote(change.id, 'y', change.position.y);
      }
  }
  async function createProposal() {
    const doc = docRef.current;
    if (!doc) return;
    const map = doc.getMap<Y.Map<unknown>>('notes');
    const texts = selected
      .map((id) => map.get(id)?.get('text'))
      .filter((v): v is string => typeof v === 'string' && !!v.trim());
    if (!texts.length) {
      setError('Select one or more notes first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setProposal(await post<Proposal>(`/api/v1/boards/${boardId}/ai/proposal`, { notes: texts }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed.');
    } finally {
      setBusy(false);
    }
  }
  async function reviewProposal(approve: boolean) {
    if (!proposal || !canEdit) return;
    setBusy(true);
    try {
      await post(
        `/api/v1/boards/${boardId}/ai/proposals/${proposal.id}/${approve ? 'apply' : 'reject'}`,
      );
      setProposal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not review proposal.');
    } finally {
      setBusy(false);
    }
  }
  async function resumeProposal() {
    try {
      const plans = await request<Proposal[]>(`/api/v1/boards/${boardId}/ai/proposals`);
      if (plans[0]) setProposal(plans[0]);
      else setError('There are no pending plans for this board version.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load proposals.');
    }
  }
  if (error && !access)
    return (
      <main className="container">
        <Link to="/">← Workspaces</Link>
        <div className="notice">{error}</div>
      </main>
    );
  if (!access) return <main className="container">Loading board…</main>;
  const selectedNode = selected.length === 1 ? nodes.find((n) => n.id === selected[0]) : undefined;
  return (
    <main className="board-page">
      <div className="board-header">
        <div>
          <Link className="back" to={`/workspace/${access.board.workspaceId}`}>
            ← Workspace
          </Link>
          <h2>{access.board.title}</h2>
          <span className="board-meta">
            <span
              className={
                status.startsWith('All') || status.startsWith('Connected') ? 'dot online' : 'dot'
              }
            />
            {status} · {presence} online · {access.role.toLowerCase()}
          </span>
        </div>
        <div className="toolbar">
          {stale && (
            <button className="button secondary" onClick={() => window.location.reload()}>
              Reload board
            </button>
          )}
          {!stale &&
            (status.startsWith('Not synced') ||
              status.startsWith('Could not') ||
              status.startsWith('Offline')) && (
              <button className="button secondary" onClick={retrySync}>
                Retry sync
              </button>
            )}
          <button className="button secondary" disabled={!canEdit} onClick={renameBoard}>
            Rename
          </button>
          {(access.role === 'OWNER' || access.role === 'ADMIN') && (
            <button className="button secondary" onClick={archiveBoard}>
              Archive
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => undoRef.current?.undo()}
            disabled={!canEdit}
          >
            ↶ Undo
          </button>
          <button
            className="button secondary"
            onClick={() => undoRef.current?.redo()}
            disabled={!canEdit}
          >
            ↷ Redo
          </button>
          <button className="button primary" onClick={() => addNote()} disabled={!canEdit}>
            + Add note
          </button>
        </div>
      </div>
      {error && (
        <div className="board-error" role="alert">
          {error}{' '}
          <button aria-label="Dismiss message" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      <div className="board-layout">
        <div
          className="flow"
          onMouseMove={(e) => {
            const now = Date.now();
            if (!instance || now - cursorSent.current < 150 || !socketRef.current?.connected)
              return;
            cursorSent.current = now;
            socketRef.current.emit(
              'board:cursor',
              instance.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
            );
          }}
        >
          <ReactFlow
            onInit={setInstance}
            nodes={nodes}
            edges={edges}
            onNodesChange={nodeChanges}
            onConnect={connect}
            onSelectionChange={({ nodes: selectedNodes, edges: pickedEdges }) => {
              setSelected(selectedNodes.map((n) => n.id));
              setSelectedEdges(pickedEdges.map((e) => e.id));
            }}
            nodesDraggable={!!canEdit}
            nodesConnectable={!!canEdit}
            elementsSelectable
            fitView
            deleteKeyCode={null}
          >
            <Background gap={22} size={1} color="#d6d9d1" />
            <Controls />
            <ViewportPortal>
              {Object.entries(cursors).map(([id, point]) => (
                <div
                  key={id}
                  className="remote-cursor"
                  style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
                >
                  <span>➤</span>
                  <b>{point.name}</b>
                </div>
              ))}
            </ViewportPortal>
          </ReactFlow>
          <div className="board-tip">
            ✳ Click a note to select it. Drag between handles to connect.
          </div>
        </div>
        <aside className="board-sidebar">
          <span className="eyebrow">YOUR THINKING SPACE</span>
          <h2>{selectedNode ? 'Edit note' : 'Make a little room.'}</h2>
          {selectedNode ? (
            <>
              <label>
                Note
                <textarea
                  maxLength={1000}
                  value={String(selectedNode.data.label ?? '')}
                  disabled={!canEdit}
                  onChange={(e) => changeNote(selectedNode.id, 'text', e.target.value)}
                />
              </label>
              <button className="text-button danger" disabled={!canEdit} onClick={deleteNotes}>
                Delete selected note
              </button>
            </>
          ) : (
            <p className="muted">
              Add a note, move it around, and connect your ideas. Select notes to create a plan.
            </p>
          )}
          {(selected.length > 1 || selectedEdges.length > 0) && (
            <button className="text-button danger" disabled={!canEdit} onClick={deleteNotes}>
              Delete selection
            </button>
          )}
          <div className="sidebar-rule" />
          <h3>Board history</h3>
          <p className="muted">Save a checkpoint before making big changes.</p>
          <div className="history-actions">
            <button
              className="button secondary"
              onClick={saveSnapshot}
              disabled={!canEdit || status !== 'All changes saved'}
            >
              Save snapshot
            </button>
            <button className="button secondary" onClick={loadSnapshots}>
              View history
            </button>
          </div>
          <button className="text-button" onClick={exportNotes}>
            Export local notes
          </button>
          {snapshots.map((snapshot) => (
            <div className="snapshot" key={snapshot.id}>
              <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
              {(access.role === 'OWNER' || access.role === 'ADMIN') && (
                <button className="text-button" onClick={() => restoreSnapshot(snapshot.id)}>
                  Restore
                </button>
              )}
            </div>
          ))}
          <div className="sidebar-rule" />
          <div className="ai-icon">✳</div>
          <h3>Turn ideas into a plan.</h3>
          <p className="muted">Select notes, and Gemini will suggest tasks for you to review.</p>
          <button
            className="button primary full"
            onClick={createProposal}
            disabled={!canEdit || busy || !selected.length}
          >
            {busy ? 'Thinking…' : '✳ Generate task plan'}
          </button>
          <button className="text-button" onClick={resumeProposal} disabled={!canEdit}>
            Review a pending plan
          </button>
          <small>
            Selected notes are sent to Gemini. Suggestions are added only after approval while
            connected.
          </small>
        </aside>
      </div>
      {proposal && (
        <div className="modal-bg">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Review AI task plan">
            <span className="eyebrow">GEMINI PROPOSAL</span>
            <h2>A plan to get started.</h2>
            <p className="muted">Review these suggestions before adding them to your board.</p>
            <ol>
              {proposal.tasks.map((task, i) => (
                <li key={i}>{task}</li>
              ))}
            </ol>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setProposal(null)}
              >
                Review later
              </button>
              <button
                className="button secondary"
                disabled={busy || !canEdit}
                onClick={() => reviewProposal(false)}
              >
                Discard
              </button>
              <button
                className="button primary"
                disabled={busy || !canEdit || status !== 'All changes saved'}
                onClick={() => reviewProposal(true)}
              >
                {busy ? 'Saving…' : 'Add tasks to board'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
