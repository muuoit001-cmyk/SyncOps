import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Edit2, UserX, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import type { StaffMember, Site } from '../types';

// ── Staff Drawer ────────────────────────────────────────────────────────────
interface StaffDrawerProps {
  open: boolean;
  staff?: StaffMember | null;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}

const StaffDrawer: React.FC<StaffDrawerProps> = ({ open, staff, sites, onClose, onSaved }) => {
  const [form, setForm] = useState({
    employee_id: '', full_name: '', email: '', phone: '', site_id: '', status: 'active',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (staff) {
      setForm({
        employee_id: staff.employee_id,
        full_name: staff.full_name,
        email: staff.email || '',
        phone: staff.phone || '',
        site_id: staff.site_id || '',
        status: staff.status,
      });
    } else {
      setForm({ employee_id: '', full_name: '', email: '', phone: '', site_id: '', status: 'active' });
    }
    setError('');
  }, [staff, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = { ...form, site_id: form.site_id || null };
      if (staff) {
        await api.patch(`/staff/${staff.id}`, payload);
      } else {
        await api.post('/staff', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save staff member');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={staff ? 'Edit staff member' : 'Add staff member'}>
        <div className="drawer-header">
          <h2 className="drawer-title">{staff ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
          <button className="btn btn-secondary btn-icon btn-sm" onClick={onClose} aria-label="Close drawer">✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="drawer-body">
            {error && (
              <div
                style={{
                  padding: '0.75rem',
                  background: 'var(--color-error-light)',
                  color: 'var(--color-error)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                }}
              >
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="employee-id" className="form-label">Employee ID *</label>
              <input
                id="employee-id"
                className="form-input"
                value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value.toUpperCase() }))}
                placeholder="EMP-001"
                required
                disabled={!!staff}
                style={staff ? { background: 'var(--color-bg)', color: 'var(--color-text-muted)' } : {}}
              />
            </div>

            <div className="form-group">
              <label htmlFor="full-name" className="form-label">Full Name *</label>
              <input
                id="full-name"
                className="form-input"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="John Doe"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="staff-email" className="form-label">Email</label>
              <input
                id="staff-email"
                type="email"
                className="form-input"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="john@example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="staff-phone" className="form-label">Phone</label>
              <input
                id="staff-phone"
                type="tel"
                className="form-input"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+254 700 000000"
              />
            </div>

            <div className="form-group">
              <label htmlFor="staff-site" className="form-label">Assigned Site</label>
              <select
                id="staff-site"
                className="form-input form-select"
                value={form.site_id}
                onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
              >
                <option value="">— No site assigned —</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {staff && (
              <div className="form-group">
                <label htmlFor="staff-status" className="form-label">Status</label>
                <select
                  id="staff-status"
                  className="form-input form-select"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            )}
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading} id="staff-save-btn">
              {loading ? 'Saving...' : staff ? 'Save Changes' : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
};

// ── Main Staff Page ─────────────────────────────────────────────────────────
const Staff: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [staffRes, sitesRes] = await Promise.all([api.get('/staff'), api.get('/sites')]);
      setStaffList(staffRes.data);
      setSites(sitesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = staffList.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.employee_id.toLowerCase().includes(search.toLowerCase()) ||
    (s.site_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this staff member and revoke their device access?')) return;
    await api.delete(`/staff/${id}`);
    fetchData();
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'badge-green',
      inactive: 'badge-gray',
      suspended: 'badge-amber',
    };
    return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-subtitle">{staffList.length} staff members total</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingStaff(null); setDrawerOpen(true); }}
          id="add-staff-btn"
        >
          <Plus size={16} /> Add Staff Member
        </button>
      </div>

      {/* Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1rem',
        }}
      >
        <Search size={16} color="var(--color-text-muted)" />
        <input
          type="search"
          placeholder="Search by name, ID, or site..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            border: 'none', outline: 'none',
            fontSize: '0.875rem', flex: 1,
            background: 'transparent',
            color: 'var(--color-text-primary)',
          }}
          aria-label="Search staff"
          id="staff-search"
        />
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table-responsive">
          <thead>
            <tr>
              <th>Name</th>
              <th>Employee ID</th>
              <th>Site</th>
              <th>Status</th>
              <th>Last Clock-In</th>
              <th>Enrolled</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3].map(i => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7].map(j => (
                    <td key={j}><div className="skeleton" style={{ height: 16, width: '80%' }} /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                  {search ? `No staff matching "${search}"` : 'No staff members yet'}
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id}>
                  <td data-label="Name">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: 32, height: 32,
                          borderRadius: '50%',
                          background: 'var(--color-primary-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: 'var(--color-primary)',
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      >
                        {s.full_name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.full_name}</div>
                        {s.email && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.email}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="ID">
                    <code style={{ fontSize: '0.8rem', background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4 }}>
                      {s.employee_id}
                    </code>
                  </td>
                  <td data-label="Site">
                    {s.site_name ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.875rem' }}>
                        <MapPin size={12} color="var(--color-text-muted)" />
                        {s.site_name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Unassigned</span>
                    )}
                  </td>
                  <td data-label="Status">{statusBadge(s.status)}</td>
                  <td data-label="Last Clock-In" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {s.last_clock_in ? format(new Date(s.last_clock_in), 'MMM d, HH:mm') : '—'}
                  </td>
                  <td data-label="Enrolled" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {s.enrolled_at ? <span className="badge badge-green">Enrolled</span> : <span className="badge badge-gray">Not enrolled</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary btn-sm btn-icon"
                        onClick={() => { setEditingStaff(s); setDrawerOpen(true); }}
                        aria-label={`Edit ${s.full_name}`}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn btn-danger btn-sm btn-icon"
                        onClick={() => handleDeactivate(s.id)}
                        aria-label={`Deactivate ${s.full_name}`}
                        title="Deactivate"
                        disabled={s.status === 'inactive'}
                      >
                        <UserX size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <StaffDrawer
        open={drawerOpen}
        staff={editingStaff}
        sites={sites}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchData}
      />
    </div>
  );
};

export default Staff;
