import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, User, Zap, Moon, Sun } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface TopBarProps {
  onMenuClick: () => void;
  title?: string;
}

const TopBar: React.FC<TopBarProps> = ({ onMenuClick, title }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [dark, setDark] = React.useState(() => localStorage.getItem('syncops_theme') === 'dark');

  React.useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('syncops_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="topbar" role="banner">
      {/* Mobile hamburger */}
      <button
        className="btn btn-secondary btn-icon"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        style={{ display: 'none' }}
        id="mobile-menu-btn"
      >
        <Menu size={20} />
      </button>

      {/* Mobile logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mobile-logo">
        <div className="sidebar-logo-icon" style={{ width: 28, height: 28 }}>
          <Zap size={16} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>SyncOps</span>
      </div>

      {/* Page title */}
      {title && (
        <h1
          style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: 0,
          }}
        >
          {title}
        </h1>
      )}

      <div style={{ flex: 1 }} />

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button className="btn btn-secondary btn-icon" onClick={() => setDark(value => !value)} aria-label={dark ? 'Use light theme' : 'Use dark theme'} title={dark ? 'Use light theme' : 'Use dark theme'}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="btn btn-secondary btn-icon" aria-label="Notifications">
          <Bell size={18} />
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
          title={user?.email}
        >
          <div
            style={{
              width: 28, height: 28,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {user?.full_name?.charAt(0) || <User size={14} />}
          </div>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.full_name || user?.email}
          </span>
        </div>

        <button
          className="btn btn-secondary btn-icon"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={18} />
        </button>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          #mobile-menu-btn { display: flex !important; }
          .mobile-logo { display: flex; }
        }
        @media (min-width: 1024px) {
          .mobile-logo { display: none !important; }
        }
      `}</style>
    </header>
  );
};

export default TopBar;
