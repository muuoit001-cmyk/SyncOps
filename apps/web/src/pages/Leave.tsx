import React, { useEffect, useState, useCallback } from 'react';
import {
  CalendarDays, Search, CheckCircle, XCircle, Clock, Download, Filter,
  ChevronDown, FileText, User, RefreshCw,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

interface LeaveRequest {
  id: string;
  starts_on: string;
  ends_on: string;
  days: number;
  reason?: string;
  status: 'pending_manager' | 'pending_hr' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  leave_type_name: string;
  leave_type_code: string;
  full_name: string;
  employee_id: string;
  site_name?: string;
  document_count: number;
}

interface LeaveStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  pending_manager: { label: 'Manager Review', badge: 'badge badge-amber', icon: <Clock size={10} /> },
  pending_hr:      { label: 'HR Review',      badge: 'badge badge-blue',  icon: <Clock size={10} /> },
  approved:        { label: 'Approved',        badge: 'badge badge-green', icon: <CheckCircle size={10} /> },
  rejected:        { label: 'Rejected',        badge: 'badge badge-red',   icon: <XCircle size={10} /> },
};

const LEAVE_TYPE_COLORS: Record<string, string> = {
  ANNUAL:       'var(--color-primary)',
  SICK:         'var(--color-error)',
  MATERNITY:    'var(--color-indigo)',
  PATERNITY:    '#8B5CF6',
  COMPASSIONATE:'#EC4899',
  STUDY:        '#0891B2',
  UNPAID:       'var(--color-text-muted)',
};

