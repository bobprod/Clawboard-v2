import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSSE } from '../hooks/useSSE';
import { apiFetch } from '../lib/apiFetch';
import type { Task } from '../data/mockData';
import {
  ArrowLeft, Terminal, Clock, Zap, Shield, MoreVertical, Trash2,
  Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Play,
  Copy, Check, Search, Pause, Download, Filter, RotateCcw,
} from 'lucide-react';
import { Dropdown } from './Dropdown';

interface ActivityEvent {
  ts: string;
  type: 'launched' | 'completed' | 'failed' | 'retry' | 'info';
  label: string;
  detail?: string;
}

interface Execution {
  id: string;
  startedAt: string;
  duration: number;
  tokens: { prompt: number; completion: number };
  cost: string;
  exitCode: number;
  stdout: string;
  llmModel: string;
}

interface RichTask extends Task {
  activity?: ActivityEvent[];
  executions?: Execution[];
  modeleId?: string;
  scheduleName?: string;
}

const BASE = 'http://localhost:4000';

const STATUS_COLOR: Record<string, string> = {
  planned: '#a1a1aa', pending: '#a1a1aa',
  running: '#3b82f6', completed: '#10b981', failed: '#ef4444',
};

const EVT_COLOR: Record<string, string> = {
  launched: '#3b82f6', completed: '#10b981', failed: '#ef4444',
  retry: '#f59e0b', info: '#8b5cf6',
};

const EVT_ICON: Record<string, React.ReactNode> = {
  launched:  <Play size={12} />,
  completed: <CheckCircle2 size={12} />,
  failed:    <AlertTriangle size={12} />,
  retry:     <RefreshCw size={12} />,
  info:      <Shield size={12} />,
};

function modelShortName(m: string | undefined) {
  if (!m) return '—';
  if (m.includes('claude')) return 'Claude Sonnet';
  if (m.includes('kimi')) return 'Kimi K2';
  if (m.includes('ollama')) return 'Local';
  return m.split('/').pop() || m;
}

function InfoCard({ label, value, color = 'var(--text-primary)', icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color, fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  );
}

// Very simple markdown renderer (bold, code, headers, lists)
function MarkdownOutput({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: 1.8, color: '#c4c4d4' }}>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <div key={i} style={{ color: '#a78bfa', fontWeight: 700, fontSize: '13px', marginTop: '12px' }}>{line.slice(4)}</div>;
        if (line.startsWith('## ')) return <div key={i} style={{ color: '#818cf8', fontWeight: 700, fontSize: '14px', marginTop: '16px' }}>{line.slice(3)}</div>;
        if (line.startsWith('# ')) return <div key={i} style={{ color: '#6366f1', fontWeight: 700, fontSize: '16px', marginTop: '20px' }}>{line.slice(2)}</div>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: '16px', color: '#c4c4d4' }}>{'• '}{renderInline(line.slice(2))}</div>;
        if (/^\d+\. /.test(line)) return <div key={i} style={{ paddingLeft: '16px', color: '#c4c4d4' }}>{renderInline(line)}</div>;
        if (line.startsWith('```')) return <div key={i} style={{ color: '#4b5563' }}>{line}</div>;
        if (line === '') return <div key={i} style={{ height: '6px' }} />;
        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: 'rgba(245,158,11,0.3)', borderRadius: '2px', padding: '0 1px' }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} style={{ color: '#e2e8f0' }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', color: '#10b981', fontSize: '11px' }}>{p.slice(1, -1)}</code>;
    return p;
  });
}

