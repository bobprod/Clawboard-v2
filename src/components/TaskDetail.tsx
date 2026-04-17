import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useSSE } from "../hooks/useSSE";
import { mockTasks } from "../data/mockData";
import type { Task } from "../data/mockData";
import {
  Terminal,
  Shield,
  ArrowLeft,
  Clock,
  Zap,
  MoreVertical,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Dropdown } from "./Dropdown";

const BASE = "http://localhost:4000";

interface LogLine {
  line: string;
  ts: string;
}

const LOG_COLORS: Record<string, string> = {
  "[BOOT]": "#6366f1",
  "[INIT]": "#8b5cf6",
  "[NET]": "#3b82f6",
  "[LLM]": "#10b981",
  "[EXEC]": "#a1a1aa",
  WARNING: "#f59e0b",
  "[ERROR]": "#ef4444",
};
const lineColor = (l: string) => {
  for (const [k, v] of Object.entries(LOG_COLORS)) if (l.includes(k)) return v;
  return "#71717a";
};

export const TaskDetail = () => {
  const { taskId } = useParams();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logConnected, setLogConnected] = useState(false);

  const { data: liveTasks } = useSSE<Task[] | null>(
    "/api/tasks?stream=1",
    null,
  );
  const task =
    liveTasks?.find((t) => t.id === taskId) ??
    mockTasks.find((t) => t.id === taskId) ??
    mockTasks[1];

  useEffect(() => {
    if (!taskId) return;
    setLogs([]);
    const es = new EventSource(`${BASE}/api/logs/${taskId}`);
    es.onopen = () => setLogConnected(true);
    es.onmessage = (e) => {
      try {
        setLogs((p) => [...p, JSON.parse(e.data)]);
      } catch (_) {}
    };
    es.onerror = () => {
      setLogConnected(false);
      es.close();
    };
    return () => es.close();
  }, [taskId]);

  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Link
          to="/tasks"
          style={{
            display: "flex",
            padding: "10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "12px",
            color: "var(--text-secondary)",
            transition: "all 0.2s",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.background = "var(--bg-surface-elevated)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.background = "var(--bg-surface)";
          }}
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "2px" }}>
            {task.title}
          </h2>
          <div
            className="text-muted"
            style={{ fontFamily: "var(--mono)", fontSize: "12px" }}
          >
            ID: {task.id} • AGENT: {task.agentId} • MODE:{" "}
            {task.llmMode.toUpperCase()}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
          <div
            className="glass-panel"
            style={{
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}
          >
            <Zap size={16} color="var(--status-success)" />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontWeight: 600,
                color: "var(--status-success)",
              }}
            >
              ${task.cost || "0.00"}
            </span>
          </div>
          <div
            className="glass-panel"
            style={{
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid rgba(59, 130, 246, 0.2)",
            }}
          >
            <Terminal size={16} color="var(--brand-primary)" />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontWeight: 600,
                color: "var(--brand-primary)",
              }}
            >
              {task.tokensUsed
                ? task.tokensUsed.prompt + task.tokensUsed.completion
                : 0}{" "}
              tkns
            </span>
          </div>

          <Dropdown
            trigger={
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--border-subtle)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s",
                  marginLeft: "8px",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                }}
              >
                Actions <MoreVertical size={16} />
              </button>
            }
            items={[
              {
                icon: Terminal,
                label: "Copier les logs (JSON)",
                onClick: () => console.log("Copier logs"),
              },
              {
                icon: Zap,
                label: "Relancer la tâche",
                onClick: () => console.log("Relancer"),
              },
              {
                icon: Trash2,
                label: "Archiver / Supprimer",
                danger: true,
                onClick: () => console.log("Supprimer"),
              },
            ]}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "24px", flexGrow: 1, minHeight: 0 }}>
        {/* Terminal Stdout */}
        <div
          className="glass-panel"
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              gap: "12px",
              alignItems: "center",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <Terminal size={18} color="var(--text-secondary)" />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              Live Terminal (stdout)
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontWeight: 600,
                color: logConnected ? "#10b981" : "#ef4444",
              }}
            >
              {logConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {logConnected ? "STREAMING" : "DÉCONNECTÉ"}
            </span>
          </div>
          <div
            ref={terminalRef}
            style={{
              flexGrow: 1,
              background: "#050510",
              padding: "20px",
              fontFamily: "var(--mono)",
              fontSize: "12px",
              lineHeight: "1.7",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {logs.length === 0 && (
              <div style={{ color: "#3b82f6", opacity: 0.6 }}>
                {logConnected
                  ? "Connexion au flux..."
                  : "— Backend hors ligne — démarrez server.mjs —"}
              </div>
            )}
            {logs.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    color: "#2d2d3a",
                    flexShrink: 0,
                    fontSize: "10px",
                    marginTop: "2px",
                    minWidth: "65px",
                  }}
                >
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <span style={{ color: lineColor(entry.line) }}>
                  {entry.line}
                </span>
              </div>
            ))}
            {logConnected && (
              <span style={{ color: "#3b82f6", marginTop: "4px" }}>▋</span>
            )}
          </div>
        </div>

        {/* Timeline d'activité */}
        <div
          className="glass-panel"
          style={{
            width: "350px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            overflowY: "auto",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              marginTop: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Shield size={18} color="var(--brand-accent)" />
            Routing Sécurité
          </h3>
          <div
            style={{
              background: "rgba(139, 92, 246, 0.05)",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid rgba(139, 92, 246, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Moteur Gérant Actif
              </div>
              <div
                style={{
                  fontSize: "11px",
                  background: "var(--brand-accent)",
                  color: "#fff",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                P2P
              </div>
            </div>
            <div
              style={{
                fontWeight: 600,
                color: "var(--brand-accent)",
                textTransform: "capitalize",
                fontSize: "1.1rem",
              }}
            >
              {task.llmMode} LLM
            </div>
          </div>

          <h3
            style={{
              fontSize: "1.1rem",
              marginTop: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Terminal size={18} color="var(--brand-primary)" />
            Canal de Livraison
          </h3>
          <div
            style={{
              background: "rgba(59, 130, 246, 0.05)",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Plateforme Cible
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--brand-primary)",
                  textTransform: "capitalize",
                  fontSize: "1rem",
                }}
              >
                {task.channelTarget.platform}
              </div>
            </div>
            <div
              style={{
                background: "rgba(0,0,0,0.3)",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                  fontWeight: 600,
                }}
              >
                ID du Chat / Webhook
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "13px",
                  color: "#fff",
                  wordBreak: "break-all",
                }}
              >
                {task.channelTarget.targetId}
              </div>
            </div>
          </div>

          <h3
            style={{
              fontSize: "1.1rem",
              marginTop: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Clock size={18} />
            Timeline Analytique
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              position: "relative",
              marginLeft: "8px",
              marginTop: "8px",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "7px",
                top: "10px",
                bottom: "10px",
                width: "2px",
                background: "var(--border-subtle)",
              }}
            ></div>

            <div style={{ display: "flex", gap: "16px", position: "relative" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "var(--bg-surface)",
                  border: "2px solid var(--text-secondary)",
                  zIndex: 1,
                  marginTop: "2px",
                }}
              ></div>
              <div>
                <div style={{ fontWeight: 500, fontSize: "14px" }}>
                  Tâche Créée
                </div>
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  {new Date(task.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "16px", position: "relative" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "var(--bg-surface)",
                  border: "2px solid var(--brand-primary)",
                  zIndex: 1,
                  marginTop: "2px",
                }}
              ></div>
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "14px",
                    color: "var(--brand-primary)",
                  }}
                >
                  Routage Actif (Privacy)
                </div>
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  Analysée par NemoClaw Router
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "16px", position: "relative" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "var(--bg-surface)",
                  border: `2px solid ${task.status === "completed" ? "var(--status-success)" : "var(--text-secondary)"}`,
                  zIndex: 1,
                  marginTop: "2px",
                }}
              ></div>
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "14px",
                    color:
                      task.status === "completed"
                        ? "var(--status-success)"
                        : "var(--text-primary)",
                  }}
                >
                  Livraison Terminée
                </div>
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  {task.completedAt
                    ? new Date(task.completedAt).toLocaleTimeString()
                    : "En attente..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
