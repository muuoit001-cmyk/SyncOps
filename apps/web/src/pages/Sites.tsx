// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, MapPin, Trash2, Edit2, Users } from 'lucide-react';
import api from '../services/api';
import type { Site } from '../types';

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ── Map click handler ──────────────────────────────────────────────────────
interface MapClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onMapClick }) => {
  useMapEvents({
    click: (e: { latlng: { lat: number; lng: number } }) => onMapClick(e.latlng.lat, e.latlng.lng),
  });
  return null;
};

// ── Site Drawer ────────────────────────────────────────────────────────────
interface SiteDrawerProps {
  open: boolean;
  site?: Site | null;
  onClose: () => void;
  onSaved: () => void;
}

const SiteDrawer: React.FC<SiteDrawerProps> = ({ open, site, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '', radius_meters: '100' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([-1.2921, 36.8219]);
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (site) {
      setForm({
        name: site.name,
        address: site.address || '',
        lat: String(site.lat),
        lng: String(site.lng),
        radius_meters: String(site.radius_meters),
      });
      setMapCenter([site.lat, site.lng]);
      setMarkerPos([site.lat, site.lng]);
    } else {
      setForm({ name: '', address: '', lat: '', lng: '', radius_meters: '100' });
      setMarkerPos(null);
    }
    setError('');
  }, [site, open]);

  const handleMapClick = (lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    setForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        address: form.address || undefined,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radius_meters: parseInt(form.radius_meters),
      };
      if (site) {
        await api.patch(`/sites/${site.id}`, payload);
      } else {
        await api.post('/sites', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save site');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const radius = parseFloat(form.radius_meters) || 100;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={site ? 'Edit site' : 'Add site'} style={{ width: 520 }}>
        <div className="drawer-header">
          <h2 className="drawer-title">{site ? 'Edit Site' : 'Add New Site'}</h2>
          <button className="btn btn-secondary btn-icon btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="drawer-body">
            {error && (
              <div style={{ padding: '0.75rem', background: 'var(--color-error-light)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="site-name" className="form-label">Site Name *</label>
              <input id="site-name" className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="HQ Office" required />
            </div>

            <div className="form-group">
              <label htmlFor="site-address" className="form-label">Address</label>
              <input id="site-address" className="form-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main Street, City" />
            </div>

            {/* Map */}
            <div className="form-group">
              <label className="form-label">Location — click on the map to set pin</label>
              <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--color-border)' }}>
                  <MapContainer
                    center={markerPos}
                    zoom={14}
                    style={{ height: 240 }}
                  >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <MapClickHandler onMapClick={handleMapClick} />
                  {markerPos && (
                    <>
                      <Marker position={markerPos} />
                      <Circle
                        center={markerPos}
                        radius={radius}
                        pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.12 }}
                      />
                    </>
                  )}
                </MapContainer>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label htmlFor="site-lat" className="form-label">Latitude *</label>
                <input id="site-lat" className="form-input" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="-1.292100" required />
              </div>
              <div className="form-group">
                <label htmlFor="site-lng" className="form-label">Longitude *</label>
                <input id="site-lng" className="form-input" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="36.821900" required />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="site-radius" className="form-label">Geofence Radius: {form.radius_meters}m</label>
              <input
                id="site-radius"
                type="range"
                min={10} max={500} step={10}
                value={form.radius_meters}
                onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))}
                style={{ width: '100%', accentColor: 'var(--color-primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                <span>10m</span><span>500m</span>
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.lat || !form.lng} id="site-save-btn">
              {loading ? 'Saving...' : site ? 'Save Changes' : 'Create Site'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
};

// ── Main Sites Page ──────────────────────────────────────────────────────────
const Sites: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);

  const fetchSites = useCallback(async () => {
    try {
      const { data } = await api.get('/sites');
      setSites(data);
      if (!selected && data.length > 0) setSelected(data[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this site? Staff assigned to it will be unassigned.')) return;
    await api.delete(`/sites/${id}`);
    if (selected?.id === id) setSelected(null);
    fetchSites();
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sites & Geofences</h1>
          <p className="page-subtitle">{sites.length} sites configured</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingSite(null); setDrawerOpen(true); }}
          id="add-site-btn"
        >
          <Plus size={16} /> Add Site
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>
        {/* Site list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}>
          {loading ? (
            <div style={{ padding: '1rem' }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8, borderRadius: 8 }} />)}
            </div>
          ) : sites.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><MapPin size={24} /></div>
              <p>No sites yet</p>
            </div>
          ) : (
            sites.map(site => (
              <div
                key={site.id}
                onClick={() => setSelected(site)}
                style={{
                  padding: '0.875rem 1rem',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  background: selected?.id === site.id ? 'var(--color-primary-light)' : 'transparent',
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
                role="button"
                tabIndex={0}
                aria-selected={selected?.id === site.id}
                onKeyDown={e => e.key === 'Enter' && setSelected(site)}
              >
                <div
                  style={{
                    width: 36, height: 36,
                    background: selected?.id === site.id ? 'var(--color-primary)' : 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: selected?.id === site.id ? 'white' : 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: selected?.id === site.id ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                    {site.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', gap: '0.5rem', marginTop: 2 }}>
                    <span>{site.radius_meters}m radius</span>
                    {site.staff_count !== undefined && <span>· {site.staff_count} staff</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Map view */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
          {selected ? (
            <>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{selected.name}</div>
                  {selected.address && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{selected.address}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="badge badge-blue">
                    <Users size={10} /> {selected.staff_count ?? 0} staff
                  </span>
                  <span className="badge badge-gray">{selected.radius_meters}m radius</span>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { setEditingSite(selected); setDrawerOpen(true); }} aria-label="Edit site" title="Edit site">
                    <Edit2 size={14} />
                  </button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(selected.id)} aria-label="Delete site" title="Delete site">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <MapContainer
                key={selected.id}
                center={[selected.lat, selected.lng]}
                zoom={15}
                style={{ height: 440 }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Marker position={[selected.lat, selected.lng]} />
                <Circle
                  center={[selected.lat, selected.lng]}
                  radius={selected.radius_meters}
                  pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.15, weight: 2 }}
                />
              </MapContainer>
            </>
          ) : (
            <div className="empty-state" style={{ height: '100%' }}>
              <div className="empty-state-icon"><MapPin size={28} /></div>
              <p>Select a site to view its map</p>
            </div>
          )}
        </div>
      </div>

      <SiteDrawer
        open={drawerOpen}
        site={editingSite}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchSites}
      />
    </div>
  );
};

export default Sites;
