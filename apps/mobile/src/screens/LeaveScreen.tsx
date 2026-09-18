import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
interface LeaveType { id: string; name: string; days_per_year: number }

const LeaveScreen: React.FC = () => {
  const { session } = useSessionStore();
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    signedRequest('GET', '/attendance/leave', {}, session.deviceId, session.deviceToken, session.privateKeyB64)
      .then(({ data }) => { setItems(data.requests); setLeaveTypes(data.leaveTypes); if (!selectedType && data.leaveTypes[0]) setSelectedType(data.leaveTypes[0].id); })
      .catch(err => setError(err.response?.data?.error || 'Could not load leave'))
      .finally(() => setLoading(false));
  }, [session]);

  const applyForLeave = async () => {
    if (!session || !selectedType || !startsOn || !endsOn) { setError('Select a leave type and enter both dates.'); return; }
    setSubmitting(true); setError('');
    try {
      await signedRequest('POST', '/attendance/leave', { leave_type_id: selectedType, starts_on: startsOn, ends_on: endsOn, reason }, session.deviceId, session.deviceToken, session.privateKeyB64);
      setStartsOn(''); setEndsOn(''); setReason('');
      const { data } = await signedRequest('GET', '/attendance/leave', {}, session.deviceId, session.deviceToken, session.privateKeyB64);
      setItems(data.requests); setLeaveTypes(data.leaveTypes);
    } catch (err: any) { setError(err.response?.data?.error || 'Could not submit leave application'); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Leave</Text><Text style={styles.subtitle}>Your approved and pending leave</Text></View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.form}><Text style={styles.formTitle}>Apply for leave</Text><View style={styles.typeRow}>{leaveTypes.map(type => <TouchableOpacity key={type.id} style={[styles.typeButton, selectedType === type.id && styles.typeButtonActive]} onPress={() => setSelectedType(type.id)}><Text style={[styles.typeButtonText, selectedType === type.id && styles.typeButtonTextActive]}>{type.name}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} placeholder="Start date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={startsOn} onChangeText={setStartsOn} autoCapitalize="none" /><TextInput style={styles.input} placeholder="End date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={endsOn} onChangeText={setEndsOn} autoCapitalize="none" /><TextInput style={[styles.input, styles.reasonInput]} placeholder="Reason (optional)" placeholderTextColor={colors.textMuted} value={reason} onChangeText={setReason} multiline /><TouchableOpacity style={styles.submit} onPress={applyForLeave} disabled={submitting}><Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit application'}</Text></TouchableOpacity>{error ? <Text style={styles.error}>{error}</Text> : null}</View>} ListEmptyComponent={<View style={styles.center}><Text style={styles.empty}>No leave requests</Text></View>} renderItem={({ item }) => <View style={styles.card}><View style={styles.row}><Text style={styles.type}>{item.leave_type_name}</Text><Text style={[styles.status, item.status === 'approved' ? styles.approved : styles.pending]}>{item.status}</Text></View><Text style={styles.dates}>{item.starts_on} - {item.ends_on} ({item.days} days)</Text>{item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}</View>} />}
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
  form: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  formTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  typeButton: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  typeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeButtonText: { color: colors.textSecondary, fontSize: fontSize.sm },
  typeButtonTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, color: colors.textPrimary, marginTop: spacing.sm },
  reasonInput: { minHeight: 60, textAlignVertical: 'top' },
  submit: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  submitText: { color: '#fff', fontWeight: '700' },
  error: { color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm },
});

export default LeaveScreen;
