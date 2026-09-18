import React, { useEffect, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, Clock3, Plus, Users } from 'lucide-react';
import api from '../services/api';

interface Department { id: string; name: string; code: string; description?: string; staff_count: number }
interface Team { id: string; name: string; code: string; department_name?: string; site_name?: string; leader_name?: string; staff_count: number }
interface Shift { id: string; name: string; start_time: string; end_time: string; grace_minutes: number; staff_count: number; working_days?: number[] }
interface LeaveType { id: string; name: string; code: string; days_per_year: number }
interface LeaveRequest { id: string; full_name: string; employee_id: string; leave_type_name: string; starts_on: string; ends_on: string; days: number; reason?: string }

interface OrganizationData {
  departments: Department[];
  teams: Team[];
  shifts: Shift[];
  leaveTypes: LeaveType[];
  pendingLeave: LeaveRequest[];
}

const emptyData: OrganizationData = { departments: [], teams: [], shifts: [], leaveTypes: [], pendingLeave: [] };

const Organization: React.FC = () => {
  const [data, setData] = useState<OrganizationData>(emptyData);
  const [tab, setTab] = useState<'departments' | 'teams' | 'shifts' | 'leave'>('departments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', code: '', description: '', days_per_year: '21', department_id: '', start_time: '08:00', end_time: '17:00', grace_minutes: '10' });

  const load = () => {
    setLoading(true);
    api.get('/organization/overview').then(response => setData(response.data)).catch(err => setError(err.response?.data?.error || 'Unable to load organization data')).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (path: string, payload: Record<string, unknown>) => {
    try {
      await api.post(path, payload);
      setForm({ name: '', code: '', description: '', days_per_year: '21', department_id: '', start_time: '08:00', end_time: '17:00', grace_minutes: '10' });
      setError('');
      load();
    } catch (err: any) {
      const validationMessage = err.response?.data?.errors?.[0]?.msg;
      setError(validationMessage || err.response?.data?.error || 'Could not save this record');
    }
  };

  const updateLeave = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await api.patch(`/organization/leave-requests/${id}`, { status });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not update leave request');
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (tab === 'departments') return create('/organization/departments', form);
    if (tab === 'teams') return create('/organization/teams', { ...form, department_id: form.department_id || null });
    if (tab === 'shifts') return create('/shifts', { name: form.name, start_time: form.start_time, end_time: form.end_time, grace_minutes: Number(form.grace_minutes) });
    if (tab === 'leave') return create('/organization/leave-types', { ...form, days_per_year: Number(form.days_per_year) });
  };

  const tabItems = [
    { id: 'departments' as const, label: 'Departments', icon: BriefcaseBusiness },
    { id: 'teams' as const, label: 'Teams', icon: Users },
    { id: 'shifts' as const, label: 'Shifts', icon: Clock3 },
    { id: 'leave' as const, label: 'Leave setup', icon: CalendarDays },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h1 className="page-title">Organization</h1><p className="page-subtitle">Structure people, schedules, and leave workflows in one place</p></div>
      </div>
      <div className="summary-grid" style={{ marginBottom: '1rem' }}>
        <div className="summary-card"><div className="summary-card-label">Departments</div><div className="summary-card-value">{data.departments.length}</div></div>
        <div className="summary-card"><div className="summary-card-label">Teams</div><div className="summary-card-value">{data.teams.length}</div></div>
        <div className="summary-card"><div className="summary-card-label">Active shifts</div><div className="summary-card-value">{data.shifts.length}</div></div>
        <div className="summary-card"><div className="summary-card-label">Pending leave</div><div className="summary-card-value">{data.pendingLeave.length}</div></div>
      </div>
      {error && <div style={{ marginBottom: '1rem', padding: '0.75rem', color: 'var(--color-error)', background: 'var(--color-error-light)', borderRadius: 'var(--radius-md)' }}>{error}</div>}
      <div className="tabs" role="tablist" aria-label="Organization sections">
        {tabItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`tab ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)} role="tab" aria-selected={tab === item.id}><Icon size={16} /> {item.label}</button>; })}
      </div>
      {loading ? <div className="card">Loading organization data...</div> : (
        <div className="organization-layout">
          {(
            <form className="card organization-form" onSubmit={submit}>
              <div className="card-header"><span className="card-title"><Plus size={16} /> Add {tab === 'departments' ? 'department' : tab === 'teams' ? 'team' : tab === 'shifts' ? 'shift' : 'leave type'}</span></div>
              <label className="form-label" htmlFor="org-name">Name</label><input id="org-name" className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={tab === 'departments' ? 'Collections' : tab === 'teams' ? 'Nairobi Collections' : 'Annual Leave'} required />
              {tab === 'shifts' ? <><label className="form-label" htmlFor="shift-start">Start time</label><input id="shift-start" className="form-input" type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} /><label className="form-label" htmlFor="shift-end">End time</label><input id="shift-end" className="form-input" type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} /><label className="form-label" htmlFor="shift-grace">Late grace (minutes)</label><input id="shift-grace" className="form-input" type="number" min="0" value={form.grace_minutes} onChange={e => setForm(f => ({ ...f, grace_minutes: e.target.value }))} /></> : <><label className="form-label" htmlFor="org-code">Code</label><input id="org-code" className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder={tab === 'departments' ? 'COL' : tab === 'teams' ? 'NBI-COL-01' : 'ANNUAL'} required />{tab === 'teams' && <><label className="form-label" htmlFor="team-department">Department</label><select id="team-department" className="form-input form-select" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}><option value="">Unassigned</option>{data.departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></>}{tab === 'leave' ? <><label className="form-label" htmlFor="leave-days">Days per year</label><input id="leave-days" className="form-input" type="number" min="0" step="0.5" value={form.days_per_year} onChange={e => setForm(f => ({ ...f, days_per_year: e.target.value }))} /></> : <><label className="form-label" htmlFor="org-description">Description</label><textarea id="org-description" className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></>}</>}
              <button className="btn btn-primary" type="submit"><Plus size={15} /> Create</button>
            </form>
          )}
          <div className="card">
            <div className="card-header"><span className="card-title">{tabItems.find(item => item.id === tab)?.label}</span></div>
            {tab === 'departments' && <div className="table-wrapper"><table><thead><tr><th>Name</th><th>Code</th><th>Employees</th></tr></thead><tbody>{data.departments.map(item => <tr key={item.id}><td>{item.name}</td><td><code>{item.code}</code></td><td>{item.staff_count}</td></tr>)}</tbody></table></div>}
            {tab === 'teams' && <div className="table-wrapper"><table><thead><tr><th>Team</th><th>Department</th><th>Branch</th><th>Leader</th><th>Employees</th></tr></thead><tbody>{data.teams.map(item => <tr key={item.id}><td>{item.name}<small style={{ display: 'block', color: 'var(--color-text-muted)' }}>{item.code}</small></td><td>{item.department_name || '—'}</td><td>{item.site_name || '—'}</td><td>{item.leader_name || 'Unassigned'}</td><td>{item.staff_count}</td></tr>)}</tbody></table></div>}
            {tab === 'shifts' && <div className="table-wrapper"><table><thead><tr><th>Shift</th><th>Schedule</th><th>Grace</th><th>Assigned</th></tr></thead><tbody>{data.shifts.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}</td><td>{item.grace_minutes} min</td><td>{item.staff_count}</td></tr>)}</tbody></table></div>}
            {tab === 'leave' && <><div className="table-wrapper"><table><thead><tr><th>Leave type</th><th>Code</th><th>Allowance</th></tr></thead><tbody>{data.leaveTypes.map(item => <tr key={item.id}><td>{item.name}</td><td><code>{item.code}</code></td><td>{item.days_per_year} days</td></tr>)}</tbody></table></div><h3 style={{ margin: '1.5rem 0 0.75rem' }}>Pending requests</h3><div className="table-wrapper"><table><thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Days</th><th>Actions</th></tr></thead><tbody>{data.pendingLeave.map(item => <tr key={item.id}><td>{item.full_name}<small style={{ display: 'block', color: 'var(--color-text-muted)' }}>{item.employee_id}</small></td><td>{item.leave_type_name}</td><td>{item.starts_on} - {item.ends_on}</td><td>{item.days}</td><td><button className="btn btn-primary btn-sm" onClick={() => updateLeave(item.id, 'approved')}>Approve</button> <button className="btn btn-danger btn-sm" onClick={() => updateLeave(item.id, 'rejected')}>Reject</button></td></tr>)}</tbody></table></div></>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Organization;
