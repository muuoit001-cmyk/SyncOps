import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Shield, Smartphone, MapPin, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import type { AttendanceLog } from '../types';

const FLAG_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  mock_location_detected: { label: 'Mock Location', icon: <Smartphone size={12} />, color: 'var(--color-error)' },
  out_of_fence: { label: 'Out of Fence', icon: <MapPin size={12} />, color: 'var(--color-warning)' },
  gps_accuracy_low: { label: 'Low GPS Accuracy', icon: <Shield size={12} />, color: 'var(--color-warning)' },
  new_device: { label: 'New Device', icon: <Smartphone size={12} />, color: 'var(--color-primary)' },
  rapid_clock_out: { label: 'Rapid Clock-Out', icon: <Clock size={12} />, color: 'var(--color-warning)' },
};

function parseFlagReason(reason: string) {
  const key = Object.keys(FLAG_LABELS).find(k => reason.startsWith(k));
  if (!key) return { label: reason, icon: <AlertTriangle size={12} />, color: 'var(--color-warning)' };
  return { ...FLAG_LABELS[key], label: FLAG_LABELS[key].label + (reason.includes(':') ? ` (${reason.split(':').slice(1).join(':')})` : '') };
}

const Flagged: React.FC = () => {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchFlagged = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance', { params: { flagged: 'true', limit: 100 } });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlagged(); }, [fetchFlagged]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Flagged Events</h1>
          <p className="page-subtitle">
            {total} event{total !== 1 ? 's' : ''} requiring review
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--color-warning-light)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            color: 'var(--color-warning)',
          }}
        >
          <AlertTriangle size={14} />
          Flagged events are logged for review — staff are not blocked automatically
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1,2,3].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 80 }} />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
              <Shield size={28} />
            </div>
            <p style={{ fontWeight: 500 }}>No flagged events</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              All attendance events are clean. Keep it up!
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {logs.map(log => (
            <div
              key={log.id}
              className="card animate-slide-up"
              style={{ borderLeft: '4px solid var(--color-warning)', padding: '1rem 1.25rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  {/* Avatar */}
                  <div
                    style={{
                      width: 40, height: 40,
                      borderRadius: '50%',
                      background: 'var(--color-warning-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.875rem',
                      color: 'var(--color-warning)',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {log.staff_name?.charAt(0) || '?'}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{log.staff_name}</span>
                      <code style={{ fontSize: '0.72rem', background: 'var(--color-bg)', padding: '1px 5px', borderRadius: 4 }}>
                        {log.employee_id}
                      </code>
                      <span className={`badge ${log.action === 'clock_in' ? 'badge-green' : 'badge-gray'}`}>
                        {log.action === 'clock_in' ? '↑ Clock In' : '↓ Clock Out'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      {log.site_name && `${log.site_name} · `}
                      {format(new Date(log.timestamp_utc), 'MMM d, yyyy HH:mm:ss')} UTC
                      {' · '}{formatDistanceToNow(new Date(log.timestamp_utc), { addSuffix: true })}
                    </div>

                    {/* Flag reasons */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {(log.flag_reason || []).map((reason, i) => {
                        const parsed = parseFlagReason(reason);
                        return (
                          <span
                            key={i}
                            className="badge"
                            style={{ background: `${parsed.color}20`, color: parsed.color, gap: '0.3rem' }}
                          >
                            {parsed.icon} {parsed.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* GPS info */}
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {log.distance_from_site_m != null && (
                    <div>{log.distance_from_site_m}m from site</div>
                  )}
                  {log.gps_accuracy_m != null && (
                    <div>GPS ±{Math.round(log.gps_accuracy_m)}m accuracy</div>
                  )}
                  {log.device_label && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                      <Smartphone size={10} /> {log.device_label}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Flagged;
