import React, { useEffect, useState } from 'react';
import { Users, Clock, UserX, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import type { DashboardSummary, RecentActivity } from '../types';

interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  subtitle?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, color, bgColor, subtitle }) => (
  <div className="summary-card" role="region" aria-label={`${label}: ${value}`}>
    <div className="summary-card-icon" style={{ background: bgColor, color }}>
      {icon}
    </div>
    <div className="summary-card-label">{label}</div>
    <div className="summary-card-value" style={{ color }}>
      {value.toLocaleString()}
    </div>
    {subtitle && <div className="summary-card-footer">{subtitle}</div>}
  </div>
);

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await api.get('/attendance/dashboard');
        setSummary(data.summary);
        setActivity(data.recentActivity);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  const SkeletonCard = () => (
    <div className="summary-card">
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 10, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 80, height: 12, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 60, height: 36 }} />
    </div>
  );

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{today} · Auto-refreshes every 30s</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
        {loading ? (
          [1,2,3,4].map(i => <SkeletonCard key={i} />)
        ) : summary ? (
          <>
            <SummaryCard
              label="Present Today"
              value={summary.present}
              icon={<Users size={20} />}
              color="var(--color-primary)"
              bgColor="var(--color-primary-light)"
              subtitle={`of ${summary.totalActive} active staff`}
            />
            <SummaryCard
              label="Clocked In Late"
              value={summary.late}
              icon={<Clock size={20} />}
              color="var(--color-warning)"
              bgColor="var(--color-warning-light)"
              subtitle="after 9:00 AM"
            />
            <SummaryCard
              label="Absent"
              value={summary.absent}
              icon={<UserX size={20} />}
              color="#6B7280"
              bgColor="#F3F4F6"
              subtitle="not clocked in yet"
            />
            <SummaryCard
              label="Flagged Events"
              value={summary.flagged}
              icon={<AlertTriangle size={20} />}
              color="var(--color-error)"
              bgColor="var(--color-error-light)"
              subtitle="require review"
            />
          </>
        ) : null}
      </div>

      {/* Recent activity */}
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} color="var(--color-text-muted)" />
            <span className="card-title">Recent Activity</span>
          </div>
        </div>

        {loading ? (
          <div>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="activity-item">
                <div className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 6 }} />
                  <div className="skeleton" style={{ width: '40%', height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Clock size={28} />
            </div>
            <p style={{ fontWeight: 500 }}>No activity today</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Clock-in events will appear here in real time
            </p>
          </div>
        ) : (
          <div>
            {activity.map((item, i) => (
              <div key={i} className="activity-item">
                <div
                  className="activity-dot"
                  style={{
                    background: item.is_flagged
                      ? 'var(--color-warning)'
                      : item.action === 'clock_in'
                      ? 'var(--color-success)'
                      : 'var(--color-text-muted)',
                  }}
                  aria-hidden="true"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                      {item.staff_name}
                    </span>
                    <span
                      className={`badge ${
                        item.action === 'clock_in' ? 'badge-green' : 'badge-gray'
                      }`}
                    >
                      {item.action === 'clock_in' ? (
                        <><CheckCircle size={10} /> Clocked In</>
                      ) : (
                        <><Clock size={10} /> Clocked Out</>
                      )}
                    </span>
                    {item.is_flagged && (
                      <span className="badge badge-amber">
                        <AlertTriangle size={10} /> Flagged
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    {item.site_name && `${item.site_name} · `}
                    {formatDistanceToNow(new Date(item.timestamp_utc), { addSuffix: true })}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {format(new Date(item.timestamp_utc), 'HH:mm')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
