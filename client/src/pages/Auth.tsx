import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { API, post } from '../api';
import { Brand, Message, errorText } from '../components';

export function Auth({
  mode,
  reload,
}: {
  mode: 'login' | 'register';
  reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const route = useLocation();
  const [message, setMessage] = useState(
    typeof route.state?.message === 'string' ? route.state.message : '',
  );
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const payload = {
        email: form.get('email'),
        password: form.get('password'),
        ...(mode === 'register' ? { name: form.get('name') } : {}),
      };
      await post(`/api/v1/auth/${mode}`, payload, false);
      if (mode === 'register') {
        navigate('/login', {
          state: { message: 'Account created. Check your email to verify it, then log in.' },
        });
      } else {
        await reload();
        navigate('/');
      }
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <div className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
          <h1>
            Good ideas
            <br />
            grow <em>together.</em>
          </h1>
          <p>
            A calmer place for your team to think, connect ideas, and turn the messy middle into a
            plan.
          </p>
          <div className="story-notes">
            <span>01 / Capture ideas</span>
            <span>02 / Connect the dots</span>
            <span>03 / Make it happen</span>
          </div>
        </div>
        <small>Built for thoughtful teams, everywhere.</small>
      </div>
      <div className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">WELCOME TO THINKWEAVE</span>
          <h2>{mode === 'login' ? 'Welcome back.' : 'Start creating.'}</h2>
          <p className="muted">
            {mode === 'login'
              ? 'Sign in to pick up where you left off.'
              : 'Create your account and bring your ideas together.'}
          </p>
          <Message>{message}</Message>
          <form onSubmit={submit} className="stack">
            {mode === 'register' && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Utpal Sonowal"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                placeholder="At least 12 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            {mode === 'login' && (
              <Link className="subtle-link" to="/forgot-password">
                Forgot password?
              </Link>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'One moment…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>
          <div className="divider">
            <span>or continue with</span>
          </div>
          <div className="socials">
            <a className="button secondary" href={`${API}/api/v1/auth/oauth/google`}>
              Google ↗
            </a>
            <a className="button secondary" href={`${API}/api/v1/auth/oauth/github`}>
              GitHub ↗
            </a>
          </div>
          <p className="auth-footer">
            {mode === 'login' ? 'New to ThinkWeave?' : 'Already have an account?'}{' '}
            <Link to={mode === 'login' ? '/register' : '/login'}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
