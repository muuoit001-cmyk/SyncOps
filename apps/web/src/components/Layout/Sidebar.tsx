import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, MapPin, ClipboardList,
  AlertTriangle, ChevronLeft, ChevronRight, Zap, BarChart3,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  flaggedCount?: number;
}

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Staff', icon: Users, path: '/staff' },
  { label: 'Sites & Geofences', icon: MapPin, path: '/sites' },
  { label: 'Attendance Log', icon: ClipboardList, path: '/attendance' },
  { label: 'Flagged Events', icon: AlertTriangle, path: '/flagged', badge: true },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
];

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, mobileOpen, flaggedCount = 0 }) => {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="drawer-overlay"
          style={{ zIndex: 39 }}
          onClick={onToggle}
        />
      )}

      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden="true">
            <Zap size={20} />
          </div>
          {!collapsed && <span className="sidebar-logo-text">SyncOps</span>}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {!collapsed && (
            <span className="nav-section-label">Navigation</span>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <Icon className="nav-icon" aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.badge && flaggedCount > 0 && (
                  <span className="nav-badge" aria-label={`${flaggedCount} flagged events`}>
                    {flaggedCount > 99 ? '99+' : flaggedCount}
                  </span>
                )}
                {collapsed && item.badge && flaggedCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 6, right: 6,
                      width: 8, height: 8,
                      background: 'var(--color-error)',
                      borderRadius: '50%',
                    }}
                    aria-hidden="true"
                  />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
          <button
            className="btn btn-secondary btn-icon"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ width: '100%' }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span style={{ fontSize: '0.8rem', marginLeft: 4 }}>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
