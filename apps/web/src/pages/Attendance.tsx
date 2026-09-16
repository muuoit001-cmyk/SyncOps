import React, { useEffect, useState, useCallback } from 'react';
import { Download, Filter, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { AttendanceLog, Site, StaffMember } from '../types';

const FlagReasonTooltip: React.FC<{ reasons: string[] }> = ({ reasons }) => (
  <div className="tooltip-wrapper">
    <span className="badge badge-amber" style={{ cursor: 'help' }}>
      <AlertTriangle size={10} /> {reasons.length} flag{reasons.length > 1 ? 's' : ''}
    </span>
    <div className="tooltip" style={{ maxWidth: 280, whiteSpace: 'normal' }}>
      {reasons.map((r, i) => (
        <div key={i} style={{ marginBottom: i < reasons.length - 1 ? 2 : 0 }}>
          • {r.replace(/_/g, ' ')}
        </div>
      ))}
    </div>
  </div>
);

const Attendance: React.FC = () => {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sites, setSites] = useState<Site[]>([]);

  // Filters
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [staffFilter, setStaffFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortField, setSortField] = useState<string>('timestamp_utc');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from: from ? `${from}T00:00:00Z` : '',
        to: to ? `${to}T23:59:59Z` : '',
        limit: String(LIMIT),
        offset: String(page * LIMIT),
      };
      if (staffFilter) params.staff_id = staffFilter;
      if (siteFilter) params.site_id = siteFilter;
      if (flaggedOnly) params.flagged = 'true';
      const { data } = await api.get('/attendance', { params });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [from, to, staffFilter, siteFilter, flaggedOnly, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    Promise.all([api.get('/staff'), api.get('/sites')]).then(([s, si]) => {
      setStaff(s.data);
      setSites(si.data);
    });
  }, []);

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    const toastId = toast.loading('Exporting attendance records...');
    try {
      const params: Record<string, string> = {};
      if (from) params.from = `${from}T00:00:00Z`;
      if (to) params.to = `${to}T23:59:59Z`;
      if (staffFilter) params.staff_id = staffFilter;
      if (siteFilter) params.site_id = siteFilter;
      if (flaggedOnly) params.flagged = 'true';

      const response = await api.get('/attendance/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `syncops_attendance_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Attendance CSV exported successfully!', { id: toastId });
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(err.response?.data?.error || 'Failed to export CSV', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon: React.FC<{ field: string }> = ({ field }) => (
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
      : <span style={{ width: 12 }} />
  );

  const sorted = [...logs].sort((a, b) => {
    const va = (a as any)[sortField] ?? '';
    const vb = (b as any)[sortField] ?? '';
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Log</h1>
          <p className="page-subtitle">{total.toLocaleString()} records found</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={exporting} id="export-csv-btn">
          <Download size={16} /> {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <Filter size={14} color="var(--color-text-muted)" />
        <input
          type="date"
          className="form-input"
          value={from}
          onChange={e => { setFrom(e.target.value); setPage(0); }}
          style={{ width: 140 }}
          aria-label="From date"
          id="filter-from-date"
        />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>to</span>
        <input
          type="date"
          className="form-input"
          value={to}
          onChange={e => { setTo(e.target.value); setPage(0); }}
          style={{ width: 140 }}
          aria-label="To date"
          id="filter-to-date"
        />
        <select
          className="form-input form-select"
          value={staffFilter}
          onChange={e => { setStaffFilter(e.target.value); setPage(0); }}
          style={{ width: 180 }}
          aria-label="Filter by staff"
          id="filter-staff"
        >
          <option value="">All staff</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <select
          className="form-input form-select"
          value={siteFilter}
          onChange={e => { setSiteFilter(e.target.value); setPage(0); }}
          style={{ width: 160 }}
          aria-label="Filter by site"
          id="filter-site"
        >
          <option value="">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={e => { setFlaggedOnly(e.target.checked); setPage(0); }}
            id="filter-flagged"
            style={{ accentColor: 'var(--color-warning)' }}
          />
          Flagged only
        </label>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { setFrom(''); setTo(''); setStaffFilter(''); setSiteFilter(''); setFlaggedOnly(false); setPage(0); }}
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table-responsive">
          <thead>
            <tr>
              <th onClick={() => handleSort('staff_name')} style={{ cursor: 'pointer' }}>
                Staff <SortIcon field="staff_name" />
              </th>
              <th onClick={() => handleSort('action')} style={{ cursor: 'pointer' }}>
                Action <SortIcon field="action" />
              </th>
              <th onClick={() => handleSort('timestamp_utc')} style={{ cursor: 'pointer' }}>
                Timestamp <SortIcon field="timestamp_utc" />
              </th>
              <th>Site</th>
              <th>GPS</th>
              <th>Fence</th>
              <th>Flags</th>
              <th>Sync</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7,8].map(j => (
                    <td key={j}><div className="skeleton" style={{ height: 14, width: '80%' }} /></td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                  No attendance records found for the selected filters
                </td>
              </tr>
            ) : (
              sorted.map(log => (
                <tr key={log.id} className={log.is_flagged ? 'flagged-row' : ''}>
                  <td data-label="Staff">
                    <div style={{ fontWeight: 500 }}>{log.staff_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{log.employee_id}</div>
                  </td>
                  <td data-label="Action">
                    <span className={`badge ${log.action === 'clock_in' ? 'badge-green' : 'badge-gray'}`}>
                      {log.action === 'clock_in' ? '↑ Clock In' : '↓ Clock Out'}
                    </span>
                  </td>
                  <td data-label="Time" style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                    <div>{format(new Date(log.timestamp_utc), 'MMM d, yyyy')}</div>
                    <div style={{ color: 'var(--color-text-muted)' }}>{format(new Date(log.timestamp_utc), 'HH:mm:ss')}</div>
                  </td>
                  <td data-label="Site" style={{ fontSize: '0.8rem' }}>{log.site_name || '—'}</td>
                  <td data-label="GPS" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {log.gps_accuracy_m != null ? `±${Math.round(log.gps_accuracy_m)}m` : '—'}
                  </td>
                  <td data-label="Fence">
                    {log.is_within_fence ? (
                      <span className="badge badge-green">In fence</span>
                    ) : (
                      <div className="tooltip-wrapper">
                        <span className="badge badge-red" style={{ cursor: 'help' }}>Out of fence</span>
                        {log.distance_from_site_m != null && (
                          <div className="tooltip">{log.distance_from_site_m}m from site</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td data-label="Flags">
                    {log.is_flagged && log.flag_reason?.length ? (
                      <FlagReasonTooltip reasons={log.flag_reason} />
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td data-label="Sync">
                    {log.is_offline_sync ? (
                      <span className="badge badge-amber">Offline</span>
                    ) : (
                      <span className="badge badge-green">Online</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          <span>Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>Previous</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
