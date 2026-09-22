import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSessionStore } from './src/store/sessionStore';
import { colors, fontSize } from './src/constants/theme';

// Screens
import EnrollIdScreen from './src/screens/enroll/EnrollIdScreen';
import EnrollLocationScreen from './src/screens/enroll/EnrollLocationScreen';
import EnrollBiometricScreen from './src/screens/enroll/EnrollBiometricScreen';
import EnrollDoneScreen from './src/screens/enroll/EnrollDoneScreen';
import UnlockScreen from './src/screens/UnlockScreen';
import HomeScreen from './src/screens/HomeScreen';
import ConfirmScreen from './src/screens/ConfirmScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import LeaveScreen from './src/screens/LeaveScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ── Tab navigator (Home + History) ──────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          elevation: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Clock',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.tabIconActive : undefined}>
              <Text style={{ fontSize: 20, lineHeight: 26, color }}>⏱</Text>
            </View>
          ),
          tabBarAccessibilityLabel: 'Clock in or out',
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.tabIconActive : undefined}>
              <Text style={{ fontSize: 20, lineHeight: 26, color }}>📋</Text>
            </View>
          ),
          tabBarAccessibilityLabel: 'View attendance history',
        }}
      />
      <Tab.Screen
        name="Leave"
        component={LeaveScreen}
        options={{
          tabBarLabel: 'Leave',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.tabIconActive : undefined}>
              <Text style={{ fontSize: 20, lineHeight: 26, color }}>🗓</Text>
            </View>
          ),
          tabBarAccessibilityLabel: 'View leave',
        }}
      />
    </Tab.Navigator>
  );
}

// ── Root navigator ──────────────────────────────────────────────────────────
function AppNavigator() {
  const { session, isLoading, isLocked } = useSessionStore();

  if (isLoading) {
    return (
      <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel="Loading SyncOps">
        <View style={styles.loadingLogo}>
          <Text style={{ fontSize: 32, lineHeight: 40 }}>⚡</Text>
        </View>
        <Text style={styles.loadingBrand}>SyncOps</Text>
        <Text style={styles.loadingTagline}>HR & Workforce</Text>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 32 }} />
      </View>
    );
  }

  const isEnrolled = !!session;

  if (isLocked) {
    return <UnlockScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isEnrolled ? (
        // Enrollment flow
        <>
          <Stack.Screen name="EnrollId" component={EnrollIdScreen} />
          <Stack.Screen name="EnrollLocation" component={EnrollLocationScreen} />
          <Stack.Screen name="EnrollBiometric" component={EnrollBiometricScreen} />
          <Stack.Screen name="EnrollDone" component={EnrollDoneScreen} />
        </>
      ) : (
        // Main app
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="Confirm"
            component={ConfirmScreen}
            options={{ presentation: 'modal', gestureEnabled: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const { loadSession } = useSessionStore();

  useEffect(() => {
    loadSession();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  loadingLogo: {
    width: 72, height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  loadingBrand: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  loadingTagline: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: '600',
  },
  tabIconActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
