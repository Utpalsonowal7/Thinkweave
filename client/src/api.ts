const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export { API };
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
let refreshing: Promise<boolean> | null = null;
async function doRefresh(): Promise<boolean> {
  const execute = async () => {
    const r = await fetch(`${API}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return r.ok;
  };
  // Cookies are shared across tabs; serialize the request before reading them.
  if (navigator.locks) return navigator.locks.request('thinkweave-refresh', execute);
  // Without Web Locks, avoid accidentally revoking a session with parallel tabs.
  return false;
}
export async function refreshSession(): Promise<boolean> {
  if (!refreshing)
    refreshing = doRefresh()
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  canRefresh = true,
): Promise<T> {
  const result = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (result.status === 401 && canRefresh && (await refreshSession()))
    return request<T>(path, options, false);
  const json = await result.json().catch(() => ({}));
  if (!result.ok)
    throw new ApiError(
      typeof json.message === 'string' ? json.message : 'Request failed.',
      result.status,
    );
  return json.data as T;
}
export function post<T>(path: string, body: unknown = {}, canRefresh = true) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) }, canRefresh);
}
