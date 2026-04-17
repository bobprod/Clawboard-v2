// ─── CoworkModule.tsx ────────────────────────────────────────────────────────
// Full Cowork desktop — inspired by Claude Cowork, OpenWork, Eigent, Kuse.
// Features: session management, live progress, plan viewer, file explorer,
// sub-agent monitor, computer use panel, human-in-the-loop approvals,
// SSE real-time updates.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Monitor,
  FolderOpen,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Camera,
  MousePointer2,
  Keyboard,
  Users,
  ListTodo,
  MessageSquare,
  BarChart3,
  Cpu,
  Send,
  RotateCcw,
  Zap,
  Activity,
  Layers,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlanStep {
  title: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  detail?: string;
}

interface SubAgent {
  id: string;
  role: string;
  task: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
}

interface SessionFile {
  name: string;
  type: "file" | "directory";
  path: string;
}

interface ApprovalRequest {
  action: string;
  reason: string;
  risk?: string;
  options: string[];
  toolCallId?: string;
}

interface CoworkSession {
  id: string;
  name: string;
  status: "active" | "paused" | "completed" | "failed";
  mode: "autonomous" | "supervised" | "manual";
  model: string;
  progress: number;
  iterations: number;
  maxIterations?: number;
  tokensUsed: number;
  cost: number;
  plan: PlanStep[];
  currentStep: number;
  totalSteps: number;
  subAgents: SubAgent[];
  filesModified: string[];
  filesCreated: string[];
  computerUseEnabled: boolean;
  pendingApproval: ApprovalRequest | null;
  createdAt: string;
  updatedAt: string;
  messages?: { role: string; content: string; ts: string }[];
  errors?: string[];
}

interface SSEEvent {
  type: string;
  data: any;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  active: "#10b981",
  paused: "#f59e0b",
  completed: "#8b5cf6",
  failed: "#ef4444",
};

const statusLabels: Record<string, string> = {
  active: "En cours",
  paused: "En pause",
  completed: "Terminé",
  failed: "Échoué",
};

const modeLabels: Record<string, string> = {
  autonomous: "Autonome",
  supervised: "Supervisé",
  manual: "Manuel",
};

const roleIcons: Record<string, string> = {
  researcher: "🔍",
  coder: "💻",
  reviewer: "📝",
  writer: "✍️",
  analyst: "📊",
};

const glassCard: React.CSSProperties = {
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg, 12px)",
  padding: "16px",
};

const pill = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "3px 10px",
  borderRadius: "var(--radius-full, 999px)",
  background: `${color}15`,
  color,
  fontSize: "11px",
  fontWeight: 600,
});

// ─── Main Component ─────────────────────────────────────────────────────────

