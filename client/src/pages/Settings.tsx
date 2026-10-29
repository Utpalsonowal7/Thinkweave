import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { post, request } from '../api';
import { Message, errorText } from '../components';

export function Settings({ reload }: { reload: () => Promise<void> }) {
  type Session = {
    id: string;
    userAgent: string | null;
    current: boolean;
    createdAt: string;
    expiresAt: string;
  };
  const [items, setItems] = useState<Session[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      setItems((await request<{ sessions: Session[] }>('/api/v1/auth/sessions')).sessions);
    } catch (e) {
      setMessage(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(id: string, current: boolean) {
    try {
      await post(`/api/v1/auth/sessions/${id}/revoke`);
      if (current) await reload();
      else await load();
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  async function link(provider: string) {
    try {
      const data = await post<{ authorizationUrl: string }>(`/api/v1/auth/oauth/${provider}/link`);
      location.assign(data.authorizationUrl);
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  return (
    <main className="container narrow">
      <Link className="back" to="/">
        ← Back to workspaces
      </Link>
      <div className="section-head">
        <div>
          <span className="eyebrow">ACCOUNT</span>
          <h1>
            Settings<span className="accent">.</span>
          </h1>
        </div>
      </div>
      <Message>{message}</Message>
      <section className="panel">
        <h2>Connected accounts</h2>
        <p className="muted">Connect a social account to your existing ThinkWeave account.</p>
        <div className="socials">
          <button className="button secondary" onClick={() => link('google')}>
            Connect Google ↗
          </button>
          <button className="button secondary" onClick={() => link('github')}>
            Connect GitHub ↗
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Active sessions</h2>
        <p className="muted">Sign out of devices you don’t recognize.</p>
        {items.map((s) => (
          <div className="session-row" key={s.id}>
            <div>
              <strong>{s.current ? 'This session' : 'Other session'}</strong>
              <small>
                {s.userAgent || 'Unknown device'} · Created{' '}
                {new Date(s.createdAt).toLocaleDateString()}
              </small>
            </div>
            <button className="text-button" onClick={() => revoke(s.id, s.current)}>
              Revoke
            </button>
          </div>
        ))}
      </section>
    </main>
  );
}
