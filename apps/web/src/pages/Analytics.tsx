import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';

interface AnalyticsData {
  daily: Array<{ day: string; clock_ins: number; clock_outs: number; flagged: number }>;
  sites: Array<{ site_name: string; clock_ins: number; flagged: number }>;
  overtimeMinutes: number;
}

const Analytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    api.get('/analytics', { params: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } })
      .then(response => setData(response.data))
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
      {loading || !data ? <div className="card">Loading analytics...</div> : (
        <>
          <div className="summary-grid" style={{ marginBottom: '1rem' }}>
            <div className="summary-card"><div className="summary-card-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}><BarChart3 size={20} /></div><div className="summary-card-label">Overtime</div><div className="summary-card-value">{Math.round(data.overtimeMinutes / 60)}h</div></div>
            <div className="summary-card"><div className="summary-card-label">Clock-ins</div><div className="summary-card-value">{data.daily.reduce((sum, item) => sum + item.clock_ins, 0)}</div></div>
            <div className="summary-card"><div className="summary-card-label">Flagged events</div><div className="summary-card-value" style={{ color: 'var(--color-warning)' }}>{data.daily.reduce((sum, item) => sum + item.flagged, 0)}</div></div>
          </div>
          <div className="card" style={{ marginBottom: '1rem' }}><div className="card-header"><span className="card-title">Daily attendance</span></div><ResponsiveContainer width="100%" height={300}><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="clock_ins" stroke="var(--color-primary)" name="Clock-ins" /><Line type="monotone" dataKey="flagged" stroke="var(--color-warning)" name="Flagged" /></LineChart></ResponsiveContainer></div>
          <div className="card"><div className="card-header"><span className="card-title">Attendance by site</span></div><ResponsiveContainer width="100%" height={280}><BarChart data={data.sites}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="site_name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="clock_ins" fill="var(--color-primary)" name="Clock-ins" /><Bar dataKey="flagged" fill="var(--color-warning)" name="Flagged" /></BarChart></ResponsiveContainer></div>
        </>
      )}
    </div>
  );
};

export default Analytics;