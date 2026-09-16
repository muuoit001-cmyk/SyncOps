import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import api from '../services/api';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your activation link...');

  useEffect(() => {
    async function handleActivation() {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      try {
        // 1. If Supabase session is in the URL hash (Supabase auth redirect)
        if (supabase) {
          const { data, error: sbError } = await supabase.auth.getSession();
          if (data?.session?.user?.email) {
            // Activate account in backend database
            await api.post('/auth/activate', { email: data.session.user.email });
            setStatus('success');
            setMessage('Your email has been verified and your HR account is now active!');
            return;
          }
        }

        // 2. Token-based or email-based activation
        if (token || email) {
          const res = await api.post('/auth/activate', { token, email });
          setStatus('success');
          setMessage(res.data?.message || 'Your HR account has been successfully activated!');
          return;
        }

        setStatus('error');
        setMessage('Invalid or missing activation link. Please contact support or request a new link.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Activation failed or the link has expired.');
      }
    }

    handleActivation();
  }, [searchParams]);

  return (
    <div className="login-bg">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: 'var(--color-primary)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
          }}
        >
          <Zap size={28} color="white" />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          Account Activation
        </h1>

        {status === 'loading' && (
          <div style={{ padding: '2rem 0' }}>
            <Loader2 size={36} color="var(--color-primary)" className="animate-spin" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ padding: '1rem 0' }}>
            <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
              <CheckCircle2 size={48} color="#16a34a" />
            </div>
            <p style={{ color: 'var(--color-text-primary)', fontSize: '1rem', fontWeight: 500, marginBottom: '1.5rem' }}>
              {message}
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={() => navigate('/login')}
            >
              Proceed to Sign In <ArrowRight size={16} />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: '1rem 0' }}>
            <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--color-error-light)', borderRadius: '50%', marginBottom: '1rem' }}>
              <AlertCircle size={48} color="var(--color-error)" />
            </div>
            <p style={{ color: 'var(--color-error)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              {message}
            </p>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => navigate('/login')}
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
