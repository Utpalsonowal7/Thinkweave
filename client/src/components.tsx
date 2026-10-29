import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from './api';
import type { User } from './types';

export function Message({ children }: { children: ReactNode }) {
  return children ? (
    <div className="notice" role="status">
      {children}
    </div>
  ) : null;
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
export function Brand() {
  return (
    <Link className="brand" to="/">
      <span className="brandmark">✳</span> thinkweave<span className="brand-dot">.</span>
    </Link>
  );
}
export function Shell({
  children,
  user,
  reload,
}: {
  children: ReactNode;
  user: User;
  reload: () => void;
}) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  async function logout() {
    try {
      await post('/api/v1/auth/logout');
      reload();
      navigate('/login');
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav>
          <Link to="/">Workspaces</Link>
          <Link to="/settings">Settings</Link>
          <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
          <button className="text-button" onClick={logout}>
            Log out
          </button>
        </nav>
      </header>
      <Message>{message}</Message>
      {children}
    </>
  );
}
