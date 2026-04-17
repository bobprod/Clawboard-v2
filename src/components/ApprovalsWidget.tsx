import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, Clock, Bot, RefreshCw, CheckCheck, XCircle, Info, Wifi, WifiOff } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';
import { sendNotification, requestNotificationPermission } from '../lib/notify';
import { TaskChatDrawer, ChatTriggerBtn, useTaskChat } from './TaskChatDrawer';
import { motion, AnimatePresence } from 'framer-motion';

const BASE = 'http://localhost:4000';

interface ApprovalRequest {
  id: string;
  taskId: string;
  taskName: string;
  agent?: string;
  llmModel?: string;
  reason: string;             // pourquoi l'approbation est requise
  riskLevel: 'low' | 'medium' | 'high';
  requestedAt: string;        // ISO
  expiresAt?: string;         // ISO — auto-reject passé ce délai
  payload?: Record<string, unknown>;  // détails de l'action à approuver
}

const RISK_COLOR: Record<string, string> = {
  low:    '#10b981',
  medium: '#f59e0b',
  high:   '#ef4444',
};
const RISK_LABEL: Record<string, string> = {
  low:    'Faible',
  medium: 'Moyen',
  high:   'Élevé',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function timeLeft(iso: string): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Expiré';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const MOCK_APPROVALS: ApprovalRequest[] = [
  {
    id: 'apr-1',
    taskId: 'task-42',
    taskName: 'Nettoyage base de données prod',
    agent: 'database-cleaner',
    llmModel: 'claude-sonnet-4-6',
    reason: 'Action destructrice : suppression de 1 247 enregistrements obsolètes',
    riskLevel: 'high',
    requestedAt: new Date(Date.now() - 8 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 22 * 60000).toISOString(),
    payload: { table: 'logs', rows: 1247, condition: 'created_at < NOW() - 90d' },
  },
  {
    id: 'apr-2',
    taskId: 'task-43',
    taskName: 'Envoi rapport mensuel',
    agent: 'report-sender',
    llmModel: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    reason: 'Envoi email externe vers 34 destinataires',
    riskLevel: 'medium',
    requestedAt: new Date(Date.now() - 2 * 60000).toISOString(),
  },
];

