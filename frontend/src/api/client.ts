import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL + "/api",
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Auto-refresh on 401 ──────────────────────────────────────────────────
//
// The access token is short-lived (15 min). When it expires mid-session,
// every subsequent call would otherwise fail with 401. This interceptor
// catches that, silently exchanges the long-lived refresh-token cookie for
// a fresh access token via /auth/refresh-token, and retries the original
// request once. On refresh failure we wipe local auth state and bounce the
// user to /login.
//
// Concurrency: if N requests fire simultaneously after expiry, we want ONE
// refresh round-trip, not N. `refreshPromise` is the in-flight refresh —
// every caught 401 awaits the same promise and re-issues its own request
// with whichever token it produces.

let refreshPromise: Promise<string> | null = null;

const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return url.includes('/auth/refresh-token') || url.includes('/auth/login');
};

const logoutAndRedirect = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  // Hard reload so every context resets cleanly; ProtectedRoute will then
  // bounce to /login because AuthProvider's restoreSession sees no session.
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

const performRefresh = async (): Promise<string> => {
  // Use a bare axios call so this request itself doesn't go through the
  // response interceptor (which would recurse on a 401 from refresh).
  const { data } = await axios.post(
    `${process.env.REACT_APP_API_URL}/api/auth/refresh-token`,
    {},
    { withCredentials: true },
  );
  const newToken = data.accessToken as string;
  localStorage.setItem('accessToken', newToken);
  return newToken;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const status = error.response?.status;

    if (
      status !== 401 ||
      !original ||
      original._retry ||
      isAuthEndpoint(original.url)
    ) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      original.headers = {
        ...(original.headers || {}),
        Authorization: `Bearer ${newToken}`,
      };
      return api.request(original);
    } catch (refreshErr) {
      logoutAndRedirect();
      return Promise.reject(refreshErr);
    }
  },
);

export default api;