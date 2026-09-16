import axios from 'axios';

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (!envUrl) {
    // Keep the Vite proxy for local development, but never point a deployed
    // dashboard at its own host when the Vercel variable is missing.
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? '/api'
      : 'https://syncops-production-f5ac.up.railway.app/api';
  }
  
  let cleanUrl = envUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  if (cleanUrl.endsWith('/api')) {
    return cleanUrl;
  }
  return `${cleanUrl}/api`;
}

const BASE_URL = getApiBaseUrl();

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
