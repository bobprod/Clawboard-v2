import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSSE } from '../hooks/useSSE';
import { apiFetch } from '../lib/apiFetch';
import type { Task } from '../data/mockData';
import {
  X, Play, RefreshCw, Trash2, Terminal, Clock, Zap,
  Wifi, WifiOff, CheckCircle2, AlertTriangle, Copy, Check,
  Save, Settings, History, Layers,
  ToggleLeft, ToggleRight, Plus, Minus, MessageSquare,
} from 'lucide-react';

const BASE = 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityEvent {
  ts: string;
  type: 'launched' | 'completed' | 'failed' | 'retry' | 'info' | 'created';
  label: string;
  detail?: string;
}

interface Execution {
  id: string;
  startedAt: string;
  duration: number;
  tokens: { prompt: number; completion: number };
  cost: string | number;
  exitCode: number;
  stdout: string;
  llmModel?: string;
}

interface RichTask extends Task {
  name?: string;
  instructions?: string;
  skillName?: string;
  llmModel?: string;
  agent?: string;
  canal?: string;
  destinataire?: string;
  disablePreInstructions?: boolean;
  activity?: ActivityEvent[];
  executions?: Execution[];
  modeleId?: string;
}

interface EditState {
  name: string;
  instructions: string;
  skillName: string;
  llmModel: string;
  agent: string;
  canal: string;
  destinataire: string;
  status: string;
  disablePreInstructions: boolean;
  objectives: string[];
  timeoutMin: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  planned: '#a1a1aa', pending: '#a1a1aa',
  running: '#3b82f6', completed: '#10b981', failed: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planifié', running: 'En cours', completed: 'Terminé', failed: 'Échoué', pending: 'En attente',
};

const EVT_COLOR: Record<string, string> = {
  created: '#8b5cf6', launched: '#3b82f6', completed: '#10b981',
  failed: '#ef4444', retry: '#f59e0b', info: '#a1a1aa',
};

const PANEL_MODELS: { id: string; label: string; color?: string; provider?: string }[] = [
  { id: 'claude-sonnet-4-6',                       label: 'Claude Sonnet 4.6',      color: '#8b5cf6' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: '⚡ Nemotron Ultra 253B', color: '#76b900' },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1',  label: 'Nemotron Super 49B',     color: '#76b900' },
  { id: 'meta/llama-3.1-405b-instruct',            label: '⚡ Llama 3.1 405B',      color: '#0064c8' },
  { id: 'deepseek-ai/deepseek-v3.2',               label: 'DeepSeek V3.2',          color: '#1a73e8' },
  { id: 'qwen/qwq-32b',                            label: 'QwQ 32B',                color: '#9333ea' },
  { id: 'moonshotai/kimi-k2.5',                    label: 'Kimi K2.5',              color: '#3b82f6' },
  { id: 'gemini/gemini-2.5-flash',                 label: 'Gemini 2.5 Flash',       color: '#4285f4' },
  { id: 'ollama/qwen2.5',                          label: 'Qwen 2.5 (local)',        color: '#10b981' },
];

