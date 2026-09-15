import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, differenceInMinutes, startOfDay, isSameDay } from 'date-fns';
import { colors, spacing, radius, fontSize, shadow } from '../constants/theme';
import { signedRequest } from '../services/api';
import { useSessionStore } from '../store/sessionStore';

type Period = 'week' | 'month';

interface AttendanceEntry {
  id: string;
  action: 'clock_in' | 'clock_out';
  timestamp_utc: string;
  is_flagged: boolean;
  flag_reason?: string[];
}

interface DayGroup {
  date: string;
  entries: AttendanceEntry[];
  hoursWorked?: string;
}

function groupByDay(entries: AttendanceEntry[]): DayGroup[] {
  const map = new Map<string, AttendanceEntry[]>();
  for (const e of entries) {
    const key = format(new Date(e.timestamp_utc), 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  const groups: DayGroup[] = [];
  for (const [date, dayEntries] of map.entries()) {
    const sorted = dayEntries.sort((a, b) =>
      new Date(a.timestamp_utc).getTime() - new Date(b.timestamp_utc).getTime()
    );
    // Compute hours worked from first clock_in to last clock_out
    const clockIn = sorted.find(e => e.action === 'clock_in');
    const clockOuts = sorted.filter(e => e.action === 'clock_out');
    const lastOut = clockOuts[clockOuts.length - 1];
    let hoursWorked: string | undefined;
    if (clockIn && lastOut) {
      const mins = differenceInMinutes(new Date(lastOut.timestamp_utc), new Date(clockIn.timestamp_utc));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      hoursWorked = `${h}h ${m}m`;
    }
    groups.push({ date, entries: sorted, hoursWorked });
  }

  return groups.sort((a, b) => b.date.localeCompare(a.date));
}

const HistoryScreen: React.FC = () => {
  const { session } = useSessionStore();
  const [period, setPeriod] = useState<Period>('week');
  const [groups, setGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    const days = period === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    signedRequest('GET', `/attendance/me?since=${since}`, {}, session.deviceId, session.deviceToken)
      .then(({ data }) => {
        setGroups(groupByDay(data));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, session]);

  const renderEntry = (entry: AttendanceEntry) => (
    <View
      key={entry.id}
      style={[styles.entry, entry.is_flagged && styles.entryFlagged]}
      accessible
      accessibilityLabel={`${entry.action === 'clock_in' ? 'Clock in' : 'Clock out'} at ${format(new Date(entry.timestamp_utc), 'h:mm a')}${entry.is_flagged ? ', flagged' : ''}`}
    >
      <View style={[styles.entryDot, { backgroundColor: entry.action === 'clock_in' ? colors.success : colors.textMuted }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.entryAction}>
          {entry.action === 'clock_in' ? '↑ Clocked In' : '↓ Clocked Out'}
        </Text>
        {entry.is_flagged && (
          <Text style={styles.entryFlag}>⚠ Flagged</Text>
        )}
      </View>
      <Text style={styles.entryTime}>
        {format(new Date(entry.timestamp_utc), 'h:mm a')}
      </Text>
    </View>
  );

  const renderGroup = ({ item }: { item: DayGroup }) => {
    const d = new Date(item.date);
    const isToday = isSameDay(d, new Date());
    return (
      <View style={styles.group} accessible accessibilityRole="header">
        <View style={styles.groupHeader}>
          <Text style={styles.groupDate}>
            {isToday ? 'Today' : format(d, 'EEEE, MMMM d')}
          </Text>
          {item.hoursWorked && (
            <Text style={styles.groupHours}>{item.hoursWorked}</Text>
          )}
        </View>
        <View style={styles.groupEntries}>
          {item.entries.map(renderEntry)}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Period selector */}
      <View style={styles.periodBar}>
        {(['week', 'month'] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p }}
            accessibilityLabel={`Show ${p === 'week' ? 'this week' : 'this month'}`}
          >
            <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
              {p === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No attendance records{'\n'}for this period</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroup}
          keyExtractor={item => item.date}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  periodBar: {
    flexDirection: 'row',
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: colors.primary },
  periodBtnText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  periodBtnTextActive: { color: '#fff', fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
  group: { marginBottom: spacing.md },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  groupDate: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  groupHours: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  groupEntries: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  entryFlagged: { backgroundColor: colors.warningLight },
  entryDot: { width: 8, height: 8, borderRadius: 4 },
  entryAction: { fontSize: fontSize.base, color: colors.textPrimary, fontWeight: '500' },
  entryFlag: { fontSize: fontSize.xs, color: colors.warning, fontWeight: '500', marginTop: 2 },
  entryTime: { fontSize: fontSize.base, color: colors.textSecondary, fontVariant: ['tabular-nums'] as any },
});

export default HistoryScreen;
