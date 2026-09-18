import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { signedRequest } from '../services/api';
import { useSessionStore } from '../store/sessionStore';
import { colors, fontSize, spacing, radius } from '../constants/theme';

interface LeaveItem {
  id: string;
  starts_on: string;
  ends_on: string;
  days: number;
  reason?: string;
  status: string;
  leave_type_name: string;
}

const LeaveScreen: React.FC = () => {
  const { session } = useSessionStore();
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    signedRequest('GET', '/attendance/leave', {}, session.deviceId, session.deviceToken, session.privateKeyB64)
      .then(({ data }) => setItems(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Leave</Text><Text style={styles.subtitle}>Your approved and pending leave</Text></View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : items.length === 0 ? <View style={styles.center}><Text style={styles.empty}>No leave requests</Text></View> : <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <View style={styles.card}><View style={styles.row}><Text style={styles.type}>{item.leave_type_name}</Text><Text style={[styles.status, item.status === 'approved' ? styles.approved : styles.pending]}>{item.status}</Text></View><Text style={styles.dates}>{item.starts_on} - {item.ends_on} ({item.days} days)</Text>{item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}</View>} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 },
  list: { padding: spacing.md, paddingTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { color: colors.textPrimary, fontWeight: '700', fontSize: fontSize.md },
  status: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  approved: { color: colors.success },
  pending: { color: colors.warning },
  dates: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 8 },
  reason: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted, fontSize: fontSize.md },
});

export default LeaveScreen;
