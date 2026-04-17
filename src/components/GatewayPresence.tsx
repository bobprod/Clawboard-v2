import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { Monitor, Smartphone, Terminal, Globe, Cpu, RefreshCw, Loader2, Radio } from 'lucide-react';

const BASE = 'http://localhost:4000';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientMode = 'ui' | 'webchat' | 'cli' | 'backend' | 'probe' | 'test' | 'node';

interface PresenceEntry {
  instanceId?: string;
  host?:        string;
  ip?:          string;
  version?:     string;
  deviceFamily?: string;
  mode?:        ClientMode;
  lastInputSeconds?: number;
  reason?:      string;
  ts:           number;
}

// ── Mock data (graceful fallback) ─────────────────────────────────────────────

const MOCK_PRESENCE: PresenceEntry[] = [
  { instanceId: 'gw-self',    host: 'gateway-host',  ip: '127.0.0.1',    version: '1.0.0', mode: 'backend', reason: 'self',      ts: Date.now() - 2000  },
  { instanceId: 'ui-desktop', host: 'BOB-PC',        ip: '192.168.1.10', version: '1.0.0', mode: 'ui',      reason: 'connect',   ts: Date.now() - 15000 },
  { instanceId: 'cli-01',     host: 'BOB-PC',        ip: '127.0.0.1',    version: '1.0.0', mode: 'cli',     reason: 'connect',   ts: Date.now() - 45000, lastInputSeconds: 30 },
];

// ── Mode config ───────────────────────────────────────────────────────────────

const MODE_CFG: Record<ClientMode, { label: string; icon: React.FC<{ size?: number }>; color: string }> = {
  ui:      { label: 'UI',      icon: Monitor,    color: '#8b5cf6' },
  webchat: { label: 'WebChat', icon: Globe,      color: '#3b82f6' },
  cli:     { label: 'CLI',     icon: Terminal,   color: '#10b981' },
  backend: { label: 'Gateway', icon: Cpu,        color: '#f59e0b' },
  probe:   { label: 'Probe',   icon: Radio,      color: '#94a3b8' },
  test:    { label: 'Test',    icon: Radio,      color: '#94a3b8' },
  node:    { label: 'Node',    icon: Smartphone, color: '#06b6d4' },
};

function modeOf(entry: PresenceEntry): ClientMode {
  return (entry.mode as ClientMode) ?? 'ui';
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)  return 'maintenant';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const GatewayPresence = () => {
  const [entries,    setEntries]    = useState<PresenceEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useMock,    setUseMock]    = useState(false);

  const fetchPresence = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const r = await apiFetch(`${BASE}/api/presence`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const list: PresenceEntry[] = Array.isArray(d) ? d : (d.entries ?? d.data ?? []);
      setEntries(list);
      setUseMock(false);
    } catch {
      setEntries(MOCK_PRESENCE);
      setUseMock(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchPresence(); }, []);

  const modeCount = (m: ClientMode) => entries.filter(e => modeOf(e) === m).length;

  return (
    <div className="glass-panel p-6" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Radio size={17} color="var(--brand-accent)" />
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Présence Gateway</h2>
        {useMock && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, marginLeft: 4 }}>démo</span>
        )}
        <button onClick={() => fetchPresence(true)} disabled={refreshing}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: refreshing ? 'wait' : 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4 }}>
          {refreshing
            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <RefreshCw size={14} />}
        </button>
      </div>

      {/* Mode summary pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['backend', 'ui', 'cli', 'webchat', 'node'] as ClientMode[]).map(m => {
          const n = modeCount(m);
          if (n === 0) return null;
          const cfg = MODE_CFG[m];
          const Icon = cfg.icon;
          return (
            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: `${cfg.color}18`, border: `1px solid ${cfg.color}33`, fontSize: 11, fontWeight: 700, color: cfg.color }}>
              <Icon size={11} /> {cfg.label} <span style={{ opacity: 0.7, fontWeight: 400 }}>×{n}</span>
            </div>
          );
        })}
      </div>

      {/* Entries list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 8 }} />
          Chargement…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((e, i) => {
            const mode = modeOf(e);
            const cfg  = MODE_CFG[mode];
            const Icon = cfg.icon;
            return (
              <div key={e.instanceId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 9 }}>
                {/* Mode icon */}
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: cfg.color }}>
                  <Icon size={13} />
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.host ?? e.instanceId ?? '—'}
                    </span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, background: `${cfg.color}18`, color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {e.ip && <span style={{ fontFamily: 'var(--mono)', marginRight: 8 }}>{e.ip}</span>}
                    {e.version && <span>v{e.version}</span>}
                    {e.lastInputSeconds !== undefined && <span style={{ marginLeft: 8 }}>· inactif {e.lastInputSeconds}s</span>}
                  </div>
                </div>
                {/* Time */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(e.ts)}</div>
                {/* Online dot */}
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0, animation: 'pulseHeart 2s infinite' }} />
              </div>
            );
          })}
          {entries.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Aucun client connecté
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulseHeart {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>
    </div>
  );
};
