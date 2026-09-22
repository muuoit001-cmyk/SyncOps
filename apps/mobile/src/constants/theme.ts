// SyncOps design system constants — Premium edition
export const colors = {
  primary:       '#2563EB',
  primaryDark:   '#1D4ED8',
  primaryLight:  '#DBEAFE',
  secondary:     '#6366F1',
  secondaryLight:'#EEF2FF',
  success:       '#16A34A',
  successLight:  '#DCFCE7',
  warning:       '#D97706',
  warningLight:  '#FEF3C7',
  error:         '#DC2626',
  errorLight:    '#FEE2E2',
  clockOut:      '#0891B2',
  clockOutLight: '#CFFAFE',
  // Backgrounds
  bg:            '#F1F5F9',
  surface:       '#FFFFFF',
  surfaceElevated:'#FFFFFF',
  border:        '#E2E8F0',
  borderLight:   '#F1F5F9',
  // Text
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#94A3B8',
  // Gradient pairs (used in HomeScreen etc.)
  gradientStart: '#2563EB',
  gradientEnd:   '#1D4ED8',
  gradientAlt:   '#6366F1',
} as const;

export const gradients = {
  primary:  ['#2563EB', '#1D4ED8'] as [string, string],
  clockOut: ['#0891B2', '#0E7490'] as [string, string],
  success:  ['#16A34A', '#15803D'] as [string, string],
  done:     ['#16A34A', '#15803D'] as [string, string],
  surface:  ['#F8FAFC', '#FFFFFF'] as [string, string],
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const radius = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   20,
  xl:   28,
  full: 9999,
} as const;

export const fontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  '2xl': 30,
  '3xl': 40,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;
