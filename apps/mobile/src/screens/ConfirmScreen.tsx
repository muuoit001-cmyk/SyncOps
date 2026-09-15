import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, spacing, fontSize, shadow } from '../../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  navigation: any;
  route: any;
}

const ConfirmScreen: React.FC<Props> = ({ navigation, route }) => {
  const { action, timestamp, isOffline } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  const bgColor = action === 'clock_in' ? colors.success : colors.clockOut;

  useEffect(() => {
    // Pop-in animation
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 180,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(checkAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 2 seconds — spec requirement
    const timer = setTimeout(() => {
      navigation.replace('Main');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const ts = new Date(timestamp);

  return (
    <View
      style={[styles.container, { backgroundColor: bgColor }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${action === 'clock_in' ? 'Clocked in' : 'Clocked out'} successfully at ${format(ts, 'h:mm a')}`}
      accessibilityLiveRegion="assertive"
    >
      <StatusBar barStyle="light-content" backgroundColor={bgColor} />

      <Animated.View
        style={[
          styles.checkContainer,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.checkmark}>✓</Text>
      </Animated.View>

      <Animated.View style={{ opacity: checkAnim, alignItems: 'center' }}>
        <Text style={styles.actionLabel}>
          {action === 'clock_in' ? 'Clocked In' : 'Clocked Out'}
        </Text>
        <Text style={styles.timestamp}>
          {format(ts, 'h:mm a')}
        </Text>
        <Text style={styles.dateText}>
          {format(ts, 'EEEE, MMMM d')}
        </Text>

        {isOffline && (
          <View style={styles.offlinePill}>
            <Text style={styles.offlinePillText}>
              ⚡ Offline — will sync automatically
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  checkContainer: {
    width: 120, height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  checkmark: {
    fontSize: 64,
    color: '#fff',
    fontWeight: '700',
    lineHeight: 72,
  },
  actionLabel: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  timestamp: {
    fontSize: fontSize['3xl'],
    fontWeight: '300',
    color: '#fff',
    letterSpacing: -1,
    marginTop: 4,
  },
  dateText: {
    fontSize: fontSize.base,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  offlinePill: {
    marginTop: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  offlinePillText: {
    fontSize: fontSize.sm,
    color: '#fff',
    fontWeight: '500',
  },
});

export default ConfirmScreen;
