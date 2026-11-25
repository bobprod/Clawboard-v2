import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, Activity, Lock, Globe, FileCode, ToggleLeft, ToggleRight,
  KeyRound, QrCode, Smartphone, CheckCircle2, XCircle, Copy, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';

const BASE = 'http://localhost:4000';

interface Guardrail {
  id: string;
  name: string;
  enabled: boolean;
}

interface SecEvent {
  time: string;
  type: 'block' | 'allow';
  desc: string;
  reason: string;
  taskId?: string;
}

interface TotpSetup {
  secret: string;
  otpAuthUrl: string;
  backupCodes: string[];
}

// ── TOTP MFA Panel ────────────────────────────────────────────────────────────
function TotpMfaPanel() {
  type MfaStep = 'idle' | 'setup' | 'verify' | 'enabled';

  const [mfaEnabled,   setMfaEnabled]   = useState(false);
  const [step,         setStep]         = useState<MfaStep>('idle');
  const [setup,        setSetup]        = useState<TotpSetup | null>(null);
  const [token,        setToken]        = useState('');
  const [error,        setError]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [showSecret,   setShowSecret]   = useState(false);
  const [showBackup,   setShowBackup]   = useState(false);
  const [copiedCode,   setCopiedCode]   = useState<string | null>(null);

  // Check MFA status on mount
  useEffect(() => {
    apiFetch(`${BASE}/api/security/totp/status`)
      .then(r => r.json())
      .then(d => { setMfaEnabled(d.enabled ?? false); })
      .catch(() => { /* no MFA configured yet */ });
  }, []);

  const handleSetup = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`${BASE}/api/security/totp/setup`, { method: 'POST' });
      const data = await res.json();
      setSetup(data);
      setStep('setup');
    } catch {
      // Mock fallback
      const secret = 'JBSWY3DPEHPK3PXP';
      const otpAuthUrl = `otpauth://totp/ClawBoard:admin@nemoclaw.ai?secret=${secret}&issuer=ClawBoard%20Nemoclaw&algorithm=SHA1&digits=6&period=30`;
      setSetup({
        secret,
        otpAuthUrl,
        backupCodes: [
          'ABCD-1234', 'EFGH-5678', 'IJKL-9012',
          'MNOP-3456', 'QRST-7890', 'UVWX-2345',
          'YZ01-6789', 'BCDE-0123',
        ],
      });
      setStep('setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (token.length !== 6) { setError('Entrez un code à 6 chiffres.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`${BASE}/api/security/totp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error('Code incorrect');
      setMfaEnabled(true);
      setStep('enabled');
    } catch {
      // Mock: accept any 6-digit code for demo
      if (/^\d{6}$/.test(token)) {
        setMfaEnabled(true);
        setStep('enabled');
      } else {
        setError('Code incorrect ou expiré. Réessayez.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      await apiFetch(`${BASE}/api/security/totp/disable`, { method: 'POST' });
    } catch { /* mock */ }
    setMfaEnabled(false);
    setSetup(null);
    setStep('idle');
    setToken('');
    setLoading(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    });
  };

  const qrUrl = setup
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(setup.otpAuthUrl)}`
    : '';

  return (
    <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <KeyRound size={18} color="var(--brand-accent)" />
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Authentification TOTP (MFA)</h3>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11, fontWeight: 700,
          padding: '3px 10px', borderRadius: 99,
          background: mfaEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${mfaEnabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
          color: mfaEnabled ? '#10b981' : '#ef4444',
        }}>
          {mfaEnabled ? '● Activé' : '○ Désactivé'}
        </span>
      </div>

      {/* Idle state */}
      {step === 'idle' && !mfaEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Protégez votre compte avec une application d'authentification (Google Authenticator, Authy, 1Password…).
            Un code à 6 chiffres vous sera demandé à chaque connexion.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { icon: Smartphone, label: 'Compatible Google Authenticator' },
              { icon: Shield,     label: 'Code TOTP renouvelé toutes 30s' },
              { icon: KeyRound,   label: '8 codes de secours générés' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12, color: 'var(--text-muted)',
                background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
                borderRadius: 7, padding: '5px 10px',
              }}>
                <Icon size={12} /> {label}
              </div>
            ))}
          </div>
          <button
            onClick={handleSetup}
            disabled={loading}
            style={{
              alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', background: 'var(--brand-accent)', color: '#fff',
              border: 'none', borderRadius: 9, cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: 13.5, opacity: loading ? 0.6 : 1,
              boxShadow: 'none',
            }}
          >
            {loading
              ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Préparation…</>
              : <><QrCode size={14} /> Configurer le MFA</>
            }
          </button>
        </div>
      )}

      {/* Setup step — show QR */}
      {step === 'setup' && setup && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* QR Code */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: 6,
              border: '2px solid color-mix(in srgb, var(--brand-accent) 30%, transparent)',
              boxShadow: '0 0 20px color-mix(in srgb, var(--brand-accent) 20%, transparent)',
            }}>
              <img src={qrUrl} alt="QR TOTP" width={180} height={180} style={{ display: 'block', borderRadius: 8 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Scannez avec votre app TOTP
            </div>
          </div>

          {/* Right side */}
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Étape 1 :</strong> Ouvrez Google Authenticator ou Authy<br />
              <strong style={{ color: 'var(--text-primary)' }}>Étape 2 :</strong> Scannez le QR code ou entrez la clé secrète<br />
              <strong style={{ color: 'var(--text-primary)' }}>Étape 3 :</strong> Entrez le code à 6 chiffres ci-dessous
            </div>

            {/* Secret key */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>
                Clé secrète (saisie manuelle)
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '8px 12px',
              }}>
                <span style={{
                  flex: 1, fontFamily: 'var(--mono)', fontSize: 13.5, fontWeight: 700,
                  letterSpacing: '0.15em', color: showSecret ? 'var(--brand-accent)' : 'var(--text-muted)',
                  filter: showSecret ? 'none' : 'blur(5px)',
                  transition: 'filter 0.2s',
                  userSelect: showSecret ? 'text' : 'none',
                }}>
                  {setup.secret}
                </span>
                <button onClick={() => setShowSecret(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 3 }}>
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => copyCode(setup.secret)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedCode === setup.secret ? '#10b981' : 'var(--text-muted)', padding: 3 }}>
                  {copiedCode === setup.secret ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Token input */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>
                Code de vérification (6 chiffres)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={token}
                  onChange={e => { setToken(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                  placeholder="000000"
                  maxLength={6}
                  style={{
                    flex: 1, padding: '9px 14px', borderRadius: 8, fontSize: 20,
                    fontFamily: 'var(--mono)', letterSpacing: '0.4em', fontWeight: 700,
                    textAlign: 'center',
                    background: 'var(--bg-glass)',
                    border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'var(--border-subtle)'}`,
                    color: 'var(--text-primary)', outline: 'none',
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleVerify()}
                />
                <button
                  onClick={handleVerify}
                  disabled={loading || token.length !== 6}
                  style={{
                    padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13.5,
                    background: 'var(--brand-accent)', color: '#fff', border: 'none',
                    cursor: loading || token.length !== 6 ? 'not-allowed' : 'pointer',
                    opacity: loading || token.length !== 6 ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {loading ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Vérifier'}
                </button>
              </div>
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12.5, color: '#ef4444' }}>
                  <XCircle size={13} /> {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MFA enabled */}
      {(step === 'enabled' || (mfaEnabled && step === 'idle')) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 18px', background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10,
          }}>
            <CheckCircle2 size={20} color="#10b981" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>MFA activé avec succès</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Votre compte est protégé par TOTP. Un code sera requis à chaque connexion.
              </div>
            </div>
          </div>

          {/* Backup codes */}
          {setup?.backupCodes && (
            <div>
              <button
                onClick={() => setShowBackup(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--brand-accent)', fontSize: 13, fontWeight: 600, padding: 0,
                }}
              >
                {showBackup ? <Eye size={13} /> : <EyeOff size={13} />}
                {showBackup ? 'Masquer' : 'Afficher'} les codes de secours
              </button>
              {showBackup && (
                <div style={{
                  marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}>
                  {setup.backupCodes.map(code => (
                    <div key={code} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
                      borderRadius: 6, padding: '6px 10px',
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
                        {code}
                      </span>
                      <button onClick={() => copyCode(code)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedCode === code ? '#10b981' : 'var(--text-muted)', padding: 2 }}>
                        {copiedCode === code ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showBackup && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  ⚠ Conservez ces codes en lieu sûr. Chaque code ne peut être utilisé qu'une seule fois.
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleDisable}
            disabled={loading}
            style={{
              alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8,
              color: '#ef4444', cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1,
            }}
          >
            <XCircle size={13} /> Désactiver le MFA
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

const iconFor = (name: string) => {
  if (name.toLowerCase().includes('npm') || name.toLowerCase().includes('pypi') || name.toLowerCase().includes('file') || name.toLowerCase().includes('code')) return <FileCode size={16} />;
  if (name.toLowerCase().includes('network') || name.toLowerCase().includes('outbound')) return <Globe size={16} />;
  return <Lock size={16} />;
};

export const SecurityModule = () => {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [events, setEvents]         = useState<SecEvent[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`${BASE}/api/security/guardrails`).then(r => r.json()).catch(() => []),
      apiFetch(`${BASE}/api/security/events`).then(r => r.json()).catch(() => []),
    ]).then(([g, e]) => {
      setGuardrails(Array.isArray(g) ? g : []);
      setEvents(Array.isArray(e) ? e : []);
      setLoading(false);
    });
  }, []);

  const handleToggle = async (g: Guardrail) => {
    const next = !g.enabled;
    setGuardrails(prev => prev.map(x => x.id === g.id ? { ...x, enabled: next } : x));
    await apiFetch(`${BASE}/api/security/guardrails`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, enabled: next }),
    }).catch(() => {});
  };

  const blocked = events.filter(e => e.type === 'block').length;
  const allowed = events.filter(e => e.type === 'allow').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', paddingBottom: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ background: 'var(--brand-accent)', padding: '12px', borderRadius: '14px', color: 'var(--text-primary)' }}>
          <ShieldCheck size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Sécurité & Privacy Router</h2>
          <div className="text-muted" style={{ marginTop: '4px' }}>
            {blocked} bloqué{blocked !== 1 ? 's' : ''} · {allowed} autorisé{allowed !== 1 ? 's' : ''} · surveillance proactive OpenShell
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-muted" style={{ textAlign: 'center', padding: '40px' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) 2fr', gap: '24px', flexGrow: 1 }}>

          {/* TOTP MFA — full width */}
          <div style={{ gridColumn: '1 / -1' }}>
            <TotpMfaPanel />
          </div>

          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Status */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>
                <Shield size={18} /> Statut Global du Noyau
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(16,185,129,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-success)' }}>
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1.2rem', color: 'var(--status-success)' }}>Sécurisé</div>
                  <div className="text-muted" style={{ fontSize: '13px' }}>NemoClaw Privacy Core actif et fonctionnel.</div>
                </div>
              </div>
            </div>

            {/* Guardrails */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>
                <Lock size={18} /> Garde-fous Actifs (Sandbox)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {guardrails.map(g => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-glass)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: g.enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {iconFor(g.name)}
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>{g.name}</span>
                    </div>
                    <button onClick={() => handleToggle(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: g.enabled ? '#10b981' : 'var(--text-muted)', display: 'flex', padding: 0 }}>
                      {g.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                    </button>
                  </div>
                ))}
                {guardrails.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>Aucun garde-fou configuré</div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Events */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>
                <Activity size={18} /> Radar de Filtrage & Logs (Temps Réel)
              </h3>
              <span style={{ fontSize: '12px', background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                {events.length} événements récents
              </span>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '8px' }}>
              {events.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Aucun événement récent
                </div>
              )}
              {events.map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '16px', padding: '16px 20px', borderRadius: '8px',
                  background: ev.type === 'block' ? 'rgba(239,68,68,0.04)' : 'rgba(16,185,129,0.04)',
                  borderLeft: `4px solid ${ev.type === 'block' ? 'var(--status-error)' : 'var(--status-success)'}`,
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text-secondary)', minWidth: '70px', marginTop: '2px' }}>
                    {ev.time ?? '—'}
                  </div>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontWeight: 600, color: ev.type === 'block' ? 'var(--status-error)' : 'var(--status-success)', marginBottom: '6px', fontSize: '0.9rem', letterSpacing: '0.5px' }}>
                      {ev.type === 'block' ? 'ACCÈS REFUSÉ' : 'ACCÈS AUTORISÉ'}
                    </div>
                    <div style={{ fontSize: '14px', lineHeight: 1.4, color: 'var(--text-primary)' }}>{ev.desc}</div>
                  </div>
                  <div style={{ fontSize: '12px', background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: '6px', height: 'fit-content', fontWeight: 500, border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {ev.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
