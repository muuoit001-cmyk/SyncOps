import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Search, Edit2, UserX, MapPin, Upload, Download, X, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import type { StaffMember, Site } from '../types';
import { csvEscape, downloadTextFile, parseCsv, staffTemplateCsv } from '../utils/csv';
import { useAuthStore } from '../store/authStore';

// ── Staff Drawer ────────────────────────────────────────────────────────────
interface StaffDrawerProps {
  open: boolean;
  staff?: StaffMember | null;
  sites: Site[];
  departments: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; department_id?: string }>;
  shifts: Array<{ id: string; name: string; start_time: string; end_time: string }>;
  managers: Array<{ id: string; full_name: string; role_title?: string }>;
  onClose: () => void;
  onSaved: () => void;
}

const StaffDrawer: React.FC<StaffDrawerProps> = ({ open, staff, sites, departments, teams, shifts, managers, onClose, onSaved }) => {
  const [form, setForm] = useState({
    employee_id: '', full_name: '', email: '', phone: '', site_id: '', department_id: '', team_id: '', manager_staff_id: '', role_title: '', shift_id: '', status: 'active',
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
        department_id: staff.department_id || '',
        team_id: staff.team_id || '',
        manager_staff_id: staff.manager_staff_id || '',
        role_title: staff.role_title || '',
        shift_id: staff.shift_id || '',
        status: staff.status,
      });
    } else {
      setForm({ employee_id: '', full_name: '', email: '', phone: '', site_id: '', department_id: '', team_id: '', manager_staff_id: '', role_title: '', shift_id: '', status: 'active' });
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
        if (form.shift_id) await api.put(`/shifts/assign/${staff.id}`, { shift_id: form.shift_id });
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
              <label htmlFor="staff-role" className="form-label">Role / Job Title</label>
              <input id="staff-role" className="form-input" value={form.role_title} onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))} placeholder="Collection Officer" />
            </div>

            <div className="form-group">
              <label htmlFor="staff-department" className="form-label">Department</label>
              <select id="staff-department" className="form-input form-select" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value, team_id: '' }))}>
                <option value="">— No department assigned —</option>
                {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="staff-team" className="form-label">Team</label>
              <select id="staff-team" className="form-input form-select" value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))}>
                <option value="">— No team assigned —</option>
                {teams.filter(team => !form.department_id || team.department_id === form.department_id).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="staff-shift" className="form-label">Assigned Shift</label>
              <select id="staff-shift" className="form-input form-select" value={form.shift_id} onChange={e => setForm(f => ({ ...f, shift_id: e.target.value }))}>
                <option value="">— No shift assigned —</option>
                {shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="staff-manager" className="form-label">Manager</label>
              <select id="staff-manager" className="form-input form-select" value={form.manager_staff_id} onChange={e => setForm(f => ({ ...f, manager_staff_id: e.target.value }))}>
                <option value="">— No manager assigned —</option>
                {managers.filter(manager => manager.id !== staff?.id).map(manager => <option key={manager.id} value={manager.id}>{manager.full_name}{manager.role_title ? ` (${manager.role_title})` : ''}</option>)}
              </select>
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
  const { user } = useAuthStore();
  const canWrite = user?.role !== 'hr';
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; department_id?: string }>>([]);
  const [shifts, setShifts] = useState<Array<{ id: string; name: string; start_time: string; end_time: string }>>([]);
  const [managers, setManagers] = useState<Array<{ id: string; full_name: string; role_title?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [staffRes, sitesRes, organizationRes] = await Promise.all([api.get('/staff'), api.get('/sites'), api.get('/organization/overview')]);
      setStaffList(staffRes.data);
      setSites(sitesRes.data);
      setDepartments(organizationRes.data.departments);
      setTeams(organizationRes.data.teams);
      setShifts(organizationRes.data.shifts);
      setManagers(staffRes.data.filter((member: StaffMember) => member.status === 'active'));
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

  const handleGenerateEnrollmentCode = async (staff: StaffMember) => {
    try {
      const { data } = await api.post(`/staff/${staff.id}/enrollment-code`);
      window.alert(`Enrollment code for ${data.employee_id}: ${data.code}\n\nGive this code to the staff member. It expires in 24 hours and can only be used once.`);
    } catch (err: any) {
      window.alert(err.response?.data?.error || 'Failed to generate enrollment code');
    }
  };

  const handleBulkFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error('The uploaded CSV has no staff records.');
      const { data } = await api.post('/staff/bulk', { staff: rows });
      setBulkResult(data);
      fetchData();
    } catch (err: any) {
      setBulkResult({ error: err.response?.data?.error || err.message || 'Bulk import failed' });
    } finally {
      setBulkLoading(false);
    }
  };

  const downloadBulkErrors = () => {
    const errors = [...(bulkResult?.failed || []), ...(bulkResult?.duplicates || [])];
    const rows = [
      ['Row', 'Column', 'Employee ID', 'Error'],
      ...errors.map((item: any) => [item.row, item.column || '', item.employee_id || '', item.error || '']),
    ];
    downloadTextFile('syncops_staff_import_errors.csv', rows.map(row => row.map(csvEscape).join(',')).join('\r\n'));
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
        {canWrite && <button
          className="btn btn-primary"
          onClick={() => { setEditingStaff(null); setDrawerOpen(true); }}
          id="add-staff-btn"
        >
          <Plus size={16} /> Add Staff Member
        </button>}
        {canWrite && <button className="btn btn-secondary" onClick={() => { setBulkOpen(true); setBulkResult(null); }}>
          <Upload size={16} /> Bulk Add Staff
        </button>}
      </div>

      {bulkOpen && (
        <div className="card" style={{ marginBottom: '1rem' }} role="dialog" aria-label="Bulk add staff">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem', margin: 0 }}>Bulk Add Staff</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                Upload a CSV using the required columns: Employee ID, Full Name, Email, Phone, Site Name.
              </p>
            </div>
            <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setBulkOpen(false)} aria-label="Close bulk upload">
              <X size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => downloadTextFile('syncops_staff_template.csv', staffTemplateCsv())}>
              <Download size={15} /> Download Template
            </button>
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={bulkLoading}>
              <Upload size={15} /> {bulkLoading ? 'Importing...' : 'Choose CSV'}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleBulkFile} hidden />
          </div>
          {bulkResult?.error && <p role="alert" style={{ color: 'var(--color-error)', marginBottom: 0 }}>{bulkResult.error}</p>}
          {bulkResult && !bulkResult.error && (
            <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span className="badge badge-green">Added: {bulkResult.importedCount}</span>
                <span className="badge badge-amber">Duplicates: {bulkResult.duplicateCount}</span>
                <span className="badge badge-red">Failed: {bulkResult.failedCount}</span>
              </div>
              {(bulkResult.failedCount > 0 || bulkResult.duplicateCount > 0) && (
                <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.75rem' }} onClick={downloadBulkErrors}>
                  <Download size={14} /> Download Error Report
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
                      {canWrite && <button
                        className="btn btn-secondary btn-sm btn-icon"
                        onClick={() => handleGenerateEnrollmentCode(s)}
                        aria-label={`Generate enrollment code for ${s.full_name}`}
                        title="Generate enrollment code"
                      >
                        <KeyRound size={14} />
                      </button>}
                      {canWrite && <button
                        className="btn btn-secondary btn-sm btn-icon"
                        onClick={() => { setEditingStaff(s); setDrawerOpen(true); }}
                        aria-label={`Edit ${s.full_name}`}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>}
                      {canWrite && <button
                        className="btn btn-danger btn-sm btn-icon"
                        onClick={() => handleDeactivate(s.id)}
                        aria-label={`Deactivate ${s.full_name}`}
                        title="Deactivate"
                        disabled={s.status === 'inactive'}
                      >
                        <UserX size={14} />
                      </button>}
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
        departments={departments}
        teams={teams}
        shifts={shifts}
        managers={managers}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchData}
      />
    </div>
  );
};

export default Staff;
