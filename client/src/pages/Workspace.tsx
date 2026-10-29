import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { post, request } from '../api';
import type { BoardInfo, User } from '../types';
import { Message, errorText } from '../components';

export function WorkspacePage({ user }: { user: User }) {
  const { workspaceId = '' } = useParams();
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [members, setMembers] = useState<
    Array<{ userId: string; role: string; user: { name: string; email: string } }>
  >([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([
        request<BoardInfo[]>(`/api/v1/workspaces/${workspaceId}/boards`),
        request<typeof members>(`/api/v1/workspaces/${workspaceId}/members`),
      ]);
      setBoards(b);
      setMembers(m);
    } catch (e) {
      setMessage(errorText(e));
    }
  }, [workspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await post(`/api/v1/workspaces/${workspaceId}/boards`, { title });
      setTitle('');
      await load();
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  const actorRole = members.find((m) => m.userId === user.id)?.role;
  async function changeMember(userId: string, action: string, role?: string) {
    try {
      await post(
        `/api/v1/workspaces/${workspaceId}/members/${userId}/${action}`,
        role ? { role } : {},
      );
      await load();
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      await post(`/api/v1/workspaces/${workspaceId}/invitations`, {
        email: data.get('email'),
        role: data.get('role'),
      });
      form.reset();
      setMessage('Invitation sent.');
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  return (
    <main className="container">
      <Link className="back" to="/">
        ← All workspaces
      </Link>
      <div className="page-head compact">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>
            Ideas in motion<span className="accent">.</span>
          </h1>
          <p className="muted">A shared home for everything you’re working on.</p>
        </div>
      </div>
      <Message>{message}</Message>
      <div className="workspace-layout">
        <section>
          <div className="section-head">
            <div>
              <span className="eyebrow">YOUR CANVASES</span>
              <h2>Boards</h2>
            </div>
            <span className="count">{boards.length} TOTAL</span>
          </div>
          {actorRole && actorRole !== 'VIEWER' && (
            <form className="create-bar" onSubmit={create}>
              <input
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your board a name"
              />
              <button className="button primary">+ Create board</button>
            </form>
          )}
          <div className="board-list">
            {boards.map((b, i) => (
              <Link className="board-row" to={`/board/${b.id}`} key={b.id}>
                <span className={`board-icon tone-${i % 3}`}>▦</span>
                <div>
                  <strong>{b.title}</strong>
                  <small>Open collaborative board</small>
                </div>
                <span className="row-arrow">↗</span>
              </Link>
            ))}
            {!boards.length && (
              <div className="empty-state">No boards yet. Start with the first idea.</div>
            )}
          </div>
        </section>
        <aside className="side-panel">
          <span className="eyebrow">BETTER TOGETHER</span>
          <h2>Your team</h2>
          <p className="muted">Invite people to think alongside you.</p>
          <div className="member-list">
            {members.map((m) => (
              <div className="member" key={m.userId}>
                <span className="avatar">{m.user.name.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{m.user.name}</strong>
                  <small>{m.role}</small>
                </div>
                {m.userId !== user.id &&
                  m.role !== 'OWNER' &&
                  (actorRole === 'OWNER' || (actorRole === 'ADMIN' && m.role !== 'ADMIN')) && (
                    <div className="member-actions">
                      <select
                        aria-label={`Role for ${m.user.name}`}
                        value={m.role}
                        onChange={(e) => void changeMember(m.userId, 'role', e.target.value)}
                      >
                        <option>EDITOR</option>
                        <option>VIEWER</option>
                        {actorRole === 'OWNER' && <option>ADMIN</option>}
                      </select>
                      <button
                        className="text-button danger"
                        onClick={() => {
                          if (window.confirm(`Remove ${m.user.name}?`))
                            void changeMember(m.userId, 'remove');
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
          {(actorRole === 'OWNER' || actorRole === 'ADMIN') && (
            <form onSubmit={invite} className="stack">
              <label>
                Invite by email
                <input type="email" name="email" placeholder="teammate@example.com" required />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </label>
              <button className="button secondary">Send invitation →</button>
            </form>
          )}
        </aside>
      </div>
    </main>
  );
}
