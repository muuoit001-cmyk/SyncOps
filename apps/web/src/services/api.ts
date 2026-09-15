import axios from 'axios';

// In production (Vercel), VITE_API_BASE_URL is set to the Railway backend URL.
// In dev, Vite's proxy rewrites /api → localhost:3001 so we use '/api'.
const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('syncops_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('syncops_refresh_token');
      if (!refreshToken) {
        window.location.href = '/login';
        return Promise.reject(err);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('syncops_access_token', data.accessToken);
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        pendingQueue.forEach(({ resolve }) => resolve(data.accessToken));
        pendingQueue = [];
        return api(original);
      } catch (refreshErr) {
        pendingQueue.forEach(({ reject }) => reject(refreshErr));
        pendingQueue = [];
        localStorage.removeItem('syncops_access_token');
        localStorage.removeItem('syncops_refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
