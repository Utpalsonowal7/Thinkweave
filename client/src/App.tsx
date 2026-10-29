import { useCallback, useEffect, useState, type ReactNode, lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { request } from './api';
import type { User } from './types';
import { Brand, Shell } from './components';
import { Auth } from './pages/Auth';
import { TokenPage, Forgot } from './pages/TokenPage';
import { Dashboard } from './pages/Dashboard';
import { WorkspacePage } from './pages/Workspace';
import { Settings } from './pages/Settings';
const Board = lazy(() => import('./Board').then((m) => ({ default: m.Board })));

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const result = await request<{ user: User }>('/api/v1/auth/me');
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  if (loading)
    return (
      <main className="center-screen">
        <div className="muted">Loading ThinkWeave…</div>
      </main>
    );
  const wrap = (node: ReactNode) =>
    user ? (
      <Shell user={user} reload={() => void reload()}>
        {node}
      </Shell>
    ) : (
      <Navigate to="/login" replace />
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Auth mode="login" reload={reload} />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/" replace /> : <Auth mode="register" reload={reload} />}
      />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/verify-email" element={<TokenPage kind="verify" reload={reload} />} />
      <Route path="/reset-password" element={<TokenPage kind="reset" reload={reload} />} />
      <Route
        path="/invitations/accept"
        element={
          user ? (
            <TokenPage kind="invite" reload={reload} />
          ) : (
            <main className="center-screen">
              <div className="simple-card">
                <Brand />
                <h2>Sign in to accept your invitation</h2>
                <p>After signing in, reopen the invitation link from your email.</p>
                <Link className="button primary" to="/login">
                  Sign in
                </Link>
              </div>
            </main>
          )
        }
      />
      <Route path="/" element={wrap(user && <Dashboard user={user} />)} />
      <Route path="/workspace/:workspaceId" element={wrap(user && <WorkspacePage user={user} />)} />
      <Route
        path="/board/:boardId"
        element={wrap(
          user && (
            <Suspense fallback={<p className="container">Loading board…</p>}>
              <Board user={user} />
            </Suspense>
          ),
        )}
      />
      <Route path="/settings" element={wrap(<Settings reload={reload} />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
