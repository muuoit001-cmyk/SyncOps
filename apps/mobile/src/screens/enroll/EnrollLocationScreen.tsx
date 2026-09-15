import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { colors, spacing, radius, fontSize, shadow } from '../../constants/theme';

interface Props {
  navigation: any;
  route: any;
}

const EnrollLocationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { staffData } = route.params;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestPermission = async () => {
    setLoading(true);
    setError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        navigation.navigate('EnrollBiometric', { staffData });
      } else {
        setError(
          'Location permission is required for geofence checking at clock-in. ' +
          'Please grant permission in your device Settings and try again.'
        );
      }
    } catch {
      setError('Failed to request location permission. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Progress */}
        <View style={styles.progress}>
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.line, styles.lineDone]} />
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.line} />
          <View style={styles.dot} />
        </View>

        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📍</Text>
        </View>

        <Text style={styles.title}>Location Access</Text>
        <Text style={styles.description}>
          SyncOps uses your location only at clock-in and clock-out to confirm
          you're on-site. Your location is never tracked in the background.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>👤 Enrolling as</Text>
          <Text style={styles.infoName}>{staffData.full_name}</Text>
          <Text style={styles.infoId}>{staffData.employee_id}</Text>
          {staffData.site_name && (
            <Text style={styles.infoSite}>📍 {staffData.site_name}</Text>
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={requestPermission}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Allow location access"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Allow Location Access</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.border,
  },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.primary },
  line: {
    flex: 1, height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  lineDone: { backgroundColor: colors.success },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: spacing.lg,
  },
  infoCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadow.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  infoId: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: 'monospace', marginTop: 2 },
  infoSite: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  errorText: { fontSize: fontSize.sm, color: colors.error, textAlign: 'center', lineHeight: 20 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
});

export default EnrollLocationScreen;
