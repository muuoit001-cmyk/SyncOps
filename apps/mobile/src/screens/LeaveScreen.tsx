import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Platform, SafeAreaView,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';
import { signedRequest } from '../services/api';
import { useSessionStore } from '../store/sessionStore';
import { colors, fontSize, spacing, radius, shadow } from '../constants/theme';

interface LeaveItem {
  id: string;
  starts_on: string;
  ends_on: string;
  days: number;
  reason?: string;
  status: string;
  leave_type_name: string;
}
interface LeaveType { id: string; name: string; code?: string; days_per_year: number }
interface Attachment { file_name: string; mime_type: string; file_size?: number; content_base64: string }

type DateField = 'start' | 'end';

const STATUS_COLORS: Record<string, string> = {
  approved:        colors.success,
  pending_manager: colors.warning,
  pending_hr:      '#6366F1',
  rejected:        colors.error,
};

const STATUS_LABELS: Record<string, string> = {
  approved:        'Approved',
  pending_manager: 'Pending',
  pending_hr:      'HR Review',
  rejected:        'Rejected',
};

/** Returns true if the leave type name indicates sick leave */
const isSickLeave = (name: string) =>
  name.toLowerCase().includes('sick') || name.toLowerCase().includes('medical');

const AnimatedCard: React.FC<{ item: LeaveItem; index: number }> = ({ item, index }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const typeColor = STATUS_COLORS[item.status] || colors.textMuted;

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <View style={styles.card}>
        {/* Left color bar */}
        <View style={[styles.cardBar, { backgroundColor: typeColor }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardRow}>
            <View style={styles.cardTypePill}>
              <Text style={styles.cardTypeText}>{item.leave_type_name}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: typeColor + '22', borderColor: typeColor + '55' }]}>
              <Text style={[styles.statusText, { color: typeColor }]}>
                {STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
          </View>
          <Text style={styles.cardDates}>
            {item.starts_on} → {item.ends_on}
          </Text>
          <Text style={styles.cardDayCount}>{item.days} {item.days === 1 ? 'day' : 'days'}</Text>
          {item.reason ? <Text style={styles.cardReason} numberOfLines={2}>{item.reason}</Text> : null}
        </View>
      </View>
    </Animated.View>
  );
};