export const CoworkModule = () => {
  const [sessions, setSessions] = useState<CoworkSession[]>([]);
  const [activeSession, setActiveSession] = useState<CoworkSession | null>(
    null,
  );
  const [tab, setTab] = useState<
    "overview" | "plan" | "files" | "agents" | "computer" | "messages"
  >("overview");
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [fileContent, setFileContent] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [computerStatus, setComputerStatus] = useState<any>(null);
  const [messageInput, setMessageInput] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch sessions ────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`${BASE}/api/cowork/sessions`);
      const data = await res.json();
      setSessions(data);
    } catch {
      // Demo data
      setSessions([
        {
          id: "demo-1",
          name: "Rapport Q1 2026",
          status: "completed",
          mode: "autonomous",
          model: "claude-sonnet-4",
          progress: 100,
          iterations: 5,
          tokensUsed: 12400,
          cost: 0.068,
          plan: [
            { title: "Analyse des données", status: "done" },
            { title: "Rédaction du rapport", status: "done" },
            { title: "Génération des graphiques", status: "done" },
            { title: "Relecture et correction", status: "done" },
          ],
          currentStep: 4,
          totalSteps: 4,
          subAgents: [
            {
              id: "sa-1",
              role: "analyst",
              task: "Analyse CSV",
              status: "completed",
              createdAt: new Date().toISOString(),
            },
          ],
          filesModified: [],
          filesCreated: [
            "rapport-q1.md",
            "charts/revenue.svg",
            "charts/users.svg",
          ],
          computerUseEnabled: false,
          pendingApproval: null,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "demo-2",
          name: "Audit Sécurité Frontend",
          status: "active",
          mode: "supervised",
          model: "claude-opus-4",
          progress: 45,
          iterations: 3,
          tokensUsed: 8200,
          cost: 0.12,
          plan: [
            { title: "Scan des dépendances", status: "done" },
            { title: "Analyse du code source", status: "in_progress" },
            { title: "Tests de pénétration", status: "pending" },
            { title: "Rapport de vulnérabilités", status: "pending" },
          ],
          currentStep: 1,
          totalSteps: 4,
          subAgents: [
            {
              id: "sa-2",
              role: "coder",
              task: "Scan npm audit",
              status: "completed",
              createdAt: new Date().toISOString(),
            },
            {
              id: "sa-3",
              role: "reviewer",
              task: "Analyse XSS patterns",
              status: "running",
              createdAt: new Date().toISOString(),
            },
          ],
          filesModified: ["package.json"],
          filesCreated: ["audit-report.md"],
          computerUseEnabled: false,
          pendingApproval: null,
          createdAt: new Date(Date.now() - 1800000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    // Check computer use status
    apiFetch(`${BASE}/api/computer-use/status`)
      .then((r) => r.json())
      .then(setComputerStatus)
      .catch(() =>
        setComputerStatus({
          status: "unavailable",
          platform: "unknown",
          capabilities: [],
        }),
      );
  }, [loadSessions]);

  // ── SSE subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!activeSession) return;
    const es = new EventSource(
      `${BASE}/api/cowork/sessions/${activeSession.id}/stream`,
    );
    eventSourceRef.current = es;

    es.addEventListener("session_update", (e) => {
      const data = JSON.parse(e.data);
      setActiveSession((prev) => (prev ? { ...prev, ...data } : prev));
      addEvent("session_update", data);
    });
    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setActiveSession((prev) =>
        prev ? { ...prev, progress: data.percent } : prev,
      );
      addEvent("progress", data);
    });
    es.addEventListener("plan_update", (e) => {
      const data = JSON.parse(e.data);
      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              plan: data.plan,
              currentStep: data.current,
              totalSteps: data.total,
            }
          : prev,
      );
      addEvent("plan_update", data);
    });
    es.addEventListener("tool_call", (e) =>
      addEvent("tool_call", JSON.parse(e.data)),
    );
    es.addEventListener("tool_result", (e) =>
      addEvent("tool_result", JSON.parse(e.data)),
    );
    es.addEventListener("message", (e) =>
      addEvent("message", JSON.parse(e.data)),
    );
    es.addEventListener("subagent_spawned", (e) => {
      const data = JSON.parse(e.data);
      setActiveSession((prev) =>
        prev ? { ...prev, subAgents: [...prev.subAgents, data] } : prev,
      );
      addEvent("subagent_spawned", data);
    });
    es.addEventListener("subagent_completed", (e) => {
      const data = JSON.parse(e.data);
      setActiveSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subAgents: prev.subAgents.map((sa) =>
            sa.id === data.id ? { ...sa, status: "completed" } : sa,
          ),
        };
      });
      addEvent("subagent_completed", data);
    });
    es.addEventListener("approval_needed", (e) => {
      const data = JSON.parse(e.data);
      setActiveSession((prev) =>
        prev ? { ...prev, pendingApproval: data, status: "paused" } : prev,
      );
      addEvent("approval_needed", data);
    });
    es.addEventListener("completed", (e: any) =>
      addEvent("completed", JSON.parse(e.data)),
    );
    es.addEventListener("error", (e: any) => addEvent("error", JSON.parse(e.data)));

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [activeSession?.id]);

  const addEvent = (type: string, data: any) => {
    setEvents((prev) => [...prev.slice(-100), { type, data }]);
    setTimeout(
      () => eventsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };

  // ── Actions ───────────────────────────────────────────────────────────

  const loadFiles = async (sessionId: string) => {
    try {
      const res = await apiFetch(
        `${BASE}/api/cowork/sessions/${sessionId}/files`,
      );
      setFiles(await res.json());
    } catch {
      setFiles([]);
    }
  };

  const readFile = async (sessionId: string, filePath: string) => {
    try {
      const res = await apiFetch(
        `${BASE}/api/cowork/sessions/${sessionId}/files/${filePath}`,
      );
      setFileContent(await res.json());
    } catch {
      setFileContent({ path: filePath, content: "(erreur de lecture)" });
    }
  };

  const approveAction = async (decision: "approve" | "reject") => {
    if (!activeSession) return;
    await apiFetch(`${BASE}/api/cowork/sessions/${activeSession.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => {});
    setActiveSession((prev) =>
      prev ? { ...prev, pendingApproval: null, status: "active" } : prev,
    );
  };

  const pauseSession = async () => {
    if (!activeSession) return;
    await apiFetch(`${BASE}/api/cowork/sessions/${activeSession.id}/pause`, {
      method: "POST",
    }).catch(() => {});
    setActiveSession((prev) => (prev ? { ...prev, status: "paused" } : prev));
  };

  const resumeSession = async () => {
    if (!activeSession) return;
    await apiFetch(`${BASE}/api/cowork/sessions/${activeSession.id}/resume`, {
      method: "POST",
    }).catch(() => {});
    setActiveSession((prev) => (prev ? { ...prev, status: "active" } : prev));
  };

  const deleteSession = async (id: string) => {
    await apiFetch(`${BASE}/api/cowork/sessions/${id}`, {
      method: "DELETE",
    }).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSession?.id === id) setActiveSession(null);
  };

  const sendMessage = async () => {
    if (!activeSession || !messageInput.trim()) return;
    await apiFetch(`${BASE}/api/cowork/sessions/${activeSession.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageInput }),
    }).catch(() => {});
    addEvent("message", { role: "user", text: messageInput });
    setMessageInput("");
  };

  const takeScreenshot = async () => {
    try {
      const res = await apiFetch(`${BASE}/api/computer-use/screenshot`);
      const data = await res.json();
      setScreenshot(data.screenshot || null);
    } catch {
      setScreenshot(null);
    }
  };

  // ── New Session Dialog ────────────────────────────────────────────────

  const NewSessionDialog = () => {
    const [name, setName] = useState("Nouvelle tâche Cowork");
    const [prompt, setPrompt] = useState("");
    const [mode, setMode] = useState<"autonomous" | "supervised" | "manual">(
      "autonomous",
    );
    const [model, setModel] = useState("claude-sonnet-4-20250514");
    const [computerUse, setComputerUse] = useState(false);

    const create = async () => {
      try {
        const res = await apiFetch(`${BASE}/api/cowork/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, prompt, mode, model, computerUse }),
        });
        const session = await res.json();
        setSessions((prev) => [session, ...prev]);
        setActiveSession(session);
        setShowNewSession(false);
        setEvents([]);
      } catch {
        // Demo: create local session
        const demo: CoworkSession = {
          id: `local-${Date.now()}`,
          name,
          status: "active",
          mode,
          model,
          progress: 0,
          iterations: 0,
          tokensUsed: 0,
          cost: 0,
          plan: [],
          currentStep: 0,
          totalSteps: 0,
          subAgents: [],
          filesModified: [],
          filesCreated: [],
          computerUseEnabled: computerUse,
          pendingApproval: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSessions((prev) => [demo, ...prev]);
        setActiveSession(demo);
        setShowNewSession(false);
        setEvents([]);
      }
    };

    const inputStyle: React.CSSProperties = {
      width: "100%",
      padding: "10px 12px",
      borderRadius: "8px",
      background: "var(--bg-glass)",
      border: "1px solid var(--border-subtle)",
      color: "var(--text-primary)",
      fontSize: "13px",
      outline: "none",
      fontFamily: "inherit",
    };

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
        }}
      >
        <div
          style={{
            ...glassCard,
            width: "520px",
            maxHeight: "80vh",
            overflow: "auto",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>
            Nouvelle Session Cowork
          </h3>

          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "4px",
              display: "block",
            }}
          >
            Nom
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, marginBottom: "12px" }}
          />

          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "4px",
              display: "block",
            }}
          >
            Objectif / Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Décrivez ce que l'agent doit accomplir…"
            style={{ ...inputStyle, resize: "vertical", marginBottom: "12px" }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                  display: "block",
                }}
              >
                Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                style={{ ...inputStyle }}
              >
                <option value="autonomous">🤖 Autonome</option>
                <option value="supervised">👁️ Supervisé</option>
                <option value="manual">🛑 Manuel</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                  display: "block",
                }}
              >
                Modèle LLM
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ ...inputStyle }}
              >
                <option value="claude-sonnet-4-20250514">
                  Claude Sonnet 4
                </option>
                <option value="claude-opus-4-20250918">Claude Opus 4</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="deepseek-chat">DeepSeek V3</option>
              </select>
            </div>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              cursor: "pointer",
              marginBottom: "16px",
            }}
          >
            <input
              type="checkbox"
              checked={computerUse}
              onChange={(e) => setComputerUse(e.target.checked)}
              style={{ accentColor: "var(--brand-primary)" }}
            />
            <Monitor size={14} /> Activer Computer Use (contrôle du bureau)
          </label>

          <div
            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
          >
            <button
              onClick={() => setShowNewSession(false)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Annuler
            </button>
            <button
              onClick={create}
              disabled={!prompt.trim()}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                background: "var(--brand-primary)",
                border: "none",
                color: "#fff",
                cursor: prompt.trim() ? "pointer" : "not-allowed",
                fontSize: "13px",
                fontWeight: 600,
                opacity: prompt.trim() ? 1 : 0.5,
              }}
            >
              <Play
                size={13}
                style={{ verticalAlign: "middle", marginRight: "4px" }}
              />{" "}
              Lancer
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Approval Banner ───────────────────────────────────────────────────

  const ApprovalBanner = ({ approval }: { approval: ApprovalRequest }) => (
    <div
      style={{
        ...glassCard,
        background: "rgba(245, 158, 11, 0.08)",
        borderColor: "rgba(245, 158, 11, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <AlertTriangle size={20} color="#f59e0b" />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "13px" }}>
          Approbation requise
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          Action :{" "}
          <code
            style={{
              background: "rgba(255,255,255,0.08)",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          >
            {approval.action}
          </code>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          {approval.reason}
        </div>
        {approval.risk && (
          <span
            style={pill(
              approval.risk === "high"
                ? "#ef4444"
                : approval.risk === "medium"
                  ? "#f59e0b"
                  : "#10b981",
            )}
          >
            {approval.risk}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={() => approveAction("approve")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            background: "rgba(16,185,129,0.15)",
            color: "#10b981",
            border: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          <CheckCircle2
            size={13}
            style={{ verticalAlign: "middle", marginRight: "4px" }}
          />{" "}
          Approuver
        </button>
        <button
          onClick={() => approveAction("reject")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
            border: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          <XCircle
            size={13}
            style={{ verticalAlign: "middle", marginRight: "4px" }}
          />{" "}
          Rejeter
        </button>
      </div>
    </div>
  );

  // ── Sub-components ────────────────────────────────────────────────────

  const PlanView = ({ plan }: { plan: PlanStep[] }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {plan.length === 0 && (
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: "13px",
            fontStyle: "italic",
          }}
        >
          L'agent n'a pas encore créé de plan…
        </div>
      )}
      {plan.map((step, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 12px",
            borderRadius: "8px",
            background:
              step.status === "in_progress"
                ? "rgba(139,92,246,0.08)"
                : step.status === "done"
                  ? "rgba(16,185,129,0.05)"
                  : "transparent",
          }}
        >
          {step.status === "done" ? (
            <CheckCircle2 size={16} color="#10b981" />
          ) : step.status === "in_progress" ? (
            <Loader2 size={16} color="#8b5cf6" className="spin" />
          ) : step.status === "skipped" ? (
            <XCircle size={16} color="#6b7280" />
          ) : (
            <Clock size={16} color="var(--text-secondary)" />
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: step.status === "in_progress" ? 600 : 400,
              }}
            >
              {step.title}
            </div>
            {step.detail && (
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                {step.detail}
              </div>
            )}
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            #{i + 1}
          </span>
        </div>
      ))}
    </div>
  );

  const SubAgentsView = ({ agents }: { agents: SubAgent[] }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {agents.length === 0 && (
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: "13px",
            fontStyle: "italic",
          }}
        >
          Aucun sous-agent actif
        </div>
      )}
      {agents.map((sa) => (
        <div
          key={sa.id}
          style={{
            ...glassCard,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{roleIcons[sa.role] || "🤖"}</span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "capitalize",
              }}
            >
              {sa.role}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {sa.task}
            </div>
          </div>
          <span
            style={pill(
              sa.status === "completed"
                ? "#10b981"
                : sa.status === "running"
                  ? "#8b5cf6"
                  : "#ef4444",
            )}
          >
            {sa.status === "running" && <Loader2 size={10} className="spin" />}
            {sa.status}
          </span>
        </div>
      ))}
    </div>
  );

  const FilesView = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
        <button
          onClick={() => activeSession && loadFiles(activeSession.id)}
          style={{
            padding: "5px 12px",
            borderRadius: "6px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          <RotateCcw
            size={12}
            style={{ verticalAlign: "middle", marginRight: "4px" }}
          />{" "}
          Rafraîchir
        </button>
      </div>
      {files.length === 0 && (
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: "13px",
            fontStyle: "italic",
          }}
        >
          Workspace vide — l'agent n'a pas encore créé de fichiers.
        </div>
      )}
      {files.map((f) => (
        <div
          key={f.path}
          onClick={() =>
            f.type === "file" &&
            activeSession &&
            readFile(activeSession.id, f.path)
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 10px",
            borderRadius: "6px",
            cursor: f.type === "file" ? "pointer" : "default",
            background:
              fileContent?.path === f.path
                ? "rgba(139,92,246,0.08)"
                : "transparent",
          }}
        >
          {f.type === "directory" ? (
            <FolderOpen size={14} color="#f59e0b" />
          ) : (
            <FileText size={14} color="var(--text-secondary)" />
          )}
          <span style={{ fontSize: "13px" }}>{f.name}</span>
        </div>
      ))}
      {fileContent && (
        <div style={{ marginTop: "12px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              marginBottom: "6px",
              color: "var(--text-secondary)",
            }}
          >
            {fileContent.path}
          </div>
          <pre
            style={{
              ...glassCard,
              fontSize: "12px",
              fontFamily: "'Fira Code', monospace",
              overflow: "auto",
              maxHeight: "300px",
              whiteSpace: "pre-wrap",
            }}
          >
            {fileContent.content}
          </pre>
        </div>
      )}
    </div>
  );

  const ComputerUseView = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Monitor size={18} color="var(--brand-primary)" />
        <span style={{ fontWeight: 600 }}>Computer Use</span>
        <span
          style={pill(
            computerStatus?.capabilities?.length > 0 ? "#10b981" : "#6b7280",
          )}
        >
          {computerStatus?.platform || "?"} —{" "}
          {computerStatus?.capabilities?.length || 0} capacités
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: "8px",
        }}
      >
        {[
          { label: "Screenshot", icon: Camera, action: takeScreenshot },
          { label: "Clic gauche", icon: MousePointer2, action: () => {} },
          { label: "Saisir texte", icon: Keyboard, action: () => {} },
          { label: "Scroll", icon: ChevronDown, action: () => {} },
        ].map((a) => (
          <button
            key={a.label}
            onClick={a.action}
            style={{
              ...glassCard,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              padding: "12px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            <a.icon size={18} />
            {a.label}
          </button>
        ))}
      </div>

      {screenshot && (
        <div style={{ ...glassCard }}>
          <div
            style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}
          >
            Dernier screenshot
          </div>
          {screenshot === "demo" ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: "13px",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "8px",
              }}
            >
              📸 Screenshot simulé — activez le bridge natif pour les captures
              réelles
            </div>
          ) : (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Screenshot"
              style={{
                width: "100%",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            />
          )}
        </div>
      )}

      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
        <strong>Capacités détectées :</strong>{" "}
        {computerStatus?.capabilities?.join(", ") || "aucune"}
      </div>
    </div>
  );

  const MessagesView = () => {
    const messages = events.filter(
      (e) =>
        e.type === "message" ||
        e.type === "tool_call" ||
        e.type === "tool_result" ||
        e.type === "error",
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div
          style={{
            flex: 1,
            maxHeight: "400px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: "13px",
                fontStyle: "italic",
              }}
            >
              Aucun message dans cette session…
            </div>
          )}
          {messages.map((ev, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "8px",
                padding: "6px 10px",
                borderRadius: "8px",
                background:
                  ev.type === "error"
                    ? "rgba(239,68,68,0.05)"
                    : ev.data?.role === "user"
                      ? "rgba(139,92,246,0.05)"
                      : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color:
                    ev.type === "tool_call"
                      ? "#f59e0b"
                      : ev.type === "tool_result"
                        ? "#10b981"
                        : ev.type === "error"
                          ? "#ef4444"
                          : "var(--text-secondary)",
                  textTransform: "uppercase",
                  minWidth: "60px",
                }}
              >
                {ev.type}
              </span>
              <span style={{ fontSize: "12px", wordBreak: "break-word" }}>
                {ev.data?.text ||
                  ev.data?.name ||
                  ev.data?.error ||
                  JSON.stringify(ev.data).slice(0, 200)}
              </span>
            </div>
          ))}
          <div ref={eventsEndRef} />
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Envoyer un message à l'agent…"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: "13px",
              outline: "none",
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              background: "var(--brand-primary)",
              border: "none",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────

  const activeBtnStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: "var(--radius-full, 999px)",
    background: isActive ? "var(--brand-primary)" : "rgba(255,255,255,0.05)",
    color: isActive ? "#fff" : "var(--text-secondary)",
    border: isActive ? "none" : "1px solid var(--border-subtle)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: isActive ? 600 : 400,
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  return (
    <div
      style={{ display: "flex", gap: "20px", minHeight: "calc(100vh - 120px)" }}
    >
      {showNewSession && <NewSessionDialog />}

      {/* ── Left: Session List ──────────────────────────────────────────── */}
      <div
        style={{
          width: "280px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Layers size={20} color="var(--brand-primary)" />
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Cowork</h2>
          </div>
          <button
            onClick={() => setShowNewSession(true)}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-full, 999px)",
              background: "var(--brand-primary)",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Plus size={13} /> Nouvelle
          </button>
        </div>

        {sessions.length === 0 && (
          <div
            style={{
              ...glassCard,
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: "13px",
            }}
          >
            Aucune session. Cliquez sur "Nouvelle" pour démarrer.
          </div>
        )}

        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => {
              setActiveSession(s);
              setEvents([]);
              setFiles([]);
              setFileContent(null);
            }}
            style={{
              ...glassCard,
              padding: "12px",
              cursor: "pointer",
              borderColor:
                activeSession?.id === s.id
                  ? "var(--brand-primary)"
                  : "var(--border-subtle)",
              background:
                activeSession?.id === s.id
                  ? "rgba(139,92,246,0.06)"
                  : "var(--bg-glass)",
              transition: "all 0.15s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "13px" }}>
                {s.name}
              </span>
              <span style={pill(statusColors[s.status] || "#6b7280")}>
                {statusLabels[s.status]}
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: "4px",
                borderRadius: "2px",
                background: "rgba(255,255,255,0.06)",
                marginBottom: "6px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${s.progress}%`,
                  background: statusColors[s.status],
                  borderRadius: "2px",
                  transition: "width 0.3s",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                fontSize: "11px",
                color: "var(--text-secondary)",
              }}
            >
              <span>{modeLabels[s.mode]}</span>
              <span>•</span>
              <span>{s.iterations} iter.</span>
              <span>•</span>
              <span>${s.cost.toFixed(3)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Right: Session Detail ──────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {!activeSession ? (
          <div
            style={{
              ...glassCard,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              color: "var(--text-secondary)",
            }}
          >
            <Layers size={40} opacity={0.3} />
            <div style={{ fontSize: "15px" }}>
              Sélectionnez une session ou créez-en une nouvelle
            </div>
            <button
              onClick={() => setShowNewSession(true)}
              style={{
                padding: "8px 20px",
                borderRadius: "var(--radius-full, 999px)",
                background: "var(--brand-primary)",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <Plus
                size={13}
                style={{ verticalAlign: "middle", marginRight: "4px" }}
              />{" "}
              Nouvelle session Cowork
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
                  {activeSession.name}
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "4px",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={pill(statusColors[activeSession.status])}>
                    {statusLabels[activeSession.status]}
                  </span>
                  <span>{modeLabels[activeSession.mode]}</span>
                  <span>•</span>
                  <span>{activeSession.model}</span>
                  <span>•</span>
                  <span>
                    {activeSession.iterations}/
                    {activeSession.maxIterations || MAX_ITER_DEFAULT} iter.
                  </span>
                  <span>•</span>
                  <span>
                    {activeSession.tokensUsed.toLocaleString()} tokens
                  </span>
                  <span>•</span>
                  <span>${activeSession.cost.toFixed(4)}</span>
                  {activeSession.computerUseEnabled && (
                    <span style={pill("#8b5cf6")}>
                      <Monitor size={10} /> Computer Use
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {activeSession.status === "active" && (
                  <button
                    onClick={pauseSession}
                    style={{ ...activeBtnStyle(false) }}
                  >
                    <Pause size={13} /> Pause
                  </button>
                )}
                {activeSession.status === "paused" &&
                  !activeSession.pendingApproval && (
                    <button
                      onClick={resumeSession}
                      style={{ ...activeBtnStyle(true) }}
                    >
                      <Play size={13} /> Reprendre
                    </button>
                  )}
                <button
                  onClick={() => deleteSession(activeSession.id)}
                  style={{ ...activeBtnStyle(false), color: "#ef4444" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: "6px",
                borderRadius: "3px",
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${activeSession.progress}%`,
                  background: `linear-gradient(90deg, var(--brand-primary), ${statusColors[activeSession.status]})`,
                  borderRadius: "3px",
                  transition: "width 0.5s",
                }}
              />
            </div>

            {/* Approval banner */}
            {activeSession.pendingApproval && (
              <ApprovalBanner approval={activeSession.pendingApproval} />
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(
                [
                  { key: "overview", icon: BarChart3, label: "Vue d'ensemble" },
                  { key: "plan", icon: ListTodo, label: "Plan" },
                  { key: "files", icon: FolderOpen, label: "Fichiers" },
                  { key: "agents", icon: Users, label: "Sous-agents" },
                  { key: "computer", icon: Monitor, label: "Computer Use" },
                  { key: "messages", icon: MessageSquare, label: "Messages" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    if (t.key === "files") loadFiles(activeSession.id);
                  }}
                  style={activeBtnStyle(tab === t.key)}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div
              style={{
                ...glassCard,
                flex: 1,
                minHeight: "300px",
                overflow: "auto",
              }}
            >
              {tab === "overview" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <StatCard
                    icon={Activity}
                    label="Progression"
                    value={`${activeSession.progress}%`}
                    color="#8b5cf6"
                  />
                  <StatCard
                    icon={Zap}
                    label="Itérations"
                    value={`${activeSession.iterations}`}
                    color="#f59e0b"
                  />
                  <StatCard
                    icon={Cpu}
                    label="Tokens"
                    value={activeSession.tokensUsed.toLocaleString()}
                    color="#10b981"
                  />
                  <StatCard
                    icon={BarChart3}
                    label="Coût"
                    value={`$${activeSession.cost.toFixed(4)}`}
                    color="#3b82f6"
                  />
                  <StatCard
                    icon={FileText}
                    label="Fichiers créés"
                    value={`${activeSession.filesCreated.length}`}
                    color="#f97316"
                  />
                  <StatCard
                    icon={Users}
                    label="Sous-agents"
                    value={`${activeSession.subAgents.length}`}
                    color="#ec4899"
                  />

                  {/* Mini plan in overview */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "8px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Plan de travail
                    </div>
                    <PlanView plan={activeSession.plan} />
                  </div>

                  {/* Recent events */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "8px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Événements récents
                    </div>
                    <div
                      style={{
                        maxHeight: "200px",
                        overflow: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      {events.slice(-10).map((ev, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: "11px",
                            display: "flex",
                            gap: "6px",
                            padding: "3px 0",
                          }}
                        >
                          <span
                            style={{
                              color:
                                ev.type === "error"
                                  ? "#ef4444"
                                  : "var(--text-secondary)",
                              fontWeight: 600,
                              minWidth: "80px",
                            }}
                          >
                            {ev.type}
                          </span>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {ev.data?.message ||
                              ev.data?.text ||
                              ev.data?.name ||
                              JSON.stringify(ev.data).slice(0, 100)}
                          </span>
                        </div>
                      ))}
                      {events.length === 0 && (
                        <div
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: "12px",
                            fontStyle: "italic",
                          }}
                        >
                          En attente d'événements…
                        </div>
                      )}
                      <div ref={eventsEndRef} />
                    </div>
                  </div>
                </div>
              )}
              {tab === "plan" && <PlanView plan={activeSession.plan} />}
              {tab === "files" && <FilesView />}
              {tab === "agents" && (
                <SubAgentsView agents={activeSession.subAgents} />
              )}
              {tab === "computer" && <ComputerUseView />}
              {tab === "messages" && <MessagesView />}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── StatCard ───────────────────────────────────────────────────────────────

const MAX_ITER_DEFAULT = 25;

const StatCard = ({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) => (
  <div
    style={{
      background: `${color}08`,
      border: `1px solid ${color}20`,
      borderRadius: "10px",
      padding: "14px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    }}
  >
    <div
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        background: `${color}15`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={18} color={color} />
    </div>
    <div>
      <div style={{ fontSize: "18px", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
        {label}
      </div>
    </div>
  </div>
);
