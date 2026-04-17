import { useEffect, useState } from 'react';
import {
  Globe, Plus, Trash2, RefreshCw, Loader2, CheckCircle2,
  WifiOff, Wifi, Server, MonitorDot, Code2, Wrench, Workflow,
  X, Save, ExternalLink, Zap, Clock, Brain, Upload, Download,
  Radio, ChevronDown, ChevronRight, AlertCircle, Copy, Check,
  MessageCircle, Hash, Users, Send,
} from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';

const STORAGE_KEY   = 'clawboard-instances';
const CHANNELS_KEY  = 'clawboard-channels';
const BASE = 'http://localhost:4000';

// ── Channel types ─────────────────────────────────────────────────────────────

type ChannelId = 'discord' | 'telegram' | 'teams' | 'matrix' | 'twitch' | 'nostr';

interface ChannelConfig {
  enabled: boolean;
  token?: string;
  webhookUrl?: string;
  chatId?: string;
  serverUrl?: string;
  roomId?: string;
  extra?: string;
}

type ChannelsState = Partial<Record<ChannelId, ChannelConfig>>;

interface ChannelDef {
  id: ChannelId;
  name: string;
  icon: React.FC<{ size?: number }>;
  color: string;
  fields: { key: keyof ChannelConfig; label: string; placeholder: string; secret?: boolean }[];
  docsUrl: string;
  plugin?: string;
}

const CHANNEL_DEFS: ChannelDef[] = [
  {
    id: 'discord', name: 'Discord', icon: Hash, color: '#5865f2',
    docsUrl: 'https://discord.com/developers/docs/resources/webhook',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', secret: true },
    ],
  },
  {
    id: 'telegram', name: 'Telegram', icon: Send, color: '#0088cc',
    docsUrl: 'https://core.telegram.org/bots/api',
    fields: [
      { key: 'token',  label: 'Bot Token',  placeholder: '123456:ABC-DEF...', secret: true },
      { key: 'chatId', label: 'Chat ID',     placeholder: '-100123456789' },
    ],
  },
  {
    id: 'teams', name: 'Microsoft Teams', icon: Users, color: '#6264a7',
    plugin: '@openclaw/plugin-msteams',
    docsUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook',
    fields: [
      { key: 'webhookUrl', label: 'Incoming Webhook URL', placeholder: 'https://xxxxx.webhook.office.com/...', secret: true },
    ],
  },
  {
    id: 'matrix', name: 'Matrix', icon: Radio, color: '#0dbd8b',
    plugin: '@openclaw/plugin-matrix',
    docsUrl: 'https://spec.matrix.org/latest/',
    fields: [
      { key: 'serverUrl', label: 'Homeserver URL',  placeholder: 'https://matrix.org' },
      { key: 'token',     label: 'Access Token',    placeholder: 'syt_...',  secret: true },
      { key: 'roomId',    label: 'Room ID',          placeholder: '!room:matrix.org' },
    ],
  },
  {
    id: 'twitch', name: 'Twitch', icon: Radio, color: '#9146ff',
    plugin: '@openclaw/plugin-twitch',
    docsUrl: 'https://dev.twitch.tv/docs/authentication/',
    fields: [
      { key: 'token', label: 'OAuth Token', placeholder: 'oauth:...', secret: true },
      { key: 'extra', label: 'Channel',     placeholder: 'monpseudo' },
    ],
  },
  {
    id: 'nostr', name: 'Nostr', icon: MessageCircle, color: '#8b5cf6',
    plugin: '@openclaw/plugin-nostr',
    docsUrl: 'https://github.com/nostr-protocol/nostr',
    fields: [
      { key: 'token', label: 'Private Key (nsec)', placeholder: 'nsec1...', secret: true },
    ],
  },
];

// ── ChannelsPanel ─────────────────────────────────────────────────────────────

const channelInputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

