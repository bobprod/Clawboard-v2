import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useSSE } from "../hooks/useSSE";
import { apiFetch } from "../lib/apiFetch";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { Task } from "../data/mockData";
import {
  Play,
  Plus,
  MoreVertical,
  Trash2,
  RefreshCw,
  FileText,
  Repeat,
  BookOpen,
  Archive,
  ChevronRight,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Save,
  X,
  Terminal,
  Shield,
  Check,
  Search,
  Layers,
  HelpCircle,
  Copy,
  RotateCcw,
  Download,
  AlertTriangle,
} from "lucide-react";
import { Dropdown } from "./Dropdown";
import { TasksTour, resetTasksTour } from "./TasksTour";
import { TaskChatDrawer, ChatTriggerBtn, useTaskChat } from "./TaskChatDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Modele {
  id: string;
  name: string;
  skillName: string;
  instructions: string;
  agent: string;
  canal: string;
  destinataire: string;
  llmModel: string;
  disablePreInstructions: boolean;
  executionCount: number;
}

interface Recurrence {
  id: string;
  name: string;
  cronExpr: string;
  human: string;
  timezone: string;
  modeleId: string;
  llmModel: string;
  active: boolean;
  nextRun: string;
}

interface PreInstructions {
  content: string;
  savedAt: string;
}

interface ArchiveEntry {
  id: string;
  // backend fields
  taskName?: string;
  skillName?: string;
  startedAt?: string;
  promptTokens?: number;
  completionTokens?: number;
  exitCode?: number;
  // legacy / computed
  name?: string;
  date?: string;
  duration: number;
  tokens?: number;
  cost: number | string;
  status: string;
  modeleId?: string;
  llmModel?: string;
}

type TabId =
  | "taches"
  | "modeles"
  | "recurrences"
  | "preinstructions"
  | "archives";

const BASE = "http://localhost:4000";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "taches", label: "Tâches", icon: <Play size={15} /> },
  { id: "modeles", label: "Modèles", icon: <FileText size={15} /> },
  { id: "recurrences", label: "Récurrences", icon: <Repeat size={15} /> },
  {
    id: "preinstructions",
    label: "Pré-instructions",
    icon: <BookOpen size={15} />,
  },
  { id: "archives", label: "Archives", icon: <Archive size={15} /> },
];

const STATUS_COLOR: Record<string, string> = {
  planned: "#a1a1aa",
  pending: "#a1a1aa",
  running: "#3b82f6",
  completed: "#10b981",
  failed: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = {
  planned: "Planifié",
  pending: "En attente",
  running: "En cours",
  completed: "Terminé",
  failed: "Échoué",
};

function modelShortName(m: string | undefined) {
  if (!m) return "—";
  if (m.includes("claude")) return "Claude";
  if (m.includes("kimi")) return "Kimi";
  if (m.includes("ollama")) return "Local";
  return m.split("/").pop()?.slice(0, 8) || m;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#a1a1aa";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "11px",
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: "20px",
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          boxShadow: status === "running" ? `0 0 6px ${color}` : "none",
          animation: status === "running" ? "pulse 1.5s infinite" : "none",
        }}
      />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Tag({
  label,
  color = "var(--brand-primary)",
  bg,
}: {
  label: string;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontFamily: "var(--mono)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "5px",
        background: bg ?? `${color}18`,
        color,
      }}
    >
      {label}
    </span>
  );
}

// ─── Kanban columns config ────────────────────────────────────────────────────

