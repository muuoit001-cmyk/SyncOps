import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, User, Zap, Moon, Sun, Clock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { format } from 'date-fns';

interface TopBarProps {
  onMenuClick: () => void;
  title?: string;
}

const TopBar: React.FC<TopBarProps> = ({ onMenuClick, title }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('syncops_theme') === 'dark');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('syncops_theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
        <div
          className="sidebar-logo-icon"
          style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
          }}
        >
          <Zap size={16} strokeWidth={2.5} />
        </div>
        <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em' }}>SyncOps</span>
      </div>

      {/* Page title */}
      {title && (
        <h1
          style={{
            fontSize: '0.9rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
      )}

      <div style={{ flex: 1 }} />

      {/* Live clock */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.75rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.01em',
        }}
        aria-label="Current time"
      >
        <Clock size={13} color="var(--color-text-muted)" />
        {format(currentTime, 'EEE, HH:mm:ss')}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => setDark(v => !v)}
          aria-label={dark ? 'Use light theme' : 'Use dark theme'}
          title={dark ? 'Use light theme' : 'Use dark theme'}
          style={{ transition: 'all 0.2s' }}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button className="btn btn-secondary btn-icon" aria-label="Notifications">
          <Bell size={18} />
        </button>

        {/* User pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            cursor: 'default',
          }}
          title={user?.email}
        >
          <div
            style={{
              width: 28, height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-indigo) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '0.72rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {user?.full_name?.charAt(0).toUpperCase() || <User size={14} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {user?.full_name || user?.email}
            </span>
            {user?.role && (
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                {user.role.replace(/_/g, ' ')}
              </span>
            )}
          </div>
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
