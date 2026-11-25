/**
 * TaskChatDrawer — Drawer contextuel de chat par tâche/agent
 * Design premium : header gradient, chips colorés, bulles soignées
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Bot, User, RefreshCw, MessageSquare, Sparkles, StopCircle } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';
import { LiaPlanPreview } from './LiaPlanPreview';
import type { LiaPlan } from './LiaPlanPreview';

const BASE = 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskChatContext {
  taskId:    string;
  taskName:  string;
  agent?:    string;
  skill?:    string;
  llmModel?: string;
  status?:   'running' | 'completed' | 'failed' | 'pending' | string;
  lastLog?:  string;
  errorMsg?: string;
  module?:   'task' | 'agent' | 'approval' | 'security';
}

interface Msg {
  role:    'user' | 'assistant' | 'system';
  content: string;
  ts:      number;
  typing?: boolean;
  plan?:   LiaPlan;
}

// ─── Contexte Lia (skills + agents) ───────────────────────────────────────────

interface LiaCtx { skills: any[]; agents: any[] }

async function fetchLiaContext(): Promise<LiaCtx> {
  try {
    const [sRes, aRes] = await Promise.all([
      apiFetch(`${BASE}/api/skills`).catch(() => null),
      apiFetch(`${BASE}/api/agents`).catch(() => null),
    ]);
    const skills = sRes?.ok ? await sRes.json().catch(() => []) : [];
    const agents = aRes?.ok ? await aRes.json().catch(() => []) : [];
    return {
      skills: Array.isArray(skills) ? skills : [],
      agents: Array.isArray(agents) ? agents : [],
    };
  } catch {
    return { skills: [], agents: [] };
  }
}

const MOCK_SKILLS = [
  { name: 'web-scraper',   description: 'Scraping de pages web et extraction de données structurées' },
  { name: 'code-gen',      description: 'Génération et refactoring de code source' },
  { name: 'code-fix',      description: 'Correction de bugs et analyse d\'erreurs' },
  { name: 'seo-content',   description: 'Rédaction d\'articles et contenus optimisés SEO' },
  { name: 'blog-writer',   description: 'Création d\'articles de blog longs et détaillés' },
  { name: 'report-gen',    description: 'Génération de rapports formatés Markdown/PDF' },
  { name: 'data-analysis', description: 'Analyse de données CSV/JSON et visualisation' },
  { name: 'vuln-scan',     description: 'Scan de vulnérabilités OWASP et sécurité API' },
  { name: 'diff-detector', description: 'Détection de changements entre deux versions de contenu' },
  { name: 'social-post',   description: 'Création de posts pour réseaux sociaux' },
];

function buildLiaSystemPrompt(ctx: LiaCtx): string {
  const skills = ctx.skills.length > 0 ? ctx.skills : MOCK_SKILLS;
  const agents = ctx.agents.length > 0 ? ctx.agents : [
    { label: 'NemoClaw Router',  role: 'Main Orchestrator',   status: 'active'  },
    { label: 'Code Architect',   role: 'Software Engineer',   status: 'active'  },
    { label: 'Data Analyst',     role: 'Data processing',     status: 'offline' },
    { label: 'Security Scanner', role: 'Vulnerability check', status: 'active'  },
  ];

  const skillsList  = skills.map((s: any) => `- ${s.name}: ${s.description || ''}`).join('\n');
  const agentsList  = agents.map((a: any) => `- ${a.label} (${a.role}, ${a.status})`).join('\n');

  return `Tu es Lia, l'orchestratrice intelligente centrale de ClawBoard / Nemoclaw.
Tu comprends les objectifs de l'utilisateur et génères des plans d'exécution concrets.

SKILLS DISPONIBLES DANS LE SYSTÈME:
${skillsList}

AGENTS DISPONIBLES:
${agentsList}

INSTRUCTIONS IMPORTANTES:
Quand l'utilisateur exprime un objectif, une tâche ou un besoin d'automatisation :
1. Réponds en 1-2 phrases conversationnelles (ce que tu vas faire)
2. Génère SYSTÉMATIQUEMENT un plan JSON entre les balises <PLAN_JSON> et </PLAN_JSON>

FORMAT EXACT DU PLAN:
<PLAN_JSON>
{
  "summary": "Description courte du plan en une phrase",
  "steps": [
    {
      "id": "step-1",
      "name": "Nom court de l'étape",
      "skill": "nom-du-skill",
      "agent": "Nom de l'Agent",
      "prompt": "Instructions précises et complètes pour cette étape...",
      "recurrence": null,
      "approval_needed": false
    }
  ],
  "risks": ["Risque éventuel si applicable"],
  "estimated_tokens": 2000
}
</PLAN_JSON>

Valeurs possibles pour "recurrence": null | "daily" | "weekly:monday" | "hourly" | "0 8 * * 1" (cron)
Mets "approval_needed": true uniquement si l'étape est risquée ou irréversible.
Si l'utilisateur pose juste une question sans objectif d'action → réponds normalement SANS plan JSON.
Réponds TOUJOURS en français. Sois concis et actionnable.`;
}

// ─── Chips intelligents selon contexte ────────────────────────────────────────

function getChips(ctx: TaskChatContext): { label: string; icon: string; prompt: string; color: string }[] {
  const base = [
    { label: 'Que fait cette tâche ?', icon: '💡', color: '#f59e0b', prompt: `Explique brièvement ce que fait la tâche "${ctx.taskName}" avec l'agent ${ctx.agent || 'main'}.` },
    { label: 'Optimiser le prompt',    icon: '🎯', color: 'var(--brand-accent)', prompt: `Comment optimiser les instructions de la tâche "${ctx.taskName}" pour de meilleurs résultats ?` },
  ];
  if (ctx.status === 'failed') return [
    { label: 'Pourquoi ça a échoué ?', icon: '🔍', color: '#ef4444', prompt: `La tâche "${ctx.taskName}" a échoué. ${ctx.errorMsg ? `Erreur : ${ctx.errorMsg}.` : ''} Explique la cause probable et propose une correction.` },
    { label: 'Corriger et relancer',   icon: '🔄', color: '#10b981', prompt: `Propose une correction concrète pour que la tâche "${ctx.taskName}" réussisse, en tenant compte de l'erreur précédente.` },
    { label: 'Analyser les logs',      icon: '📋', color: 'var(--brand-accent)', prompt: `Analyse les logs de la tâche "${ctx.taskName}" et identifie les points critiques. ${ctx.lastLog ? `Dernière sortie : ${ctx.lastLog.slice(0, 300)}` : ''}` },
  ];
  if (ctx.status === 'running') return [
    { label: 'Status actuel',          icon: '📊', color: 'var(--brand-accent)', prompt: `Quelle est la progression actuelle de la tâche "${ctx.taskName}" ? Que fait-elle en ce moment ?` },
    { label: 'Estimation restante',    icon: '⏱️', color: '#f59e0b', prompt: `Estime le temps restant pour que la tâche "${ctx.taskName}" se termine, basé sur son profil habituel.` },
    ...base,
  ];
  if (ctx.status === 'completed') return [
    { label: 'Résumé des résultats',   icon: '📈', color: '#10b981', prompt: `Résume les résultats de la dernière exécution réussie de "${ctx.taskName}".` },
    { label: 'Optimiser pour la suite',icon: '💡', color: '#f59e0b', prompt: `Comment améliorer la tâche "${ctx.taskName}" pour la prochaine exécution ?` },
    { label: 'Créer une variante',     icon: '🔄', color: 'var(--brand-accent)', prompt: `Propose une variante de la tâche "${ctx.taskName}" avec un objectif légèrement différent.` },
  ];
  if (ctx.module === 'approval') return [
    { label: 'Quels sont les risques ?',icon: '⚠️', color: '#ef4444', prompt: `Analyse les risques de cette action en attente d'approbation pour la tâche "${ctx.taskName}".` },
    { label: "Critères d'approbation", icon: '✅', color: '#10b981', prompt: `Quels critères devrais-je vérifier avant d'approuver l'action de la tâche "${ctx.taskName}" ?` },
    { label: 'Négocier les paramètres',icon: '🤝', color: 'var(--brand-accent)', prompt: `Comment puis-je réduire la portée ou l'impact de l'action demandée par "${ctx.taskName}" tout en atteignant l'objectif ?` },
  ];
  if (ctx.module === 'agent') return [
    { label: "Capacités de l'agent",  icon: '🤖', color: 'var(--brand-accent)', prompt: `Quelles sont les capacités et les limites de l'agent "${ctx.agent || ctx.taskName}" ?` },
    { label: 'Intégrations possibles', icon: '🔗', color: 'var(--brand-accent)', prompt: `Avec quels autres agents ou outils l'agent "${ctx.agent || ctx.taskName}" peut-il collaborer ?` },
    ...base,
  ];
  return base;
}

// ─── Chips Lia (planning) ─────────────────────────────────────────────────────

const LIA_CHIPS = [
  { label: 'Scraper un site',      icon: '🕷️', color: 'var(--brand-accent)', prompt: 'Je veux scraper un site web et extraire des données structurées. Propose-moi un plan.' },
  { label: 'Créer du contenu',     icon: '✍️', color: 'var(--brand-accent)', prompt: 'Je veux générer du contenu (article, post, newsletter). Propose-moi un plan selon mon besoin.' },
  { label: 'Tâche de code',        icon: '💻', color: '#10b981', prompt: 'Je veux automatiser une tâche de développement (génération, refactoring, fix). Propose un plan.' },
  { label: 'Analyser des données', icon: '📊', color: '#f59e0b', prompt: 'Je veux analyser un jeu de données et générer un rapport. Propose-moi un plan complet.' },
  { label: 'Surveillance récurrente', icon: '👁️', color: '#ef4444', prompt: 'Je veux surveiller quelque chose régulièrement (site, API, prix) et recevoir des alertes. Propose un plan.' },
  { label: 'Sécurité & audit',     icon: '🔒', color: 'var(--brand-accent)', prompt: 'Je veux auditer la sécurité de mon application ou API. Propose un plan d\'analyse.' },
];

// ─── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user';
  const time = new Date(msg.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      display: 'flex', gap: 8,
      flexDirection: isUser ? 'row-reverse' : 'row',
      marginBottom: 16, alignItems: 'flex-end',
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: isUser
          ? 'var(--brand-accent)'
          : 'linear-gradient(135deg, #1e293b, #0f172a)',
        border: isUser ? 'none' : '1px solid color-mix(in srgb, var(--brand-accent) 25%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: isUser ? '0 2px 8px color-mix(in srgb, var(--brand-accent) 30%, transparent)' : 'none',
      }}>
        {isUser
          ? <User size={13} color="#fff" />
          : <Bot size={13} color="var(--brand-accent)" />
        }
      </div>

      <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{
          background: isUser
            ? 'var(--brand-accent)'
            : 'var(--bg-glass)',
          border: isUser ? 'none' : '1px solid var(--border-subtle)',
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          padding: '9px 13px',
          fontSize: '0.82rem', lineHeight: 1.6,
          color: isUser ? '#fff' : 'var(--text-primary)',
          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          boxShadow: isUser ? '0 4px 12px color-mix(in srgb, var(--brand-accent) 20%, transparent)' : '0 1px 4px rgba(0,0,0,0.1)',
        }}>
          {msg.typing ? (
            <span style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
              <span style={{ animation: 'dot1 1.4s ease-in-out infinite', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-accent)', display: 'inline-block' }} />
              <span style={{ animation: 'dot2 1.4s ease-in-out infinite', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-accent)', display: 'inline-block' }} />
              <span style={{ animation: 'dot3 1.4s ease-in-out infinite', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-accent)', display: 'inline-block' }} />
            </span>
          ) : msg.content}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6, paddingInline: 4 }}>{time}</span>
        {msg.plan && !msg.typing && (
          <LiaPlanPreview plan={msg.plan} />
        )}
      </div>
    </div>
  );
}

// ─── Storage helpers ───────────────────────────────────────────────────────────

function historyKey(taskId: string) { return `clawboard-chat-${taskId}`; }
function loadHistory(taskId: string): Msg[] {
  try { return JSON.parse(localStorage.getItem(historyKey(taskId)) || '[]'); } catch { return []; }
}
function saveHistory(taskId: string, msgs: Msg[]) {
  try { localStorage.setItem(historyKey(taskId), JSON.stringify(msgs.slice(-50))); } catch { /* ignore */ }
}

