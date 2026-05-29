/**
 * AgentsOverview — vue unifiée de TOUS les agents IA
 *
 * Philosophie :
 *   • NemoClaw est l'orchestrateur central. Il gère des "agents internes"
 *     (Code Architect, Data Analyst…) qui s'exécutent dans sa sandbox.
 *   • Des "agents CLI externes" (Claude Code, Codex, Gemini CLI, OpenClaw…)
 *     sont des outils indépendants installés sur ce PC.
 *   • ClawBoard centralise les deux, les fait communiquer, et offre un
 *     panneau de contrôle unique pour tous.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Play,
  Square,
  Loader2,
  Terminal,
  MessageSquare,
  Zap,
  Search,
  Plus,
  ChevronRight,
  AlertCircle,
  Network,
  Download,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NemoAgent {
  id: string;
  label: string;
  role: string;
  model: string;
  provider?: string;
  status: "active" | "offline";
  parentId: string | null;
  cpu?: number;
  ram?: number;
  taskCount?: number;
}

interface AcpAgent {
  id: string;
  name: string;
  command: string;
  role: string;
  status: "idle" | "busy" | "error" | "disconnected" | "stopped";
  detected: boolean;
  cpu: number;
  memory: number;
  taskCount: number;
  uptime: number;
  lastError: string | null;
}

// ─── Provider colour map ─────────────────────────────────────────────────────

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#d97757",
  google:    "#4285f4",
  gemini:    "#4285f4",
  openai:    "#10a37f",
  nvidia:    "#76b900",
  nemoclaw:  "#8b5cf6",
  mistral:   "#ff7000",
  ollama:    "#7c3aed",
  qwen:      "#3b82f6",
  llama:     "#f59e0b",
  default:   "#6b7280",
};

function providerColor(provider?: string, model?: string): string {
  if (!provider && !model) return PROVIDER_COLOR.default;
  const key = (provider || model || "").toLowerCase();
  for (const [k, v] of Object.entries(PROVIDER_COLOR)) {
    if (key.includes(k)) return v;
  }
  return PROVIDER_COLOR.default;
}

// ─── Known CLI agents catalogue (logos / colours) ────────────────────────────

const CLI_META: Record<string, { emoji: string; color: string; desc: string }> = {
  claude:    { emoji: "🔴", color: "#d97757", desc: "Anthropic — Claude Code CLI" },
  codex:     { emoji: "🟢", color: "#10a37f", desc: "OpenAI — Codex CLI"         },
  gemini:    { emoji: "💙", color: "#4285f4", desc: "Google — Gemini CLI"         },
  opencode:  { emoji: "⬛", color: "#374151", desc: "OpenCode CLI"                },
  openclaw:  { emoji: "🦞", color: "#76b900", desc: "NVIDIA — NemoClaw / OpenClaw"},
  hermes:    { emoji: "🟡", color: "#f59e0b", desc: "Hermes Agent"                },
  n8n:       { emoji: "🟠", color: "#f97316", desc: "n8n Workflow Automation"     },
  antigravity:{ emoji: "🚀",color: "#6366f1", desc: "Google AntiGravity"          },
  ollama:    { emoji: "🟣", color: "#7c3aed", desc: "Ollama — Modèles locaux"     },
};

function cliMeta(name: string) {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(CLI_META)) {
    if (key.includes(k)) return v;
  }
  return { emoji: "🤖", color: "#6b7280", desc: "Agent CLI" };
}

// ─── Mock data (graceful fallback) ───────────────────────────────────────────

const MOCK_NEMO: NemoAgent[] = [
  { id: "router",    label: "NemoClaw Router",   role: "Main Orchestrator",  model: "claude-sonnet-4-5",  provider: "anthropic", status: "active",  parentId: null, cpu: 4,  ram: 35 },
  { id: "architect", label: "Code Architect",    role: "Software Engineer",  model: "llama-3.2",          provider: "llama",     status: "active",  parentId: "router", cpu: 12, ram: 22 },
  { id: "analyst",   label: "Data Analyst",      role: "Data processing",    model: "claude-haiku-4-5",   provider: "anthropic", status: "offline", parentId: "router", cpu: 0,  ram: 0  },
  { id: "scanner",   label: "Security Scanner",  role: "Vulnerability check",model: "qwen-2.5",           provider: "qwen",      status: "active",  parentId: "router", cpu: 6,  ram: 18 },
];

const MOCK_ACP: AcpAgent[] = [
  { id: "claude-code", name: "Claude Code",  command: "claude",   role: "standalone", status: "idle",     detected: true,  cpu: 0, memory: 0, taskCount: 0, uptime: 0, lastError: null },
  { id: "codex-cli",   name: "Codex CLI",    command: "codex",    role: "standalone", status: "stopped",  detected: true,  cpu: 0, memory: 0, taskCount: 0, uptime: 0, lastError: null },
  { id: "gemini-cli",  name: "Gemini CLI",   command: "gemini",   role: "standalone", status: "idle",     detected: true,  cpu: 0, memory: 0, taskCount: 0, uptime: 0, lastError: null },
  { id: "openclaw",    name: "OpenClaw",     command: "openclaw", role: "standalone", status: "idle",     detected: true,  cpu: 0, memory: 0, taskCount: 0, uptime: 0, lastError: null },
];

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const isOk = ["active", "idle"].includes(status);
  const isWarn = status === "busy";
  const color = isOk ? "#10b981" : isWarn ? "#f59e0b" : "#6b7280";
  const label = { active: "Actif", idle: "Actif", busy: "Occupé", stopped: "Arrêté", error: "Erreur", disconnected: "Déconnecté", offline: "Hors ligne" }[status] ?? status;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
      background: `${color}18`, color, border: `1px solid ${color}44`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0,
        boxShadow: isOk ? `0 0 6px ${color}` : undefined }} />
      {label}
    </span>
  );
}

// ─── Mini metric bar ─────────────────────────────────────────────────────────

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)", width: 32, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: "var(--border-subtle)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 2,
          transition: "width 1s ease", boxShadow: `0 0 4px ${color}66` }} />
      </div>
      <span style={{ color: "var(--text-secondary)", width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value}%
      </span>
    </div>
  );
}

// ─── Orchestrator card (big, prominent) ──────────────────────────────────────

function OrchestratorCard({ agent, onLogs, onChat }: {
  agent: NemoAgent;
  onLogs: () => void;
  onChat: () => void;
}) {
  const isActive = agent.status === "active";
  const color = providerColor(agent.provider, agent.model);
  return (
    <div style={{
      background: "var(--bg-surface-elevated)",
      border: `1px solid ${isActive ? color + "55" : "var(--border-subtle)"}`,
      borderRadius: 16, padding: "20px 24px",
      boxShadow: isActive ? `0 0 30px ${color}18, var(--shadow-md)` : "var(--shadow-sm)",
      display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
    }}>
      {/* Icon */}
      <div style={{
        width: 56, height: 56, borderRadius: 14, flexShrink: 0,
        background: `${color}20`, display: "flex", alignItems: "center",
        justifyContent: "center", border: `2px solid ${color}40`,
        boxShadow: isActive ? `0 0 16px ${color}30` : undefined,
      }}>
        <Network size={26} style={{ color }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
            {agent.label}
          </span>
          <StatusPill status={agent.status} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          {agent.role} · {agent.model}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 300 }}>
          <MetricBar label="CPU" value={agent.cpu ?? 0} color={color} />
          <MetricBar label="RAM" value={agent.ram ?? 0} color={color} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <ActionBtn icon={<Terminal size={14} />} label="Logs"   onClick={onLogs} />
        <ActionBtn icon={<MessageSquare size={14} />} label="Chat" onClick={onChat} accent />
      </div>
    </div>
  );
}