const LeaveScreen: React.FC = () => {
  const { session } = useSessionStore();
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerField, setPickerField] = useState<DateField>('start');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const formAnim = useRef(new Animated.Value(0)).current;

  const selectedTypeName = leaveTypes.find(t => t.id === selectedType)?.name || '';
  const attachLabel = isSickLeave(selectedTypeName)
    ? '📎 Attach Sick Sheet'
    : '📎 Attach Supporting Document';

  useEffect(() => {
    if (!session) return;
    signedRequest('GET', '/attendance/leave', {}, session.deviceId, session.deviceToken, session.privateKeyB64)
      .then(({ data }) => {
        setItems(data.requests || []);
        setLeaveTypes(data.leaveTypes || []);
        if (!selectedType && data.leaveTypes?.[0]) setSelectedType(data.leaveTypes[0].id);
      })
      .catch(err => setError(err.response?.data?.error || 'Could not load leave'))
      .finally(() => setLoading(false));
  }, [session]);

  // Animate form open/close
  useEffect(() => {
    Animated.spring(formAnim, {
      toValue: showForm ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [showForm]);

  const openPicker = (field: DateField) => {
    setPickerField(field);
    setPickerVisible(true);
  };

  const onDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setPickerVisible(false);
    if (!selected) return;
    if (pickerField === 'start') {
      setStartDate(selected);
      if (endDate && selected > endDate) setEndDate(null);
    } else {
      setEndDate(selected);
    }
  };

  const applyForLeave = async () => {
    if (!session || !selectedType || !startDate || !endDate) {
      setError('Please select leave type and both dates.');
      return;
    }
    if (endDate < startDate) { setError('End date cannot be before start date.'); return; }
    setSubmitting(true);
    setError('');
    const starts_on = format(startDate, 'yyyy-MM-dd');
    const ends_on   = format(endDate, 'yyyy-MM-dd');
    try {
      await signedRequest(
        'POST', '/attendance/leave',
        { leave_type_id: selectedType, starts_on, ends_on, reason, attachment },
        session.deviceId, session.deviceToken, session.privateKeyB64,
      );
      setStartDate(null); setEndDate(null); setReason(''); setAttachment(null); setShowForm(false);
      const { data } = await signedRequest('GET', '/attendance/leave', {}, session.deviceId, session.deviceToken, session.privateKeyB64);
      setItems(data.requests || []); setLeaveTypes(data.leaveTypes || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not submit leave application');
    } finally {
      setSubmitting(false);
    }
  };

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (file.size && file.size > 8 * 1024 * 1024) { setError('Document must be smaller than 8 MB.'); return; }
      const content_base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      setAttachment({ file_name: file.name, mime_type: file.mimeType || 'application/octet-stream', file_size: file.size, content_base64 });
      setError('');
    } catch {
      setError('Could not attach that document.');
    }
  };

  const dateBtn = (field: DateField) => {
    const val = field === 'start' ? startDate : endDate;
    const label = field === 'start' ? 'Start Date' : 'End Date';
    return (
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => openPicker(field)}
        accessibilityRole="button"
        accessibilityLabel={`Select ${label}`}
      >
        <Text style={styles.dateButtonIcon}>📅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateButtonLabel}>{label}</Text>
          <Text style={[styles.dateButtonValue, !val && { color: colors.textMuted }]}>
            {val ? format(val, 'EEE, MMMM d yyyy') : 'Tap to select'}
          </Text>
        </View>
        {val && (
          <TouchableOpacity onPress={() => field === 'start' ? setStartDate(null) : setEndDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>×</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Leave</Text>
          <Text style={styles.subtitle}>
            {items.length > 0 ? `${items.length} request${items.length !== 1 ? 's' : ''}` : 'Your approved and pending leave'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.applyBtn, showForm && styles.applyBtnActive]}
          onPress={() => setShowForm(f => !f)}
        >
          <Text style={[styles.applyBtnText, showForm && styles.applyBtnTextActive]}>
            {showForm ? '✕ Close' : '+ Apply'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            showForm ? (
              <Animated.View
                style={{
                  opacity: formAnim,
                  transform: [{ scaleY: formAnim }, { translateY: formAnim.interpolate({ inputRange: [0,1], outputRange: [-16, 0] }) }],
                }}
              >
                <View style={styles.form}>
                  <Text style={styles.formTitle}>New Leave Application</Text>

                  {/* Leave type chips */}
                  <Text style={styles.fieldLabel}>Leave Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                    {leaveTypes.map(type => (
                      <TouchableOpacity
                        key={type.id}
                        style={[styles.typeChip, selectedType === type.id && styles.typeChipActive]}
                        onPress={() => { setSelectedType(type.id); setAttachment(null); }}
                      >
                        <Text style={[styles.typeChipText, selectedType === type.id && styles.typeChipTextActive]}>
                          {type.name}
                        </Text>
                        {type.days_per_year > 0 && (
                          <Text style={[styles.typeChipDays, selectedType === type.id && { color: '#fff' }]}>
                            {type.days_per_year}d/yr
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Date pickers */}
                  <Text style={styles.fieldLabel}>Dates</Text>
                  <View style={styles.dateRow}>
                    {dateBtn('start')}
                    <View style={styles.dateSeparator}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>to</Text>
                    </View>
                    {dateBtn('end')}
                  </View>

                  {/* Day count preview */}
                  {startDate && endDate && endDate >= startDate && (
                    <View style={styles.dayCountBanner}>
                      <Text style={styles.dayCountText}>
                        📅 {Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1} day(s) requested
                      </Text>
                    </View>
                  )}

                  {/* Reason */}
                  <Text style={styles.fieldLabel}>Reason (optional)</Text>
                  <TextInput
                    style={styles.reasonInput}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Add a reason for your leave..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  {/* Attachment */}
                  <TouchableOpacity style={styles.attachButton} onPress={pickAttachment}>
                    {attachment ? (
                      <View style={styles.attachRow}>
                        <Text style={styles.attachIcon}>✅</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.attachedName} numberOfLines={1}>{attachment.file_name}</Text>
                          <Text style={styles.attachedSize}>
                            {attachment.file_size ? `${(attachment.file_size / 1024).toFixed(1)} KB` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => setAttachment(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ color: colors.error, fontWeight: '700', fontSize: 16 }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.attachButtonText}>{attachLabel}</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.templateHint}>
                    A leave summary will be auto-generated for your records.
                  </Text>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                    onPress={applyForLeave}
                    disabled={submitting}
                  >
                    <Text style={styles.submitBtnText}>
                      {submitting ? 'Submitting...' : 'Submit Application →'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ) : null
          }
          ListEmptyComponent={
            !showForm ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🗓</Text>
                <Text style={styles.emptyTitle}>No leave requests</Text>
                <Text style={styles.emptySubtitle}>Tap "+ Apply" to submit your first leave application</Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => <AnimatedCard item={item} index={index} />}
        />
      )}

      {/* Native date picker */}
      {pickerVisible && (
        <>
          {Platform.OS === 'ios' ? (
            <View style={styles.iosPickerBackdrop}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setPickerVisible(false)} />
              <View style={styles.iosPickerContainer}>
                <View style={styles.iosPickerHeader}>
                  <TouchableOpacity onPress={() => setPickerVisible(false)}>
                    <Text style={styles.iosPickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerField === 'start' ? (startDate || new Date()) : (endDate || startDate || new Date())}
                  mode="date"
                  display="inline"
                  onChange={onDateChange}
                  minimumDate={pickerField === 'end' && startDate ? startDate : new Date()}
                  style={{ backgroundColor: colors.surface }}
                  themeVariant="light"
                />
              </View>
            </View>
          ) : (
            <DateTimePicker
              value={pickerField === 'start' ? (startDate || new Date()) : (endDate || startDate || new Date())}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={pickerField === 'end' && startDate ? startDate : new Date()}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  applyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  applyBtnActive: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  applyBtnTextActive: { color: colors.textSecondary },

  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Form
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '800',
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Leave type chips
  typeScroll: { marginBottom: spacing.xs, flexGrow: 0 },
  typeChip: {
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  typeChipDays: { color: colors.textMuted, fontSize: fontSize.xs },

  // Date pickers
  dateRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 60,
  },
  dateButtonIcon: { fontSize: 20 },
  dateButtonLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  dateButtonValue: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600', marginTop: 2 },
  dateSeparator: { alignItems: 'center', paddingHorizontal: 2 },

  // Day count preview
  dayCountBanner: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  dayCountText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },

  // Reason TextInput
  reasonInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontFamily: undefined,
  },

  // Attachment
  attachButton: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachButtonText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%' },
  attachIcon: { fontSize: 20 },
  attachedName: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600' },
  attachedSize: { color: colors.textMuted, fontSize: fontSize.xs },

  templateHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm, textAlign: 'center', lineHeight: 16 },
  errorText: { color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' },

  // Submit
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadow.md,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base, letterSpacing: -0.2 },

  // Leave request cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadow.card,
  },
  cardBar: { width: 4, borderRadius: 4 },
  cardContent: { flex: 1, padding: spacing.md },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTypePill: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  cardTypeText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  cardDates: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  cardDayCount: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, fontWeight: '600' },
  cardReason: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 6, lineHeight: 16 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 64, marginBottom: spacing.md },
  emptyTitle: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.xs },
  emptySubtitle: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.lg },

  // iOS date picker modal
  iosPickerBackdrop: {
    position: 'absolute',
    inset: 0,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  iosPickerContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    ...shadow.lg,
  },
  iosPickerHeader: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-end',
  },
  iosPickerDone: { color: colors.primary, fontWeight: '700', fontSize: fontSize.base },
});

export default LeaveScreen;