// ─── Main Drawer ───────────────────────────────────────────────────────────────

interface Props { ctx: TaskChatContext | null; onClose: () => void; }

export function TaskChatDrawer({ ctx, onClose }: Props) {
  const [msgs,    setMsgs]    = useState<Msg[]>([]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [liaMode, setLiaMode] = useState(false);
  const [liaCtx,  setLiaCtx]  = useState<LiaCtx>({ skills: [], agents: [] });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const h = loadHistory(ctx.taskId);
    setMsgs(h.length > 0 ? h : []);
    setInput('');
    setLiaMode(false);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [ctx?.taskId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { if (ctx && msgs.length > 0) saveHistory(ctx.taskId, msgs.filter(m => !m.typing && !m.plan)); }, [msgs, ctx]);

  // Charge skills + agents pour le contexte Lia
  useEffect(() => {
    if (liaMode && liaCtx.skills.length === 0) {
      fetchLiaContext().then(setLiaCtx);
    }
  }, [liaMode]);

  const buildSystemPrompt = useCallback((c: TaskChatContext, lia: boolean): string => {
    if (lia) return buildLiaSystemPrompt(liaCtx);
    return [
      `Tu es l'agent "${c.agent || 'main'}".`,
      `Tu es spécialisé dans la tâche "${c.taskName}"${c.skill ? ` (skill: ${c.skill})` : ''}.`,
      `\nCONTEXTE DE LA TÂCHE :`,
      `- Nom : ${c.taskName}`,
      c.agent    ? `- Agent : ${c.agent}` : '',
      c.skill    ? `- Skill : ${c.skill}` : '',
      c.llmModel ? `- Modèle LLM : ${c.llmModel}` : '',
      c.status   ? `- Status actuel : ${c.status}` : '',
      c.errorMsg ? `- Dernière erreur : ${c.errorMsg}` : '',
      c.lastLog  ? `- Dernière sortie (extrait) : ${c.lastLog.slice(0, 400)}` : '',
      `\nRéponds de façon concise, pratique et actionnable. Utilise des listes à puces quand c'est utile.`,
    ].filter(Boolean).join('\n');
  }, [liaCtx]);

  const send = useCallback(async (text?: string) => {
    if (!ctx) return;
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    const userMsg: Msg   = { role: 'user',      content, ts: Date.now() };
    const typingMsg: Msg = { role: 'assistant', content: '', ts: Date.now(), typing: true };
    setMsgs(prev => [...prev, userMsg, typingMsg]);
    setLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const systemPrompt = buildSystemPrompt(ctx, liaMode);
    const history = msgs.filter(m => !m.typing).map(m => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content }];
    let accumulated = '';
    try {
      const res = await apiFetch(`${BASE}/api/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: ctx.llmModel || 'claude-sonnet-4-6' }),
        signal: abortRef.current.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const p = JSON.parse(data);
            if (p.token) {
              accumulated += p.token;
              setMsgs(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: accumulated, typing: false } : m));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') { setMsgs(prev => prev.filter(m => !m.typing)); setLoading(false); return; }
      accumulated = getDemoResponse(content, ctx, liaMode);
    }

    // Parse plan JSON en mode Lia
    if (liaMode && accumulated.includes('<PLAN_JSON>')) {
      const match = accumulated.match(/<PLAN_JSON>([\s\S]*?)<\/PLAN_JSON>/);
      if (match) {
        try {
          const plan: LiaPlan = JSON.parse(match[1].trim());
          const cleanContent  = accumulated.replace(/<PLAN_JSON>[\s\S]*?<\/PLAN_JSON>/, '').trim();
          setMsgs(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: cleanContent, plan, typing: false } : m));
          setLoading(false);
          return;
        } catch { /* keep raw if JSON malformed */ }
      }
    }

    if (!accumulated) setMsgs(prev => prev.filter(m => !m.typing));
    else setMsgs(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: accumulated, typing: false } : m));
    setLoading(false);
  }, [ctx, input, loading, msgs, liaMode, buildSystemPrompt]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!ctx) return null;

  const chips = liaMode ? LIA_CHIPS : getChips(ctx);
  const agentLabel = liaMode ? 'Lia' : (ctx.agent || ctx.taskName);
  const statusColors: Record<string, string> = { failed: '#ef4444', completed: '#10b981', running: '#f59e0b', pending: 'var(--brand-accent)' };
  const statusColor = statusColors[ctx.status || ''] || 'var(--text-muted)';
  const hasMessages = msgs.filter(m => m.role === 'user').length > 0;

  return createPortal(
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 1000, backdropFilter: 'blur(3px)',
        animation: 'fadeIn 0.18s ease',
      }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
        background: 'var(--bg-primary)',
        zIndex: 1001, display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 60px rgba(0,0,0,0.5)',
        animation: 'slideInRight 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        borderLeft: '1px solid color-mix(in srgb, var(--brand-accent) 15%, transparent)',
      }}>

        {/* Accent bar top */}
        <div style={{ height: 3, background: 'var(--brand-accent)', flexShrink: 0, transition: 'background 0.3s' }} />

        {/* Header */}
        <div style={{ padding: '16px 18px 12px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            {/* Avatar */}
            <div style={{
              width: 42, height: 42, borderRadius: 14, flexShrink: 0,
              background: liaMode
                ? 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 20%, transparent), color-mix(in srgb, var(--brand-accent) 30%, transparent))'
                : 'color-mix(in srgb, var(--brand-accent) 15%, transparent)',
              border: `1px solid ${liaMode ? 'color-mix(in srgb, var(--brand-accent) 40%, transparent)' : 'color-mix(in srgb, var(--brand-accent) 30%, transparent)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 16px ${liaMode ? 'color-mix(in srgb, var(--brand-accent) 20%, transparent)' : 'color-mix(in srgb, var(--brand-accent) 15%, transparent)'}`,
            }}>
              {liaMode
                ? <Sparkles size={20} color="var(--brand-accent)" />
                : <Bot size={20} color="var(--brand-accent)" />
              }
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  {agentLabel}
                </span>
                {ctx.status && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: statusColor,
                    background: `${statusColor}18`, padding: '2px 8px', borderRadius: 99,
                    border: `1px solid ${statusColor}30`, letterSpacing: '0.3px',
                  }}>
                    {ctx.status.toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ctx.taskName}
              </div>
              {ctx.llmModel && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2, opacity: 0.7 }}>
                  {ctx.llmModel}
                </div>
              )}
            </div>

            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-subtle)',
              background: 'var(--bg-glass)', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-glass)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Mode toggle — segmented pill */}
          <div style={{
            display: 'inline-flex', background: 'var(--bg-glass)', borderRadius: 10,
            border: '1px solid var(--border-subtle)', padding: 3, gap: 2,
          }}>
            <button onClick={() => setLiaMode(false)} style={{
              padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
              background: !liaMode ? 'color-mix(in srgb, var(--brand-accent) 18%, transparent)' : 'transparent',
              color: !liaMode ? 'var(--brand-accent)' : 'var(--text-muted)',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Bot size={11} />{ctx.agent || 'Agent'}
            </button>
            <button onClick={() => setLiaMode(true)} style={{
              padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
              background: liaMode ? 'color-mix(in srgb, var(--brand-accent) 18%, transparent)' : 'transparent',
              color: liaMode ? 'var(--brand-accent)' : 'var(--text-muted)',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkles size={11} />Lia
            </button>
          </div>
        </div>

        {/* Quick chips (first open) */}
        {!hasMessages && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.12)', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
              Actions rapides
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {chips.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => send(chip.prompt)}
                  disabled={loading}
                  style={{
                    padding: '6px 12px', borderRadius: 20,
                    border: `1px solid color-mix(in srgb, ${chip.color} 19%, transparent)`,
                    background: `color-mix(in srgb, ${chip.color} 6%, transparent)`,
                    color: chip.color,
                    fontSize: '11.5px', fontWeight: 500, cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${chip.color} 20%, transparent)`; e.currentTarget.style.borderColor = `color-mix(in srgb, ${chip.color} 31%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `color-mix(in srgb, ${chip.color} 6%, transparent)`; e.currentTarget.style.borderColor = `color-mix(in srgb, ${chip.color} 19%, transparent)`; }}
                >
                  <span style={{ fontSize: 13 }}>{chip.icon}</span>{chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px' }}>
          {msgs.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 18,
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 10%, transparent), color-mix(in srgb, var(--brand-accent) 15%, transparent))',
                border: '1px solid color-mix(in srgb, var(--brand-accent) 20%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageSquare size={24} color="var(--brand-accent)" style={{ opacity: 0.6 }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Chat avec <span style={{ color: 'var(--brand-accent)' }}>{agentLabel}</span>
                </div>
                <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                  Utilise les actions rapides ou pose une question
                </div>
              </div>
            </div>
          )}
          {msgs.map((m, i) => <Bubble key={i} msg={m} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-glass)', flexShrink: 0 }}>
          {/* Mini chips quand déjà en conversation */}
          {hasMessages && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {chips.slice(0, 3).map((chip, i) => (
                <button key={i} onClick={() => send(chip.prompt)} disabled={loading} style={{
                  padding: '3px 9px', borderRadius: 12,
                  border: `1px solid color-mix(in srgb, ${chip.color} 15%, transparent)`,
                  background: `color-mix(in srgb, ${chip.color} 3%, transparent)`,
                  color: chip.color, fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span>{chip.icon}</span>{chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14, padding: '8px 8px 8px 14px',
            transition: 'border-color 0.15s',
          }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--brand-accent) 40%, transparent)')}
            onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Message à ${agentLabel}…`}
              rows={1}
              style={{
                flex: 1, resize: 'none', background: 'transparent', border: 'none',
                color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
                padding: '2px 0',
              }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            {loading ? (
              <button onClick={() => abortRef.current?.abort()} title="Arrêter" style={{
                width: 32, height: 32, borderRadius: 9, border: 'none', flexShrink: 0,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <StopCircle size={15} />
              </button>
            ) : (
              <button onClick={() => send()} disabled={!input.trim()} style={{
                width: 32, height: 32, borderRadius: 9, border: 'none', flexShrink: 0,
                background: input.trim() ? 'var(--brand-accent)' : 'transparent',
                color: input.trim() ? '#fff' : 'var(--text-muted)',
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
                boxShadow: 'none',
              }}>
                <Send size={14} />
              </button>
            )}
          </div>

          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 7, textAlign: 'center', opacity: 0.6, letterSpacing: '0.2px' }}>
            Shift+Entrée pour saut de ligne · Historique local · {loading ? <><RefreshCw size={8} style={{ verticalAlign: 'middle', animation: 'spin 1s linear infinite' }} /> Génération…</> : 'Prêt'}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn       { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes dot1 { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
        @keyframes dot2 { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1.1)} }
        @keyframes dot3 { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
      `}</style>
    </>,
    document.body,
  );
}

// ─── Demo fallback ─────────────────────────────────────────────────────────────

function getDemoResponse(input: string, ctx: TaskChatContext, lia: boolean): string {
  const q = input.toLowerCase();

  if (lia) {
    // Détecte le type d'objectif et génère un plan démo adapté
    const isScrap   = q.includes('scrap') || q.includes('crawl') || q.includes('site') || q.includes('extraire');
    const isCode    = q.includes('code') || q.includes('bug') || q.includes('refactor') || q.includes('déve') || q.includes('repo');
    const isContent = q.includes('contenu') || q.includes('article') || q.includes('blog') || q.includes('rédige') || q.includes('post');
    const isSurv    = q.includes('surveill') || q.includes('monitore') || q.includes('alerte') || q.includes('chaque') || q.includes('récurr');
    void (q.includes('données') || q.includes('analys') || q.includes('rapport') || q.includes('csv'));
    const isSec     = q.includes('sécurité') || q.includes('vulné') || q.includes('audit') || q.includes('owasp');

    if (isScrap) return `Parfait, je prépare un plan de scraping adapté à ton besoin.

<PLAN_JSON>
{
  "summary": "Scraping web avec extraction de données structurées",
  "steps": [
    { "id": "step-1", "name": "Scraper les données", "skill": "web-scraper", "agent": "Data Analyst", "prompt": "Scrape le site cible et extrait toutes les données pertinentes en JSON structuré. Gère la pagination et les éléments dynamiques.", "recurrence": null, "approval_needed": false },
    { "id": "step-2", "name": "Nettoyer et structurer", "skill": "data-analysis", "agent": "Data Analyst", "prompt": "Nettoie et normalise les données extraites. Supprime les doublons, formate les dates et valeurs numériques.", "recurrence": null, "approval_needed": false },
    { "id": "step-3", "name": "Générer rapport", "skill": "report-gen", "agent": "Data Analyst", "prompt": "Génère un rapport Markdown résumant les données collectées avec statistiques et insights clés.", "recurrence": null, "approval_needed": false }
  ],
  "risks": ["Certains sites bloquent les bots — vérifier les CGU", "Respect du robots.txt recommandé"],
  "estimated_tokens": 3500
}
</PLAN_JSON>`;

    if (isCode) return `Je vais te préparer un plan de développement structuré.

<PLAN_JSON>
{
  "summary": "Tâche de développement logiciel automatisée",
  "steps": [
    { "id": "step-1", "name": "Analyser le code existant", "skill": "code-gen", "agent": "Code Architect", "prompt": "Analyse le code source fourni, identifie les problèmes de qualité, bugs potentiels et axes d'amélioration.", "recurrence": null, "approval_needed": false },
    { "id": "step-2", "name": "Générer les corrections", "skill": "code-fix", "agent": "Code Architect", "prompt": "Applique les corrections identifiées. Respecte les conventions du projet et génère du code propre et commenté.", "recurrence": null, "approval_needed": true },
    { "id": "step-3", "name": "Tests et validation", "skill": "code-gen", "agent": "Code Architect", "prompt": "Génère des tests unitaires pour les fonctions modifiées et vérifie la non-régression.", "recurrence": null, "approval_needed": false }
  ],
  "risks": ["Approbation humaine recommandée avant merge"],
  "estimated_tokens": 5000
}
</PLAN_JSON>`;

    if (isContent) return `Voici un plan de création de contenu optimisé.

<PLAN_JSON>
{
  "summary": "Création de contenu éditorial de qualité",
  "steps": [
    { "id": "step-1", "name": "Recherche et outline", "skill": "seo-content", "agent": "NemoClaw Router", "prompt": "Recherche les mots-clés pertinents et crée un plan détaillé pour le contenu demandé. Inclus l'angle éditorial et les points clés.", "recurrence": null, "approval_needed": false },
    { "id": "step-2", "name": "Rédaction du contenu", "skill": "blog-writer", "agent": "NemoClaw Router", "prompt": "Rédige le contenu complet selon le plan validé. Ton engageant, structure H2/H3, introduction accrocheuse, conclusion avec CTA.", "recurrence": null, "approval_needed": false },
    { "id": "step-3", "name": "Optimisation SEO", "skill": "seo-content", "agent": "NemoClaw Router", "prompt": "Optimise le contenu pour le SEO : densité des mots-clés, meta description, alt texts suggérés, liens internes.", "recurrence": null, "approval_needed": false }
  ],
  "risks": [],
  "estimated_tokens": 4000
}
</PLAN_JSON>`;

    if (isSurv) return `Parfait pour un monitoring récurrent automatisé.

<PLAN_JSON>
{
  "summary": "Surveillance récurrente avec alertes automatiques",
  "steps": [
    { "id": "step-1", "name": "Collecter les données", "skill": "web-scraper", "agent": "Data Analyst", "prompt": "Scrape les données à surveiller (prix, contenu, statut API) et stocke l'instantané courant.", "recurrence": "daily", "approval_needed": false },
    { "id": "step-2", "name": "Détecter les changements", "skill": "diff-detector", "agent": "Data Analyst", "prompt": "Compare l'instantané courant avec le précédent. Identifie et classe les changements par importance.", "recurrence": "daily", "approval_needed": false },
    { "id": "step-3", "name": "Rapport de changements", "skill": "report-gen", "agent": "Data Analyst", "prompt": "Si des changements sont détectés, génère un rapport synthétique avec les deltas et leur impact potentiel.", "recurrence": "daily", "approval_needed": false }
  ],
  "risks": ["Vérifier les limites de rate-limiting du site cible"],
  "estimated_tokens": 2000
}
</PLAN_JSON>`;

    if (isSec) return `Je prépare un plan d'audit de sécurité complet.

<PLAN_JSON>
{
  "summary": "Audit de sécurité et détection de vulnérabilités",
  "steps": [
    { "id": "step-1", "name": "Scan des vulnérabilités", "skill": "vuln-scan", "agent": "Security Scanner", "prompt": "Effectue un scan OWASP Top 10 de l'application cible. Identifie injections SQL, XSS, CSRF, mauvaises configurations.", "recurrence": null, "approval_needed": false },
    { "id": "step-2", "name": "Analyse des dépendances", "skill": "code-fix", "agent": "Security Scanner", "prompt": "Analyse les dépendances NPM/Python pour détecter des CVE connues. Propose les mises à jour prioritaires.", "recurrence": null, "approval_needed": false },
    { "id": "step-3", "name": "Rapport de sécurité", "skill": "report-gen", "agent": "Security Scanner", "prompt": "Génère un rapport de sécurité complet avec niveau de criticité (CVSS), impact et recommandations de correction.", "recurrence": null, "approval_needed": true }
  ],
  "risks": ["Ne pas lancer sur des systèmes sans autorisation"],
  "estimated_tokens": 4500
}
</PLAN_JSON>`;

    // Generic Lia plan
    return `Bien reçu ! Voici un plan d'exécution adapté à ton objectif.

<PLAN_JSON>
{
  "summary": "${input.slice(0, 80)}",
  "steps": [
    { "id": "step-1", "name": "Analyse et préparation", "skill": "data-analysis", "agent": "NemoClaw Router", "prompt": "Analyse le contexte et prépare les paramètres optimaux pour l'objectif : ${input.slice(0, 150)}", "recurrence": null, "approval_needed": false },
    { "id": "step-2", "name": "Exécution principale", "skill": "web-scraper", "agent": "NemoClaw Router", "prompt": "Exécute la tâche principale selon les paramètres définis. Collecte les résultats et gère les erreurs.", "recurrence": null, "approval_needed": false },
    { "id": "step-3", "name": "Synthèse et rapport", "skill": "report-gen", "agent": "NemoClaw Router", "prompt": "Génère un rapport synthétisant les résultats, les insights clés et les prochaines actions recommandées.", "recurrence": null, "approval_needed": false }
  ],
  "risks": [],
  "estimated_tokens": 3000
}
</PLAN_JSON>`;
  }

  if (q.includes('échoué') || q.includes('erreur') || q.includes('failed'))
    return `**Analyse de l'échec — ${ctx.taskName}**\n\nCauses probables :\n• Timeout dépassé (vérifier le paramètre timeout)\n• Erreur de connexion au service cible\n• Prompt trop vague ou mal formaté\n\n**Recommandation :** Relance avec un timeout augmenté à 60 min et ajoute des instructions de retry dans le prompt.`;
  if (q.includes('optimis'))
    return `**Optimisation — ${ctx.taskName}**\n\n• Ajoute "Réponds en JSON structuré" pour parser facilement\n• Utilise few-shot examples dans le prompt\n• Active le skill ${ctx.skill || 'adapté'} pour plus de contexte\n• Considère le modèle Nemotron Ultra pour les tâches complexes`;
  return `**${ctx.agent || 'Agent'}** répond :\n\nContexte chargé pour "${ctx.taskName}".\n\n${ctx.skill ? `Skill actif : **${ctx.skill}**\n` : ''}Pose-moi une question spécifique sur cette tâche et je t'aiderai à l'analyser, l'optimiser ou la déboguer.`;
}

// ─── Hook utilitaire ───────────────────────────────────────────────────────────

export function useTaskChat() {
  const [chatCtx, setChatCtx] = useState<TaskChatContext | null>(null);
  const openChat  = useCallback((ctx: TaskChatContext) => setChatCtx(ctx), []);
  const closeChat = useCallback(() => setChatCtx(null), []);
  return { chatCtx, openChat, closeChat };
}

// ─── Bouton déclencheur ────────────────────────────────────────────────────────

interface ChatBtnProps { ctx: TaskChatContext; onOpen: (ctx: TaskChatContext) => void; unread?: number; }

export function ChatTriggerBtn({ ctx, onOpen, unread = 0 }: ChatBtnProps) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onOpen(ctx); }}
      title={`Chat — ${ctx.taskName}`}
      style={{
        position: 'relative', width: 28, height: 28, borderRadius: 8, border: 'none',
        background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)', color: 'var(--brand-accent)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-accent) 22%, transparent)'; e.currentTarget.style.transform = 'scale(1.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-accent) 10%, transparent)'; e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <MessageSquare size={13} />
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%',
          background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