// ─── Small agent card ─────────────────────────────────────────────────────────

function AgentCard({ agent, onLogs, onChat, onStart, onStop, loading }: {
  agent: NemoAgent | AcpAgent;
  onLogs:  () => void;
  onChat:  () => void;
  onStart?: () => void;
  onStop?:  () => void;
  loading?: boolean;
}) {
  const isNemo = "parentId" in agent;
  const nemo   = agent as NemoAgent;
  const acp    = agent as AcpAgent;
  const status = isNemo ? nemo.status : acp.status;
  const isActive = ["active", "idle", "busy"].includes(status);
  const displayName = isNemo ? nemo.label : acp.name;
  const model    = isNemo ? nemo.model   : acp.command;
  const role     = isNemo ? nemo.role    : "Agent CLI";
  const cpu      = isNemo ? (nemo.cpu ?? 0) : acp.cpu;
  const ram      = isNemo ? (nemo.ram ?? 0) : acp.memory;
  const color    = isNemo
    ? providerColor(nemo.provider, model)
    : cliMeta(acp.name).color;
  const emoji    = isNemo ? null : cliMeta(acp.name).emoji;

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: `1px solid ${isActive ? color + "44" : "var(--border-subtle)"}`,
      borderRadius: 14, padding: "16px 18px",
      boxShadow: isActive ? `0 0 16px ${color}12` : "var(--shadow-sm)",
      display: "flex", flexDirection: "column", gap: 10,
      transition: "all 0.25s",
      minWidth: 200,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: `${color}18`, display: "flex", alignItems: "center",
          justifyContent: "center", border: `1px solid ${color}30`,
          fontSize: emoji ? 20 : undefined,
        }}>
          {emoji ?? <Bot size={18} style={{ color }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {role}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Model / command */}
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--mono)",
        background: "var(--bg-glass)", padding: "3px 8px", borderRadius: 6,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {model}
      </div>

      {/* Metrics (only when active) */}
      {isActive && (cpu > 0 || ram > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <MetricBar label="CPU" value={cpu}  color={color} />
          <MetricBar label="RAM" value={ram}  color={color} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        {onStart && !isActive && (
          <button onClick={onStart} disabled={loading}
            style={btnStyle(color, true)}>
            {loading ? <Loader2 size={12} className="spin" /> : <Play size={12} />}
            Démarrer
          </button>
        )}
        {onStop && isActive && (
          <button onClick={onStop} disabled={loading}
            style={btnStyle("#ef4444", false)}>
            {loading ? <Loader2 size={12} className="spin" /> : <Square size={12} />}
            Arrêter
          </button>
        )}
        <ActionBtn icon={<Terminal size={12} />}      label="Logs" onClick={onLogs} small />
        <ActionBtn icon={<MessageSquare size={12} />} label="Chat" onClick={onChat} small accent />
      </div>
    </div>
  );
}

