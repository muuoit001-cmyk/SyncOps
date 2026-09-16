import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
  StatusBar, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, spacing, radius, fontSize, shadow } from '../constants/theme';
import { useSessionStore } from '../store/sessionStore';
import { useGeofence } from '../hooks/useGeofence';
import { useAttendance, getLastAction, getNextAction, ClockAction, NextClockAction } from '../hooks/useAttendance';
import * as Location from 'expo-location';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = Math.min(SCREEN_WIDTH - 80, 240);

interface OfflineBannerProps { count: number; }
const OfflineBanner: React.FC<OfflineBannerProps> = ({ count }) => (
  <View style={styles.offlineBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
    <Text style={styles.offlineBannerText}>
      ⚡ No connection — {count > 0 ? `${count} action${count > 1 ? 's' : ''} will sync automatically` : 'your clock-in will sync automatically'}
    </Text>
  </View>
);

const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { session, clearSession } = useSessionStore();
  const { status: fenceStatus, distanceM, accuracy, siteName, recheck } = useGeofence();
  const {
    clockState, error, confirmedAt, isOffline, queuedCount,
    performClock, reset, refreshQueuedCount, refreshTodayStatus,
  } = useAttendance();

  const [nextAction, setNextAction] = useState<NextClockAction>('clock_in');
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Load last action on mount, then confirm with server (source of truth)
  useEffect(() => {
    getLastAction().then(last => {
      setNextAction(getNextAction(last));
      if (last) {
        const t = new Date(last.timestamp);
        setLastActionLabel(
          `${last.action === 'clock_in' ? 'Clocked in' : 'Clocked out'} at ${format(t, 'h:mm a')}`
        );
      }
    });
    refreshQueuedCount();
    refreshTodayStatus().then((status) => {
      if (!status) return;
      if (status.isComplete) setNextAction('completed');
      else if (status.nextAction === 'clock_out') setNextAction('clock_out');
      else if (status.nextAction === 'clock_in') setNextAction('clock_in');
    });
  }, []);

  // Get GPS location in background (for clock payload)
  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(pos => setCurrentLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
      }))
      .catch(() => { });
  }, []);

  // Pulse animation when idle
  useEffect(() => {
    if (clockState === 'idle' && fenceStatus === 'inside' && nextAction !== 'completed') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
    pulseAnim.setValue(1);
  }, [clockState, fenceStatus, nextAction]);

  // Navigate to confirmation on success
  useEffect(() => {
    if (clockState === 'success' && confirmedAt) {
      navigation.navigate('Confirm', {
        action: nextAction === 'clock_out' ? 'clock_out' : 'clock_in',
        timestamp: confirmedAt,
        isOffline,
      });
      // Flip action for next time: clock_in -> clock_out, clock_out -> completed
      setNextAction(a => a === 'clock_in' ? 'clock_out' : 'completed');
      setLastActionLabel(
        `${nextAction === 'clock_in' ? 'Clocked in' : 'Clocked out'} at ${format(new Date(confirmedAt), 'h:mm a')}`
      );
      reset();
    }
  }, [clockState, confirmedAt]);

  const handleClockTap = async () => {
    if (clockState !== 'idle' || nextAction === 'completed') return;
    await performClock(nextAction as ClockAction, currentLocation);
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'You will need to enroll this device again before clocking in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => clearSession() },
    ]);
  };

  // ── Button state derivation ───────────────────────────────────────────────
  const isCompletedToday = nextAction === 'completed';

  const isButtonDisabled =
    isCompletedToday ||
    clockState !== 'idle' ||
    fenceStatus === 'outside' ||
    fenceStatus === 'permission_denied';

  const isFenceChecking = fenceStatus === 'checking';
  const isLowAccuracy = fenceStatus === 'low_accuracy';

  const buttonColor = isCompletedToday
    ? colors.success
    : isButtonDisabled && fenceStatus !== 'low_accuracy'
      ? colors.textMuted
      : nextAction === 'clock_in' ? colors.primary : colors.clockOut;

  const buttonLabel = isCompletedToday
    ? 'Done for Today'
    : clockState === 'authenticating'
      ? 'Verifying...'
      : clockState === 'submitting'
        ? 'Recording...'
        : isFenceChecking
          ? 'Checking location...'
          : nextAction === 'clock_in' ? 'Clock In' : 'Clock Out';

  const now = new Date();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {/* Offline banner */}
      {(isOffline || queuedCount > 0) && <OfflineBanner count={queuedCount} />}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header info */}
        <View style={styles.header} accessible accessibilityRole="header">
          <Text style={styles.staffName} accessibilityLabel={`Welcome, ${session?.fullName}`}>
            {session?.fullName}
          </Text>
          <Text style={styles.dateText}>
            {format(now, 'EEEE, MMMM d')}
          </Text>
          {(session?.siteName || siteName) && (
            <Text style={styles.siteText}>
              📍 {siteName || session?.siteName}
            </Text>
          )}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>

        {/* Central clock button */}
        <View style={styles.buttonArea}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                styles.clockButton,
                {
                  backgroundColor: isCompletedToday ? colors.success : (isButtonDisabled ? '#E2E8F0' : buttonColor),
                  width: BUTTON_SIZE,
                  height: BUTTON_SIZE,
                  borderRadius: BUTTON_SIZE / 2,
                },
                !isButtonDisabled && !isCompletedToday && shadow.lg,
              ]}
              onPress={handleClockTap}
              disabled={isButtonDisabled && fenceStatus !== 'low_accuracy'}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${buttonLabel} button, double tap to activate`}
              accessibilityState={{ disabled: isButtonDisabled }}
              id="clock-action-btn"
            >
              {(clockState === 'authenticating' || clockState === 'submitting') ? (
                <View style={styles.spinnerContainer}>
                  <Text style={styles.clockButtonText}>⏳</Text>
                  <Text style={styles.clockButtonSubtext}>{buttonLabel}</Text>
                </View>
              ) : isCompletedToday ? (
                <View style={styles.spinnerContainer}>
                  <Text style={[styles.clockButtonText, { color: '#fff' }]}>✓</Text>
                  <Text style={[styles.clockButtonLabel, { color: '#fff', fontSize: fontSize.base }]}>Done for Today</Text>
                  <Text style={[styles.clockButtonSubtext, { color: '#fff', fontSize: fontSize.xs }]}>
                    Attendance complete
                  </Text>
                </View>
              ) : isFenceChecking ? (
                <View style={styles.spinnerContainer}>
                  <Text style={{ fontSize: 36 }}>📡</Text>
                  <Text style={styles.clockButtonSubtext}>Checking...</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.clockButtonText, isButtonDisabled && { color: colors.textMuted }]}>
                    {nextAction === 'clock_in' ? '↑' : '↓'}
                  </Text>
                  <Text style={[styles.clockButtonLabel, isButtonDisabled && { color: colors.textMuted }]}>
                    {nextAction === 'clock_in' ? 'Clock In' : 'Clock Out'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>


          {/* Geofence status message — inline, calm, no modal */}
          {fenceStatus === 'outside' && distanceM !== null && (
            <View style={styles.fenceMessage} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={styles.fenceMessageIcon}>📍</Text>
              <Text style={styles.fenceMessageText}>
                You're {distanceM}m from {siteName || session?.siteName || 'your site'}.{'\n'}
                Move closer to clock {nextAction === 'clock_in' ? 'in' : 'out'}.
              </Text>
              <TouchableOpacity style={styles.recheckBtn} onPress={recheck} accessibilityRole="button" accessibilityLabel="Recheck location">
                <Text style={styles.recheckBtnText}>Recheck</Text>
              </TouchableOpacity>
            </View>
          )}

          {isLowAccuracy && accuracy !== null && (
            <View style={[styles.fenceMessage, { borderColor: colors.warning, backgroundColor: colors.warningLight }]} accessibilityRole="alert">
              <Text style={styles.fenceMessageIcon}>📡</Text>
              <Text style={[styles.fenceMessageText, { color: colors.warning }]}>
                GPS accuracy is low (±{Math.round(accuracy)}m).{'\n'}
                Wait a moment for a better signal, then try again.
              </Text>
              <TouchableOpacity style={[styles.recheckBtn, { backgroundColor: colors.warning }]} onPress={recheck}>
                <Text style={styles.recheckBtnText}>Recheck</Text>
              </TouchableOpacity>
            </View>
          )}

          {fenceStatus === 'no_site' && (
            <View style={styles.fenceMessage} accessibilityRole="alert">
              <Text style={styles.fenceMessageText}>No site assigned. Contact your HR team.</Text>
            </View>
          )}

          {fenceStatus === 'permission_denied' && (
            <View style={[styles.fenceMessage, { borderColor: colors.error, backgroundColor: colors.errorLight }]} accessibilityRole="alert">
              <Text style={[styles.fenceMessageText, { color: colors.error }]}>
                Location permission required. Enable it in device Settings.
              </Text>
            </View>
          )}

          {error && (
            <View style={[styles.fenceMessage, { borderColor: colors.error, backgroundColor: colors.errorLight }]} accessibilityRole="alert">
              <Text style={[styles.fenceMessageText, { color: colors.error }]}>{error}</Text>
            </View>
          )}
        </View>

        {/* Last action */}
        {lastActionLabel && (
          <Text style={styles.lastActionText} accessibilityLabel={lastActionLabel}>
            {lastActionLabel}
          </Text>
        )}

        {/* Time */}
        <Text style={styles.currentTime}>
          {format(now, 'HH:mm')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  offlineBanner: {
    backgroundColor: colors.warningLight,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
  },
  offlineBannerText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '500',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: { alignItems: 'center', marginBottom: spacing.xl, width: '100%' },
  staffName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  dateText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  siteText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  logoutButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  buttonArea: { alignItems: 'center', marginBottom: spacing.xl },
  clockButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64, // spec: minimum 64px tap target
  },
  clockButtonText: {
    fontSize: 52,
    color: '#fff',
    lineHeight: 60,
    fontWeight: '300',
  },
  clockButtonLabel: {
    fontSize: fontSize.lg,
    color: '#fff',
    fontWeight: '700',
    marginTop: -4,
    letterSpacing: -0.3,
  },
  clockButtonSubtext: {
    fontSize: fontSize.sm,
    color: '#fff',
    fontWeight: '500',
    marginTop: 4,
    opacity: 0.85,
  },
  spinnerContainer: { alignItems: 'center' },
  fenceMessage: {
    marginTop: spacing.lg,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    maxWidth: 320,
    width: SCREEN_WIDTH - 48,
  },
  fenceMessageIcon: { fontSize: 24, marginBottom: 4 },
  fenceMessageText: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 20,
  },
  recheckBtn: {
    marginTop: 10,
    backgroundColor: colors.error,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
    minHeight: 44, // spec: 44×44 minimum touch target
    justifyContent: 'center',
  },
  recheckBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  lastActionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  currentTime: {
    fontSize: fontSize['3xl'],
    fontWeight: '300',
    color: colors.textPrimary,
    letterSpacing: -1,
    opacity: 0.3,
  },
});

export default HomeScreen;