const Leave: React.FC = () => {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const canApprove = user?.role !== 'hr';

  const fetchLeave = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { limit: '200' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/attendance/leave/all', { params });
      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchLeave(); }, [fetchLeave]);

  const handleStatusChange = async (id: string, status: string) => {
    setActionLoading(id + status);
    try {
      await api.patch(`/attendance/leave/${id}/status`, {
        status,
        reviewer_notes: notes[id] || null,
      });
      await fetchLeave();
      setExpandedRow(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update leave status');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = requests.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    r.employee_id.toLowerCase().includes(search.toLowerCase()) ||
    r.leave_type_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats: LeaveStats = {
    pending: requests.filter(r => r.status.startsWith('pending')).length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    total: requests.length,
  };

  const fmt = (d: string) => {
    try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">Review and approve employee leave requests</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchLeave} disabled={loading} id="refresh-leave-btn">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card">
          <div className="summary-card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
            <Clock size={20} />
          </div>
          <div className="summary-card-label">Pending Review</div>
          <div className="summary-card-value" style={{ color: 'var(--color-warning)' }}>{stats.pending}</div>
          <div className="summary-card-footer">awaiting action</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
            <CheckCircle size={20} />
          </div>
          <div className="summary-card-label">Approved</div>
          <div className="summary-card-value" style={{ color: 'var(--color-success)' }}>{stats.approved}</div>
          <div className="summary-card-footer">this period</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-icon" style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}>
            <XCircle size={20} />
          </div>
          <div className="summary-card-label">Rejected</div>
          <div className="summary-card-value" style={{ color: 'var(--color-error)' }}>{stats.rejected}</div>
          <div className="summary-card-footer">this period</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <CalendarDays size={20} />
          </div>
          <div className="summary-card-label">Total Requests</div>
          <div className="summary-card-value">{stats.total}</div>
          <div className="summary-card-footer">all time</div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--color-error-light)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.6rem 1rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            flex: 1,
            minWidth: 200,
          }}
        >
          <Search size={15} color="var(--color-text-muted)" />
          <input
            type="search"
            placeholder="Search by name, ID, or leave type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none', outline: 'none',
              fontSize: '0.875rem', flex: 1,
              background: 'transparent',
              color: 'var(--color-text-primary)',
            }}
            aria-label="Search leave requests"
            id="leave-search"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Filter size={14} color="var(--color-text-muted)" />
          <select
            className="form-input form-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            style={{ minWidth: 160 }}
          >
            <option value="">All statuses</option>
            <option value="pending_manager">Manager Review</option>
            <option value="pending_hr">HR Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table-responsive">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Leave Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Status</th>
              <th>Applied</th>
              <th>Docs</th>
              {canApprove && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7,8].map(j => (
                    <td key={j}><div className="skeleton" style={{ height: 16, width: '75%' }} /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={canApprove ? 8 : 7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <CalendarDays size={24} />
                    </div>
                    <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>
                      {search || statusFilter ? 'No matching leave requests' : 'No leave requests yet'}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                      Requests submitted by staff will appear here
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <React.Fragment key={r.id}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                  >
                    {/* Employee */}
                    <td data-label="Employee">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          style={{
                            width: 30, height: 30,
                            borderRadius: '50%',
                            background: 'var(--color-primary-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700,
                            color: 'var(--color-primary)',
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          {r.full_name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.full_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                            {r.employee_id}{r.site_name ? ` · ${r.site_name}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Leave type */}
                    <td data-label="Leave Type">
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: `${LEAVE_TYPE_COLORS[r.leave_type_code] || 'var(--color-primary)'}18`,
                          color: LEAVE_TYPE_COLORS[r.leave_type_code] || 'var(--color-primary)',
                          border: `1px solid ${LEAVE_TYPE_COLORS[r.leave_type_code] || 'var(--color-primary)'}40`,
                        }}
                      >
                        {r.leave_type_name}
                      </span>
                    </td>

                    {/* Dates */}
                    <td data-label="Dates" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {fmt(r.starts_on)} – {fmt(r.ends_on)}
                    </td>

                    {/* Days */}
                    <td data-label="Days">
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28, height: 28,
                          borderRadius: '50%',
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {r.days}
                      </span>
                    </td>

                    {/* Status */}
                    <td data-label="Status">
                      <span className={STATUS_CONFIG[r.status]?.badge}>
                        {STATUS_CONFIG[r.status]?.icon}
                        {STATUS_CONFIG[r.status]?.label}
                      </span>
                    </td>

                    {/* Applied */}
                    <td data-label="Applied" style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      {fmt(r.created_at)}
                    </td>

                    {/* Docs */}
                    <td data-label="Docs">
                      {r.document_count > 0 ? (
                        <span className="badge badge-blue">
                          <FileText size={10} /> {r.document_count}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>None</span>
                      )}
                    </td>

                    {/* Actions */}
                    {canApprove && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {(r.status === 'pending_manager' || r.status === 'pending_hr') && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={e => { e.stopPropagation(); handleStatusChange(r.id, 'approved'); }}
                                disabled={actionLoading === r.id + 'approved'}
                                id={`approve-leave-${r.id}`}
                              >
                                <CheckCircle size={13} />
                                {actionLoading === r.id + 'approved' ? '…' : 'Approve'}
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={e => { e.stopPropagation(); handleStatusChange(r.id, 'rejected'); }}
                                disabled={actionLoading === r.id + 'rejected'}
                                id={`reject-leave-${r.id}`}
                              >
                                <XCircle size={13} />
                                {actionLoading === r.id + 'rejected' ? '…' : 'Reject'}
                              </button>
                            </>
                          )}
                          <button
                            className="btn btn-secondary btn-sm btn-icon"
                            onClick={e => { e.stopPropagation(); setExpandedRow(expandedRow === r.id ? null : r.id); }}
                            aria-label="View details"
                            title="View details"
                          >
                            <ChevronDown size={13} style={{ transform: expandedRow === r.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>

                  {/* Expanded detail row */}
                  {expandedRow === r.id && (
                    <tr>
                      <td colSpan={canApprove ? 8 : 7} style={{ padding: 0 }}>
                        <div
                          style={{
                            padding: '1rem 1.5rem',
                            background: 'var(--color-bg)',
                            borderTop: '1px solid var(--color-border)',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '1rem',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                              Reason
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                              {r.reason || <em style={{ color: 'var(--color-text-muted)' }}>Not provided</em>}
                            </div>
                          </div>
                          {r.reviewer_notes && (
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                                Reviewer Notes
                              </div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>{r.reviewer_notes}</div>
                            </div>
                          )}
                          {canApprove && (r.status === 'pending_manager' || r.status === 'pending_hr') && (
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                                Reviewer Notes (optional)
                              </div>
                              <textarea
                                className="form-input"
                                rows={2}
                                placeholder="Add notes for the employee..."
                                value={notes[r.id] || ''}
                                onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: '0.8rem', resize: 'vertical' }}
                              />
                            </div>
                          )}
                          {r.reviewed_at && (
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                                Reviewed On
                              </div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                                {fmt(r.reviewed_at)}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.75rem', textAlign: 'right' }}>
          Showing {filtered.length} of {total} requests
        </p>
      )}
    </div>
  );
};

export default Leave;