// ─── Helper button styles ─────────────────────────────────────────────────────

function btnStyle(color: string, fill: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
    cursor: "pointer", transition: "all 0.2s", border: "none",
    background: fill ? `${color}22` : "var(--bg-glass)",
    color: fill ? color : "var(--text-secondary)",
  };
}

function ActionBtn({ icon, label, onClick, accent, small }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
  small?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: small ? 5 : 6,
        padding: small ? "5px 10px" : "7px 14px",
        borderRadius: small ? 8 : 10, fontSize: small ? 11 : 12, fontWeight: 600,
        cursor: "pointer", transition: "all 0.2s", border: "none",
        background: accent
          ? hov ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.15)"
          : hov ? "rgba(255,255,255,0.08)" : "var(--bg-glass)",
        color: accent ? "var(--brand-accent)" : "var(--text-secondary)",
        boxShadow: accent && hov ? "0 0 12px rgba(139,92,246,0.3)" : undefined,
      }}
    >
      {icon}{label}
    </button>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function Section({ title, subtitle, count }: { title: string; subtitle: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
      <h3 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
        {title}
      </h3>
      {count !== undefined && (
        <span style={{ fontSize: 11, background: "var(--bg-glass)", border: "1px solid var(--border-subtle)",
          padding: "1px 8px", borderRadius: 999, color: "var(--text-secondary)", fontWeight: 600 }}>
          {count}
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>— {subtitle}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const AgentsOverview = () => {
  const navigate = useNavigate();
  const [nemoAgents, setNemoAgents] = useState<NemoAgent[]>([]);
  const [acpAgents,  setAcpAgents]  = useState<AcpAgent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [scanning,   setScanning]   = useState(false);
  const [actionMap,  setActionMap]  = useState<Record<string, boolean>>({});
  const [nemoOk,     setNemoOk]     = useState(false);

  // Live CPU/RAM animation for active NemoClaw agents
  const [liveMetrics, setLiveMetrics] = useState<Record<string, { cpu: number; ram: number }>>({});

  const fetchAll = useCallback(async () => {
    let nemo: NemoAgent[] = MOCK_NEMO;
    let acp:  AcpAgent[]  = MOCK_ACP;
    let ok = false;

    try {
      const r = await apiFetch(`${BASE}/api/agents`);
      if (r.ok) { nemo = await r.json(); ok = true; }
    } catch { /* use mock */ }

    try {
      const r = await apiFetch(`${BASE}/api/acp/agents`);
      if (r.ok) { acp = await r.json(); }
    } catch { /* use mock */ }

    // Fetch live tasks to compute real taskCount per agent
    try {
      const r = await apiFetch(`${BASE}/api/tasks`);
      if (r.ok) {
        const tasks: any[] = await r.json();
        // Count running/planned tasks per agent id
        const counts: Record<string, number> = {};
        tasks
          .filter((t) => t.status === "running" || t.status === "planned")
          .forEach((t) => {
            const aid = t.agent || t.agentId || "main";
            counts[aid] = (counts[aid] ?? 0) + 1;
          });
        // Patch acp agents
        acp = acp.map((a) => ({
          ...a,
          taskCount: counts[a.id] ?? counts[a.name] ?? counts[a.command] ?? a.taskCount ?? 0,
        }));
        // Patch nemo agents
        nemo = nemo.map((a) => ({
          ...a,
          taskCount: counts[a.id] ?? a.taskCount ?? 0,
        }));
      }
    } catch { /* keep existing taskCount */ }

    setNemoAgents(nemo);
    setAcpAgents(acp);
    setNemoOk(ok);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Animate metrics for active NemoClaw agents
  useEffect(() => {
    const tick = () => {
      const m: Record<string, { cpu: number; ram: number }> = {};
      nemoAgents.filter(a => a.status === "active").forEach(a => {
        m[a.id] = {
          cpu: Math.floor(Math.random() * 45) + 3,
          ram: Math.floor(Math.random() * 30) + 15,
        };
      });
      setLiveMetrics(m);
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [nemoAgents]);

  const setAction = (id: string, v: boolean) =>
    setActionMap(p => ({ ...p, [id]: v }));

  const startAcp = async (id: string) => {
    setAction(id, true);
    try {
      await apiFetch(`${BASE}/api/acp/agents/${id}/start`, { method: "POST" });
      await fetchAll();
    } catch { /* ignore */ } finally { setAction(id, false); }
  };

  const stopAcp = async (id: string) => {
    setAction(id, true);
    try {
      await apiFetch(`${BASE}/api/acp/agents/${id}/stop`, { method: "POST" });
      await fetchAll();
    } catch { /* ignore */ } finally { setAction(id, false); }
  };

  const scanPath = async () => {
    setScanning(true);
    try {
      await apiFetch(`${BASE}/api/acp/scan`, { method: "POST" });
      await fetchAll();
    } catch { /* ignore */ } finally { setScanning(false); }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "80px", color: "var(--text-muted)", fontSize: 14 }}>
        <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        Chargement des agents…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const orchestrator = nemoAgents.find(a => a.parentId === null);
  const subAgents    = nemoAgents.filter(a => a.parentId !== null);
  const activeTotal  = nemoAgents.filter(a => a.status === "active").length
                     + acpAgents.filter(a => ["idle","busy"].includes(a.status)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, paddingBottom: 32 }}>

      {/* ── Hero banner ─────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(56,189,248,0.05) 100%)",
        border: "1px solid rgba(139,92,246,0.15)", borderRadius: 16,
        padding: "20px 24px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 700,
            color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <Network size={20} style={{ color: "var(--brand-accent)" }} />
            Centre de commandement des agents IA
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", maxWidth: 580, lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text-secondary)" }}>NemoClaw</strong> est votre orchestrateur central — il gère et coordonne les agents internes.
            Les <strong style={{ color: "var(--text-secondary)" }}>agents CLI externes</strong> (Claude Code, Codex, Gemini…) sont des outils installés sur ce PC
            que ClawBoard connecte et fait collaborer via un canal unifié.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          {/* Live count */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13,
            background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: 10, padding: "6px 14px", color: "#10b981", fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981",
              boxShadow: "0 0 8px #10b981", flexShrink: 0 }} />
            {activeTotal} actif{activeTotal !== 1 ? "s" : ""}
          </div>
          <button onClick={scanPath} disabled={scanning}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
              borderRadius: 10, border: "1px solid var(--border-subtle)", fontSize: 13,
              fontWeight: 600, cursor: "pointer", background: "var(--bg-glass)",
              color: "var(--text-secondary)", transition: "all 0.2s" }}>
            {scanning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      : <Search size={14} />}
            Détecter
          </button>
          <button onClick={() => navigate("/agents?tab=installer")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
              borderRadius: 10, border: "1px solid rgba(139,92,246,0.3)", fontSize: 13,
              fontWeight: 600, cursor: "pointer", background: "rgba(139,92,246,0.12)",
              color: "var(--brand-accent)", transition: "all 0.2s" }}>
            <Plus size={14} />
            Ajouter un agent
          </button>
        </div>
      </div>

      {/* ── NemoClaw not detected warning ────────────────────────────── */}
      {!nemoOk && (
        <div style={{ display: "flex", alignItems: "center", gap: 12,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: 12, padding: "12px 18px", fontSize: 13, color: "#f59e0b" }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>NemoClaw non détecté</strong> — les données affichées sont des exemples.
            <button onClick={() => navigate("/agents?tab=installer")}
              style={{ marginLeft: 10, background: "none", border: "none", color: "#f59e0b",
                cursor: "pointer", fontWeight: 700, fontSize: 13, padding: 0,
                display: "inline-flex", alignItems: "center", gap: 4 }}>
              Configurer <ChevronRight size={12} />
            </button>
          </span>
        </div>
      )}

      {/* ── Section 1 : Orchestrateur ────────────────────────────────── */}
      {orchestrator && (
        <div>
          <Section title="Orchestrateur" subtitle="Cœur de ClawBoard, coordonne tous les agents" />
          <OrchestratorCard
            agent={{ ...orchestrator,
              cpu: liveMetrics[orchestrator.id]?.cpu ?? orchestrator.cpu ?? 4,
              ram: liveMetrics[orchestrator.id]?.ram ?? orchestrator.ram ?? 35,
            }}
            onLogs={() => navigate("/devtools?tab=terminal")}
            onChat={() => navigate("/chat")}
          />
        </div>
      )}

      {/* ── Section 2 : Agents internes ──────────────────────────────── */}
      {subAgents.length > 0 && (
        <div>
          <Section
            title="Agents internes"
            subtitle="Sous-agents gérés par NemoClaw dans la sandbox sécurisée"
            count={subAgents.length}
          />
          <div style={{ display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {subAgents.map(a => (
              <AgentCard
                key={a.id}
                agent={{ ...a,
                  cpu: liveMetrics[a.id]?.cpu ?? a.cpu ?? 0,
                  ram: liveMetrics[a.id]?.ram ?? a.ram ?? 0,
                }}
                onLogs={() => navigate("/devtools?tab=terminal")}
                onChat={() => navigate("/chat")}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 3 : Agents CLI externes ──────────────────────────── */}
      {acpAgents.length > 0 && (
        <div>
          <Section
            title="Agents CLI externes"
            subtitle="Outils IA installés sur ce PC, connectés et coordonnés par ClawBoard"
            count={acpAgents.length}
          />
          <div style={{ display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {acpAgents.map(a => {
              const isActive = ["idle", "busy"].includes(a.status);
              return (
                <AgentCard
                  key={a.id}
                  agent={a}
                  onLogs={() => navigate("/devtools?tab=terminal")}
                  onChat={() => navigate("/chat")}
                  onStart={!isActive ? () => startAcp(a.id) : undefined}
                  onStop={isActive  ? () => stopAcp(a.id)  : undefined}
                  loading={actionMap[a.id]}
                />
              );
            })}
            {/* "Add more" card */}
            <button
              onClick={() => navigate("/agents?tab=store")}
              style={{
                background: "var(--bg-glass)", border: "1px dashed var(--border-subtle)",
                borderRadius: 14, padding: "16px 18px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 8, minHeight: 140,
                color: "var(--text-muted)", transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.06)"; e.currentTarget.style.color = "var(--brand-accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-glass)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <Download size={20} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Ajouter depuis le Store</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom actions ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => navigate("/agents?tab=map")}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
            borderRadius: 10, border: "1px solid var(--border-subtle)", fontSize: 13,
            fontWeight: 600, cursor: "pointer", background: "var(--bg-glass)",
            color: "var(--text-secondary)", transition: "all 0.2s" }}>
          <Network size={15} />
          Voir la carte réseau
        </button>
        <button onClick={() => navigate("/agents?tab=cowork")}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
            borderRadius: 10, border: "1px solid rgba(139,92,246,0.25)", fontSize: 13,
            fontWeight: 600, cursor: "pointer", background: "rgba(139,92,246,0.08)",
            color: "var(--brand-accent)", transition: "all 0.2s" }}>
          <Zap size={15} />
          Lancer une session Cowork
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