export const ApprovalsWidget = () => {
  const [requests,     setRequests]     = useState<ApprovalRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [sseActive,    setSseActive]    = useState(false);
  const [useMock,      setUseMock]      = useState(false);
  const [sandboxName,  setSandboxName]  = useState('my-assistant');
  const sseRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const osRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { chatCtx, openChat, closeChat } = useTaskChat();

  // ── Poll OpenShell blocked requests (via NemoClaw bridge) ─────────────────
  const pollOpenShell = useCallback((name: string) => {
    apiFetch(`${BASE}/api/nemoclaw/${name}/approvals`)
      .then(r => r.json())
      .then((data: any) => {
        const items: ApprovalRequest[] = Array.isArray(data) ? data : [];
        if (items.length > 0) {
          setRequests(prev => {
            const ids = new Set(prev.map(r => r.id));
            return [...prev, ...items.filter(r => !ids.has(r.id))];
          });
          setUseMock(false);
        }
      })
      .catch(() => {});
  }, []);

  // ── REST fetch (initial load + fallback polling) ─────────────────────────
  const fetchApprovals = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    apiFetch(`${BASE}/api/approvals`)
      .then(r => r.json())
      .then((data: any) => {
        const list: ApprovalRequest[] = Array.isArray(data) ? data : (data.approvals ?? data.data ?? []);
        setRequests(list);
        setUseMock(false);
        setLoading(false);
      })
      .catch(() => {
        setRequests(MOCK_APPROVALS);
        setUseMock(true);
        setLoading(false);
      });
  }, []);

  // ── SSE connection to /api/approvals?stream=1 ────────────────────────────
  const connectSSE = useCallback(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }

    const url = `${BASE}/api/approvals?stream=1`;
    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      fetchApprovals();
      return;
    }
    sseRef.current = es;

    es.onopen = () => {
      setSseActive(true);
      // Stop fallback polling when SSE is live
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    // New approval arrived
    es.addEventListener('approval', (e: MessageEvent) => {
      try {
        const req: ApprovalRequest = JSON.parse(e.data);
        setRequests(prev => {
          if (prev.some(r => r.id === req.id)) return prev;
          sendNotification("Action requise", { body: req.taskName });
          return [req, ...prev];
        });
      } catch { /* malformed event */ }
    });

    // Approval decided (by another operator)
    es.addEventListener('decision', (e: MessageEvent) => {
      try {
        const { id } = JSON.parse(e.data);
        setRequests(prev => prev.filter(r => r.id !== id));
      } catch { /* ignore */ }
    });

    // Bulk snapshot (initial state sent by server)
    es.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data);
        const list: ApprovalRequest[] = Array.isArray(raw) ? raw : (raw.approvals ?? raw.data ?? []);
        setRequests(list);
        setUseMock(false);
        setLoading(false);
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      setSseActive(false);
      es.close();
      sseRef.current = null;
      // Fall back to polling every 30s when SSE unavailable
      fetchApprovals();
      if (!pollRef.current) {
        pollRef.current = setInterval(() => fetchApprovals(true), 30000);
      }
      // Retry SSE connection after 15s
      setTimeout(connectSSE, 15000);
    };
  }, [fetchApprovals]);

  useEffect(() => {
    connectSSE();
    return () => {
      sseRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connectSSE]);

  // Poll OpenShell séparé — se relance à chaque changement de sandboxName
  useEffect(() => {
    requestNotificationPermission();
    if (osRef.current) clearInterval(osRef.current);
    pollOpenShell(sandboxName); // Poll immédiat dès que le nom change
    osRef.current = setInterval(() => pollOpenShell(sandboxName), 20000);
    return () => { if (osRef.current) clearInterval(osRef.current); };
  }, [pollOpenShell, sandboxName]);

  const handleDecision = async (id: string, decision: 'approve' | 'reject') => {
    setActing(id);
    try {
      await apiFetch(`${BASE}/api/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      // optimistic removal anyway (mock)
      setRequests(prev => prev.filter(r => r.id !== id));
    } finally {
      setActing(null);
    }
  };

  const safeRequests = Array.isArray(requests) ? requests : [];
  const pending = safeRequests.length;

  return (
    <div className="glass-panel p-6" style={{ minHeight: 200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <ShieldCheck size={18} color="var(--brand-accent)" />
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Flux d'Approbation</h2>
        {pending > 0 && (
          <span style={{
            background: 'rgba(239,68,68,0.15)',
            color: '#ef4444',
            borderRadius: 99,
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.3px',
          }}>
            {pending} en attente
          </span>
        )}
        {/* SSE / mock status */}
        <span
          title={sseActive ? 'Temps réel SSE actif (Nemoclaw)' : useMock ? 'Mode démo — endpoint absent' : 'Polling 30s'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 99,
            background: sseActive ? 'rgba(16,185,129,0.1)' : useMock ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
            border: `1px solid ${sseActive ? 'rgba(16,185,129,0.3)' : useMock ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
            color: sseActive ? '#10b981' : useMock ? '#f59e0b' : '#3b82f6',
          }}
        >
          {sseActive ? <Wifi size={10} /> : <WifiOff size={10} />}
          {sseActive ? 'Temps réel' : useMock ? 'Démo' : 'Polling'}
        </span>
        {/* OpenShell sandbox selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 6 }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>OpenShell:</span>
          <input
            value={sandboxName}
            onChange={e => setSandboxName(e.target.value)}
            style={{ fontSize: '10px', padding: '2px 7px', borderRadius: 5, background: 'rgba(118,185,0,0.08)', border: '1px solid rgba(118,185,0,0.25)', color: '#76b900', width: 110, outline: 'none' }}
            placeholder="my-assistant"
          />
          <button
            onClick={() => pollOpenShell(sandboxName)}
            title="Forcer le poll OpenShell"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#76b900', padding: 2 }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
        <button
          onClick={() => fetchApprovals()}
          disabled={loading}
          title="Rafraîchir"
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: 4, borderRadius: 6,
            opacity: loading ? 0.4 : 0.7,
            transition: 'opacity 0.2s',
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Content */}
      {loading && pending === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Chargement…
        </div>
      ) : pending === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <CheckCheck size={32} style={{ margin: '0 auto 10px', display: 'block', color: '#10b981', opacity: 0.7 }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune approbation en attente</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AnimatePresence>
          {safeRequests.map(req => {
            const riskColor = RISK_COLOR[req.riskLevel];
            const exp = req.expiresAt ? timeLeft(req.expiresAt) : null;
            const isExpired = exp === 'Expiré';
            const isOpen = expanded === req.id;

            return (
              <motion.div
                key={req.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: isExpired ? 0.5 : 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3 }}
                style={{
                  background: 'var(--bg-glass)',
                  border: `1px solid var(--border-subtle)`,
                  borderLeft: `3px solid ${riskColor}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                  {/* Risk badge */}
                  <div style={{
                    flexShrink: 0,
                    width: 36, height: 36,
                    borderRadius: 8,
                    background: `${riskColor}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: riskColor,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                    flexDirection: 'column',
                    gap: 1,
                  }}>
                    <ShieldCheck size={14} />
                    <span>{RISK_LABEL[req.riskLevel]}</span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {req.taskName}
                      {isExpired && (
                        <span style={{ fontSize: 10, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '1px 6px', borderRadius: 99 }}>EXPIRÉ</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {req.reason}
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      {req.agent && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Bot size={10} /> {req.agent}
                        </span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} /> {timeAgo(req.requestedAt)}
                      </span>
                      {exp && (
                        <span style={{ color: isExpired ? '#ef4444' : exp.includes('min') && parseInt(exp) < 10 ? '#f59e0b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> expire dans {exp}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <ChatTriggerBtn
                      ctx={{
                        taskId: req.taskId,
                        taskName: req.taskName,
                        agent: req.agent,
                        llmModel: req.llmModel,
                        status: 'approval',
                        module: 'approval',
                      }}
                      onOpen={openChat}
                    />
                    {req.payload && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : req.id)}
                        title="Détails"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: 6, opacity: 0.7 }}
                      >
                        <Info size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDecision(req.id, 'reject')}
                      disabled={!!acting || isExpired}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', borderRadius: 7,
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: '#ef4444',
                        fontSize: 12, fontWeight: 600,
                        cursor: acting || isExpired ? 'not-allowed' : 'pointer',
                        opacity: acting === req.id ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <XCircle size={12} /> Rejeter
                    </button>
                    <button
                      onClick={() => handleDecision(req.id, 'approve')}
                      disabled={!!acting || isExpired}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', borderRadius: 7,
                        background: acting === req.id ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.15)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        color: '#10b981',
                        fontSize: 12, fontWeight: 600,
                        cursor: acting || isExpired ? 'not-allowed' : 'pointer',
                        opacity: acting === req.id ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <ShieldCheck size={12} /> Approuver
                    </button>
                  </div>
                </div>

                {/* Payload detail */}
                {isOpen && req.payload && (
                  <div style={{
                    borderTop: '1px solid var(--border-subtle)',
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.15)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Payload
                    </div>
                    <pre style={{
                      margin: 0,
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}>
                      {JSON.stringify(req.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}

      <TaskChatDrawer ctx={chatCtx} onClose={closeChat} />
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
