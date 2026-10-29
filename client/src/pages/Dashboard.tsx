import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { post, request } from '../api';
import type { Membership, User } from '../types';
import { Message, errorText } from '../components';

export function Dashboard({ user }: { user: User }) {
  const [items, setItems] = useState<Membership[]>([]);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const load = useCallback(async () => {
    try {
      setItems(await request<Membership[]>('/api/v1/workspaces'));
    } catch (err) {
      setMessage(errorText(err));
    }
  }, []);
  useEffect(() => {
    if (user.emailVerifiedAt) void load();
  }, [load, user.emailVerifiedAt]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/api/v1/workspaces', { name });
      setName('');
      await load();
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  async function resend() {
    try {
      await post('/api/v1/auth/verification/request', { email: user.email });
      setMessage('If eligible, a verification email will be sent.');
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  return (
    <main className="container">
      <div className="page-head">
        <div>
          <span className="eyebrow">YOUR SPACE TO THINK</span>
          <h1>
            Welcome back, {user.name.split(' ')[0]}
            <span className="accent">.</span>
          </h1>
          <p className="muted">Gather your team and make room for good ideas.</p>
        </div>
        <div className="head-badge">
          ✳{' '}
          <span>
            Make space
            <br />
            for ideas.
          </span>
        </div>
      </div>
      <Message>{message}</Message>
      {!user.emailVerifiedAt ? (
        <section className="panel">
          <h2>Verify your email first</h2>
          <p>We sent a verification link to {user.email}. Verify it to access your workspaces.</p>
          <button className="button primary" onClick={resend}>
            Resend verification email
          </button>
        </section>
      ) : (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">THE BIG PICTURE</span>
              <h2>Your workspaces</h2>
            </div>
            <span className="count">{items.length} TOTAL</span>
          </div>
          <form className="create-bar" onSubmit={create}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder="Name your new workspace"
              aria-label="Workspace name"
            />
            <button className="button primary">+ Create workspace</button>
          </form>
          <div className="workspace-grid">
            {items.map((item, i) => (
              <Link
                key={item.workspace.id}
                to={`/workspace/${item.workspace.id}`}
                className="workspace-card"
              >
                <div className={`card-icon tone-${i % 3}`}>
                  {item.workspace.name.charAt(0).toUpperCase()}
                </div>
                <span className="card-arrow">↗</span>
                <h3>{item.workspace.name}</h3>
                <p className="muted">A space to think together.</p>
                <div className="card-foot">
                  <span>{item.role}</span>
                  <span>OPEN WORKSPACE →</span>
                </div>
              </Link>
            ))}
            <div className="empty-card">
              <span>✳</span>
              <strong>Ideas are better together.</strong>
              <p>Create a workspace, invite your team, and start your first board.</p>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
