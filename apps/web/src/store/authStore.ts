import { create } from 'zustand';
import api from '../services/api';
import { supabase } from '../services/supabase';
import type { HRUser } from '../types';

interface AuthState {
  user: HRUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<{ requiresTotp?: boolean }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

function persistSession(data: { accessToken: string; refreshToken: string; user: HRUser }) {
  localStorage.setItem('syncops_access_token', data.accessToken);
  localStorage.setItem('syncops_refresh_token', data.refreshToken);
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password, totpCode) => {
    if (supabase && !totpCode) {
      const { data: sbData, error: sbError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!sbError && sbData.session?.access_token) {
        const { data } = await api.post('/auth/supabase-login', {
          accessToken: sbData.session.access_token,
          password,
        });
        persistSession(data);
        set({ user: data.user, isAuthenticated: true });
        return {};
      }

      const sbMsg = (sbError?.message || '').toLowerCase();
      if (sbMsg.includes('email not confirmed') || sbMsg.includes('not confirmed')) {
        const err = new Error('Your account has not been activated yet. Please click the activation link sent to your work email.');
        (err as any).response = { data: { error: err.message, code: 'ACCOUNT_NOT_ACTIVATED' } };
        throw err;
      }
    }

    const { data } = await api.post('/auth/login', { email, password, totpCode });
    if (data.requiresTotp) return { requiresTotp: true };

    persistSession(data);
    set({ user: data.user, isAuthenticated: true });
    return {};
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('syncops_refresh_token');
    try { await api.post('/auth/logout', { refreshToken }); } catch { /* ignore */ }
    try { await supabase?.auth.signOut(); } catch { /* ignore */ }
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
