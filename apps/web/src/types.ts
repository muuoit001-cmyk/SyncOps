// Shared TypeScript types for SyncOps

export type StaffStatus = 'active' | 'inactive' | 'suspended';
export type AttendanceAction = 'clock_in' | 'clock_out';
export type HRRole = 'hr_admin' | 'hr_manager';

export interface Site {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radius_meters: number;
  is_active: boolean;
  staff_count?: number;
  created_at: string;
}

export interface StaffMember {
  id: string;
  employee_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  site_id?: string;
  site_name?: string;
  status: StaffStatus;
  enrolled_at?: string;
  last_clock_in?: string;
  created_at: string;
}

export interface AttendanceLog {
  id: string;
  staff_id?: string;
  staff_name?: string;
  employee_id?: string;
  site_id?: string;
  site_name?: string;
  device_id?: string;
  device_label?: string;
  action: AttendanceAction;
  timestamp_utc: string;
  client_time_utc?: string;
  lat?: number;
  lng?: number;
  gps_accuracy_m?: number;
  distance_from_site_m?: number;
  is_within_fence: boolean;
  is_offline_sync: boolean;
  is_flagged: boolean;
  flag_reason?: string[];
  created_at: string;
}

export interface Device {
  id: string;
  staff_id: string;
  staff_name?: string;
  employee_id?: string;
  device_label?: string;
  platform?: 'ios' | 'android';
  is_active: boolean;
  enrolled_at: string;
  last_used_at?: string;
}

export interface HRUser {
  id: string;
  email: string;
  full_name: string;
  role: HRRole;
  totp_enabled: boolean;
}

export interface DashboardSummary {
  present: number;
  late: number;
  absent: number;
  flagged: number;
  totalActive: number;
}

export interface RecentActivity {
  action: AttendanceAction;
  timestamp_utc: string;
  is_flagged: boolean;
  staff_name: string;
  site_name?: string;
}
