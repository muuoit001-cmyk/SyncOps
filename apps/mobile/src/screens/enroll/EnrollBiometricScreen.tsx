import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { colors, spacing, radius, fontSize, shadow } from '../../constants/theme';
import api from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import { getBiometricCapabilities } from '../../hooks/useBiometric';

interface Props {
  navigation: any;
  route: any;
}

const EnrollBiometricScreen: React.FC<Props> = ({ navigation, route }) => {
  const { staffData } = route.params;
  const { saveSession } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'face' | 'iris' | 'none'>('none');

  useEffect(() => {
    getBiometricCapabilities().then(c => setBiometricType(c.type));
  }, []);

  const handleEnroll = async () => {
    setLoading(true);
    setError('');

    try {
      // Step 1: Verify biometric works before registering device
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your identity to complete enrollment',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        requireConfirmation: false,
      });

      if (!authResult.success) {
        setError('Biometric verification cancelled. Please try again.');
        setLoading(false);
        return;
      }

      // Step 2: Register device with server
      const deviceLabel = `${Constants.deviceName || 'Device'} (${biometricType})`;
      const platform = Constants.platform?.ios ? 'ios' : 'android';

      const { data } = await api.post('/devices/enroll', {
        staff_id: staffData.id,
        device_label: deviceLabel,
        platform,
      });

      // Step 3: Persist session securely
      await saveSession({
        deviceId: data.deviceId,
        deviceToken: data.deviceToken, // stored only in SecureStore, never logged
        staffId: staffData.id,
        employeeId: staffData.employee_id,
        fullName: staffData.full_name,
        siteId: staffData.site_id,
        siteName: staffData.site_name,
      });

      // If this is a new device re-enrollment, surface the info
      if (data.isNewDevice) {
        Alert.alert(
          'New Device Registered',
          'Your HR team has been notified of this new device registration.',
          [{ text: 'OK', onPress: () => navigation.replace('EnrollDone') }]
        );
      } else {
        navigation.replace('EnrollDone');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Enrollment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const biometricIcon = biometricType === 'face' ? '🔐' : biometricType === 'fingerprint' ? '👆' : '🔒';
  const biometricLabel = biometricType === 'face' ? 'Face ID' : biometricType === 'fingerprint' ? 'Fingerprint' : 'Biometric';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Progress */}
        <View style={styles.progress}>
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.line, styles.lineDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.line, styles.lineDone]} />
          <View style={[styles.dot, styles.dotActive]} />
        </View>

        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{biometricIcon}</Text>
        </View>

        <Text style={styles.title}>Register {biometricLabel}</Text>
        <Text style={styles.description}>
          Your biometric data stays on your device and is never sent to our servers.
          It will be used to confirm clock-in and clock-out actions.
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleEnroll}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`Register ${biometricLabel}`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Register {biometricLabel}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>
          After enrollment, your biometric is your clock-in — no password needed.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.primary },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  lineDone: { backgroundColor: colors.success },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 36 },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm, letterSpacing: -0.3 },
  description: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 320, marginBottom: spacing.lg },
  errorBox: { backgroundColor: colors.errorLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, width: '100%' },
  errorText: { fontSize: fontSize.sm, color: colors.error, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', width: '100%', minHeight: 52 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
  footer: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, maxWidth: 280, lineHeight: 20 },
});

export default EnrollBiometricScreen;
