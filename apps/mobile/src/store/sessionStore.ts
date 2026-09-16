import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export interface SessionData {
  deviceId: string;
  deviceToken: string;
  privateKeyB64?: string;
  staffId: string;
  employeeId: string;
  fullName: string;
  siteId?: string;
  siteName?: string;
}

interface SessionStore {
  session: SessionData | null;
  isLoading: boolean;
  isLocked: boolean;
  loadSession: () => Promise<void>;
  saveSession: (data: SessionData) => Promise<void>;
  lockSession: () => Promise<void>;
  unlockSession: () => Promise<boolean>;
  clearSession: () => Promise<void>;
}

const SESSION_KEY = 'syncops_session';

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  isLoading: true,
  isLocked: false,

  loadSession: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as SessionData;
        set({ session, isLoading: false, isLocked: false });
      } else {
        set({ isLoading: false, isLocked: false });
      }
    } catch {
      set({ isLoading: false, isLocked: false });
    }
  },

  saveSession: async (data) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(data));
    set({ session: data, isLocked: false });
  },

  lockSession: async () => {
    set({ session: null, isLocked: true });
  },

  unlockSession: async () => {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return false;
    try {
      const session = JSON.parse(raw) as SessionData;
      set({ session, isLocked: false });
      return true;
    } catch {
      return false;
    }
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await AsyncStorage.removeItem('syncops_last_action');
    await AsyncStorage.removeItem('syncops_offline_queue');
    set({ session: null, isLocked: false });
  },
}));
