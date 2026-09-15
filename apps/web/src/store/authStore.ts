import { create } from 'zustand';
import api from '../services/api';
import type { HRUser } from '../types';

interface AuthState {
  user: HRUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<{ requiresTotp?: boolean }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password, totpCode) => {
    const { data } = await api.post('/auth/login', { email, password, totpCode });
    if (data.requiresTotp) return { requiresTotp: true };

    localStorage.setItem('syncops_access_token', data.accessToken);
    localStorage.setItem('syncops_refresh_token', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    return {};
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('syncops_refresh_token');
    try { await api.post('/auth/logout', { refreshToken }); } catch { /* ignore */ }
    localStorage.removeItem('syncops_access_token');
    localStorage.removeItem('syncops_refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('syncops_access_token');
    if (!token) { set({ isLoading: false }); return; }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
