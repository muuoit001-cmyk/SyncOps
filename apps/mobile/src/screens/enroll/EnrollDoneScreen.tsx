import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize, shadow } from '../../constants/theme';

interface Props {
  navigation: any;
}

const EnrollDoneScreen: React.FC<Props> = ({ navigation }) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.content}>
      <View style={styles.checkCircle}>
        <Text style={styles.checkMark}>✓</Text>
      </View>

      <Text style={styles.title}>You're all set!</Text>
      <Text style={styles.description}>
        Your device is enrolled. From now on, just open SyncOps and
        tap the big button — your fingerprint is all you need.
      </Text>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => navigation.replace('Main')}
        accessibilityRole="button"
        accessibilityLabel="Go to home screen"
      >
        <Text style={styles.btnText}>Start Clocking In →</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadow.lg,
  },
  checkMark: { fontSize: 52, color: '#fff', fontWeight: '700', lineHeight: 56 },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
    marginBottom: spacing.xl,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
  },
  btnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
});

export default EnrollDoneScreen;