export const TaskDetailPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [richTask, setRichTask] = useState<RichTask | null>(null);
  const [activeExec, setActiveExec] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [relaunching, setRelaunching] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<{ line: string; ts: string }[]>([]);
  const [logConnected, setLogConnected] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logPaused, setLogPaused] = useState(false);
  const [logLevel, setLogLevel] = useState<string>('all');
  const pausedLogsRef = useRef<{ line: string; ts: string }[]>([]);

  const { data: liveTasks } = useSSE<Task[] | null>('/api/tasks?stream=1', null);

  // Load task details
  useEffect(() => {
    if (!taskId) return;
    apiFetch(`${BASE}/api/tasks/${taskId}`)
      .then(r => r.json())
      .then((d: RichTask) => {
        setRichTask(d);
        if (d.executions?.length) setActiveExec(d.executions[d.executions.length - 1].id);
      })
      .catch(() => {});
  }, [taskId]);

  // Merge live SSE data into richTask
  const liveBase = liveTasks?.find(t => t.id === taskId);
  const task: RichTask | null = richTask
    ? { ...richTask, ...(liveBase ? { status: liveBase.status, tokensUsed: liveBase.tokensUsed, cost: liveBase.cost } : {}) }
    : null;

  // Log stream
  useEffect(() => {
    if (!taskId) return;
    setLogs([]);
    pausedLogsRef.current = [];
    const es = new EventSource(`${BASE}/api/logs/${taskId}`);
    es.onopen = () => setLogConnected(true);
    es.onmessage = e => {
      try {
        const entry = JSON.parse(e.data);
        if (logPaused) { pausedLogsRef.current.push(entry); }
        else { setLogs(p => [...p, entry]); }
      } catch (_) {}
    };
    es.onerror = () => { setLogConnected(false); es.close(); };
    return () => es.close();
  }, [taskId, logPaused]);

  // Resume: flush buffered logs
  const handleResumeLogs = () => {
    if (pausedLogsRef.current.length) {
      setLogs(p => [...p, ...pausedLogsRef.current]);
      pausedLogsRef.current = [];
    }
    setLogPaused(false);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (logLevel !== 'all') {
      result = result.filter(l => l.line.includes(`[${logLevel.toUpperCase()}]`));
    }
    if (logSearch) {
      const q = logSearch.toLowerCase();
      result = result.filter(l => l.line.toLowerCase().includes(q));
    }
    return result;
  }, [logs, logSearch, logLevel]);

  const exportLogs = () => {
    const text = logs.map(l => `${l.ts}  ${l.line}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `logs-${taskId}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetryInline = async () => {
    if (!taskId) return;
    setRelaunching(true);
    setLogs([]);
    await apiFetch(`${BASE}/api/tasks/${taskId}/run`, { method: 'POST' }).catch(() => {});
    setTimeout(() => setRelaunching(false), 3500);
  };

  const handleClone = () => {
    if (!task) return;
    navigate('/tasks/new', { state: { prefill: task } });
  };

  // Auto-scroll
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  const LOG_COLORS: Record<string, string> = {
    '[BOOT]': '#6366f1', '[INIT]': '#8b5cf6', '[NET]': '#3b82f6',
    '[LLM]': '#10b981', '[EXEC]': '#a1a1aa', 'WARNING': '#f59e0b', '[ERROR]': '#ef4444',
  };
  const lineColor = (l: string) => {
    for (const [k, v] of Object.entries(LOG_COLORS)) if (l.includes(k)) return v;
    return '#71717a';
  };

  const handleRelaunch = async () => {
    if (!taskId) return;
    setRelaunching(true);
    await apiFetch(`${BASE}/api/tasks/${taskId}/run`, { method: 'POST' }).catch(() => {});
    setTimeout(() => setRelaunching(false), 3500);
  };

  const copyLogs = () => {
    const text = logs.map(l => `${l.ts}  ${l.line}`).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopiedLogs(true); setTimeout(() => setCopiedLogs(false), 2000); }).catch(() => {});
  };

  const activeExecution = task?.executions?.find(e => e.id === activeExec);

  if (!task) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
      Chargement…
    </div>
  );

  const statusColor = STATUS_COLOR[task.status] ?? '#a1a1aa';
  const totalTokens = task.tokensUsed ? task.tokensUsed.prompt + task.tokensUsed.completion : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <Link to="/tasks" style={{
          display: 'flex', padding: '10px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '12px', color: 'var(--text-secondary)', transition: 'all 0.2s',
          boxShadow: 'var(--shadow-sm)', flexShrink: 0,
        }}
        onMouseOver={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-surface-elevated)'; }}
        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
        ><ArrowLeft size={20} /></Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0,
              boxShadow: task.status === 'running' ? `0 0 8px ${statusColor}` : 'none',
              animation: task.status === 'running' ? 'pulse 1.5s infinite' : 'none',
            }} />
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{task.title}</h2>
          </div>
          <div className="text-muted" style={{ fontFamily: 'var(--mono)', fontSize: '12px', marginTop: '4px' }}>
            {task.id} · {task.agentId} · {((task as any).llmModel?.split('/').pop() ?? task.llmMode ?? '—').toUpperCase()}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          <InfoCard label="Coût" value={`$${task.cost || '0.00'}`} color="#10b981" icon={<Zap size={11} />} />
          <InfoCard label="Tokens" value={totalTokens.toLocaleString()} color="var(--brand-primary)" icon={<Terminal size={11} />} />

          <Dropdown
            trigger={
              <button style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)',
                background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              >
                Actions <MoreVertical size={16} />
              </button>
            }
            items={[
              { icon: copiedLogs ? Check : Copy, label: 'Copier les logs', onClick: copyLogs },
              { icon: Download, label: 'Exporter les logs', onClick: exportLogs },
              { icon: RotateCcw, label: 'Cloner la tâche', onClick: handleClone },
              { icon: relaunching ? RefreshCw : Play, label: 'Relancer la tâche', onClick: handleRelaunch },
              { icon: Trash2, label: 'Archiver / Supprimer', danger: true, onClick: () => console.log('delete') },
            ]}
          />
        </div>
      </div>

      {/* ── Info cards row ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
        <InfoCard label="Statut" value={task.status.toUpperCase()} color={statusColor} />
        <InfoCard label="Agent" value={task.agentId} icon={<Shield size={11} />} />
        <InfoCard label="Canal" value={`${task.channelTarget?.platform ?? '—'}`} />
        <InfoCard label="Créé" value={new Date(task.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} icon={<Clock size={11} />} />
      </div>

      {/* ── Main content: Terminal + Sidebar ──────────────────────────── */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* Left: Terminal + Executions tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          {/* Terminal */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '300px', maxHeight: '420px' }}>
            {/* Terminal header with controls */}
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap' }}>
              <Terminal size={16} color="var(--text-secondary)" />
              <span style={{ fontWeight: 600 }}>Live Terminal</span>

              {/* Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 10px', border: '1px solid var(--border-subtle)', marginLeft: '8px' }}>
                <Search size={12} color="var(--text-secondary)" />
                <input
                  type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)}
                  placeholder="Filtrer les logs…"
                  style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '11px', width: '120px', fontFamily: 'var(--mono)' }}
                />
              </div>

              {/* Level filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={11} color="var(--text-secondary)" />
                <select
                  value={logLevel} onChange={e => setLogLevel(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px', padding: '3px 6px', cursor: 'pointer' }}
                >
                  <option value="all">Tous</option>
                  <option value="ERROR">Erreurs</option>
                  <option value="LLM">LLM</option>
                  <option value="EXEC">Exec</option>
                  <option value="NET">Net</option>
                  <option value="BOOT">Boot</option>
                </select>
              </div>

              {/* Pause / Resume */}
              <button
                onClick={() => logPaused ? handleResumeLogs() : setLogPaused(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                  background: logPaused ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${logPaused ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
                  borderRadius: '6px', cursor: 'pointer', color: logPaused ? '#f59e0b' : 'var(--text-secondary)',
                  fontSize: '11px', fontWeight: 600,
                }}
              >
                {logPaused ? <><Play size={11} /> Resume ({pausedLogsRef.current.length})</> : <><Pause size={11} /> Pause</>}
              </button>

              {/* Log count + status */}
              <span style={{ marginLeft: 'auto', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>{filteredLogs.length}/{logs.length}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: logConnected ? '#10b981' : '#ef4444' }}>
                  {logConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                  {logConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </span>
            </div>

            {/* Log output */}
            <div ref={terminalRef} style={{
              flex: 1, background: '#050510', padding: '16px',
              fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: 1.7,
              overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px',
            }}>
              {filteredLogs.length === 0 && logs.length === 0 && (
                <div style={{ color: '#3b82f6', opacity: 0.6 }}>
                  {logConnected ? 'Connexion au flux…' : '— Backend hors ligne — démarrez server.mjs —'}
                </div>
              )}
              {filteredLogs.length === 0 && logs.length > 0 && (
                <div style={{ color: '#f59e0b', opacity: 0.6 }}>Aucun log ne correspond au filtre</div>
              )}
              {filteredLogs.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#2d2d3a', flexShrink: 0, fontSize: '10px', marginTop: '2px', minWidth: '65px' }}>
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <span style={{ color: lineColor(entry.line) }}>{logSearch ? highlightMatch(entry.line, logSearch) : entry.line}</span>
                </div>
              ))}
              {logConnected && !logPaused && <span style={{ color: '#3b82f6', marginTop: '4px' }}>▋</span>}
              {logPaused && <span style={{ color: '#f59e0b', marginTop: '4px' }}>⏸ Paused — {pausedLogsRef.current.length} buffered</span>}
            </div>
          </div>

          {/* ── Retry inline banner (shown when failed) ────────────── */}
          {task.status === 'failed' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '14px',
            }}>
              <AlertTriangle size={20} color="#ef4444" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#ef4444', fontSize: '14px' }}>Tâche en échec</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  La tâche a échoué. Vous pouvez la relancer ou la cloner avec des modifications.
                </div>
              </div>
              <button
                onClick={handleRetryInline}
                disabled={relaunching}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                  background: relaunching ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                  border: `1px solid ${relaunching ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
                  borderRadius: 'var(--radius-full)', cursor: relaunching ? 'not-allowed' : 'pointer',
                  color: relaunching ? '#f59e0b' : '#3b82f6', fontWeight: 700, fontSize: '13px',
                }}
              >
                <RefreshCw size={14} style={relaunching ? { animation: 'spin 1s linear infinite' } : {}} />
                {relaunching ? 'Relancement…' : 'Réessayer'}
              </button>
              <button
                onClick={handleClone}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 'var(--radius-full)', cursor: 'pointer',
                  color: 'var(--brand-accent)', fontWeight: 700, fontSize: '13px',
                }}
              >
                <Copy size={14} /> Cloner & Modifier
              </button>
            </div>
          )}

          {/* Executions */}
          {task.executions && task.executions.length > 0 && (
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '14px' }}>
              {/* Exec tab bar */}
              <div style={{ display: 'flex', gap: '2px', padding: '8px', background: 'rgba(0,0,0,0.2)', overflowX: 'auto', borderBottom: '1px solid var(--border-subtle)' }}>
                {task.executions.map((ex, i) => (
                  <button key={ex.id} onClick={() => setActiveExec(ex.id)} style={{
                    flexShrink: 0, padding: '7px 14px', borderRadius: '8px', border: 'none',
                    background: activeExec === ex.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeExec === ex.id ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                    borderBottom: activeExec === ex.id ? `2px solid ${ex.exitCode === 0 ? '#10b981' : '#ef4444'}` : '2px solid transparent',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ex.exitCode === 0 ? '#10b981' : '#ef4444', flexShrink: 0 }} />
                    Exec {i + 1}
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>
                      {new Date(ex.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                ))}
              </div>

              {/* Active exec details */}
              {activeExecution && (
                <div style={{ padding: '0' }}>
                  {/* Metrics row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', borderBottom: '1px solid var(--border-subtle)' }}>
                    {[
                      { label: 'Durée', value: `${activeExecution.duration}s` },
                      { label: 'Tokens', value: ((activeExecution.tokens?.prompt ?? 0) + (activeExecution.tokens?.completion ?? 0)).toLocaleString() },
                      { label: 'Coût', value: `$${activeExecution.cost}`, color: '#10b981' },
                      { label: 'Exit', value: activeExecution.exitCode === 0 ? '✓ 0' : `✗ ${activeExecution.exitCode}`, color: activeExecution.exitCode === 0 ? '#10b981' : '#ef4444' },
                    ].map((m, i) => (
                      <div key={i} style={{ padding: '12px 16px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{m.label}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '1rem', color: m.color ?? 'var(--text-primary)', marginTop: '2px' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Stdout */}
                  <div style={{ padding: '16px 20px', background: '#060612', maxHeight: '280px', overflowY: 'auto' }}>
                    <MarkdownOutput text={activeExecution.stdout} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar: Activity timeline + routing info */}
        <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '20px', flexShrink: 0 }}>

          {/* Routing info */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-accent)' }}>
              <Shield size={16} /> Routage
            </h3>
            <div style={{ background: 'rgba(139,92,246,0.06)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Moteur LLM</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-accent)', fontSize: '0.95rem' }}>{modelShortName((task as any).llmModel ?? task.llmMode)}</div>
            </div>

            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-primary)' }}>
              <Terminal size={16} /> Canal de livraison
            </h3>
            <div style={{ background: 'rgba(59,130,246,0.06)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Plateforme</span>
                <span style={{ fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'capitalize' }}>{task.channelTarget?.platform ?? '—'}</span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '3px', fontWeight: 600 }}>Target ID</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: '#fff', wordBreak: 'break-all' }}>{task.channelTarget?.targetId ?? '—'}</div>
              </div>
            </div>
          </div>

          {/* Activity timeline */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} /> Activité
            </h3>

            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '0' }}>
              {/* Vertical line */}
              <div style={{ position: 'absolute', left: '11px', top: '12px', bottom: '12px', width: '2px', background: 'var(--border-subtle)' }} />

              {(task.activity && task.activity.length > 0 ? task.activity : [
                { ts: task.createdAt, type: 'info' as const, label: 'Tâche créée' },
                { ts: task.createdAt, type: 'launched' as const, label: 'Lancée' },
                ...(task.status === 'completed' ? [{ ts: task.completedAt ?? new Date().toISOString(), type: 'completed' as const, label: 'Terminée' }] : []),
                ...(task.status === 'failed' ? [{ ts: new Date().toISOString(), type: 'failed' as const, label: 'Échec' }] : []),
              ]).map((evt, i) => {
                const color = EVT_COLOR[evt.type] ?? '#a1a1aa';
                return (
                  <div key={i} style={{ display: 'flex', gap: '14px', position: 'relative', paddingBottom: '16px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: `${color}22`, border: `2px solid ${color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color, zIndex: 1, marginTop: '1px',
                      boxShadow: 'none',
                    }}>
                      {EVT_ICON[evt.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{evt.label}</div>
                      {evt.detail && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{evt.detail}</div>}
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                        {new Date(evt.ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
