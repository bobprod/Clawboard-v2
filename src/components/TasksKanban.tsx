import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { Task } from '../data/mockData';
import { useSSE } from '../hooks/useSSE';
import { api } from '../hooks/useApi';
import { apiFetch } from '../lib/apiFetch';

const BASE = 'http://localhost:4000';

interface Agent { id: string; name: string; }
import { Play, CheckCircle2, AlertTriangle, Clock, Plus, Zap, GripVertical, MoreVertical, Copy, PauseCircle, Trash2, Eye, RotateCcw } from 'lucide-react';
import { Dropdown } from './Dropdown';

type ColStatus = 'planned' | 'running' | 'completed' | 'failed' | 'pending';

const COLS: { title: string; status: ColStatus[]; icon: React.ReactNode; color: string; bgGlow: string }[] = [
  { title: 'Planifié', status: ['planned', 'pending'], icon: <Clock size={16}/>,        color: '#a1a1aa', bgGlow: 'rgba(161,161,170,0.05)' },
  { title: 'En cours', status: ['running'],            icon: <Play size={16}/>,          color: '#3b82f6', bgGlow: 'rgba(59,130,246,0.08)'  },
  { title: 'Terminé',  status: ['completed'],          icon: <CheckCircle2 size={16}/>,  color: '#10b981', bgGlow: 'rgba(16,185,129,0.05)'  },
  { title: 'Échoué',  status: ['failed'],              icon: <AlertTriangle size={16}/>, color: '#ef4444', bgGlow: 'rgba(239,68,68,0.05)'   },
];

const STATUS_MAP: Record<string, ColStatus> = {
  'Planifié': 'planned',
  'En cours': 'running',
  'Terminé':  'completed',
  'Échoué':  'failed',
};

