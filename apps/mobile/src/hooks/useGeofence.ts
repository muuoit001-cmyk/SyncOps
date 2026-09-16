/**
 * Geofence hook — starts location check immediately on mount, in parallel
 * with the rest of the UI. Never blocks rendering.
 *
 * Returns { status, distanceM, isLoading } where:
 *   status: 'inside' | 'outside' | 'checking' | 'no_site' | 'permission_denied' | 'error'
 */
import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import api from '../services/api';
import { useSessionStore } from '../store/sessionStore';

export type GeofenceStatus =
  | 'checking'
  | 'inside'
  | 'outside'
  | 'no_site'
  | 'permission_denied'
  | 'low_accuracy'
  | 'error';

interface GeofenceResult {
  status: GeofenceStatus;
  distanceM: number | null;
  accuracy: number | null;
  siteName: string | null;
  isLoading: boolean;
  recheck: () => void;
}

const GPS_ACCURACY_WARNING_M = 50; // warn if accuracy > 50m

export function useGeofence(): GeofenceResult {
  const { session } = useSessionStore();
  const [status, setStatus] = useState<GeofenceStatus>('checking');
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const recheck = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!session?.siteId) {
      setStatus('no_site');
      return;
    }

    const currentSiteId = session.siteId;
    let cancelled = false;


    async function check() {
      setStatus('checking');

      // Check permission first (should already be granted after enrollment)
      const { status: permStatus } = await Location.getForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        if (!cancelled) setStatus('permission_denied');
        return;
      }

      try {
        // Get high-accuracy position (times out after 5s, falls back to cached)
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<Location.LocationObject>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 5000)
          ),
        ]).catch(() =>
          Location.getLastKnownPositionAsync()
        );

        if (!pos || cancelled) return;

        const acc = pos.coords.accuracy ?? null;
        if (!cancelled) setAccuracy(acc);

        // Fetch site geofence
        const { data: site } = await api.get(`/sites/${currentSiteId}/geofence`);
        if (!cancelled) setSiteName(site.name);

        // Haversine on client (mirrors server check — but server is authoritative)
        const d = haversine(pos.coords.latitude, pos.coords.longitude, site.lat, site.lng);
        const insidePolygon = Array.isArray(site.polygon_coordinates) && site.polygon_coordinates.length >= 3
          ? pointInPolygon(pos.coords.latitude, pos.coords.longitude, site.polygon_coordinates)
          : null;

        if (!cancelled) {
          setDistanceM(Math.round(d));
          if (acc !== null && acc > GPS_ACCURACY_WARNING_M) {
            setStatus('low_accuracy');
          } else if (insidePolygon !== null ? insidePolygon : d <= site.radius_meters) {
            setStatus('inside');
          } else {
            setStatus('outside');
          }
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    check();
    return () => { cancelled = true; };
  }, [session?.siteId, tick]);

  return {
    status,
    distanceM,
    accuracy,
    siteName,
    isLoading: status === 'checking',
    recheck,
  };
}

function pointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects = ((current.lng > lng) !== (prior.lng > lng))
      && lat < ((prior.lat - current.lat) * (lng - current.lng)) / (prior.lng - current.lng) + current.lat;
    if (intersects) inside = !inside;
  }
  return inside;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