const KANBAN_COLS = [
  { status: "planned", label: "Planifié", color: "#a1a1aa" },
  { status: "running", label: "En cours", color: "#3b82f6" },
  { status: "completed", label: "Terminé", color: "#10b981" },
  { status: "failed", label: "Échoué", color: "#ef4444" },
];

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({
  task,
  onDragStart,
  onSelect,
}: {
  task: Task;
  onDragStart: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const color = STATUS_COLOR[task.status] ?? "#a1a1aa";
  const name = (task as any).name || task.title || task.id;
  const skill = (task as any).skillName || (task as any).skill || "";
  const agent = (task as any).agent || "";
  const cost = (task as any).cost;
  const tokens = (task as any).tokensUsed;
  const totalTokens = tokens
    ? (tokens.prompt ?? 0) + (tokens.completion ?? 0)
    : 0;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onClick={() => onSelect(task.id)}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid var(--border-subtle)`,
        borderTop: `3px solid ${color}`,
        borderRadius: "12px",
        padding: "14px",
        cursor: "pointer",
        userSelect: "none",
        transition: "box-shadow 0.2s, transform 0.15s",
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          `0 4px 20px ${color}30`;
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.borderColor = color + "60";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.transform = "none";
        (e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-subtle)";
      }}
    >
      {/* Name + status dot */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
          gap: 6,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            lineHeight: 1.35,
            flex: 1,
          }}
        >
          {name}
        </div>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
            marginTop: 4,
            boxShadow: task.status === "running" ? `0 0 6px ${color}` : "none",
            animation:
              task.status === "running" ? "pulse 1.5s infinite" : "none",
          }}
        />
      </div>

      {/* ID pill */}
      <div
        style={{
          fontSize: "10px",
          color: "var(--text-muted)",
          fontFamily: "monospace",
          marginBottom: 8,
          opacity: 0.7,
        }}
      >
        {task.id}
      </div>

      {/* Skill + agent badges */}
      <div
        style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}
      >
        {skill && <Tag label={skill} />}
        {agent && <Tag label={agent} color="#8b5cf6" />}
      </div>

      {/* Footer: date + cost */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <div
          style={{
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          {new Date(task.createdAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {totalTokens > 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
              {(totalTokens / 1000).toFixed(1)}k tk
            </span>
          )}
          {cost > 0 && (
            <span
              style={{ fontSize: "10px", color: "#10b981", fontWeight: 600 }}
            >
              ${Number(cost).toFixed(4)}
            </span>
          )}
        </div>
      </div>

      {/* Running progress bar */}
      {task.status === "running" && (
        <div
          style={{
            marginTop: 8,
            height: 2,
            background: "var(--border-subtle)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              background: color,
              width: "60%",
              animation: "progressSlide 1.5s ease-in-out infinite",
              borderRadius: 2,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

function KanbanView({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Sync when server pushes updates (but not while dragging)
  useEffect(() => {
    if (!dragging) setLocalTasks(tasks);
  }, [tasks, dragging]);

  const handleDrop = async (targetStatus: string) => {
    if (!dragging || dragging === targetStatus) return;
    const task = localTasks.find((t) => t.id === dragging);
    if (!task || task.status === targetStatus) {
      setDragging(null);
      setDragOver(null);
      return;
    }

    // Optimistic update
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === dragging ? { ...t, status: targetStatus as any } : t,
      ),
    );
    setDragging(null);
    setDragOver(null);

    // Persist
    await apiFetch(`${BASE}/api/tasks/${dragging}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus }),
    }).catch(() => {});
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
        alignItems: "flex-start",
      }}
    >
      {KANBAN_COLS.map((col) => {
        const colTasks = localTasks.filter((t) => t.status === col.status);
        const isOver = dragOver === col.status;
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.status);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(col.status)}
            style={{
              background: isOver ? `${col.color}12` : "rgba(255,255,255,0.02)",
              border: `1px solid ${isOver ? col.color + "55" : "var(--border-subtle)"}`,
              borderRadius: "16px",
              padding: "16px",
              minHeight: "200px",
              transition: "all 0.2s",
              boxShadow: isOver ? `0 0 20px ${col.color}22` : "none",
            }}
          >
            {/* Column header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "14px",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: col.color,
                  boxShadow:
                    col.status === "running" ? `0 0 8px ${col.color}` : "none",
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "12px",
                  color: col.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {col.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  background: `${col.color}22`,
                  color: col.color,
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "10px",
                }}
              >
                {colTasks.length}
              </span>
            </div>

            {/* Drop zone hint */}
            {isOver && dragging && (
              <div
                style={{
                  border: `2px dashed ${col.color}77`,
                  borderRadius: "10px",
                  padding: "16px",
                  textAlign: "center",
                  fontSize: "12px",
                  color: col.color,
                  marginBottom: "10px",
                  background: `${col.color}08`,
                }}
              >
                Déposer ici
              </div>
            )}

            {/* Cards */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {colTasks.length === 0 && !isOver && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: "12px",
                    opacity: 0.4,
                    padding: "20px 0",
                  }}
                >
                  Vide
                </div>
              )}
              {colTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onDragStart={setDragging}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Tâches (list + kanban) ─────────────────────────────────────────────

function TabTaches({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const { chatCtx, openChat, closeChat } = useTaskChat();

  const handleClone = (task: Task) => {
    const t = task as any;
    navigate("/tasks/new", {
      state: {
        prefill: {
          name: `Copie — ${t.name || task.title || ""}`,
          instructions: t.instructions ?? t.description ?? "",
          skillName: t.skillName ?? "",
          llmModel: t.llmModel ?? task.llmMode ?? "",
          agent: t.agent ?? t.agentId ?? "main",
          canal: t.channelTarget?.platform ?? t.canal ?? "telegram",
          destinataire: t.channelTarget?.targetId ?? t.destinataire ?? "",
          timeoutMin: t.timeoutMin ?? 30,
          objectives: t.objectives ?? [],
          disablePreInstructions: t.disablePreInstructions ?? false,
        },
      },
    });
  };

  const handleReplay = async (task: Task) => {
    setReplayingId(task.id);
    try {
      await apiFetch(`${BASE}/api/tasks/${task.id}/run`, { method: "POST" });
      onSelect(task.id);
    } catch {}
    setReplayingId(null);
  };

  // Navigate to TaskCreator pre-filled with task params (Rejouer = new run from scratch)
  const handleReplayNavigate = (task: Task) => {
    const t = task as any;
    navigate("/tasks/new", {
      state: {
        prefill: {
          name: t.name || task.title || "",
          instructions: t.instructions ?? t.description ?? "",
          skillName: t.skillName ?? "",
          llmModel: t.llmModel ?? (task as any).llmMode ?? "",
          agent: t.agent ?? t.agentId ?? "main",
          canal: t.channelTarget?.platform ?? t.canal ?? "telegram",
          destinataire: t.channelTarget?.targetId ?? t.destinataire ?? "",
          timeoutMin: t.timeoutMin ?? 30,
          objectives: t.objectives ?? [],
          disablePreInstructions: t.disablePreInstructions ?? false,
        },
      },
    });
  };
  const statuses = ["all", "running", "planned", "completed", "failed"];

  const filtered = tasks
    .filter((t) => filter === "all" || t.status === filter)
    .filter(
      (t) =>
        !search.trim() ||
        [
          (t as any).name || t.title || "",
          t.id,
          (t as any).skillName || "",
          (t as any).agent || "",
        ].some((s) => s.toLowerCase().includes(search.toLowerCase())),
    );

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Search bar */}
        <div data-tour="tasks-search" style={{ position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ID, skill, agent…"
            style={{
              width: "100%",
              padding: "9px 12px 9px 34px",
              borderRadius: 10,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: "0.875rem",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--brand-accent)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-subtle)")
            }
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Filter bar */}
          <div
            data-tour="tasks-filters"
            style={{
              display: "flex",
              gap: "4px",
              background: "var(--bg-glass)",
              padding: "4px",
              borderRadius: "999px",
              border: "1px solid var(--border-subtle)",
              flexWrap: "wrap",
            }}
          >
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  background:
                    filter === s
                      ? s === "all"
                        ? "var(--brand-primary)"
                        : STATUS_COLOR[s]
                      : "transparent",
                  color: filter === s ? "#fff" : "var(--text-secondary)",
                  border: "none",
                  padding: "5px 14px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "12px",
                  transition: "all 0.2s",
                }}
              >
                {s === "all" ? "Toutes" : STATUS_LABEL[s]}{" "}
                <span style={{ opacity: 0.7, fontSize: "10px" }}>
                  (
                  {s === "all"
                    ? tasks.length
                    : tasks.filter((t) => t.status === s).length}
                  )
                </span>
              </button>
            ))}
          </div>

          {search && (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
            </span>
          )}

          {/* View toggle */}
          <div
            data-tour="tasks-view-toggle"
            style={{
              display: "flex",
              gap: "2px",
              background: "var(--bg-glass)",
              padding: "4px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              marginLeft: "auto",
            }}
          >
            {(
              [
                ["list", "☰ Liste"],
                ["kanban", "⊞ Kanban"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "7px",
                  border: "none",
                  background:
                    view === v ? "rgba(139,92,246,0.2)" : "transparent",
                  color:
                    view === v
                      ? "var(--brand-accent)"
                      : "var(--text-secondary)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "12px",
                  transition: "all 0.2s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {view === "kanban" ? (
          <KanbanView tasks={filtered} onSelect={onSelect} />
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {filtered.length === 0 && (
              <div
                style={{
                  color: "var(--text-secondary)",
                  padding: "40px",
                  textAlign: "center",
                  opacity: 0.5,
                }}
              >
                Aucune tâche dans cette catégorie
              </div>
            )}
            {filtered.map((task) => {
              const name = (task as any).name || task.title || task.id;
              const skill =
                (task as any).skillName || (task as any).skill || "";
              const agent = (task as any).agent || "";
              const llm = modelShortName(
                (task as any).llmModel ?? task.llmMode,
              );
              const cost = (task as any).cost;
              const tokens = (task as any).tokensUsed;
              const totalTokens = tokens
                ? (tokens.prompt ?? 0) + (tokens.completion ?? 0)
                : 0;
              const color = STATUS_COLOR[task.status] ?? "#a1a1aa";
              return (
                <div
                  key={task.id}
                  className="glass-panel"
                  onClick={() => onSelect(task.id)}
                  style={{
                    padding: "14px 18px",
                    borderRadius: "12px",
                    borderLeft: `4px solid ${color}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "all 0.18s",
                    cursor: "pointer",
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLElement).style.transform =
                      "translateX(3px)";
                    (e.currentTarget as HTMLElement).style.borderLeftColor =
                      color;
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      `2px 0 12px ${color}22`;
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "none";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <StatusBadge status={task.status} />

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        fontSize: "0.9rem",
                        marginBottom: 3,
                      }}
                    >
                      {name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {task.id}
                      </span>
                      {skill && <Tag label={skill} />}
                      {agent && agent !== "main" && (
                        <Tag label={agent} color="#8b5cf6" />
                      )}
                      {llm && llm !== "—" && (
                        <Tag label={llm} color="#f59e0b" />
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {totalTokens > 0 && (
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {(totalTokens / 1000).toFixed(1)}k tk
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            color: "var(--text-muted)",
                          }}
                        >
                          tokens
                        </div>
                      </div>
                    )}
                    {cost > 0 && (
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#10b981",
                          }}
                        >
                          ${Number(cost).toFixed(4)}
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            color: "var(--text-muted)",
                          }}
                        >
                          coût
                        </div>
                      </div>
                    )}
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-secondary)",
                          fontFamily: "monospace",
                        }}
                      >
                        {new Date(task.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </div>
                      <div
                        style={{ fontSize: "9px", color: "var(--text-muted)" }}
                      >
                        {new Date(task.createdAt).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Row actions */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ChatTriggerBtn
                      ctx={{
                        taskId: task.id,
                        taskName: name,
                        agent: agent || "main",
                        skill,
                        llmModel: (task as any).llmModel ?? task.llmMode ?? "",
                        status: task.status,
                        module: "task",
                      }}
                      onOpen={openChat}
                    />
                    {task.status === "failed" && (
                      <button
                        onClick={() => handleReplay(task)}
                        disabled={replayingId === task.id}
                        title="Relancer cette tâche"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "5px 10px",
                          borderRadius: 7,
                          cursor: "pointer",
                          background: "rgba(239,68,68,0.08)",
                          border: "1px solid rgba(239,68,68,0.25)",
                          color: "#ef4444",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {replayingId === task.id ? (
                          <RefreshCw
                            size={11}
                            style={{ animation: "spin 1s linear infinite" }}
                          />
                        ) : (
                          <RotateCcw size={11} />
                        )}
                        Rejouer
                      </button>
                    )}
                    <Dropdown
                      trigger={
                        <div
                          style={{
                            padding: "6px",
                            borderRadius: 6,
                            color: "var(--text-muted)",
                            cursor: "pointer",
                          }}
                        >
                          <MoreVertical size={15} />
                        </div>
                      }
                      items={[
                        {
                          icon: Copy,
                          label: "📋 Cloner",
                          onClick: () => handleClone(task),
                        },
                        ...(task.status === "failed"
                          ? [
                              {
                                icon: RotateCcw,
                                label: "🔁 Rejouer",
                                onClick: () => handleReplayNavigate(task),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>

                  <ChevronRight
                    size={16}
                    color="var(--text-muted)"
                    style={{ flexShrink: 0 }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaskChatDrawer ctx={chatCtx} onClose={closeChat} />
    </>
  );
}

// ─── Tab: Modèles ─────────────────────────────────────────────────────────────

const MODELE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B",
  },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1", label: "Nemotron Super 49B" },
  { id: "meta/llama-3.1-405b-instruct", label: "Llama 3.1 405B" },
  { id: "deepseek-ai/deepseek-v3.2", label: "DeepSeek V3.2" },
  { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
  { id: "gemini/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "ollama/qwen2.5", label: "Qwen 2.5 (local)" },
];

const modeleInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.8rem",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const formInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.8rem",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function TabModeles() {
  const navigate = useNavigate();
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [lastExecMap, setLastExecMap] = useState<Record<string, ArchiveEntry>>(
    {},
  );
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    skillName: string;
    instructions: string;
    llmModel: string;
    agent: string;
    canal: string;
    destinataire: string;
    disablePreInstructions: boolean;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    skillName: "",
    instructions: "",
    llmModel: "",
    agent: "main",
    canal: "telegram",
    destinataire: "",
    disablePreInstructions: false,
  });
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState(MODELE_MODELS);

  useEffect(() => {
    apiFetch(`${BASE}/api/models/available`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const map = new Map<string, { id: string; label: string }>();
          for (const m of MODELE_MODELS) map.set(m.id, m);
          for (const m of data) map.set(m.id, { id: m.id, label: m.label });
          setAvailableModels(Array.from(map.values()));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch(`${BASE}/api/modeles`)
      .then((r) => r.json())
      .then((d) => setModeles(Array.isArray(d) ? d : []))
      .catch(() => {});
    // Fetch archives to compute last-exec per model
    apiFetch(`${BASE}/api/archives`)
      .then((r) => r.json())
      .then((archives: ArchiveEntry[]) => {
        const map: Record<string, ArchiveEntry> = {};
        for (const a of archives) {
          if (
            a.modeleId &&
            (!map[a.modeleId] ||
              new Date(a.startedAt ?? a.date ?? 0) >
                new Date(
                  map[a.modeleId].startedAt ?? map[a.modeleId].date ?? 0,
                ))
          ) {
            map[a.modeleId] = a;
          }
        }
        setLastExecMap(map);
      })
      .catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRun = async (id: string, name: string) => {
    setRunning(id);
    try {
      const r = await apiFetch(`${BASE}/api/modeles/${id}/run`, {
        method: "POST",
      });
      const d = await r.json();
      showToast(`✓ Tâche créée: ${d.task?.title ?? name}`);
    } catch {
      showToast("Erreur de connexion");
    }
    setRunning(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce modèle ?")) return;
    await apiFetch(`${BASE}/api/modeles/${id}`, { method: "DELETE" });
    setModeles((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const r = await apiFetch(`${BASE}/api/modeles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const m = await r.json();
      setModeles((prev) => [...prev, m]);
      setForm({
        name: "",
        skillName: "",
        instructions: "",
        llmModel: "",
        agent: "main",
        canal: "telegram",
        destinataire: "",
        disablePreInstructions: false,
      });
      setShowForm(false);
      showToast("✓ Modèle créé");
    } catch {
      showToast("Erreur création");
    }
    setSaving(false);
  };

  const startEdit = (mod: Modele) => {
    setEditingId(mod.id);
    setEditForm({
      name: mod.name,
      skillName: mod.skillName || "",
      instructions: mod.instructions || "",
      llmModel: mod.llmModel || "",
      agent: mod.agent || "main",
      canal: mod.canal || "",
      destinataire: mod.destinataire || "",
      disablePreInstructions: mod.disablePreInstructions ?? false,
    });
  };

  const handleEditSave = async () => {
    if (!editingId || !editForm) return;
    setEditSaving(true);
    try {
      const r = await apiFetch(`${BASE}/api/modeles/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const updated = await r.json();
      setModeles((prev) =>
        prev.map((m) => (m.id === editingId ? { ...m, ...updated } : m)),
      );
      setEditingId(null);
      setEditForm(null);
      showToast("✓ Modèle modifié");
    } catch {
      showToast("Erreur modification");
    }
    setEditSaving(false);
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            right: "24px",
            zIndex: 9999,
            background: "#10b981",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "10px",
            fontWeight: 600,
            fontSize: "14px",
            boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
            animation: "slideIn 0.2s ease",
          }}
        >
          {toast}
        </div>
      )}

      {/* Header with create button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: showForm ? "var(--bg-glass)" : "rgba(139,92,246,0.12)",
            color: "var(--brand-accent)",
            border: "1px solid rgba(139,92,246,0.3)",
            borderRadius: 9,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Annuler" : "Créer un modèle"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            Nouveau modèle de tâche
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                }}
              >
                Nom *
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                style={modeleInputStyle}
                placeholder="Morning Briefing…"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                }}
              >
                Skill
              </label>
              <input
                value={form.skillName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, skillName: e.target.value }))
                }
                style={modeleInputStyle}
                placeholder="morning-briefing…"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                }}
              >
                Modèle LLM
              </label>
              <select
                value={form.llmModel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, llmModel: e.target.value }))
                }
                style={{ ...modeleInputStyle, cursor: "pointer" }}
              >
                <option value="">— Sélectionner —</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                }}
              >
                Agent
              </label>
              <input
                value={form.agent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, agent: e.target.value }))
                }
                style={modeleInputStyle}
                placeholder="main"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                }}
              >
                Canal
              </label>
              <input
                value={form.canal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, canal: e.target.value }))
                }
                style={modeleInputStyle}
                placeholder="telegram"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                }}
              >
                Destinataire
              </label>
              <input
                value={form.destinataire}
                onChange={(e) =>
                  setForm((f) => ({ ...f, destinataire: e.target.value }))
                }
                style={{ ...modeleInputStyle, fontFamily: "var(--mono)" }}
                placeholder="@username ou ID…"
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
              }}
            >
              Instructions
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) =>
                setForm((f) => ({ ...f, instructions: e.target.value }))
              }
              rows={3}
              style={{
                ...modeleInputStyle,
                fontFamily: "var(--mono)",
                resize: "vertical",
              }}
              placeholder="Prompt système…"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: "7px 16px",
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                background: "var(--brand-accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                opacity: !form.name.trim() ? 0.5 : 1,
              }}
            >
              <Save size={13} />
              {saving ? "Création…" : "Créer"}
            </button>
          </div>
        </div>
      )}

      {modeles.length === 0 && !showForm && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--text-secondary)",
            opacity: 0.5,
          }}
        >
          <Layers
            size={32}
            style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }}
          />
          <div style={{ fontSize: "14px" }}>
            Aucun modèle. Créez-en un ou sauvez une tâche comme modèle.
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "16px",
        }}
      >
        {modeles.map((mod) => (
          <div
            key={mod.id}
            style={{
              padding: "20px",
              borderRadius: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1rem",
                    color: "var(--text-primary)",
                  }}
                >
                  {mod.name}
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                    marginTop: "3px",
                  }}
                >
                  {mod.skillName}
                </div>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {/* Last-exec badge */}
                {lastExecMap[mod.id] &&
                  (() => {
                    const le = lastExecMap[mod.id];
                    const ok =
                      le.exitCode === 0 ||
                      le.status === "ok" ||
                      le.status === "completed";
                    return (
                      <span
                        title={`Dernière exécution : ${ok ? "succès" : "échec"}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: ok
                            ? "rgba(16,185,129,0.1)"
                            : "rgba(239,68,68,0.1)",
                          color: ok ? "#10b981" : "#ef4444",
                          border: `1px solid ${ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                        }}
                      >
                        {ok ? "✓" : "✕"} {ok ? "OK" : "FAIL"}
                      </span>
                    );
                  })()}
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                    background: "var(--bg-glass)",
                    padding: "3px 8px",
                    borderRadius: "5px",
                  }}
                >
                  {mod.executionCount} exec.
                </span>
                <Dropdown
                  trigger={
                    <div
                      style={{
                        padding: "4px",
                        borderRadius: "6px",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      <MoreVertical size={16} />
                    </div>
                  }
                  items={[
                    {
                      icon: Edit2,
                      label: "Modifier",
                      onClick: () => startEdit(mod),
                    },
                    {
                      icon: Copy,
                      label: "Cloner vers Nouvelle Tâche",
                      onClick: () =>
                        navigate("/tasks/new", {
                          state: {
                            prefill: {
                              name: `Copie — ${mod.name}`,
                              instructions: mod.instructions,
                              skillName: mod.skillName,
                              llmModel: mod.llmModel,
                              agent: mod.agent,
                              canal: mod.canal,
                              destinataire: mod.destinataire,
                              disablePreInstructions:
                                mod.disablePreInstructions,
                            },
                          },
                        }),
                    },
                    {
                      icon: Trash2,
                      label: "Supprimer",
                      danger: true,
                      onClick: () => handleDelete(mod.id),
                    },
                  ]}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {mod.agent && <Tag label={mod.agent} color="#3b82f6" />}
              {mod.canal && <Tag label={mod.canal} color="#8b5cf6" />}
              {mod.llmModel && (
                <Tag label={modelShortName(mod.llmModel)} color="#10b981" />
              )}
              {mod.disablePreInstructions && (
                <Tag label="no-preinstr" color="#f59e0b" />
              )}
            </div>
            {mod.instructions && (
              <div
                style={{
                  background: "var(--bg-glass)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                  maxHeight: "56px",
                  overflow: "hidden",
                  fontFamily: "var(--mono)",
                }}
              >
                {mod.instructions.length > 120
                  ? mod.instructions.slice(0, 120) + "…"
                  : mod.instructions}
              </div>
            )}
            {mod.destinataire && (
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Shield size={11} />
                {mod.destinataire}
              </div>
            )}
            {/* Inline edit form */}
            {editingId === mod.id && editForm && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "14px",
                  background: "rgba(139,92,246,0.04)",
                  borderRadius: 10,
                  border: "1px solid rgba(139,92,246,0.15)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--brand-accent)",
                    marginBottom: 4,
                  }}
                >
                  Modifier le modèle
                </div>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  placeholder="Nom"
                  style={formInputStyle}
                />
                <input
                  value={editForm.skillName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, skillName: e.target.value })
                  }
                  placeholder="Skill"
                  style={formInputStyle}
                />
                <textarea
                  value={editForm.instructions}
                  onChange={(e) =>
                    setEditForm({ ...editForm, instructions: e.target.value })
                  }
                  placeholder="Instructions"
                  rows={3}
                  style={{ ...formInputStyle, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={editForm.llmModel}
                    onChange={(e) =>
                      setEditForm({ ...editForm, llmModel: e.target.value })
                    }
                    placeholder="Modèle LLM"
                    style={{ ...formInputStyle, flex: 1 }}
                  />
                  <input
                    value={editForm.agent}
                    onChange={(e) =>
                      setEditForm({ ...editForm, agent: e.target.value })
                    }
                    placeholder="Agent"
                    style={{ ...formInputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={editForm.canal}
                    onChange={(e) =>
                      setEditForm({ ...editForm, canal: e.target.value })
                    }
                    placeholder="Canal"
                    style={{ ...formInputStyle, flex: 1 }}
                  />
                  <input
                    value={editForm.destinataire}
                    onChange={(e) =>
                      setEditForm({ ...editForm, destinataire: e.target.value })
                    }
                    placeholder="Destinataire"
                    style={{ ...formInputStyle, flex: 1 }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditForm(null);
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={editSaving}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      background: "var(--brand-accent)",
                      border: "none",
                      color: "#fff",
                      cursor: editSaving ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: editSaving ? 0.6 : 1,
                    }}
                  >
                    {editSaving ? "Sauvegarde…" : "Enregistrer"}
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => handleRun(mod.id, mod.name)}
              disabled={running === mod.id}
              style={
                {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "9px",
                  borderRadius: "9px",
                  background:
                    running === mod.id
                      ? "rgba(16,185,129,0.1)"
                      : "rgba(16,185,129,0.12)",
                  color: "#10b981",
                  cursor: running === mod.id ? "default" : "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                  transition: "all 0.2s",
                  border: "1px solid rgba(16,185,129,0.25)",
                } as React.CSSProperties
              }
            >
              {running === mod.id ? (
                <RefreshCw
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Play size={14} />
              )}
              {running === mod.id ? "Lancement…" : "Exécuter"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Relative time helper ──────────────────────────────────────────────────────

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

// ─── Tab: Récurrences ─────────────────────────────────────────────────────────

function TabRecurrences() {
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  // Map modeleId → last archive entry (regardless of status)
  const [lastExecMap, setLastExecMap] = useState<Record<string, ArchiveEntry>>(
    {},
  );

  useEffect(() => {
    apiFetch(`${BASE}/api/recurrences`)
      .then((r) => r.json())
      .then((d) => setRecurrences(Array.isArray(d) ? d : []))
      .catch(() => {});
    // Cross-ref: keep the most-recent archive entry per modeleId
    apiFetch(`${BASE}/api/archives`)
      .then((r) => r.json())
      .then((archives: ArchiveEntry[]) => {
        const map: Record<string, ArchiveEntry> = {};
        for (const a of archives) {
          if (!a.modeleId) continue;
          const prev = map[a.modeleId];
          if (
            !prev ||
            new Date(a.startedAt ?? a.date ?? 0) >
              new Date(prev.startedAt ?? prev.date ?? 0)
          ) {
            map[a.modeleId] = a;
          }
        }
        setLastExecMap(map);
      })
      .catch(() => {});
  }, []);

  const toggle = async (rec: Recurrence) => {
    const updated = { ...rec, active: !rec.active };
    setRecurrences((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
    await apiFetch(`${BASE}/api/recurrences/${rec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: updated.active }),
    }).catch(() => {});
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    await apiFetch(`${BASE}/api/recurrences/${id}/run`, {
      method: "POST",
    }).catch(() => {});
    setTimeout(() => setRunning(null), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette récurrence ?")) return;
    await apiFetch(`${BASE}/api/recurrences/${id}`, { method: "DELETE" }).catch(
      () => {},
    );
    setRecurrences((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {recurrences.map((rec) => (
        <div
          key={rec.id}
          className="glass-panel"
          style={{
            padding: "16px 20px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            borderLeft: `4px solid ${rec.active ? "#10b981" : "#3f3f46"}`,
            opacity: rec.active ? 1 : 0.65,
            transition: "all 0.2s",
          }}
        >
          {/* Active dot */}
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              flexShrink: 0,
              background: rec.active ? "#10b981" : "#3f3f46",
              boxShadow: rec.active ? "0 0 8px #10b981" : "none",
            }}
          />

          {/* Name + cron */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                }}
              >
                {rec.name}
              </span>
              {lastExecMap[rec.modeleId] &&
                (() => {
                  const le = lastExecMap[rec.modeleId];
                  const ok =
                    le.exitCode === 0 ||
                    le.status === "ok" ||
                    le.status === "completed";
                  const when = timeAgo(le.startedAt ?? le.date);
                  return ok ? (
                    <span
                      title={`Dernière exécution : succès ${when}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: "rgba(16,185,129,0.1)",
                        color: "#10b981",
                        border: "1px solid rgba(16,185,129,0.25)",
                      }}
                    >
                      ✅ {when}
                    </span>
                  ) : (
                    <span
                      title="Dernière exécution en échec"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: "rgba(239,68,68,0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239,68,68,0.25)",
                      }}
                    >
                      <AlertTriangle size={10} /> ⚠️ Dernière exécution échouée
                    </span>
                  );
                })()}
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                marginTop: "4px",
                flexWrap: "wrap",
              }}
            >
              <Tag label={rec.cronExpr} color="#a1a1aa" />
              <span
                style={{ fontSize: "12px", color: "var(--text-secondary)" }}
              >
                {rec.human}
              </span>
            </div>
          </div>

          {/* Tags */}
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            <Tag label={modelShortName(rec.llmModel)} color="#10b981" />
            <Tag
              label={rec.timezone.split("/")[1] ?? rec.timezone}
              color="#3b82f6"
            />
          </div>

          {/* Next run */}
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              Prochain
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-primary)",
                fontWeight: 600,
                fontFamily: "var(--mono)",
              }}
            >
              {new Date(rec.nextRun).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => toggle(rec)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: rec.active ? "#10b981" : "#3f3f46",
                display: "flex",
                alignItems: "center",
              }}
              title={rec.active ? "Désactiver" : "Activer"}
            >
              {rec.active ? (
                <ToggleRight size={22} />
              ) : (
                <ToggleLeft size={22} />
              )}
            </button>
            <button
              onClick={() => handleRun(rec.id)}
              disabled={running === rec.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-glass)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                transition: "all 0.2s",
              }}
            >
              {running === rec.id ? (
                <RefreshCw
                  size={12}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Play size={12} />
              )}
              Lancer
            </button>
            <Dropdown
              trigger={
                <div
                  style={{
                    padding: "4px",
                    borderRadius: "6px",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <MoreVertical size={16} />
                </div>
              }
              items={[
                { icon: Edit2, label: "Modifier", onClick: () => {} },
                {
                  icon: Trash2,
                  label: "Supprimer",
                  danger: true,
                  onClick: () => handleDelete(rec.id),
                },
              ]}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Pré-instructions ────────────────────────────────────────────────────

function TabPreInstructions() {
  const [data, setData] = useState<PreInstructions | null>(null);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch(`${BASE}/api/preinstructions`)
      .then((r) => r.json())
      .then((d: PreInstructions) => {
        setData(d);
        setContent(d.content);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${BASE}/api/preinstructions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      setData(d);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setLoading(false);
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div
        className="glass-panel"
        style={{
          padding: "24px",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: "1.05rem",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <BookOpen size={18} color="var(--brand-accent)" />
              Pré-instructions globales
            </div>
            {data && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                  fontFamily: "var(--mono)",
                }}
              >
                Dernière sauvegarde :{" "}
                {new Date(data.savedAt).toLocaleString("fr-FR")}
              </div>
            )}
          </div>
          <button
            onClick={save}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 22px",
              borderRadius: "10px",
              border: "none",
              background: saved
                ? "rgba(16,185,129,0.12)"
                : "var(--brand-accent)",
              color: saved ? "#10b981" : "#fff",
              cursor: loading ? "default" : "pointer",
              fontWeight: 600,
              fontSize: "14px",
              transition: "all 0.3s",
              boxShadow: saved ? "none" : "0 4px 14px rgba(139,92,246,0.35)",
            }}
          >
            {saved ? (
              <Check size={16} />
            ) : loading ? (
              <RefreshCw
                size={16}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Save size={16} />
            )}
            {saved ? "Enregistré !" : "Enregistrer"}
          </button>
        </div>

        <div
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            background: "rgba(139,92,246,0.06)",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid rgba(139,92,246,0.2)",
            lineHeight: 1.6,
          }}
        >
          Ces instructions sont injectées en préfixe dans tous les system
          prompts des agents, sauf si un modèle a l'option{" "}
          <Tag label="Désactiver pré-instructions" color="#f59e0b" /> activée.
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            fontFamily: "var(--mono)",
            fontSize: "13px",
            lineHeight: 1.7,
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--brand-primary)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--border-subtle)";
          }}
        />

        <div
          style={{
            fontSize: "11px",
            color: "var(--text-secondary)",
            display: "flex",
            gap: "16px",
          }}
        >
          <span>{content.length} caractères</span>
          <span>{content.split("\n").length} lignes</span>
          <span>{content.trim().split(/\s+/).filter(Boolean).length} mots</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Archives ────────────────────────────────────────────────────────────

// ─── Archives status options ──────────────────────────────────────────────────

const ARCHIVE_STATUS_OPTIONS = [
  {
    id: "all" as const,
    label: "Tous",
    color: "var(--text-primary)",
    bg: "rgba(255,255,255,0.08)",
  },
  {
    id: "completed" as const,
    label: "✓ Succès",
    color: "#10b981",
    bg: "rgba(16,185,129,0.15)",
  },
  {
    id: "failed" as const,
    label: "✕ Échecs",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.15)",
  },
  {
    id: "running" as const,
    label: "⟳ En cours",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.15)",
  },
];

const ARCHIVE_PERIOD_OPTIONS = [
  { id: "all" as const, label: "Toutes" },
  { id: "7d" as const, label: "7 jours" },
  { id: "30d" as const, label: "30 jours" },
  { id: "90d" as const, label: "90 jours" },
];

type ArchiveStatus = "all" | "completed" | "failed" | "running";
type ArchivePeriod = "all" | "7d" | "30d" | "90d";

const PERIOD_MS: Record<ArchivePeriod, number | null> = {
  all: null,
  "7d": 7 * 86400000,
  "30d": 30 * 86400000,
  "90d": 90 * 86400000,
};

function TabArchives() {
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ArchiveStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<ArchivePeriod>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    apiFetch(`${BASE}/api/archives?page=${page}&limit=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then(
        (
          resp:
            | {
                data?: ArchiveEntry[];
                page?: number;
                total?: number;
                totalPages?: number;
              }
            | ArchiveEntry[],
        ) => {
          if (Array.isArray(resp)) {
            // Legacy flat array response
            setArchives(resp);
            setTotalPages(1);
            setTotal(resp.length);
          } else {
            setArchives(Array.isArray(resp.data) ? resp.data : []);
            setTotalPages(resp.totalPages ?? 1);
            setTotal(resp.total ?? 0);
          }
        },
      )
      .catch(() => {});
  }, [page]);

  const getStatus = (a: ArchiveEntry): "completed" | "failed" | "running" => {
    if (a.status === "running") return "running";
    return a.exitCode === 0 || a.status === "ok" || a.status === "completed"
      ? "completed"
      : "failed";
  };

  const cutoff = PERIOD_MS[periodFilter];

  const filtered = archives
    .filter((a) => statusFilter === "all" || getStatus(a) === statusFilter)
    .filter((a) => {
      if (!cutoff) return true;
      const d = new Date(a.startedAt ?? a.date ?? "");
      return !isNaN(d.getTime()) && Date.now() - d.getTime() <= cutoff;
    })
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [a.taskName ?? a.name ?? "", a.skillName ?? "", a.id].some((s) =>
        s.toLowerCase().includes(q),
      );
    });

  // Per-status counts (unaffected by status filter, but respect period + search)
  const baseForCount = archives
    .filter((a) => {
      if (!cutoff) return true;
      const d = new Date(a.startedAt ?? a.date ?? "");
      return !isNaN(d.getTime()) && Date.now() - d.getTime() <= cutoff;
    })
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [a.taskName ?? a.name ?? "", a.skillName ?? "", a.id].some((s) =>
        s.toLowerCase().includes(q),
      );
    });

  const counts: Record<ArchiveStatus, number> = {
    all: baseForCount.length,
    completed: baseForCount.filter((a) => getStatus(a) === "completed").length,
    failed: baseForCount.filter((a) => getStatus(a) === "failed").length,
    running: baseForCount.filter((a) => getStatus(a) === "running").length,
  };

  const exportCSV = () => {
    const headers = [
      "Tâche",
      "Date",
      "Durée (s)",
      "Tokens",
      "Coût",
      "LLM",
      "Statut",
    ];
    const rows = filtered.map((a) =>
      [
        a.taskName ?? a.name ?? "",
        new Date(a.startedAt ?? a.date ?? "").toISOString(),
        a.duration,
        (a.promptTokens ?? 0) +
          (a.completionTokens ?? (a.tokens as number | undefined) ?? 0),
        typeof a.cost === "number" ? a.cost.toFixed(6) : a.cost,
        a.llmModel ?? "",
        getStatus(a),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `archives-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilter =
    statusFilter !== "all" || periodFilter !== "all" || search.trim() !== "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Row 1 : Search + Export ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom de tâche, skill…"
            style={{
              width: "100%",
              padding: "8px 12px 8px 30px",
              borderRadius: 9,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--brand-accent)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-subtle)")
            }
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          title={`Exporter ${filtered.length} entrée${filtered.length !== 1 ? "s" : ""} en CSV`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 8,
            whiteSpace: "nowrap",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.25)",
            color: "#3b82f6",
            cursor: filtered.length === 0 ? "not-allowed" : "pointer",
            fontSize: "12px",
            fontWeight: 600,
            opacity: filtered.length === 0 ? 0.5 : 1,
            transition: "all 0.15s",
          }}
        >
          <Download size={13} /> ⬇ Exporter CSV
        </button>
      </div>

      {/* ── Row 2 : Status + Période + compteur ──────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Status pills */}
        <div
          style={{
            display: "flex",
            gap: 3,
            background: "var(--bg-glass)",
            padding: "3px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
          }}
        >
          {ARCHIVE_STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setStatusFilter(opt.id)}
                style={{
                  padding: "5px 11px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: active ? opt.bg : "transparent",
                  color: active ? opt.color : "var(--text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}{" "}
                <span style={{ opacity: 0.7, fontSize: "10px" }}>
                  ({counts[opt.id]})
                </span>
              </button>
            );
          })}
        </div>

        {/* Period pills */}
        <div
          style={{
            display: "flex",
            gap: 3,
            background: "var(--bg-glass)",
            padding: "3px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
          }}
        >
          {ARCHIVE_PERIOD_OPTIONS.map((opt) => {
            const active = periodFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setPeriodFilter(opt.id)}
                style={{
                  padding: "5px 11px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: active ? "rgba(139,92,246,0.15)" : "transparent",
                  color: active
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Résultat count */}
        {hasActiveFilter && (
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginLeft: "auto",
            }}
          >
            {filtered.length} résultat{filtered.length !== 1 ? "s" : ""} sur{" "}
            {archives.length}
          </span>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 80px 80px 80px 80px 120px",
            gap: "12px",
            padding: "10px 20px",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span>Tâche</span>
          <span>Date</span>
          <span>Durée</span>
          <span>Tokens</span>
          <span>Coût</span>
          <span>LLM</span>
          <span>Statut</span>
        </div>

        {filtered.length === 0 && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "var(--text-secondary)",
              opacity: 0.5,
            }}
          >
            {archives.length === 0
              ? "Aucune archive disponible"
              : "Aucun résultat pour ces filtres"}
          </div>
        )}

        {filtered.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 80px 80px 80px 80px 120px",
              gap: "12px",
              padding: "14px 20px",
              alignItems: "center",
              background:
                i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              transition: "background 0.15s",
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.04)";
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                }}
              >
                {a.taskName ?? a.name ?? a.id}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--mono)",
                  marginTop: "2px",
                }}
              >
                {a.skillName ?? a.id}
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {(() => {
                const d = new Date(a.startedAt ?? a.date ?? "");
                return isNaN(d.getTime())
                  ? "—"
                  : d.toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
              })()}
            </div>
            <div
              style={{
                fontSize: "12px",
                fontFamily: "var(--mono)",
                color: "var(--text-primary)",
              }}
            >
              {a.duration}s
            </div>
            <div
              style={{
                fontSize: "12px",
                fontFamily: "var(--mono)",
                color: "var(--text-primary)",
              }}
            >
              {(
                (a.promptTokens ?? 0) +
                (a.completionTokens ?? (a.tokens as number | undefined) ?? 0)
              ).toLocaleString()}
            </div>
            <div
              style={{
                fontSize: "12px",
                fontFamily: "var(--mono)",
                color: "#10b981",
              }}
            >
              ${typeof a.cost === "number" ? a.cost.toFixed(4) : a.cost}
            </div>
            <Tag label={modelShortName(a.llmModel ?? "")} color="#10b981" />
            <StatusBadge status={getStatus(a)} />
          </div>
        ))}
      </div>

      {/* ── Pagination controls ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "14px 0",
            marginTop: 4,
          }}
        >
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: page <= 1 ? "var(--text-muted)" : "var(--text-secondary)",
              cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: page <= 1 ? "var(--text-muted)" : "var(--text-secondary)",
              cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            ‹ Précédent
          </button>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              padding: "0 8px",
            }}
          >
            Page{" "}
            <strong style={{ color: "var(--brand-accent)" }}>{page}</strong> /{" "}
            {totalPages}
            <span style={{ marginLeft: 8, opacity: 0.6 }}>({total} total)</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color:
                page >= totalPages
                  ? "var(--text-muted)"
                  : "var(--text-secondary)",
              cursor: page >= totalPages ? "not-allowed" : "pointer",
              opacity: page >= totalPages ? 0.4 : 1,
            }}
          >
            Suivant ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color:
                page >= totalPages
                  ? "var(--text-muted)"
                  : "var(--text-secondary)",
              cursor: page >= totalPages ? "not-allowed" : "pointer",
              opacity: page >= totalPages ? 0.4 : 1,
            }}
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export const TachesPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("taches");
  const [tourForceRun, setTourForceRun] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const { data: liveTasks } = useSSE<Task[] | null>(
    "/api/tasks?stream=1",
    null,
  );
  const tasks: Task[] = liveTasks ?? [];
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const handleSelect = (id: string) => navigate(`/tasks/${id}`);

  return (
    <div
      style={{ display: "flex", height: "100%", gap: "0", overflow: "hidden" }}
    >
      <TasksTour
        forceRun={tourForceRun}
        onClose={() => setTourForceRun(false)}
      />
      {/* ─── Left: Task list (shrinks when panel is open) ─── */}
      <div
        style={{
          flex: taskId && !panelCollapsed ? "0 0 42%" : "1 1 100%",
          minWidth: 0,
          transition: "flex 0.3s ease",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          overflowY: "auto",
          paddingRight: taskId && !panelCollapsed ? "16px" : "0",
        }}
      >
        {/* Page header */}
        <div
          data-tour="tasks-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                padding: "12px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Terminal size={24} color="var(--brand-primary)" />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "1.6rem",
                  margin: 0,
                  letterSpacing: "-0.5px",
                }}
              >
                Tâches
              </h2>
              <div
                className="text-muted"
                style={{ fontSize: "14px", marginTop: "4px" }}
              >
                {tasks.filter((t) => t.status === "running").length} en cours ·{" "}
                {tasks.length} total
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              data-tour="tasks-guide-btn"
              onClick={() => {
                resetTasksTour();
                setTourForceRun(true);
              }}
              title="Revoir le guide de la section Tâches"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 16px",
                borderRadius: "var(--radius-full)",
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.25)",
                color: "#3b82f6",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(59,130,246,0.15)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(59,130,246,0.45)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(59,130,246,0.08)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(59,130,246,0.25)";
              }}
            >
              <HelpCircle size={15} /> Guide
            </button>

            <Link
              to="/tasks/new"
              data-tour="tasks-new-btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 24px",
                background:
                  "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))",
                color: "#fff",
                borderRadius: "var(--radius-full)",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.95rem",
                boxShadow: "0 4px 20px rgba(139,92,246,0.4)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Plus size={18} /> Lancer Tâche
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <div
          data-tour="tasks-tabs"
          style={{
            display: "flex",
            gap: "2px",
            background: "var(--bg-glass)",
            padding: "5px",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            alignSelf: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-tour={
                tab.id === "modeles"
                  ? "tasks-tab-modeles"
                  : tab.id === "recurrences"
                    ? "tasks-tab-recurrences"
                    : tab.id === "preinstructions"
                      ? "tasks-tab-preinstructions"
                      : tab.id === "archives"
                        ? "tasks-tab-archives"
                        : undefined
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "9px 20px",
                borderRadius: "10px",
                border: "none",
                background:
                  activeTab === tab.id
                    ? "rgba(139,92,246,0.18)"
                    : "transparent",
                color:
                  activeTab === tab.id
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: "13px",
                transition: "all 0.2s",
                boxShadow: "none",
              }}
            >
              <span style={{ opacity: activeTab === tab.id ? 1 : 0.6 }}>
                {tab.icon}
              </span>
              {tab.label}
              {tab.id === "taches" && tasks.length > 0 && (
                <span
                  style={{
                    background: "var(--brand-primary)",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: "10px",
                    marginLeft: "2px",
                  }}
                >
                  {tasks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeTab === "taches" && (
            <TabTaches tasks={tasks} onSelect={handleSelect} />
          )}
          {activeTab === "modeles" && <TabModeles />}
          {activeTab === "recurrences" && <TabRecurrences />}
          {activeTab === "preinstructions" && <TabPreInstructions />}
          {activeTab === "archives" && <TabArchives />}
        </div>

        <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes progressSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
      </div>
      {/* end left column */}

      {/* ─── Right: Detail panel (slides in) ─── */}
      {taskId && (
        <div
          style={{
            flex: panelCollapsed ? "0 0 0%" : "0 0 58%",
            overflow: panelCollapsed ? "hidden" : "auto",
            transition: "flex 0.3s ease",
            position: "relative",
            animation: "panelSlideIn 0.25s ease",
          }}
        >
          {/* Collapse / expand toggle */}
          <button
            onClick={() => setPanelCollapsed((c) => !c)}
            title={
              panelCollapsed ? "Agrandir le panneau" : "Réduire le panneau"
            }
            style={{
              position: "sticky",
              top: "8px",
              left: "-18px",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              transition: "all 0.2s",
              flexShrink: 0,
              marginBottom: "-28px",
            }}
          >
            <ChevronRight
              size={14}
              style={{
                transform: panelCollapsed ? "none" : "rotate(180deg)",
                transition: "transform 0.3s",
              }}
            />
          </button>
          {!panelCollapsed && <TaskDetailPanel taskId={taskId} />}
        </div>
      )}

      <style>{`
        @keyframes panelSlideIn {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
};
