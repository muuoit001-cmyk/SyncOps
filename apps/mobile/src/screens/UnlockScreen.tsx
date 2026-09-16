import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { useSessionStore } from '../store/sessionStore';

const UnlockScreen: React.FC = () => {
  const { unlockSession, clearSession } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const unlock = async () => {
    setLoading(true);
    setError('');
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (!types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setError('Fingerprint authentication is required to unlock SyncOps.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SyncOps with your fingerprint',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
        requireConfirmation: false,
      });
      if (!result.success) {
        setError('Fingerprint verification was not completed.');
        return;
      }
      if (!(await unlockSession())) setError('This device enrollment is missing. Please enroll again.');
    } catch {
      setError('Unable to unlock SyncOps. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>SyncOps is locked</Text>
        <Text style={styles.description}>Your device remains enrolled. Use your fingerprint to continue without registering again.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={unlock} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock with Fingerprint</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={clearSession} disabled={loading}>
          <Text style={styles.removeText}>Remove this device enrollment</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  icon: { fontSize: 48, marginBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm },
  description: { color: colors.textSecondary, fontSize: fontSize.base, lineHeight: 22, maxWidth: 320, textAlign: 'center', marginBottom: spacing.lg },
  error: { color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, minHeight: 52, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', width: '100%' },
  buttonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
  removeText: { color: colors.error, fontSize: fontSize.sm, marginTop: spacing.lg },
});

export default UnlockScreen;