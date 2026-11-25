/**
 * LoginPage — authentification Nemoclaw.
 *
 * Appelle POST /api/auth/login avec { username, password }.
 * Fallback graceful : si l'endpoint est absent, accepte n'importe quelles
 * credentials et passe en mode Démo (badge visible dans la topbar).
 *
 * Stocke dans localStorage :
 *   clawboard-token  — JWT ou token opaque
 *   clawboard-user   — JSON { username, displayName, role, avatar?, demo? }
 */
import { useState, useRef, useEffect } from 'react';
import { BrainCircuit, LogIn, Eye, EyeOff, Loader2, AlertCircle, Wifi } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';

const BASE = 'http://localhost:4000';

interface LoginPageProps {
  onLogin: () => void;
}

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd,  setShowPwd]    = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Identifiant et mot de passe requis.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Identifiants incorrects.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      localStorage.setItem('clawboard-token', data.token ?? 'authenticated');
      localStorage.setItem('clawboard-user', JSON.stringify({
        username: data.user?.username ?? username.trim(),
        displayName: data.user?.displayName ?? username.trim(),
        role: data.user?.role ?? 'user',
        avatar: data.user?.avatar ?? null,
        demo: false,
      }));
      onLogin();

    } catch {
      // Endpoint absent → mode démo graceful
      localStorage.setItem('clawboard-token', 'demo-token');
      localStorage.setItem('clawboard-user', JSON.stringify({
        username: username.trim() || 'admin',
        displayName: username.trim() || 'Admin',
        role: 'admin',
        avatar: null,
        demo: true,
      }));
      onLogin();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: '18px',
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
            boxShadow: '0 0 30px color-mix(in srgb, var(--brand-accent) 40%, transparent)',
            marginBottom: '16px',
          }}>
            <BrainCircuit size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            ClawBoard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
            Interface de contrôle Nemoclaw
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Username */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Identifiant
            </label>
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="admin"
              autoComplete="username"
              disabled={loading}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: '10px',
                background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.2s',
                opacity: loading ? 0.6 : 1,
              }}
              onFocus={e => e.target.style.borderColor = 'var(--brand-accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Mot de passe
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                style={{
                  width: '100%', padding: '11px 42px 11px 14px', borderRadius: '10px',
                  background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s',
                  opacity: loading ? 0.6 : 1,
                }}
                onFocus={e => e.target.style.borderColor = 'var(--brand-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 0, display: 'flex',
                }}
                tabIndex={-1}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444', fontSize: '0.85rem',
            }}>
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '12px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
              color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px color-mix(in srgb, var(--brand-accent) 35%, transparent)',
              opacity: loading ? 0.8 : 1,
              transition: 'all 0.2s', marginTop: '4px',
            }}
          >
            {loading
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Connexion…</>
              : <><LogIn size={18} /> Se connecter</>
            }
          </button>
        </form>

        {/* Demo hint */}
        <div style={{
          marginTop: '24px', paddingTop: '20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          color: 'var(--text-muted)', fontSize: '0.78rem',
        }}>
          <Wifi size={13} style={{ marginTop: '1px', flexShrink: 0 }} />
          <span>
            Si le serveur Nemoclaw est absent, la connexion s'établit en{' '}
            <strong style={{ color: 'var(--brand-accent)' }}>mode démo</strong>{' '}
            avec vos identifiants saisis.
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