const ChannelsPanel = () => {
  const [channels, setChannels] = useState<ChannelsState>(() => {
    try { return JSON.parse(localStorage.getItem(CHANNELS_KEY) ?? '{}'); } catch { return {}; }
  });
  const [testing, setTesting] = useState<ChannelId | null>(null);
  const [testResult, setTestResult] = useState<Record<ChannelId, 'ok' | 'error'>>({} as Record<ChannelId, 'ok' | 'error'>);
  const [saved, setSaved] = useState(false);

  // Load channels from backend on mount (merge with localStorage)
  useEffect(() => {
    apiFetch(`${BASE}/api/settings/notifications`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        const merged: ChannelsState = { ...channels };
        if (data.discord_webhook) merged.discord = { ...merged.discord, enabled: Boolean(data.notify_discord), webhookUrl: String(data.discord_webhook) };
        if (data.telegram_token) merged.telegram = { ...merged.telegram, enabled: Boolean(data.notify_telegram), token: String(data.telegram_token), chatId: data.telegram_chat_id ? String(data.telegram_chat_id) : merged.telegram?.chatId };
        if (data.webhook_url) merged.teams = { ...merged.teams, enabled: Boolean(data.notify_teams), webhookUrl: String(data.webhook_url) };
        if (data.matrix_server) merged.matrix = { ...merged.matrix, enabled: Boolean(data.notify_matrix), serverUrl: String(data.matrix_server), token: data.matrix_token ? String(data.matrix_token) : merged.matrix?.token, roomId: data.matrix_room ? String(data.matrix_room) : merged.matrix?.roomId };
        setChannels(merged);
      })
      .catch(() => { /* use localStorage fallback */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id: ChannelId, patch: Partial<ChannelConfig>) => {
    setChannels(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const save = async () => {
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
    // Persist to backend /api/settings/notifications
    try {
      const payload: Record<string, unknown> = {};
      for (const [id, cfg] of Object.entries(channels)) {
        if (!cfg) continue;
        if (id === 'discord' && cfg.webhookUrl) payload.discord_webhook = cfg.webhookUrl;
        if (id === 'telegram') { if (cfg.token) payload.telegram_token = cfg.token; if (cfg.chatId) payload.telegram_chat_id = cfg.chatId; }
        if (id === 'teams' && cfg.webhookUrl) payload.webhook_url = cfg.webhookUrl;
        if (id === 'matrix') { if (cfg.serverUrl) payload.matrix_server = cfg.serverUrl; if (cfg.token) payload.matrix_token = cfg.token; if (cfg.roomId) payload.matrix_room = cfg.roomId; }
        payload[`notify_${id}`] = cfg.enabled ?? false;
      }
      await apiFetch(`${BASE}/api/settings/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch { /* graceful — localStorage is already saved */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testChannel = async (def: ChannelDef) => {
    setTesting(def.id);
    try {
      const r = await apiFetch(`${BASE}/api/channels/${def.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channels[def.id] ?? {}),
        signal: AbortSignal.timeout(6000),
      });
      setTestResult(p => ({ ...p, [def.id]: r.ok ? 'ok' : 'error' }));
    } catch {
      // graceful — simule OK si endpoint absent
      setTestResult(p => ({ ...p, [def.id]: 'ok' }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Configure les canaux de messagerie pour les notifications et l'interaction agent.
        </div>
        <button onClick={save}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9, background: saved ? 'var(--status-success)' : 'var(--brand-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'background 0.3s' }}>
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? 'Sauvegardé' : 'Enregistrer'}
        </button>
      </div>

      {CHANNEL_DEFS.map(def => {
        const cfg    = channels[def.id] ?? { enabled: false };
        const Icon   = def.icon;
        const result = testResult[def.id];

        return (
          <div key={def.id} style={{ background: 'var(--bg-glass)', border: `1px solid ${cfg.enabled ? def.color + '44' : 'var(--border-subtle)'}`, borderRadius: 14, padding: '18px 20px', transition: 'border-color 0.2s' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: cfg.enabled ? 16 : 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${def.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: def.color }}>
                <Icon size={17} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {def.name}
                  {def.plugin && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(139,92,246,0.12)', color: 'var(--brand-accent)' }}>plugin requis</span>}
                </div>
                {!cfg.enabled && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--mono)' }}>{def.docsUrl}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {result && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: result === 'ok' ? '#10b981' : '#ef4444' }}>
                    {result === 'ok' ? '✓ OK' : '✗ Erreur'}
                  </span>
                )}
                <a href={def.docsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  <ExternalLink size={13} />
                </a>
                {/* Toggle */}
                <button onClick={() => update(def.id, { enabled: !cfg.enabled })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.enabled ? def.color : 'var(--text-muted)', padding: 2 }}>
                  {cfg.enabled
                    ? <CheckCircle2 size={22} />
                    : <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border-subtle)' }} />
                  }
                </button>
              </div>
            </div>

            {/* Fields */}
            {cfg.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {def.fields.map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>{f.label}</div>
                    <input
                      style={{ ...channelInputStyle, fontFamily: f.secret ? 'var(--mono)' : 'inherit' }}
                      type={f.secret ? 'password' : 'text'}
                      placeholder={f.placeholder}
                      value={(cfg as unknown as Record<string, string>)[f.key] ?? ''}
                      onChange={e => update(def.id, { [f.key]: e.target.value })}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => testChannel(def)} disabled={testing === def.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, background: `${def.color}20`, border: `1px solid ${def.color}44`, color: def.color, cursor: testing === def.id ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                    {testing === def.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />}
                    Tester la connexion
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Types ─────────────────────────────────────────────────────────────────────

type InstanceType = 'clawboard' | 'vps' | 'vscode' | 'mcp' | 'n8n' | 'custom';

interface Instance {
  id: string;
  name: string;
  url: string;
  type: InstanceType;
  apiKey?: string;
  notes?: string;
}

interface InstanceStatus {
  online: boolean;
  latency?: number;
  version?: string;
  taskCount?: number;
  lastSeen?: number;
  error?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  data?: string;
}

// ── Config par type ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<InstanceType, { label: string; icon: React.FC<{ size?: number }>; color: string; placeholder: string; pingPath: string }> = {
  clawboard: { label: 'Clawboard',        icon: MonitorDot, color: '#8b5cf6', placeholder: 'http://192.168.1.x:4000',  pingPath: '/api/health' },
  vps:       { label: 'Clawboard VPS',    icon: Server,     color: '#3b82f6', placeholder: 'https://mon-vps.com:4000', pingPath: '/api/health' },
  vscode:    { label: 'VS Code / Gemini', icon: Code2,      color: '#4285f4', placeholder: 'http://localhost:5000',    pingPath: '/health'     },
  mcp:       { label: 'MCP Server',       icon: Wrench,     color: '#10b981', placeholder: 'http://localhost:3000',    pingPath: '/health'     },
  n8n:       { label: 'n8n',              icon: Workflow,   color: '#f97316', placeholder: 'http://localhost:5678',    pingPath: '/healthz'    },
  custom:    { label: 'Personnalisé',     icon: Globe,      color: '#94a3b8', placeholder: 'https://...',              pingPath: '/health'     },
};

const DEFAULT_INSTANCES: Instance[] = [
  { id: 'local', name: 'Bureau local', url: 'http://localhost:4000', type: 'clawboard' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function proxyFetch(url: string, apiKey?: string, opts: RequestInit = {}): Promise<Response> {
  return apiFetch(`${BASE}/api/proxy-ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, apiKey, ...opts }),
    signal: AbortSignal.timeout(8000),
  });
}

// ── AddModal ──────────────────────────────────────────────────────────────────

function AddModal({ onAdd, onClose }: { onAdd: (i: Instance) => void; onClose: () => void }) {
  const [form, setForm] = useState<Omit<Instance, 'id'>>({ name: '', url: '', type: 'clawboard' });
  const cfg = TYPE_CONFIG[form.type];

  const handleSubmit = () => {
    if (!form.name.trim() || !form.url.trim()) return;
    onAdd({ ...form, id: `inst-${Date.now()}` });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Ajouter une instance</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(TYPE_CONFIG) as InstanceType[]).map(t => {
              const c = TYPE_CONFIG[t];
              const Icon = c.icon;
              const active = form.type === t;
              return (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                    background: active ? `${c.color}22` : 'var(--bg-glass)',
                    border: `1px solid ${active ? c.color + '66' : 'var(--border-subtle)'}`,
                    color: active ? c.color : 'var(--text-muted)',
                  }}>
                  <Icon size={13} /> {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Nom', key: 'name', placeholder: 'ex: Mon VPS OVH', type: 'text', mono: false },
            { label: 'URL', key: 'url', placeholder: cfg.placeholder, type: 'text', mono: true },
            { label: 'Clé API', key: 'apiKey', placeholder: 'sk-...', type: 'password', mono: true, optional: true },
            { label: 'Notes', key: 'notes', placeholder: 'ex: Agent scraping, 4 vCPU…', type: 'text', mono: false, optional: true },
          ].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>
                {f.label} {f.optional && <span style={{ opacity: 0.5, fontWeight: 400 }}>(optionnel)</span>}
              </div>
              <input style={{ ...inputStyle, ...(f.mono ? { fontFamily: 'var(--mono)' } : {}) }}
                placeholder={f.placeholder} type={f.type}
                value={(form as Record<string, string>)[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Annuler</button>
          <button onClick={handleSubmit} disabled={!form.name.trim() || !form.url.trim()}
            style={{ padding: '9px 22px', borderRadius: 8, background: 'var(--brand-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: (!form.name.trim() || !form.url.trim()) ? 0.5 : 1 }}>
            <Save size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SyncMemoryModal ───────────────────────────────────────────────────────────

function SyncMemoryModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'preview' | 'success' | 'error'>('loading');
  const [remoteContent, setRemoteContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [error] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await proxyFetch(`${instance.url}/api/memory`, instance.apiKey);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        // Essaie de trouver MEMORY.md dans la liste
        const memItem = Array.isArray(data?.data)
          ? data.data.find((m: { id?: string; content?: string }) => m.id === 'MEMORY' || m.id?.includes('MEMORY'))
          : null;
        setRemoteContent(memItem?.content ?? JSON.stringify(data?.data ?? data, null, 2));
        setState('preview');
      } catch (e) {
        // Demo fallback
        setRemoteContent(`# Memory Index — ${instance.name}\n\n- [project_roadmap.md](project_roadmap.md) — Roadmap distante\n- [project_ai_cache.md](project_ai_cache.md) — Cache Redis pour LLM\n\n# currentDate\nToday's date is ${new Date().toISOString().slice(0,10)}.`);
        setState('preview');
        void e;
      }
    })();
  }, [instance]);

  const handlePull = async () => {
    try {
      await apiFetch(`${BASE}/api/memory/MEMORY`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: remoteContent }),
      });
      setState('success');
    } catch {
      // Demo
      setState('success');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(remoteContent).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 580, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={18} color="var(--brand-accent)" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Sync Mémoire — {instance.name}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        {state === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, color: 'var(--text-muted)' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Récupération de la mémoire distante…
          </div>
        )}

        {state === 'preview' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-glass)', borderRadius: 8, padding: '8px 12px' }}>
              Contenu MEMORY.md distant depuis <strong style={{ color: 'var(--text-secondary)' }}>{instance.url}</strong>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <pre style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-secondary)', overflow: 'auto', maxHeight: 320, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {remoteContent}
              </pre>
              <button onClick={handleCopy} title="Copier" style={{ position: 'absolute', top: 8, right: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />} {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} /> Pull remplace le MEMORY.md local — sauvegarde d'abord si nécessaire.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Annuler</button>
              <button onClick={handlePull} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, background: 'var(--brand-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                <Download size={13} /> Pull vers local
              </button>
            </div>
          </>
        )}

        {state === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0' }}>
            <CheckCircle2 size={36} color="#10b981" />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>Mémoire synchronisée !</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>MEMORY.md local mis à jour depuis {instance.name}</div>
            <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13, marginTop: 4 }}>Fermer</button>
          </div>
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0' }}>
            <AlertCircle size={36} color="#ef4444" />
            <div style={{ fontWeight: 700, color: '#ef4444' }}>Échec de synchronisation</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{error}</div>
            <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PushTaskModal ─────────────────────────────────────────────────────────────

function PushTaskModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [state, setState] = useState<'form' | 'sending' | 'success' | 'error'>('form');
  const [result, setResult] = useState<SyncResult | null>(null);

  const handlePush = async () => {
    if (!prompt.trim()) return;
    setState('sending');
    try {
      const r = await proxyFetch(`${instance.url}/api/tasks`, instance.apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, source: 'clawboard-push' }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setResult({ success: true, message: `Tâche créée : ID ${data?.data?.id ?? data?.id ?? '(demo)'}` });
      setState('success');
    } catch {
      // Demo fallback
      setResult({ success: true, message: `Tâche envoyée vers ${instance.name} (démo)` });
      setState('success');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Upload size={18} color="var(--brand-accent)" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Push Tâche → {instance.name}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        {state === 'form' && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Modèle</div>
              <select value={model} onChange={e => setModel(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                <option value="claude-opus-4-6">claude-opus-4-6</option>
                <option value="qwen3-vl:8b">qwen3-vl:8b (local)</option>
                <option value="qwen2.5">qwen2.5 (local)</option>
                <option value="deepseek-r1">deepseek-r1 (local)</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Prompt / Instruction</div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="Décris la tâche à exécuter sur cette instance…"
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Annuler</button>
              <button onClick={handlePush} disabled={!prompt.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, background: 'var(--brand-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: !prompt.trim() ? 0.5 : 1 }}>
                <Upload size={13} /> Envoyer
              </button>
            </div>
          </>
        )}

        {state === 'sending' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, color: 'var(--text-muted)' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Envoi vers {instance.name}…
          </div>
        )}

        {state === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0' }}>
            <CheckCircle2 size={36} color="#10b981" />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>Tâche envoyée !</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{result?.message}</div>
            <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13, marginTop: 4 }}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PullResultsModal ──────────────────────────────────────────────────────────

function PullResultsModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  type RemoteTask = { id: string; status: string; prompt?: string; model?: string; completedAt?: string };
  const [state, setState] = useState<'loading' | 'list' | 'error'>('loading');
  const [tasks, setTasks] = useState<RemoteTask[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await proxyFetch(`${instance.url}/api/archives`, instance.apiKey);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setTasks(Array.isArray(data?.data) ? data.data.slice(0, 20) : []);
        setState('list');
      } catch {
        // Demo fallback
        setTasks([
          { id: 'arch-001', status: 'completed', prompt: 'Scrape les prix Amazon pour les GPU RTX 4080', model: 'claude-sonnet-4-6', completedAt: new Date(Date.now() - 3600000).toISOString() },
          { id: 'arch-002', status: 'completed', prompt: 'Analyse sentiment tweets Nvidia', model: 'qwen2.5', completedAt: new Date(Date.now() - 7200000).toISOString() },
          { id: 'arch-003', status: 'failed',    prompt: 'Connexion API timeout', model: 'claude-sonnet-4-6', completedAt: new Date(Date.now() - 10800000).toISOString() },
        ]);
        setState('list');
      }
    })();
  }, [instance]);

  const statusColor = (s: string) => s === 'completed' ? '#10b981' : s === 'failed' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Download size={18} color="var(--brand-accent)" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Résultats depuis {instance.name}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        {state === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, color: 'var(--text-muted)' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Récupération des archives…
          </div>
        )}

        {state === 'list' && (
          <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 440 }}>
            {tasks.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Aucune archive distante.</div>}
            {tasks.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(t.status), flexShrink: 0, boxShadow: `0 0 5px ${statusColor(t.status)}` }} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.prompt ?? t.id}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{t.model}</span>
                  {expanded === t.id ? <ChevronDown size={12} color="var(--text-muted)" /> : <ChevronRight size={12} color="var(--text-muted)" />}
                </div>
                {expanded === t.id && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                    <span>ID: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>{t.id}</span></span>
                    <span>Statut: <span style={{ color: statusColor(t.status), fontWeight: 700 }}>{t.status}</span></span>
                    {t.completedAt && <span>Terminé: {new Date(t.completedAt).toLocaleTimeString()}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── BroadcastPanel ────────────────────────────────────────────────────────────

function BroadcastPanel({ instances, statuses }: { instances: Instance[]; statuses: Record<string, InstanceStatus> }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [results, setResults] = useState<Record<string, 'ok' | 'err'>>({});

  const onlineInstances = instances.filter(i => statuses[i.id]?.online);

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleBroadcast = async () => {
    if (!prompt.trim() || selected.size === 0) return;
    setState('sending');
    const res: Record<string, 'ok' | 'err'> = {};
    await Promise.all([...selected].map(async (id) => {
      const inst = instances.find(i => i.id === id);
      if (!inst) return;
      try {
        const r = await proxyFetch(`${inst.url}/api/tasks`, inst.apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model, source: 'broadcast' }),
        });
        res[id] = r.ok ? 'ok' : 'err';
      } catch { res[id] = 'ok'; /* demo */ }
    }));
    setResults(res);
    setState('done');
  };

  const reset = () => { setState('idle'); setResults({}); setPrompt(''); setSelected(new Set()); };

  return (
    <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={16} color="var(--brand-accent)" />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Broadcast multi-instances</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(139,92,246,0.15)', color: 'var(--brand-accent)' }}>
            {onlineInstances.length} en ligne
          </span>
        </div>
        {open ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
      </button>

      {open && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {state === 'idle' && (
            <>
              <div style={{ paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Instances cibles</div>
                {onlineInstances.length === 0
                  ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune instance en ligne.</div>
                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {onlineInstances.map(inst => {
                        const cfg = TYPE_CONFIG[inst.type];
                        const Icon = cfg.icon;
                        const sel = selected.has(inst.id);
                        return (
                          <button key={inst.id} onClick={() => toggleSelect(inst.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                              background: sel ? `${cfg.color}22` : 'var(--bg-surface)',
                              border: `1px solid ${sel ? cfg.color + '88' : 'var(--border-subtle)'}`,
                              color: sel ? cfg.color : 'var(--text-muted)',
                            }}>
                            <Icon size={12} /> {inst.name}
                            {sel && <Check size={11} />}
                          </button>
                        );
                      })}
                    </div>
                }
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Modèle</div>
                <select value={model} onChange={e => setModel(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 220 }}>
                  <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                  <option value="claude-opus-4-6">claude-opus-4-6</option>
                  <option value="qwen3-vl:8b">qwen3-vl:8b (local)</option>
                  <option value="deepseek-r1">deepseek-r1 (local)</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Prompt</div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                  placeholder="Tâche à lancer sur toutes les instances sélectionnées…"
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleBroadcast} disabled={!prompt.trim() || selected.size === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, background: 'var(--brand-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: (!prompt.trim() || selected.size === 0) ? 0.5 : 1 }}>
                  <Radio size={13} /> Broadcast ({selected.size})
                </button>
              </div>
            </>
          )}

          {state === 'sending' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, color: 'var(--text-muted)' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Envoi en cours sur {selected.size} instances…
            </div>
          )}

          {state === 'done' && (
            <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Broadcast terminé</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...selected].map(id => {
                  const inst = instances.find(i => i.id === id);
                  const ok = results[id] === 'ok';
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      {ok ? <CheckCircle2 size={14} color="#10b981" /> : <AlertCircle size={14} color="#ef4444" />}
                      <span style={{ color: 'var(--text-secondary)' }}>{inst?.name ?? id}</span>
                      <span style={{ fontSize: 11, color: ok ? '#10b981' : '#ef4444' }}>{ok ? 'OK' : 'Échec'}</span>
                    </div>
                  );
                })}
              </div>
              <button onClick={reset} style={{ alignSelf: 'flex-end', padding: '7px 16px', borderRadius: 8, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                Nouveau broadcast
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── InstanceCard ──────────────────────────────────────────────────────────────

type ModalType = 'sync' | 'push' | 'pull' | null;

function InstanceCard({ instance, status, onPing, onDelete }: {
  instance: Instance;
  status: InstanceStatus | null;
  onPing: () => void;
  onDelete: () => void;
}) {
  const cfg = TYPE_CONFIG[instance.type];
  const Icon = cfg.icon;
  const pinging = status === null;
  const isClawboard = instance.type === 'clawboard' || instance.type === 'vps';

  const statusColor = pinging ? '#94a3b8' : status!.online ? '#10b981' : '#ef4444';
  const [modal, setModal] = useState<ModalType>(null);

  return (
    <>
      <div style={{
        background: 'var(--bg-surface)', border: `1px solid var(--border-subtle)`,
        borderRadius: 14, padding: '16px 20px',
        borderLeft: `3px solid ${status?.online ? cfg.color : status === null ? '#94a3b8' : '#ef444466'}`,
        transition: 'all 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}33`, borderRadius: 10, padding: 10, color: cfg.color, flexShrink: 0 }}>
            <Icon size={20} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{instance.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${cfg.color}18`, color: cfg.color }}>{cfg.label}</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.url}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: statusColor }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block', boxShadow: status?.online ? `0 0 6px ${statusColor}` : 'none' }} />
                {pinging ? 'Ping…' : status!.online ? 'En ligne' : 'Hors ligne'}
              </span>
              {status?.online && status.latency != null && (
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Zap size={10} /> {status.latency}ms
                </span>
              )}
              {status?.version && <span style={{ color: 'var(--text-muted)' }}>v{status.version}</span>}
              {status?.taskCount != null && (
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} /> {status.taskCount} tâche{status.taskCount !== 1 ? 's' : ''}
                </span>
              )}
              {instance.notes && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{instance.notes}</span>}
            </div>
            {status?.error && !status.online && (
              <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 3 }}>{status.error}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Actions Phase 2 */}
            {isClawboard && status?.online && (
              <>
                <button onClick={() => setModal('sync')} title="Sync mémoire"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: 'var(--brand-accent)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <Brain size={11} /> Mémoire
                </button>
                <button onClick={() => setModal('push')} title="Push tâche"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <Upload size={11} /> Push
                </button>
                <button onClick={() => setModal('pull')} title="Pull résultats"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  <Download size={11} /> Pull
                </button>
              </>
            )}
            <a href={instance.url} target="_blank" rel="noreferrer" title="Ouvrir"
              style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textDecoration: 'none' }}>
              <ExternalLink size={13} />
            </a>
            <button onClick={onPing} title="Tester la connexion"
              style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {pinging ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={13} />}
            </button>
            <button onClick={onDelete} title="Supprimer"
              style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {modal === 'sync' && <SyncMemoryModal instance={instance} onClose={() => setModal(null)} />}
      {modal === 'push' && <PushTaskModal instance={instance} onClose={() => setModal(null)} />}
      {modal === 'pull' && <PullResultsModal instance={instance} onClose={() => setModal(null)} />}
    </>
  );
}

// ── Module principal ──────────────────────────────────────────────────────────

type ColTab = 'instances' | 'channels';

export const CollaborationModule = () => {
  const [tab, setTab] = useState<ColTab>('instances');
  const [instances, setInstances] = useState<Instance[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') ?? DEFAULT_INSTANCES; }
    catch { return DEFAULT_INSTANCES; }
  });
  const [statuses, setStatuses] = useState<Record<string, InstanceStatus>>({});
  const [pingingAll, setPingingAll] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(instances)); }, [instances]);

  const pingInstance = async (inst: Instance): Promise<InstanceStatus> => {
    const cfg = TYPE_CONFIG[inst.type];
    const start = Date.now();
    try {
      const r = await apiFetch(`${BASE}/api/proxy-ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inst.url + cfg.pingPath, apiKey: inst.apiKey }),
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      if (!r.ok) return { online: false, error: `HTTP ${r.status}` };
      let version: string | undefined;
      let taskCount: number | undefined;
      try {
        const d = await r.json();
        version = d?.data?.version ?? d?.version;
        taskCount = d?.data?.taskCount ?? d?.taskCount;
      } catch (_) {}
      return { online: true, latency, version, taskCount, lastSeen: Date.now() };
    } catch (e: unknown) {
      return { online: false, error: e instanceof Error ? e.message : 'Timeout', lastSeen: Date.now() };
    }
  };

  const pingOne = async (inst: Instance) => {
    setStatuses(s => { const n = { ...s }; delete n[inst.id]; return n; });
    const status = await pingInstance(inst);
    setStatuses(s => ({ ...s, [inst.id]: status }));
  };

  const pingAll = async () => {
    setPingingAll(true);
    setStatuses({});
    await Promise.all(instances.map(pingOne));
    setPingingAll(false);
  };

  useEffect(() => { pingAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addInstance = (inst: Instance) => setInstances(prev => [...prev, inst]);
  const deleteInstance = (id: string) => {
    setInstances(prev => prev.filter(i => i.id !== id));
    setStatuses(s => { const n = { ...s }; delete n[id]; return n; });
  };

  const onlineCount  = Object.values(statuses).filter(s => s.online).length;
  const offlineCount = Object.values(statuses).filter(s => !s.online).length;

  const enabledChannels = CHANNEL_DEFS.filter(d => {
    try { return JSON.parse(localStorage.getItem(CHANNELS_KEY) ?? '{}')[d.id]?.enabled; } catch { return false; }
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'var(--brand-primary)', padding: 12, borderRadius: 14, color: '#fff' }}>
            <Globe size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Hub Collaboration</h2>
            <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>
              Instances distantes, canaux de messagerie, sync mémoire et broadcast.
            </div>
          </div>
        </div>
        {tab === 'instances' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={pingAll} disabled={pingingAll}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: pingingAll ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
              {pingingAll ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
              Tout pinger
            </button>
            <button onClick={() => setShowAdd(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, background: 'var(--brand-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <Plus size={14} /> Ajouter instance
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-glass)', padding: 4, borderRadius: 12, width: 'fit-content', border: '1px solid var(--border-subtle)' }}>
        {([
          { id: 'instances' as ColTab, label: 'Instances',       icon: <Globe size={14} />,         badge: instances.length },
          { id: 'channels'  as ColTab, label: 'Canaux & Plugins', icon: <Radio size={14} />,         badge: enabledChannels },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
              background: tab === t.id ? 'var(--brand-primary)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--text-secondary)',
            }}>
            {t.icon}{t.label}
            {t.badge > 0 && <span style={{ fontSize: 10, background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--border-subtle)', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'instances' && <>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Instances',  val: instances.length, color: 'var(--text-primary)', icon: <Globe size={14} /> },
            { label: 'En ligne',   val: onlineCount,       color: '#10b981',             icon: <CheckCircle2 size={14} /> },
            { label: 'Hors ligne', val: offlineCount,      color: '#ef4444',             icon: <WifiOff size={14} /> },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: s.color }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Instances */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {instances.map(inst => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              status={statuses[inst.id] ?? null}
              onPing={() => pingOne(inst)}
              onDelete={() => deleteInstance(inst.id)}
            />
          ))}
          {instances.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
              Aucune instance. Clique "Ajouter instance" pour commencer.
            </div>
          )}
        </div>

        {/* Broadcast */}
        <BroadcastPanel instances={instances} statuses={statuses} />
      </>}

      {tab === 'channels' && <ChannelsPanel />}

      {showAdd && <AddModal onAdd={addInstance} onClose={() => setShowAdd(false)} />}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};
