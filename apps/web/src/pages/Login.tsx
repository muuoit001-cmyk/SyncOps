import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Zap, Shield, AlertCircle, CheckCircle2, ArrowRight, Mail, KeyRound, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../services/supabase';
import api from '../services/api';

type AuthMode = 'login' | 'register' | 'forgot';

const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);

  // Register form state
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  // Forgot password form state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // General state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (requiresTotp) totpRef.current?.focus();
  }, [requiresTotp]);

  useEffect(() => {
    if (searchParams.get('activated') === 'true') {
      setError('');
    }
  }, [searchParams]);

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password, requiresTotp ? totpCode : undefined);
      if (result.requiresTotp) {
        setRequiresTotp(true);
        setLoading(false);
        return;
      }
      navigate('/');
    } catch (err: any) {
      console.error('Login error details:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError(`Cannot reach backend server. (${err.message})`);
      } else {
        setError(err.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle HR Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (regPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // 1. If Supabase is configured, register via Auth so a verification email is sent
      let authUserId: string | undefined;
      if (supabase) {
        const { data: sbData, error: sbError } = await supabase.auth.signUp({
          email: regEmail.trim(),
          password: regPassword,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/activate`,
          },
        });
        if (sbError) throw sbError;
        authUserId = sbData.user?.id;
      }

      // 2. Register the HR profile in SyncOps (inactive until the email link is clicked)
      try {
        await api.post('/auth/register', {
          email: regEmail.trim(),
          password: regPassword,
          full_name: fullName.trim(),
          auth_user_id: authUserId,
        });
      } catch (regErr: any) {
        if (regErr.response?.data?.code !== 'PENDING_ACTIVATION') throw regErr;
      }

      setRegSuccess(true);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.response?.data?.error || err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (supabase) {
        await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      }

      await api.post('/auth/forgot-password', {
        email: forgotEmail.trim(),
      });

      setForgotSuccess(true);
    } catch (err: any) {
      console.error('Forgot password error:', err);
      setError(err.response?.data?.error || 'Failed to send password reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: 56, height: 56,
              background: 'var(--color-primary)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
            }}
            aria-hidden="true"
          >
            <Zap size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            SyncOps
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.3rem' }}>
            {mode === 'login' && 'Dashboard — Sign in to continue'}
            {mode === 'register' && 'HR Portal — Register with work email'}
            {mode === 'forgot' && 'Password Recovery'}
          </p>
        </div>

        {/* Tab switch for Login vs Register */}
        {mode !== 'forgot' && (
          <div
            style={{
              display: 'flex',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              padding: 4,
              marginBottom: '1.5rem',
              border: '1px solid var(--color-border)',
            }}
          >
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: 'none',
                background: mode === 'login' ? 'var(--color-surface)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: mode === 'login' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                boxShadow: mode === 'login' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setRegSuccess(false); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: 'none',
                background: mode === 'register' ? 'var(--color-surface)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: mode === 'register' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                boxShadow: mode === 'register' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Register HR
            </button>
          </div>
        )}

        {/* Activated Banner */}
        {searchParams.get('activated') === 'true' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid #16a34a',
              borderRadius: 'var(--radius-md)',
              color: '#16a34a',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            <CheckCircle2 size={16} />
            Your HR account has been activated! Please sign in.
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: 'var(--color-error-light)',
              border: '1px solid var(--color-error)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-error)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
            role="alert"
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* ── MODE 1: SIGN IN ──────────────────────────────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!requiresTotp ? (
              <>
                <div className="form-group">
                  <label htmlFor="email" className="form-label">Work Email</label>
                  <input
                    id="email"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hr@company.com"
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="password" className="form-label">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setForgotSuccess(false); }}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        fontSize: '0.75rem', color: 'var(--color-primary)',
                        cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      style={{ paddingRight: '2.75rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', right: '0.75rem', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-muted)', padding: 0,
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="form-group">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--color-primary-light)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '0.5rem',
                  }}
                >
                  <Shield size={16} color="var(--color-primary)" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                    Enter your 6-digit authenticator code
                  </span>
                </div>
                <label htmlFor="totp" className="form-label">Authentication Code</label>
                <input
                  id="totp"
                  ref={totpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="form-input"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={{ fontSize: '1.5rem', letterSpacing: '0.3em', textAlign: 'center' }}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', marginTop: '0.5rem' }}
              id="login-submit-btn"
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      width: 18, height: 18,
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                    }}
                    className="animate-spin"
                  />
                  Signing in...
                </span>
              ) : requiresTotp ? 'Verify Code' : 'Sign In'}
            </button>

            {requiresTotp && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => { setRequiresTotp(false); setTotpCode(''); }}
              >
                Back to login
              </button>
            )}
          </form>
        )}

        {/* ── MODE 2: REGISTER HR ──────────────────────────────────────────── */}
        {mode === 'register' && (
          regSuccess ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
                <Mail size={42} color="#16a34a" />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                Activation Email Sent!
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                We have sent an activation link to <strong>{regEmail}</strong> via Supabase. Please check your inbox and click the link to activate your HR account.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => { setMode('login'); setRegSuccess(false); }}
              >
                Return to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="reg-name" className="form-label">Full Name</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reg-name"
                    type="text"
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="reg-email" className="form-label">Work Email</label>
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="jane@company.com"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="reg-password" className="form-label">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  className="form-input"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirm-reg-password" className="form-label">Confirm Password</label>
                <input
                  id="confirm-reg-password"
                  type="password"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading || !fullName || !regEmail || !regPassword || !confirmPassword}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {loading ? 'Creating Account & Sending Link...' : 'Register with Work Email'}
              </button>
            </form>
          )
        )}

        {/* ── MODE 3: FORGOT PASSWORD ──────────────────────────────────────── */}
        {mode === 'forgot' && (
          forgotSuccess ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
                <KeyRound size={42} color="#16a34a" />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                Reset Link Sent
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                If an account exists for <strong>{forgotEmail}</strong>, a password reset link has been dispatched to your email.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => { setMode('login'); setForgotSuccess(false); }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', lineHeight: 1.4, margin: 0 }}>
                Enter your work email address and we'll send you a link to reset your password.
              </p>
              <div className="form-group">
                <label htmlFor="forgot-email" className="form-label">Work Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  className="form-input"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="hr@company.com"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading || !forgotEmail}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {loading ? 'Sending Reset Link...' : 'Send Password Reset Link'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => { setMode('login'); setError(''); }}
              >
                Cancel and Return to Sign In
              </button>
            </form>
          )
        )}

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>
          SyncOps@2026. All Rights Reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
