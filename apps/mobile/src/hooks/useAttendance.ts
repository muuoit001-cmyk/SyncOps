import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useState, useCallback } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { signedRequest } from '../services/api';
import { enqueueAction, syncOfflineQueue, loadQueue } from '../services/offlineQueue';

export type ClockAction = 'clock_in' | 'clock_out';
export type ClockState = 'idle' | 'authenticating' | 'submitting' | 'success' | 'error';

const LAST_ACTION_KEY = 'syncops_last_action';

export interface LastAction {
  action: ClockAction;
  timestamp: string;
}

export async function getLastAction(): Promise<LastAction | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setLastAction(action: LastAction): Promise<void> {
  await AsyncStorage.setItem(LAST_ACTION_KEY, JSON.stringify(action));
}

/**
 * Determines what the next action should be based on last action.
 * If last was clock_in → next is clock_out. Default is clock_in.
 */
export function getNextAction(last: LastAction | null): ClockAction {
  if (!last) return 'clock_in';
  // If last action was today's clock_in → next is clock_out
  const lastDate = new Date(last.timestamp).toDateString();
  const today = new Date().toDateString();
  if (last.action === 'clock_in' && lastDate === today) return 'clock_out';
  return 'clock_in';
}

export function useAttendance() {
  const { session } = useSessionStore();
  const [clockState, setClockState] = useState<ClockState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshQueuedCount = useCallback(async () => {
    const q = await loadQueue();
    setQueuedCount(q.length);
  }, []);

  /**
   * Main clock action — the critical 5-second path.
   * Called after user taps the button (geofence already checked).
   */
  const performClock = useCallback(async (
    action: ClockAction,
    location: { lat: number; lng: number; accuracy?: number } | null,
  ) => {
    if (!session || clockState !== 'idle') return null;

    setError(null);
    setClockState('authenticating');

    // Step 1: Biometric auth (~2s budget)
    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: action === 'clock_in' ? 'Confirm Clock In' : 'Confirm Clock Out',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      requireConfirmation: false,
    });

    if (!authResult.success) {
      setClockState('idle');
      return null;
    }

    setClockState('submitting');

    const clientTime = new Date().toISOString();
    const payload = {
      action,
      lat: location?.lat,
      lng: location?.lng,
      gps_accuracy_m: location?.accuracy,
      is_mock_location: false,
      client_time_utc: clientTime,
    };

    // Step 2: Network check + submission (~1.5s budget)
    const netState = await NetInfo.fetch();

    if (!netState.isConnected) {
      // Offline — queue locally
      await enqueueAction({ ...payload, queued_at: Date.now() });
      await setLastAction({ action, timestamp: clientTime });
      setIsOffline(true);
      setClockState('success');
      setConfirmedAt(clientTime);
      await refreshQueuedCount();
      return { timestamp: clientTime, offline: true };
    }

    try {
      const { data } = await signedRequest(
        'POST',
        '/attendance/clock',
        payload,
        session.deviceId,
        session.deviceToken,
      );

      await setLastAction({ action, timestamp: data.timestamp });
      setIsOffline(false);
      setClockState('success');
      setConfirmedAt(data.timestamp);

      // Opportunistically sync any queued offline actions
      syncOfflineQueue().then(refreshQueuedCount).catch(() => {});

      return { timestamp: data.timestamp, offline: false, isFlagged: data.isFlagged };
    } catch (err: any) {
      setClockState('error');
      setError(err.response?.data?.error || 'Clock action failed. Try again.');
      return null;
    }
  }, [session, clockState, refreshQueuedCount]);

  const reset = useCallback(() => {
    setClockState('idle');
    setError(null);
  }, []);

  return {
    clockState,
    error,
    confirmedAt,
    isOffline,
    queuedCount,
    performClock,
    reset,
    refreshQueuedCount,
  };
}
