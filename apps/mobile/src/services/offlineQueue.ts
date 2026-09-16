/**
 * Offline queue — stores clock-in/out actions when no connectivity,
 * replays them with the original device timestamp when back online.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { signedRequest } from './api';
import { useSessionStore } from '../store/sessionStore';

const QUEUE_KEY = 'syncops_offline_queue';

export interface QueuedAction {
  id: string;
  action: 'clock_in' | 'clock_out';
  lat?: number;
  lng?: number;
  gps_accuracy_m?: number;
  is_mock_location?: boolean;
  client_time_utc: string;   // timestamp of original attempt
  queued_at: number;          // unix ms of original attempt
}

export async function loadQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function enqueueAction(action: Omit<QueuedAction, 'id'>): Promise<void> {
  const queue = await loadQueue();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  queue.push({ ...action, id });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

async function removeFromQueue(id: string): Promise<void> {
  const queue = await loadQueue();
  const filtered = queue.filter(q => q.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Attempt to sync all queued offline actions.
 * Called on app resume / connectivity restored.
 * Each action is sent with `is_offline_sync: true` and the original queued_at timestamp.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { synced: 0, failed: 0 };

  const session = useSessionStore.getState().session;
  if (!session) return { synced: 0, failed: 0 };

  const queue = await loadQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await signedRequest(
        'POST',
        '/attendance/clock',
        {
          action: item.action,
          lat: item.lat,
          lng: item.lng,
          gps_accuracy_m: item.gps_accuracy_m,
          is_mock_location: item.is_mock_location ?? false,
          client_time_utc: item.client_time_utc,
          is_offline_sync: true,
          queued_at: new Date(item.queued_at).toISOString(),
        },
        session.deviceId,
        session.deviceToken,
        session.privateKeyB64,
      );
      await removeFromQueue(item.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
