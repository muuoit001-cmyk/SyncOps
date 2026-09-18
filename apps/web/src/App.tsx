import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Sidebar from './components/Layout/Sidebar';
import TopBar from './components/Layout/TopBar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Staff from './pages/Staff';
import Sites from './pages/Sites';
import Attendance from './pages/Attendance';
import Flagged from './pages/Flagged';
import Analytics from './pages/Analytics';
import Organization from './pages/Organization';

import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/staff': 'Staff',
  '/sites': 'Sites & Geofences',
  '/attendance': 'Attendance Log',
  '/flagged': 'Flagged Events',
  '/analytics': 'Analytics',
  '/organization': 'Organization',
};

const ProtectedLayout: React.FC = () => {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] || '';

  // Close mobile sidebar on navigation
  useEffect(() => setMobileSidebarOpen(false), [location.pathname]);

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => {
          if (window.innerWidth < 1024) {
            setMobileSidebarOpen(o => !o);
          } else {
            setSidebarCollapsed(c => !c);
          }
        }}
        mobileOpen={mobileSidebarOpen}
      />

      <main
        className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        id="main-content"
      >
        <TopBar
          onMenuClick={() => setMobileSidebarOpen(o => !o)}
          title={title}
        />
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/flagged" element={<Flagged />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/organization" element={<Organization />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
        }}
        aria-label="Loading SyncOps"
        role="status"
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 48, height: 48,
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              margin: '0 auto 1rem',
            }}
            className="animate-spin"
            aria-hidden="true"
          />
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading SyncOps...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.875rem',
            borderRadius: '10px',
          },
        }}
      />
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/activate" element={<AuthCallback />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/*"
          element={isAuthenticated ? <ProtectedLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </>
  );
};

export default App;
