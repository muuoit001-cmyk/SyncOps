import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export interface SessionData {
  deviceId: string;
  deviceToken: string;
  staffId: string;
  employeeId: string;
  fullName: string;
  siteId?: string;
  siteName?: string;
}

interface SessionStore {
  session: SessionData | null;
  isLoading: boolean;
  loadSession: () => Promise<void>;
  saveSession: (data: SessionData) => Promise<void>;
  clearSession: () => Promise<void>;
}

const SESSION_KEY = 'syncops_session';

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  isLoading: true,

  loadSession: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as SessionData;
        set({ session, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  saveSession: async (data) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(data));
    set({ session: data });
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    set({ session: null });
  },
}));
