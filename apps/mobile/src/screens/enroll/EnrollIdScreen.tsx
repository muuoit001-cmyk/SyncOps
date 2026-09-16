import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize, shadow } from '../../constants/theme';
import api from '../../services/api';

interface Props {
  navigation: any;
}

const EnrollIdScreen: React.FC<Props> = ({ navigation }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    if (!employeeId.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await api.get(`/staff/lookup/${employeeId.trim().toUpperCase()}`);
      // Navigate to location permission step with staff data
      navigation.navigate('EnrollLocation', { staffData: data });
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot reach the SyncOps server. Check your internet connection and try again.');
      } else {
        const msg = err.response?.data?.error || 'Employee ID not found. Contact your HR team.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo mark */}
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>⚡</Text>
          </View>

          <Text style={styles.title}>SyncOps</Text>
          <Text style={styles.subtitle}>Staff Enrollment</Text>
          <Text style={styles.description}>
            Enter the Employee ID provided by your HR team to get started.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Employee ID</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              value={employeeId}
              onChangeText={t => { setEmployeeId(t); setError(''); }}
              placeholder="e.g. EMP-001"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleLookup}
              accessibilityLabel="Employee ID input"
              accessibilityHint="Enter the employee ID given to you by HR"
            />

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLookup}
              disabled={loading || !employeeId.trim()}
              accessibilityRole="button"
              accessibilityLabel="Look up employee ID"
              id="lookup-btn"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            Don't have an ID? Contact your HR team to get enrolled.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  logoMark: {
    width: 72, height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.md,
  },
  logoText: { fontSize: 36 },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.xl,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
    maxWidth: 300,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  inputError: { borderColor: colors.error },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    marginBottom: spacing.md,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
  footer: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    maxWidth: 280,
    lineHeight: 20,
  },
});

export default EnrollIdScreen;
