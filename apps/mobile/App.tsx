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
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Clock',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, lineHeight: 28, color }}>⏱</Text>
          ),
          tabBarAccessibilityLabel: 'Clock in or out',
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, lineHeight: 28, color }}>📋</Text>
          ),
          tabBarAccessibilityLabel: 'View attendance history',
        }}
      />
      <Tab.Screen
        name="Leave"
        component={LeaveScreen}
        options={{
          tabBarLabel: 'Leave',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, lineHeight: 28, color }}>🗓</Text>,
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
        <Text style={{ fontSize: 36, marginBottom: 16 }}>⚡</Text>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>SyncOps</Text>
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
  loadingText: {
    marginTop: 12,
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
