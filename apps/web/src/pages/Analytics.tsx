import React, { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Clock3, MapPin, Users, CalendarDays, TrendingUp, RefreshCw } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import api from '../services/api';

interface AnalyticsData {
  summary: { active_staff: number; clock_ins: number; clock_outs: number; flagged: number; outside_fence: number; offline_sync: number; leave_days: number };
  daily: Array<{ day: string; clock_ins: number; clock_outs: number; flagged: number; outside_fence: number; leave_count: number }>;
  sites: Array<{ site_name: string; clock_ins: number; flagged: number; outside_fence: number; employees_present: number }>;
  flags: Array<{ flag_reason: string; count: number }>;
  late: Array<{ full_name: string; employee_id: string; site_name: string; timestamp_utc: string; shift_name: string; minutes_late: number }>;
  gps: Array<{ full_name: string; employee_id: string; site_name: string; action: string; timestamp_utc: string; gps_accuracy_m: number | null; distance_from_site_m: number | null; is_within_fence: boolean; is_offline_sync: boolean }>;
  employees: Array<{ full_name: string; employee_id: string; site_name: string; clock_ins: number; clock_outs: number; flagged: number; outside_fence: number }>;
  leaveByType?: Array<{ leave_type_name: string; request_count: number; total_days: number }>;
  overtimeMinutes: number;
}

const customTooltipStyle = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: '0.8rem',
};

const Analytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    setLoading(true);
    setError('');
    api.get('/analytics', { params: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } })
      .then(response => setData(response.data))
      .catch(err => setError(err.response?.data?.error || err.message || 'Unable to load analytics'))
      .finally(() => setLoading(false));
  }, [days, reloadKey]);

  const fmtTime = (ts: string) => {
    try { return format(new Date(ts), 'dd MMM, HH:mm'); } catch { return ts; }
  };

  const fmtDay = (d: string) => {
    try { return format(parseISO(d), 'dd MMM'); } catch { return d; }
  };

  const overtimeHours = data ? (data.overtimeMinutes / 60).toFixed(1) : '0.0';

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Attendance, leave, flags & overtime trends</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            className="form-input form-select"
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            aria-label="Analytics period"
            style={{ minWidth: 140 }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn btn-secondary btn-icon" onClick={() => setReloadKey(k => k + 1)} aria-label="Refresh analytics">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div>
          <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
            {[1,2,3,4,5].map(i => <div key={i} className="summary-card"><div className="skeleton" style={{ height: 80 }} /></div>)}
          </div>
          <div className="card"><div className="skeleton" style={{ height: 300 }} /></div>
        </div>
      ) : error ? (
        <div className="card" role="alert" style={{ color: 'var(--color-error)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <AlertTriangle size={20} />
          {error}
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setReloadKey(k => k + 1)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : !data ? (
        <div className="card">No analytics data available.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="summary-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="summary-card">
              <div className="summary-card-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                <Users size={20} />
              </div>
              <div className="summary-card-label">Active Staff</div>
              <div className="summary-card-value">{data.summary.active_staff}</div>
              <div className="summary-card-footer">total enrolled</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                <BarChart3 size={20} />
              </div>
              <div className="summary-card-label">Clock-ins</div>
              <div className="summary-card-value" style={{ color: 'var(--color-success)' }}>{data.summary.clock_ins}</div>
              <div className="summary-card-footer">this period</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                <Clock3 size={20} />
              </div>
              <div className="summary-card-label">Late Arrivals</div>
              <div className="summary-card-value" style={{ color: 'var(--color-warning)' }}>{data.late.length}</div>
              <div className="summary-card-footer">after shift start</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-icon" style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}>
                <AlertTriangle size={20} />
              </div>
              <div className="summary-card-label">Exceptions</div>
              <div className="summary-card-value" style={{ color: 'var(--color-error)' }}>{data.summary.flagged}</div>
              <div className="summary-card-footer">require review</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-icon" style={{ background: 'var(--color-indigo-light)', color: 'var(--color-indigo)' }}>
                <CalendarDays size={20} />
              </div>
              <div className="summary-card-label">Leave Days</div>
              <div className="summary-card-value" style={{ color: 'var(--color-indigo)' }}>{data.summary.leave_days}</div>
              <div className="summary-card-footer">approved this period</div>
            </div>
          </div>

          {/* Daily trend chart */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-header">
              <span className="card-title"><TrendingUp size={16} /> Attendance & Leave Trend</span>
              <span className="card-subtitle">Daily breakdown</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} width={30} />
                <Tooltip
                  contentStyle={customTooltipStyle}
                  labelFormatter={v => fmtDay(String(v))}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem' }} />
                <Line type="monotone" dataKey="clock_ins" stroke="var(--color-primary)" name="Clock-ins" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="clock_outs" stroke="var(--color-success)" name="Clock-outs" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="flagged" stroke="var(--color-warning)" name="Flagged" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="leave_count" stroke="var(--color-indigo)" name="On Leave" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Branch + exceptions grid */}
          <div className="dashboard-grid" style={{ marginBottom: '1.25rem' }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Branch Comparison</span>
                <span className="card-subtitle">{data.sites.length} sites</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.sites} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="site_name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={28} />
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem' }} />
                  <Bar dataKey="employees_present" fill="var(--color-primary)" name="Present" radius={[4,4,0,0]} />
                  <Bar dataKey="flagged" fill="var(--color-warning)" name="Flagged" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Exception Reasons</span>
                <span className="card-subtitle">{data.flags.length} types</span>
              </div>
              {data.flags.length ? (
                <div>
                  {data.flags.map(f => (
                    <div
                      key={f.flag_reason}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.65rem 0',
                        borderBottom: '1px solid var(--color-border)',
                        gap: '0.5rem',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>{f.flag_reason}</span>
                      <span className="badge badge-amber">{f.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state" style={{ padding: '1.5rem 0' }}>No exceptions in this period.</p>
              )}

              {/* Leave by type mini summary */}
              {data.leaveByType && data.leaveByType.length > 0 && (
                <>
                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                      Leave by Type
                    </div>
                    {data.leaveByType.map(lt => (
                      <div key={lt.leave_type_name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '0.85rem' }}>{lt.leave_type_name}</span>
                        <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <span className="badge badge-indigo">{lt.total_days}d</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{lt.request_count} req</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Overtime highlight */}
          {data.overtimeMinutes > 0 && (
            <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="summary-card-icon" style={{ background: 'var(--color-indigo-light)', color: 'var(--color-indigo)', flexShrink: 0 }}>
                <Clock3 size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-indigo)' }}>{overtimeHours}h overtime</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Total overtime logged in this period across all staff</div>
              </div>
            </div>
          )}

          {/* Late arrivals table */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-header">
              <span className="card-title"><Clock3 size={16} /> Late Arrivals</span>
              <span className="card-subtitle">{data.late.length} records</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Branch</th>
                    <th>Shift</th>
                    <th>Arrival</th>
                    <th>Minutes Late</th>
                  </tr>
                </thead>
                <tbody>
                  {data.late.length === 0 ? (
                    <tr><td colSpan={5}><p className="empty-state">No late arrivals in this period.</p></td></tr>
                  ) : data.late.slice(0, 15).map(item => (
                    <tr key={`${item.employee_id}-${item.timestamp_utc}`}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.full_name}</div>
                        <small style={{ color: 'var(--color-text-muted)' }}>{item.employee_id}</small>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{item.site_name}</td>
                      <td style={{ fontSize: '0.85rem' }}>{item.shift_name || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{fmtTime(item.timestamp_utc)}</td>
                      <td>
                        <span className="badge badge-amber">{item.minutes_late} min</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GPS verification table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title"><MapPin size={16} /> GPS Verification</span>
              <span className="card-subtitle">
                {data.summary.outside_fence} outside fence · {data.summary.offline_sync} offline syncs
              </span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Branch</th>
                    <th>Action</th>
                    <th>Distance</th>
                    <th>Accuracy</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gps.length === 0 ? (
                    <tr><td colSpan={6}><p className="empty-state">No GPS data in this period.</p></td></tr>
                  ) : data.gps.slice(0, 15).map(item => (
                    <tr key={`${item.employee_id}-${item.timestamp_utc}`}>
                      <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{item.full_name}</td>
                      <td style={{ fontSize: '0.85rem' }}>{item.site_name}</td>
                      <td>
                        <span className={`badge ${item.action === 'clock_in' ? 'badge-green' : 'badge-gray'}`}>
                          {item.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {item.distance_from_site_m == null ? '—' : `${Math.round(item.distance_from_site_m)}m`}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {item.gps_accuracy_m == null ? '—' : `±${Math.round(item.gps_accuracy_m)}m`}
                      </td>
                      <td>
                        {item.is_within_fence
                          ? <span className="badge badge-green">Verified</span>
                          : <span className="badge badge-red">Outside</span>}
                        {item.is_offline_sync && (
                          <span className="badge badge-gray" style={{ marginLeft: '0.3rem' }}>Offline</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;