export const TasksKanban = () => {
  const navigate = useNavigate();
  const [filterAgent, setFilterAgent]   = useState<string>('all');
  const [dragTaskId, setDragTaskId]     = useState<string | null>(null);
  const [dropTarget, setDropTarget]     = useState<string | null>(null);
  const [agents, setAgents]             = useState<Agent[]>([]);
  const [toast, setToast]               = useState<{ msg: string; color: string } | null>(null);

  useEffect(() => {
    apiFetch(`${BASE}/api/agents`)
      .then(r => r.json())
      .then((data: Agent[]) => {
        if (Array.isArray(data) && data.length > 0) setAgents(data);
      })
      .catch(() => { setAgents([]); }); // graceful fallback: degraded mode (empty)
  }, []);

  const { data: liveTasks } = useSSE<Task[] | null>('/api/tasks?stream=1', null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, any>>({});

  // Merge live tasks with our fast optimistic overrides so SSE isn't blocked
  const tasks: Task[] = (liveTasks ?? []).map(t => 
    optimisticOverrides[t.id] ? { ...t, ...optimisticOverrides[t.id] } : t
  );

  const showToast = useCallback((msg: string, color = '#10b981') => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Card Actions ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (task: Task) => {
    if (!confirm(`Supprimer la tâche "${task.title}" ?`)) return;
    try {
      setOptimisticOverrides(prev => ({ ...prev, [task.id]: { _deleted: true } }));
      await apiFetch(`${BASE}/api/tasks/${task.id}`, { method: 'DELETE' });
      showToast(`Tâche "${task.title}" supprimée`, '#ef4444');
      setTimeout(() => {
        setOptimisticOverrides(prev => { const n={...prev}; delete n[task.id]; return n; });
      }, 1500);
    } catch { showToast('Erreur suppression', '#ef4444'); }
  }, [showToast]);

  const handleClone = useCallback((task: Task) => {
    navigate('/tasks/new', { state: { prefill: { ...task, title: `${task.title} (copie)` } } });
  }, [navigate]);

  const handlePause = useCallback(async (task: Task) => {
    const newStatus = task.status === 'running' ? 'pending' : 'running';
    setOptimisticOverrides(prev => ({ ...prev, [task.id]: { status: newStatus } }));
    try {
      await api.patchTask(task.id, { status: newStatus });
      showToast(newStatus === 'pending' ? 'Tâche mise en pause' : 'Tâche relancée');
      setTimeout(() => {
        setOptimisticOverrides(prev => { const n={...prev}; delete n[task.id]; return n; });
      }, 1500);
    } catch { showToast('Erreur', '#ef4444'); }
  }, [showToast]);

  const handleRetry = useCallback(async (task: Task) => {
    try {
      await apiFetch(`${BASE}/api/tasks/${task.id}/run`, { method: 'POST' });
      showToast(`Tâche "${task.title}" relancée`);
    } catch { showToast('Erreur relance', '#ef4444'); }
  }, [showToast]);

  const filtered = tasks.filter(t => (filterAgent === 'all' || t.agentId === filterAgent) && !(t as any)._deleted);
  const getCol   = (statuses: string[]) => filtered.filter(t => statuses.includes(t.status));

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, colTitle: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(colTitle);
  };

  const onDrop = async (e: React.DragEvent, colTitle: string) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragTaskId) return;

    const newStatus = STATUS_MAP[colTitle];
    if (!newStatus) return;

    // Optimistic update without blocking SSE
    const updatePayload = { 
      status: newStatus as Task['status'], 
      ...(newStatus === 'running' ? { startedAt: new Date().toISOString() } : {}), 
      ...(newStatus === 'completed' ? { completedAt: new Date().toISOString() } : {}) 
    };
    
    setOptimisticOverrides(prev => ({ ...prev, [dragTaskId]: updatePayload }));
    setDragTaskId(null);

    // Persist to backend
    try {
      await api.patchTask(dragTaskId, updatePayload);
      setTimeout(() => {
        setOptimisticOverrides(prev => { const n={...prev}; delete n[dragTaskId]; return n; });
      }, 1500);
    } catch {
      // revert mapping
      setOptimisticOverrides(prev => { const n={...prev}; delete n[dragTaskId]; return n; });
    }
  };

  const onDragLeave = () => setDropTarget(null);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%', paddingBottom: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <Zap size={24} color="var(--brand-primary)" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.6rem', margin: 0, letterSpacing: '-0.5px' }}>Tableau Kanban</h2>
            <div className="text-muted" style={{ fontSize: '14px', marginTop: '4px' }}>
              Glissez les cartes pour changer le statut · données en temps réel
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Agent Filters */}
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
            {['all', ...agents.map(a => a.id)].map(id => {
              const label = id === 'all' ? 'Tous' : agents.find(a => a.id === id)?.name || id;
              const active = filterAgent === id;
              return (
                <button key={id} onClick={() => setFilterAgent(id)} style={{
                  background: active ? 'var(--brand-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-full)',
                  cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                  boxShadow: active ? '0 0 12px rgba(59,130,246,0.5)' : 'none',
                  transition: 'all 0.2s ease'
                }}>
                  {label}
                </button>
              );
            })}
          </div>

          <Link to="/tasks/new" style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
            color: '#fff', borderRadius: 'var(--radius-full)', textDecoration: 'none',
            fontWeight: 600, fontSize: '0.95rem',
            boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <Plus size={18} /> Lancer Tâche
          </Link>
        </div>
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'flex', gap: '24px', flexGrow: 1, overflowX: 'auto', paddingBottom: '16px', scrollSnapType: 'x mandatory' }}>
        {COLS.map(col => {
          const isTarget = dropTarget === col.title;
          return (
            <div
              key={col.title}
              onDragOver={e => onDragOver(e, col.title)}
              onDrop={e => onDrop(e, col.title)}
              onDragLeave={onDragLeave}
              style={{
                minWidth: '320px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px',
                background: isTarget ? `${col.bgGlow.replace('0.05', '0.15').replace('0.08', '0.18')}` : 'var(--bg-surface-elevated)',
                border: isTarget ? `2px dashed ${col.color}` : '1px solid var(--border-subtle)',
                borderTop: isTarget ? `4px solid ${col.color}` : `4px solid ${col.color}`,
                borderRadius: '16px', padding: '20px',
                boxShadow: isTarget ? `0 0 30px ${col.bgGlow.replace('0.05', '0.3').replace('0.08', '0.3')}` : '0 8px 30px rgba(0,0,0,0.2)',
                transition: 'all 0.2s ease',
                scrollSnapAlign: 'start',
                backgroundImage: `linear-gradient(to bottom, ${col.bgGlow}, transparent 150px)`
              }}
            >
              {/* Column Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: col.color, marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {col.icon} {col.title}
                </div>
                <div style={{ fontSize: '13px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '12px', fontWeight: 700, color: '#fff' }}>
                  {getCol(col.status).length}
                </div>
              </div>

              {/* Task Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '4px', minHeight: '80px' }}>
                {getCol(col.status).map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => onDragStart(e, task.id)}
                    style={{
                      opacity: dragTaskId === task.id ? 0.4 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <Link to={`/tasks/${task.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                      <div className="glass-panel" style={{
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: `4px solid ${col.color}`,
                        borderRadius: '12px',
                        padding: '14px 16px',
                        cursor: 'grab',
                        display: 'flex', flexDirection: 'column', gap: '10px',
                        boxShadow: task.status === 'running' ? `0 0 18px ${col.bgGlow.replace('0.08', '0.25')}` : '0 4px 12px rgba(0,0,0,0.2)',
                        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = task.status === 'running' ? `0 0 18px ${col.bgGlow.replace('0.08','0.25')}` : '0 4px 12px rgba(0,0,0,0.2)';
                      }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', lineHeight: 1.3, flex: 1 }}>{task.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <GripVertical size={14} color="var(--text-muted)" style={{ flexShrink: 0, opacity: 0.5 }} />
                            <Dropdown 
                              trigger={
                                <div style={{ padding: '2px', borderRadius: '4px', color: 'var(--text-secondary)', transition: 'all 0.2s', display: 'flex' }}
                                     onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                                     onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}>
                                  <MoreVertical size={16} />
                                </div>
                              }
                              items={[
                                { icon: Eye, label: 'Ouvrir les détails', onClick: () => navigate(`/tasks/${task.id}`) },
                                ...(task.status === 'running' ? [{ icon: PauseCircle, label: 'Mettre en pause', onClick: () => handlePause(task) }] : []),
                                ...(task.status === 'failed' ? [{ icon: RotateCcw, label: 'Réessayer', onClick: () => handleRetry(task) }] : []),
                                { icon: Copy, label: 'Cloner la tâche', onClick: () => handleClone(task) },
                                { icon: Trash2, label: 'Supprimer', danger: true, onClick: () => handleDelete(task) }
                              ]}
                            />
                          </div>
                        </div>
                        <div className="text-muted" style={{ fontSize: '12px', lineHeight: 1.5 }}>
                          {task.description.length > 75 ? task.description.slice(0, 75) + '…' : task.description}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <img
                              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${task.agentId}&backgroundColor=121214`}
                              alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid var(--border-subtle)' }}
                            />
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {agents.find(a => a.id === task.agentId)?.name || agents[0]?.name || 'Agent'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '5px', fontSize: '10px', fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' }}>
                            <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', padding: '3px 7px', borderRadius: '5px' }}>
                              {task.llmMode}
                            </span>
                            <span style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--brand-primary)', padding: '3px 7px', borderRadius: '5px' }}>
                              {task.channelTarget.platform}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}

                {getCol(col.status).length === 0 && !isTarget && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.6 }}>
                    Aucune tâche
                  </div>
                )}

                {isTarget && (
                  <div style={{
                    border: `2px dashed ${col.color}`, borderRadius: '12px', padding: '20px',
                    textAlign: 'center', color: col.color, fontSize: '13px', fontWeight: 600,
                    background: `${col.bgGlow}`, opacity: 0.8
                  }}>
                    Déposer ici
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10,
          background: 'var(--bg-surface-elevated)', border: `1px solid ${toast.color}`,
          color: toast.color, fontWeight: 600, fontSize: '0.85rem',
          boxShadow: `0 4px 20px rgba(0,0,0,0.4)`,
          animation: 'fadeInUp 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};
