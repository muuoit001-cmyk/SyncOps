import React, { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Clock3, MapPin, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';

interface AnalyticsData {
  summary: { active_staff: number; clock_ins: number; clock_outs: number; flagged: number; outside_fence: number; offline_sync: number; leave_days: number };
  daily: Array<{ day: string; clock_ins: number; clock_outs: number; flagged: number; outside_fence: number; leave_count: number }>;
  sites: Array<{ site_name: string; clock_ins: number; flagged: number; outside_fence: number; employees_present: number }>;
  flags: Array<{ flag_reason: string; count: number }>;
  late: Array<{ full_name: string; employee_id: string; site_name: string; timestamp_utc: string; shift_name: string; minutes_late: number }>;
  gps: Array<{ full_name: string; employee_id: string; site_name: string; action: string; timestamp_utc: string; gps_accuracy_m: number | null; distance_from_site_m: number | null; is_within_fence: boolean; is_offline_sync: boolean }>;
  employees: Array<{ full_name: string; employee_id: string; site_name: string; clock_ins: number; clock_outs: number; flagged: number; outside_fence: number }>;
  overtimeMinutes: number;
}

const Analytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    setLoading(true);
    setError('');
    api.get('/analytics', { params: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } })
      .then(response => setData(response.data))
      .catch(err => setError(err.response?.data?.error || err.message || 'Unable to load analytics'))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h1 className="page-title">Analytics</h1><p className="page-subtitle">Attendance, flags, and overtime trends</p></div>
        <select className="form-input form-select" value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Analytics period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {loading ? <div className="card">Loading analytics...</div> : error ? <div className="card" role="alert" style={{ color: 'var(--color-error)' }}>{error}<button className="btn btn-secondary btn-sm" style={{ marginLeft: '1rem' }} onClick={() => setDays(value => value)}>Retry</button></div> : !data ? <div className="card">No analytics data available.</div> : (
        <>
          <div className="summary-grid" style={{ marginBottom: '1rem' }}>
            <div className="summary-card"><div className="summary-card-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}><Users size={20} /></div><div className="summary-card-label">Active employees</div><div className="summary-card-value">{data.summary.active_staff}</div></div>
            <div className="summary-card"><div className="summary-card-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}><BarChart3 size={20} /></div><div className="summary-card-label">Clock-ins</div><div className="summary-card-value">{data.summary.clock_ins}</div></div>
            <div className="summary-card"><div className="summary-card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}><Clock3 size={20} /></div><div className="summary-card-label">Late arrivals</div><div className="summary-card-value">{data.late.length}</div></div>
            <div className="summary-card"><div className="summary-card-icon" style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}><AlertTriangle size={20} /></div><div className="summary-card-label">Exceptions</div><div className="summary-card-value">{data.summary.flagged}</div></div>
          </div>
          <div className="card" style={{ marginBottom: '1rem' }}><div className="card-header"><span className="card-title">Attendance and exceptions trend</span></div><ResponsiveContainer width="100%" height={300}><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="clock_ins" stroke="var(--color-primary)" name="Clock-ins" /><Line type="monotone" dataKey="clock_outs" stroke="var(--color-success)" name="Clock-outs" /><Line type="monotone" dataKey="flagged" stroke="var(--color-warning)" name="Flagged" /><Line type="monotone" dataKey="outside_fence" stroke="var(--color-danger)" name="Outside fence" /></LineChart></ResponsiveContainer></div>
          <div className="dashboard-grid" style={{ marginBottom: '1rem' }}><div className="card"><div className="card-header"><span className="card-title">Branch comparison</span></div><ResponsiveContainer width="100%" height={280}><BarChart data={data.sites}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="site_name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="employees_present" fill="var(--color-primary)" name="Employees present" /><Bar dataKey="flagged" fill="var(--color-warning)" name="Flagged" /></BarChart></ResponsiveContainer></div><div className="card"><div className="card-header"><span className="card-title">Exception reasons</span></div>{data.flags.length ? data.flags.map(flag => <div key={flag.flag_reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.7rem 0', borderBottom: '1px solid var(--color-border)' }}><span>{flag.flag_reason}</span><strong>{flag.count}</strong></div>) : <p className="empty-state">No exceptions in this period.</p>}</div></div>
          <div className="card" style={{ marginBottom: '1rem' }}><div className="card-header"><span className="card-title">Late arrivals</span><span className="card-subtitle">{data.late.length} records</span></div><div className="table-wrapper"><table><thead><tr><th>Employee</th><th>Branch</th><th>Shift</th><th>Arrival</th><th>Minutes late</th></tr></thead><tbody>{data.late.slice(0, 12).map(item => <tr key={`${item.employee_id}-${item.timestamp_utc}`}><td>{item.full_name}<small style={{ display: 'block', color: 'var(--color-text-muted)' }}>{item.employee_id}</small></td><td>{item.site_name}</td><td>{item.shift_name}</td><td>{new Date(item.timestamp_utc).toLocaleString()}</td><td><strong style={{ color: 'var(--color-warning)' }}>{item.minutes_late} min</strong></td></tr>)}</tbody></table></div></div>
          <div className="card"><div className="card-header"><span className="card-title"><MapPin size={16} /> GPS verification</span><span className="card-subtitle">{data.summary.outside_fence} outside fence · {data.summary.offline_sync} offline syncs</span></div><div className="table-wrapper"><table><thead><tr><th>Employee</th><th>Branch</th><th>Action</th><th>Distance</th><th>Accuracy</th><th>Status</th></tr></thead><tbody>{data.gps.slice(0, 12).map(item => <tr key={`${item.employee_id}-${item.timestamp_utc}`}><td>{item.full_name}</td><td>{item.site_name}</td><td>{item.action}</td><td>{item.distance_from_site_m == null ? '—' : `${Math.round(item.distance_from_site_m)} m`}</td><td>{item.gps_accuracy_m == null ? '—' : `${Math.round(item.gps_accuracy_m)} m`}</td><td>{item.is_within_fence ? <span className="badge badge-green">Verified</span> : <span className="badge badge-red">Outside fence</span>}</td></tr>)}</tbody></table></div></div>
        </>
      )}
    </div>
  );
};

export default Analytics;