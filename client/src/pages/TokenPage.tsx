import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { post } from '../api';
import { Brand, Message, errorText } from '../components';

export function TokenPage({
  kind,
  reload,
}: {
  kind: 'verify' | 'reset' | 'invite';
  reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
  useEffect(() => {
    if (location.hash) history.replaceState(null, '', location.pathname);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      if (kind === 'verify') {
        await post('/api/v1/auth/verification/confirm', { token }, false);
        await reload();
      }
      if (kind === 'reset')
        await post('/api/v1/auth/password/reset', { token, password: data.get('password') }, false);
      if (kind === 'invite') await post('/api/v1/workspaces/invitations/accept', { token });
      setMessage(
        kind === 'invite'
          ? 'Invitation accepted. Opening your workspaces…'
          : kind === 'verify'
            ? 'Email verified. You can now sign in.'
            : 'Password updated. Please sign in again.',
      );
      if (kind === 'invite') navigate('/');
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  return (
    <main className="center-screen">
      <div className="simple-card">
        <Brand />
        <h2>
          {kind === 'verify'
            ? 'Verify your email'
            : kind === 'reset'
              ? 'Choose a new password'
              : 'Join your workspace'}
        </h2>
        <p className="muted">
          {token ? 'Complete the action below.' : 'This link does not contain a token.'}
        </p>
        <Message>{message}</Message>
        <form onSubmit={submit} className="stack">
          {kind === 'reset' && (
            <label>
              New password
              <input name="password" type="password" minLength={12} maxLength={128} required />
            </label>
          )}
          <button className="button primary" disabled={!token}>
            {kind === 'verify'
              ? 'Verify email'
              : kind === 'reset'
                ? 'Reset password'
                : 'Accept invitation'}
          </button>
        </form>
        <p>
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    </main>
  );
}
export function Forgot() {
  const [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await post(
        '/api/v1/auth/password/forgot',
        { email: new FormData(e.currentTarget).get('email') },
        false,
      );
      setMessage('If the account is eligible, an email will be sent.');
    } catch (err) {
      setMessage(errorText(err));
    }
  }
  return (
    <main className="center-screen">
      <div className="simple-card">
        <Brand />
        <h2>Reset your password</h2>
        <p className="muted">We’ll email you a secure reset link.</p>
        <Message>{message}</Message>
        <form onSubmit={submit} className="stack">
          <label>
            Email address
            <input name="email" type="email" required />
          </label>
          <button className="button primary">Send reset link</button>
        </form>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