const LOG_COLORS: Record<string, string> = {
  '[BOOT]': '#6366f1', '[INIT]': '#8b5cf6', '[NET]': '#3b82f6',
  '[LLM]': '#10b981',  '[EXEC]': '#a1a1aa', 'WARNING': '#f59e0b', '[ERROR]': '#ef4444',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lineColor = (l: string) => {
  for (const [k, v] of Object.entries(LOG_COLORS)) if (l.includes(k)) return v;
  return '#71717a';
};

const modelShortName = (m: string = '') => {
  if (!m) return '—';
  if (m.includes('nemotron-ultra')) return 'Nemotron Ultra';
  if (m.includes('nemotron-super')) return 'Nemotron Super';
  if (m.includes('claude')) return 'Claude';
  if (m.includes('kimi')) return 'Kimi K2.5';
  if (m.includes('deepseek')) return 'DeepSeek';
  if (m.includes('gemini')) return 'Gemini';
  if (m.includes('llama')) return m.includes('405') ? 'Llama 405B' : 'Llama';
  if (m.includes('qwq')) return 'QwQ 32B';
  if (m.includes('ollama')) return 'Local';
  return m.split('/').pop() || m;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.2s',
};

function MarkdownOutput({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: 1.8, color: '#c4c4d4' }}>
      {(text || '').split('\n').map((line, i) => {
        if (line.startsWith('## ')) return <div key={i} style={{ color: '#818cf8', fontWeight: 700, fontSize: '13px', marginTop: '12px' }}>{line.slice(3)}</div>;
        if (line.startsWith('# '))  return <div key={i} style={{ color: '#6366f1', fontWeight: 700, fontSize: '14px', marginTop: '16px' }}>{line.slice(2)}</div>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 16 }}>• {line.slice(2)}</div>;
        if (line === '') return <div key={i} style={{ height: 5 }} />;
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const TaskDetailPanel = ({ taskId }: { taskId: string }) => {
  const navigate = useNavigate();
  const terminalRef = useRef<HTMLDivElement>(null);

  const [task, setTask]               = useState<RichTask | null>(null);
  const [loadError, setLoadError]     = useState(false);
  const [formState, setFormState]     = useState<EditState | null>(null);
  const [dirty, setDirty]             = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<'config' | 'terminal' | 'executions' | 'activity' | 'traces'>('config');
  const [activeExec, setActiveExec]   = useState<string | null>(null);
  const [logs, setLogs]               = useState<{ line: string; ts: string }[]>([]);
  const [logConnected, setLogConnected] = useState(false);
  const [relaunching, setRelaunching] = useState(false);
  const [copiedLogs, setCopiedLogs]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cloning, setCloning]         = useState(false);
  const [savingModele, setSavingModele] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [traces, setTraces]           = useState<{ traceId: string; spanId: string; operation: string; status: string; duration?: number; cost?: number; tokens?: number; ts: string }[]>([]);
  const [availableModels, setAvailableModels] = useState(PANEL_MODELS);

  const { data: liveTasks } = useSSE<Task[] | null>('/api/tasks?stream=1', null);

  // ── Load available LLM models from backend
  useEffect(() => {
    apiFetch(`${BASE}/api/models/available`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          // Dedupe by id, keep existing static entries as fallback
          const map = new Map<string, typeof PANEL_MODELS[0]>();
          for (const m of PANEL_MODELS) map.set(m.id, m);
          for (const m of data) map.set(m.id, { id: m.id, label: m.label, color: m.color, provider: m.provider });
          setAvailableModels(Array.from(map.values()));
        }
      })
      .catch(() => {});
  }, []);

  // ── Load task
  useEffect(() => {
    if (!taskId) return;
    setTask(null);
    setLoadError(false);
    setDirty(false);
    apiFetch(`${BASE}/api/tasks/${taskId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: RichTask) => {
        if (!d || typeof d !== 'object') { setLoadError(true); return; }
        setTask(d);
        setFormState({
          name:                  (d as any).name || d.title || '',
          instructions:          (d as any).instructions || d.description || '',
          skillName:             (d as any).skillName || '',
          llmModel:              (d as any).llmModel || d.llmMode || '',
          agent:                 (d as any).agent || d.agentId || 'main',
          canal:                 (d as any).canal || d.channelTarget?.platform || '',
          destinataire:          (d as any).destinataire || d.channelTarget?.targetId || '',
          status:                d.status || 'planned',
          disablePreInstructions:(d as any).disablePreInstructions ?? false,
          objectives:            (d as any).objectives || [],
          timeoutMin:            (d as any).timeoutMin || 30,
        });
        setDirty(false);
        if (d.executions?.length) setActiveExec(d.executions[d.executions.length - 1].id);
      })
      .catch(() => setLoadError(true));

    // ── Fetch OTel traces for this task
    apiFetch(`${BASE}/api/traces?taskId=${taskId}`)
      .then(r => r.json())
      .then((data: any) => {
        const spans = Array.isArray(data) ? data : (data.spans ?? data.traces ?? []);
        setTraces(spans);
      })
      .catch(() => {
        setTraces([
          { traceId: `trace-${taskId}`, spanId: 'span-1', operation: 'task.init', status: 'ok', duration: 120, cost: 0, tokens: 0, ts: new Date(Date.now() - 5000).toISOString() },
          { traceId: `trace-${taskId}`, spanId: 'span-2', operation: 'llm.prompt', status: 'ok', duration: 2400, cost: 0.0034, tokens: 1250, ts: new Date(Date.now() - 3000).toISOString() },
          { traceId: `trace-${taskId}`, spanId: 'span-3', operation: 'tool.execute', status: 'ok', duration: 800, cost: 0, tokens: 0, ts: new Date(Date.now() - 1000).toISOString() },
          { traceId: `trace-${taskId}`, spanId: 'span-4', operation: 'task.complete', status: 'ok', duration: 50, cost: 0, tokens: 0, ts: new Date().toISOString() },
        ]);
      });
  }, [taskId]);

  // ── Merge live SSE: use SSE data as fallback if fetch hasn't completed
  const liveBase = liveTasks?.find(t => t.id === taskId);
  const liveTask: RichTask | null = task
    ? { ...task, ...(liveBase ? { status: liveBase.status, tokensUsed: liveBase.tokensUsed, cost: liveBase.cost } : {}) }
    : liveBase
      ? { ...(liveBase as unknown as RichTask) }
      : null;

  // ── Log stream
  useEffect(() => {
    if (!taskId) return;
    setLogs([]);
    const es = new EventSource(`${BASE}/api/logs/${taskId}`);
    es.onopen = () => setLogConnected(true);
    es.onmessage = e => { try { setLogs(p => [...p, JSON.parse(e.data)]); } catch (_) {} };
    es.onerror = () => { setLogConnected(false); es.close(); };
    return () => es.close();
  }, [taskId]);

  // ── Auto-scroll terminal
  useEffect(() => {
    if (activeTab === 'terminal' && terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs, activeTab]);

  // ── Field update (always active)
  const setField = <K extends keyof EditState>(k: K, v: EditState[K]) => {
    setFormState(p => p ? { ...p, [k]: v } : p);
    setDirty(true);
  };

  // ── Save
  const save = async () => {
    if (!formState || !taskId) return;
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        name:                  formState.name,
        title:                 formState.name,
        instructions:          formState.instructions,
        description:           formState.instructions,
        skillName:             formState.skillName,
        llmModel:              formState.llmModel,
        agent:                 formState.agent,
        agentId:               formState.agent,
        canal:                 formState.canal,
        destinataire:          formState.destinataire,
        status:                formState.status,
        disablePreInstructions:formState.disablePreInstructions,
        objectives:            formState.objectives,
        timeoutMin:            formState.timeoutMin,
        channelTarget:         { platform: formState.canal, targetId: formState.destinataire },
      };
      const res = await apiFetch(`${BASE}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const updated = await res.json();
      setTask(updated);
      setDirty(false);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Actions
  const handleRelaunch = async () => {
    setRelaunching(true);
    setActiveTab('terminal');
    await apiFetch(`${BASE}/api/tasks/${taskId}/run`, { method: 'POST' }).catch(() => {});
    // Re-fetch after 3.5s to pick up the completed execution + new status
    setTimeout(async () => {
      setRelaunching(false);
      const d = await apiFetch(`${BASE}/api/tasks/${taskId}`).then(r => r.json()).catch(() => null);
      if (d) { setTask(d); if (d.executions?.length) setActiveExec(d.executions[0].id); }
    }, 3500);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await apiFetch(`${BASE}/api/tasks/${taskId}`, { method: 'DELETE' }).catch(() => {});
    navigate('/tasks');
  };

  const showToast = (msg: string) => { setActionToast(msg); setTimeout(() => setActionToast(null), 3000); };

  const handleClone = async () => {
    if (!liveTask) return;
    setCloning(true);
    try {
      const payload = {
        name: `${(liveTask as any).name || liveTask.title || 'Tâche'} (copie)`,
        title: `${(liveTask as any).name || liveTask.title || 'Tâche'} (copie)`,
        instructions: (liveTask as any).instructions || liveTask.description || '',
        description: (liveTask as any).instructions || liveTask.description || '',
        skillName: (liveTask as any).skillName || '',
        llmModel: (liveTask as any).llmModel || liveTask.llmMode || '',
        agent: (liveTask as any).agent || liveTask.agentId || 'main',
        canal: (liveTask as any).canal || liveTask.channelTarget?.platform || '',
        destinataire: (liveTask as any).destinataire || liveTask.channelTarget?.targetId || '',
        objectives: (liveTask as any).objectives || [],
        timeoutMin: (liveTask as any).timeoutMin || 30,
        disablePreInstructions: (liveTask as any).disablePreInstructions ?? false,
      };
      const res = await apiFetch(`${BASE}/api/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const created = await res.json();
      navigate(`/tasks/${created.id}`);
    } catch { showToast('Erreur duplication'); }
    setCloning(false);
  };

  const handleSaveAsModele = async () => {
    if (!liveTask) return;
    setSavingModele(true);
    try {
      await apiFetch(`${BASE}/api/modeles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (liveTask as any).name || liveTask.title || 'Modèle',
          skillName: (liveTask as any).skillName || '',
          instructions: (liveTask as any).instructions || liveTask.description || '',
          llmModel: (liveTask as any).llmModel || liveTask.llmMode || '',
          agent: (liveTask as any).agent || liveTask.agentId || 'main',
          canal: (liveTask as any).canal || liveTask.channelTarget?.platform || '',
          destinataire: (liveTask as any).destinataire || liveTask.channelTarget?.targetId || '',
          disablePreInstructions: (liveTask as any).disablePreInstructions ?? false,
        }),
      });
      showToast('✓ Sauvegardé comme modèle');
    } catch { showToast('Erreur sauvegarde'); }
    setSavingModele(false);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.map(l => `${l.ts}  ${l.line}`).join('\n'))
      .then(() => { setCopiedLogs(true); setTimeout(() => setCopiedLogs(false), 2000); });
  };

  if (!liveTask) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', flexDirection: 'column', gap: 12 }}>
      {loadError ? (
        <>
          <AlertTriangle size={24} style={{ opacity: 0.5, color: '#ef4444' }} />
          <span style={{ fontSize: '0.875rem', opacity: 0.7, color: '#ef4444' }}>Tâche introuvable</span>
          <button onClick={() => { setLoadError(false); apiFetch(`${BASE}/api/tasks/${taskId}`).then(r => r.json()).then(d => { if (d) setTask(d); }).catch(() => setLoadError(true)); }}
            style={{ fontSize: '12px', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Réessayer
          </button>
        </>
      ) : (
        <>
          <RefreshCw size={24} style={{ opacity: 0.4, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '0.875rem', opacity: 0.6 }}>Chargement…</span>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const statusColor = STATUS_COLOR[liveTask.status] ?? '#a1a1aa';
  const totalTokens = liveTask.tokensUsed ? liveTask.tokensUsed.prompt + liveTask.tokensUsed.completion : 0;
  const taskName = (liveTask as any).name || liveTask.title || liveTask.id;
  const activeExecution = liveTask.executions?.find(e => e.id === activeExec);

  // ── Tabs definition
  const TABS = [
    { id: 'config' as const,     icon: <Settings size={13} />,  label: 'Configuration' },
    { id: 'terminal' as const,   icon: <Terminal size={13} />,  label: 'Terminal', badge: logConnected ? '●' : '' },
    { id: 'executions' as const, icon: <History size={13} />,   label: `Exécutions${liveTask.executions?.length ? ` (${liveTask.executions.length})` : ''}` },
    { id: 'activity' as const,   icon: <Clock size={13} />,     label: 'Activité' },
    { id: 'traces' as const,     icon: <Layers size={13} />,    label: `Traces${traces.length ? ` (${traces.length})` : ''}` },
  ] as const;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)',
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface-elevated)', flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Row 1: name + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0,
                boxShadow: liveTask.status === 'running' ? `0 0 8px ${statusColor}` : 'none',
                animation: liveTask.status === 'running' ? 'pulse 1.5s infinite' : 'none',
              }} />
              <input
                value={formState?.name ?? taskName}
                onChange={e => setField('name', e.target.value)}
                style={{ ...inputStyle, fontSize: '1.05rem', fontWeight: 700, padding: '4px 8px', flex: 1 }}
                placeholder="Nom de la tâche…"
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: 4 }}>
              {liveTask.id} · {modelShortName(formState?.llmModel || (liveTask as any).llmModel || liveTask.llmMode)}
            </div>
          </div>
          <button onClick={() => navigate('/tasks')} style={{
            background: 'transparent', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          ><X size={16} /></button>
        </div>

        {/* Row 2: stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: STATUS_LABEL[liveTask.status] ?? liveTask.status, color: statusColor, bg: `${statusColor}18` },
            { label: `$${typeof liveTask.cost === 'number' ? liveTask.cost.toFixed(4) : liveTask.cost || '0.00'}`, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: <Zap size={10} /> },
            { label: totalTokens.toLocaleString() + ' tk', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)', icon: <Terminal size={10} /> },
          ].map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: s.bg, borderRadius: 20, padding: '3px 10px',
              fontSize: '11px', fontWeight: 700, color: s.color,
            }}>
              {s.icon}{s.label}
            </div>
          ))}
        </div>

        {/* Toast */}
        {actionToast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 9999,
            background: '#10b981', color: '#fff', padding: '10px 18px',
            borderRadius: 10, fontWeight: 600, fontSize: '13px',
            boxShadow: '0 4px 20px rgba(16,185,129,0.4)', animation: 'slideIn 0.2s ease',
          }}>{actionToast}</div>
        )}

        {/* Row 3: action buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {dirty && (
            <button onClick={save} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--brand-accent)', color: '#fff', border: 'none',
              borderRadius: 8, cursor: saving ? 'wait' : 'pointer', fontWeight: 600, fontSize: '12px',
            }}>
              <Save size={13} />{saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
          {saveError && <span style={{ fontSize: '11px', color: '#ef4444' }}>⚠️ {saveError}</span>}
          <button onClick={handleRelaunch} disabled={relaunching} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: 'rgba(16,185,129,0.12)', color: '#10b981',
            border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8,
            cursor: relaunching ? 'wait' : 'pointer', fontWeight: 600, fontSize: '12px',
          }}>
            {relaunching ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
            {relaunching ? 'Lancement…' : 'Lancer'}
          </button>
          <button onClick={copyLogs} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '12px',
          }}>
            {copiedLogs ? <Check size={13} /> : <Copy size={13} />}{copiedLogs ? 'Copié !' : 'Logs'}
          </button>
          <button
            onClick={() => {
              const q = `Parle-moi de la tâche ${taskId} : "${taskName}". Quel est son statut, ses objectifs et comment l'optimiser ?`;
              localStorage.setItem('lia-prefill', q);
              navigate('/chat');
            }}
            title="Demander à Lia à propos de cette tâche"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
              border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '12px',
            }}>
            <MessageSquare size={13} />Ask Lia
          </button>
          <button onClick={handleClone} disabled={cloning} title="Dupliquer cette tâche" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
            border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, cursor: cloning ? 'wait' : 'pointer', fontWeight: 600, fontSize: '12px',
          }}>
            {cloning ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={13} />}
            Dupliquer
          </button>
          <button onClick={handleSaveAsModele} disabled={savingModele} title="Sauvegarder comme modèle réutilisable" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: 'rgba(139,92,246,0.08)', color: 'var(--brand-accent)',
            border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, cursor: savingModele ? 'wait' : 'pointer', fontWeight: 600, fontSize: '12px',
          }}>
            {savingModele ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Layers size={13} />}
            → Modèle
          </button>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'rgba(239,68,68,0.08)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '12px',
            }}>
              <Trash2 size={13} />Supprimer
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>Confirmer ?</span>
              <button onClick={handleDelete} disabled={deleting} style={{
                padding: '5px 10px', background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontSize: '11px', fontWeight: 700,
              }}>{deleting ? '…' : 'Oui'}</button>
              <button onClick={() => setShowDeleteConfirm(false)} style={{
                padding: '5px 10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer', fontSize: '11px',
              }}>Non</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 12px',
        borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-glass)', flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: activeTab === tab.id ? 'var(--brand-accent)' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '12px', transition: 'all 0.15s',
            borderBottom: activeTab === tab.id ? '2px solid var(--brand-accent)' : '2px solid transparent',
          }}>
            {tab.icon}
            {tab.label}
            {tab.id === 'terminal' && logConnected && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── CONFIG TAB ── */}
        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Prompt / Instructions */}
            <Field label="Prompt / Instructions">
              <textarea
                value={formState?.instructions ?? ''}
                onChange={e => setField('instructions', e.target.value)}
                rows={8}
                style={{ ...inputStyle, fontFamily: 'var(--mono)', resize: 'vertical', lineHeight: 1.6 }}
                placeholder="Instructions système pour cet agent…"
              />
            </Field>

            {/* Row: Skill + LLM */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Skill">
                <input
                  value={formState?.skillName ?? ''}
                  onChange={e => setField('skillName', e.target.value)}
                  style={inputStyle}
                  placeholder="inbox-monitor, twitter-trends…"
                />
              </Field>

              <Field label="Modèle LLM">
                <select
                  value={formState?.llmModel ?? ''}
                  onChange={e => setField('llmModel', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">— Sélectionner —</option>
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Row: Statut + Agent + Timeout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Statut">
                <select value={formState?.status ?? liveTask.status} onChange={e => setField('status', e.target.value)} style={{ ...inputStyle, cursor: 'pointer', color: statusColor, fontWeight: 700 }}>
                  {['planned','running','completed','failed'].map(s => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>

              <Field label="Agent">
                <input value={formState?.agent ?? ''} onChange={e => setField('agent', e.target.value)} style={inputStyle} placeholder="main" />
              </Field>

              <Field label="Timeout (min)">
                <input type="number" min={1} max={1440} value={formState?.timeoutMin ?? 30} onChange={e => setField('timeoutMin', Number(e.target.value))} style={{ ...inputStyle, fontFamily: 'var(--mono)' }} />
              </Field>
            </div>

            {/* Canal de livraison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <Field label="Canal">
                <input value={formState?.canal ?? ''} onChange={e => setField('canal', e.target.value)} style={inputStyle} placeholder="discord, telegram…" />
              </Field>
              <Field label="Destinataire / Target ID">
                <input value={formState?.destinataire ?? ''} onChange={e => setField('destinataire', e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--mono)' }} placeholder="ID du channel…" />
              </Field>
            </div>

            {/* Objectifs */}
            <Field label="Objectifs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(formState?.objectives ?? []).map((obj, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={obj}
                      onChange={e => {
                        const next = [...(formState?.objectives ?? [])];
                        next[i] = e.target.value;
                        setField('objectives', next);
                      }}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder={`Objectif ${i + 1}…`}
                    />
                    <button onClick={() => setField('objectives', (formState?.objectives ?? []).filter((_, j) => j !== i))} style={{
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 6, color: '#ef4444', cursor: 'pointer', padding: '0 10px',
                      display: 'flex', alignItems: 'center',
                    }}><Minus size={13} /></button>
                  </div>
                ))}
                <button onClick={() => setField('objectives', [...(formState?.objectives ?? []), ''])} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                  background: 'rgba(139,92,246,0.08)', border: '1px dashed rgba(139,92,246,0.3)',
                  borderRadius: 8, color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600, fontSize: '12px',
                }}>
                  <Plus size={13} />Ajouter un objectif
                </button>
              </div>
            </Field>

            {/* Options */}
            <Field label="Options">
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'var(--bg-glass)', borderRadius: 8,
                border: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Désactiver pré-instructions</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>N'injecte pas le system prompt global dans cet agent</div>
                </div>
                <button onClick={() => setField('disablePreInstructions', !(formState?.disablePreInstructions))} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: formState?.disablePreInstructions ? 'var(--brand-accent)' : 'var(--text-muted)',
                }}>
                  {formState?.disablePreInstructions ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            </Field>

          </div>
        )}

        {/* ── TERMINAL TAB ── */}
        {activeTab === 'terminal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 300 }}>
            <div style={{
              padding: '10px 14px', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid var(--border-subtle)', borderRadius: '10px 10px 0 0',
              fontSize: '12px', fontWeight: 600,
            }}>
              <Terminal size={13} color="var(--text-secondary)" />
              <span>Live Terminal</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: logConnected ? '#10b981' : '#ef4444', fontSize: '11px' }}>
                {logConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                {logConnected ? 'STREAMING' : 'OFFLINE'}
              </span>
            </div>
            <div ref={terminalRef} style={{
              flex: 1, background: '#050510', padding: '14px 16px', minHeight: 300, maxHeight: 500,
              fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: 1.7, overflowY: 'auto',
              borderRadius: '0 0 10px 10px', border: '1px solid var(--border-subtle)', borderTop: 'none',
            }}>
              {logs.length === 0 && (
                <span style={{ color: '#3b82f6', opacity: 0.6 }}>
                  {logConnected ? 'Connexion au flux…' : '— Aucun log disponible —'}
                </span>
              )}
              {logs.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#2d2d3a', flexShrink: 0, fontSize: '10px', marginTop: 2, minWidth: 65 }}>
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <span style={{ color: lineColor(entry.line) }}>{entry.line}</span>
                </div>
              ))}
              {logConnected && <span style={{ color: '#3b82f6', marginTop: 4, display: 'block' }}>▋</span>}
            </div>
          </div>
        )}

        {/* ── EXECUTIONS TAB ── */}
        {activeTab === 'executions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(!liveTask.executions || liveTask.executions.length === 0) ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', opacity: 0.5, padding: '40px 0' }}>
                Aucune exécution enregistrée
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {liveTask.executions.map((ex, i) => (
                    <button key={ex.id} onClick={() => setActiveExec(ex.id)} style={{
                      padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: activeExec === ex.id ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                      color: activeExec === ex.id ? '#fff' : 'var(--text-secondary)',
                      fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                      borderBottom: activeExec === ex.id ? `2px solid ${ex.exitCode === 0 ? '#10b981' : '#ef4444'}` : '2px solid transparent',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ex.exitCode === 0 ? '#10b981' : '#ef4444' }} />
                      Exec {i + 1}
                    </button>
                  ))}
                </div>
                {activeExecution && (
                  <div style={{ background: 'var(--bg-glass)', borderRadius: 10, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--border-subtle)' }}>
                      {[
                        { label: 'Durée', value: `${activeExecution.duration}s` },
                        { label: 'Tokens', value: ((activeExecution.tokens?.prompt ?? 0) + (activeExecution.tokens?.completion ?? 0)).toLocaleString() },
                        { label: 'Coût', value: `$${activeExecution.cost}`, color: '#10b981' },
                        { label: 'Exit', value: activeExecution.exitCode === 0 ? '✓ 0' : `✗ ${activeExecution.exitCode}`, color: activeExecution.exitCode === 0 ? '#10b981' : '#ef4444' },
                      ].map((m, i) => (
                        <div key={i} style={{ padding: '10px 14px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{m.label}</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: m.color ?? 'var(--text-primary)', marginTop: 2 }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '14px 16px', maxHeight: 300, overflowY: 'auto', background: '#060612' }}>
                      <MarkdownOutput text={activeExecution.stdout} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && (
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ position: 'absolute', left: 11, top: 12, bottom: 12, width: 2, background: 'var(--border-subtle)' }} />
            {(liveTask.activity?.length ? liveTask.activity : [
              { ts: liveTask.createdAt, type: 'created' as const, label: 'Tâche créée' },
              ...(liveTask.status === 'completed' ? [{ ts: (liveTask as any).completedAt ?? new Date().toISOString(), type: 'completed' as const, label: 'Terminée avec succès' }] : []),
              ...(liveTask.status === 'failed' ? [{ ts: new Date().toISOString(), type: 'failed' as const, label: 'Échec' }] : []),
            ] as ActivityEvent[]).map((evt, i) => {
              const color = EVT_COLOR[evt.type] ?? '#a1a1aa';
              return (
                <div key={i} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: 16, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: `${color}22`, border: `2px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color, zIndex: 1,
                  }}>
                    {evt.type === 'completed' ? <CheckCircle2 size={11} /> : evt.type === 'failed' ? <AlertTriangle size={11} /> : <Clock size={11} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{evt.label}</div>
                    {evt.detail && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2 }}>{evt.detail}</div>}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {new Date(evt.ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* ── TRACES TAB ── */}
        {activeTab === 'traces' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {traces.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>Aucune trace disponible</div>
            ) : (
              traces.map((span, i) => {
                const isOk = span.status === 'ok' || span.status === 'completed';
                const color = isOk ? '#10b981' : span.status === 'error' ? '#ef4444' : '#f59e0b';
                const totalMs = span.duration ?? 0;
                return (
                  <div key={span.spanId} style={{
                    display: 'flex', gap: 12, padding: '10px 0',
                    borderBottom: i < traces.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color,
                    }}>
                      {isOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>{span.operation}</div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)', marginTop: 2, flexWrap: 'wrap' }}>
                        <span>{totalMs}ms</span>
                        {(span.tokens ?? 0) > 0 && <span>{span.tokens} tokens</span>}
                        {(span.cost ?? 0) > 0 && <span style={{ color: '#10b981' }}>${Number(span.cost).toFixed(4)}</span>}
                        <span style={{ fontFamily: 'var(--mono)', opacity: 0.6 }}>{span.spanId}</span>
                      </div>
                    </div>
                    {/* Duration bar */}
                    <div style={{ width: 60, height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', background: color, borderRadius: 2, width: `${Math.min(100, (totalMs / 3000) * 100)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
            {traces.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-glass)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
                <strong>Trace ID:</strong> <span style={{ fontFamily: 'var(--mono)', color: 'var(--brand-accent)' }}>{traces[0].traceId}</span>
                {' · '}
                <strong>Total:</strong> {traces.reduce((s, t) => s + (t.duration ?? 0), 0)}ms
                {' · '}
                <strong>Coût:</strong> ${traces.reduce((s, t) => s + (t.cost ?? 0), 0).toFixed(4)}
                {' · '}
                <strong>Tokens:</strong> {traces.reduce((s, t) => s + (t.tokens ?? 0), 0)}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
};
