import { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarClock,
  Play,
  Trash2,
  Plus,
  ToggleLeft,
  ToggleRight,
  Clock,
  Zap,
  Server,
  AlertCircle,
  Workflow,
  Save,
  RefreshCw,
  GripVertical,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { api } from "../hooks/useApi";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Pipeline Node Editor (minimal) ───────────────────────────────────────────
interface PipelineNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
}
interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}
interface Pipeline {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  savedAt?: string;
}

function PipelinePanel() {
  const [pipeline, setPipeline] = useState<Pipeline>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${BASE}/api/pipeline`);
      const d = await r.json();
      setPipeline({
        nodes: d.nodes || [],
        edges: d.edges || [],
        savedAt: d.savedAt,
      });
    } catch {
      setError("Impossible de charger le pipeline.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await apiFetch(`${BASE}/api/pipeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: pipeline.nodes, edges: pipeline.edges }),
      });
      const d = await r.json();
      setPipeline((p) => ({ ...p, savedAt: d.savedAt }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Erreur sauvegarde pipeline.");
    }
    setSaving(false);
  };

  const nodeTypes = ["trigger", "llm", "tool", "condition", "output"];

  const addNode = (type: string) => {
    const id = `node_${Date.now()}`;
    const x = 80 + (pipeline.nodes.length % 4) * 190;
    const y = 60 + Math.floor(pipeline.nodes.length / 4) * 120;
    setPipeline((p) => ({
      ...p,
      nodes: [
        ...p.nodes,
        { id, type, label: type.charAt(0).toUpperCase() + type.slice(1), x, y },
      ],
    }));
  };

  const removeNode = (id: string) => {
    setPipeline((p) => ({
      nodes: p.nodes.filter((n) => n.id !== id),
      edges: p.edges.filter((e) => e.source !== id && e.target !== id),
    }));
  };

  const NODE_COLORS: Record<string, string> = {
    trigger: "#10b981",
    llm: "#8b5cf6",
    tool: "#3b82f6",
    condition: "#f59e0b",
    output: "#ec4899",
  };

  return (
    <div
      style={{
        padding: "20px",
        background: "var(--bg-glass)",
        borderRadius: 16,
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Workflow size={18} color="var(--brand-accent)" />
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: "var(--text-primary)",
            }}
          >
            Pipeline visuel
          </span>
          {pipeline.savedAt && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
              }}
            >
              Sauvegardé{" "}
              {new Date(pipeline.savedAt).toLocaleTimeString("fr-FR")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={fetchPipeline}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              background: saved
                ? "rgba(16,185,129,0.15)"
                : "rgba(139,92,246,0.15)",
              border: `1px solid ${saved ? "rgba(16,185,129,0.4)" : "rgba(139,92,246,0.4)"}`,
              color: saved ? "#10b981" : "var(--brand-accent)",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            <Save size={13} /> {saved ? "Sauvegardé ✓" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* Toolbar : ajouter des nodes */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
      >
        {nodeTypes.map((t) => (
          <button
            key={t}
            onClick={() => addNode(t)}
            style={{
              padding: "5px 12px",
              borderRadius: 20,
              border: `1px solid ${NODE_COLORS[t]}33`,
              background: `${NODE_COLORS[t]}15`,
              color: NODE_COLORS[t],
              fontWeight: 600,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            padding: 32,
            fontSize: 13,
          }}
        >
          Chargement…
        </div>
      ) : error ? (
        <div style={{ color: "#ef4444", fontSize: 13, padding: 12 }}>
          {error}
        </div>
      ) : pipeline.nodes.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            padding: 32,
            fontSize: 13,
          }}
        >
          Aucun node. Cliquez sur un type ci-dessus pour commencer.
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            minHeight: 200,
            background: "rgba(0,0,0,0.15)",
            borderRadius: 12,
            padding: 16,
            overflowX: "auto",
          }}
        >
          {/* Edges (SVG) */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {pipeline.edges.map((e) => {
              const src = pipeline.nodes.find((n) => n.id === e.source);
              const tgt = pipeline.nodes.find((n) => n.id === e.target);
              if (!src || !tgt) return null;
              const x1 = src.x + 70,
                y1 = src.y + 20,
                x2 = tgt.x,
                y2 = tgt.y + 20;
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={e.id}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="var(--brand-accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4,3"
                  opacity={0.6}
                />
              );
            })}
          </svg>
          {/* Nodes */}
          {pipeline.nodes.map((node) => (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                background: "var(--bg-card)",
                border: `1px solid ${NODE_COLORS[node.type] || "#555"}55`,
                borderRadius: 10,
                padding: "8px 14px",
                minWidth: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: NODE_COLORS[node.type] || "#aaa",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {node.label}
                </span>
              </div>
              <button
                onClick={() => removeNode(node.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#ef4444",
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Cron {
  id: string;
  name: string;
  interval: string;
  agentId: string;
  llmMode: "local" | "cloud" | "hybrid";
  mode: ScheduleMode;
  modeConfig: Record<string, string>;
  active: boolean;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
}

type ScheduleMode =
  | "always"
  | "run-if-idle"
  | "run-if-not-run-since"
  | "skip-if-last-run-within"
  | "conflict-avoidance"
  | "priority-queue";

const MODE_LABELS: Record<
  ScheduleMode,
  { label: string; desc: string; color: string }
> = {
  always: {
    label: "Toujours",
    desc: "S'exécute à chaque intervalle",
    color: "#10b981",
  },
  "run-if-idle": {
    label: "Si inactif",
    desc: "Seulement quand aucune tâche ne tourne",
    color: "#3b82f6",
  },
  "run-if-not-run-since": {
    label: "Si non exécuté",
    desc: "Garantit une fraîcheur minimale",
    color: "#8b5cf6",
  },
  "skip-if-last-run-within": {
    label: "Debounce",
    desc: "Ignore si exécuté récemment",
    color: "#f59e0b",
  },
  "conflict-avoidance": {
    label: "Anti-conflit",
    desc: "Évite la contention avec d'autres tâches",
    color: "#ef4444",
  },
  "priority-queue": {
    label: "File prioritaire",
    desc: "Préempte les tâches moins critiques",
    color: "#a78bfa",
  },
};

const AGENTS = ["agent-main", "agent-support", "agent-veille"];
const INTERVALS = ["15m", "30m", "1h", "3h", "6h", "12h", "24h"];

const formatRelative = (iso: string | null) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `il y a ${mins}m`;
  return `il y a ${Math.round(mins / 60)}h`;
};

const formatNext = (iso: string | null) => {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "imminent";
  if (mins < 60) return `dans ${mins}m`;
  return `dans ${Math.round(mins / 60)}h`;
};

export const SchedulerModule = () => {
  const [crons, setCrons] = useState<Cron[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  // ── Drag & Drop state ──────────────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editId, setEditId] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState("");
  const [editName, setEditName] = useState("");

  // Form state
  const [form, setForm] = useState<{
    name: string;
    interval: string;
    agentId: string;
    llmMode: "local" | "cloud" | "hybrid";
    mode: ScheduleMode;
    modeConfig: Record<string, string>;
  }>({
    name: "",
    interval: "1h",
    agentId: "agent-main",
    llmMode: "hybrid",
    mode: "run-if-idle",
    modeConfig: {},
  });

  const fetchCrons = async () => {
    try {
      const res = await apiFetch("http://localhost:4000/api/crons");
      if (res.ok) setCrons(await res.json());
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchCrons();
  }, []);

  const handleToggle = async (id: string, active: boolean) => {
    setCrons((c) => c.map((x) => (x.id === id ? { ...x, active } : x)));
    await api.patchCron(id, { active });
  };

  const handleDelete = async (id: string) => {
    setCrons((c) => c.filter((x) => x.id !== id));
    await api.deleteCron(id);
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    await api.runCron(id);
    setTimeout(() => {
      setRunning(null);
      fetchCrons();
    }, 1500);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const cron = await api.createCron({ ...form });
    if (cron?.id) {
      setCrons((c) => [...c, cron]);
      setShowCreate(false);
      setForm({
        name: "",
        interval: "1h",
        agentId: "agent-main",
        llmMode: "hybrid",
        mode: "run-if-idle",
        modeConfig: {},
      });
    }
  };

  // ── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDragStart =
    (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
      setDragIdx(idx);
      e.dataTransfer.effectAllowed = "move";
      if (e.currentTarget instanceof HTMLDivElement)
        dragNode.current = e.currentTarget;
      requestAnimationFrame(() => {
        if (dragNode.current) dragNode.current.style.opacity = "0.4";
      });
    };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };

  const handleDragEnd = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      setCrons((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(overIdx, 0, moved);
        // Persist new order to backend
        next.forEach((c, i) => {
          api.patchCron(c.id, { sortOrder: i });
        });
        return next;
      });
    }
    if (dragNode.current) dragNode.current.style.opacity = "1";
    setDragIdx(null);
    setOverIdx(null);
  };

  // ── Inline edit handlers ──────────────────────────────────────────────────
  const startEdit = (cron: Cron) => {
    setEditId(cron.id);
    setEditName(cron.name);
    setEditInterval(cron.interval);
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setCrons((c) =>
      c.map((x) =>
        x.id === editId ? { ...x, name: editName, interval: editInterval } : x,
      ),
    );
    await api.patchCron(editId, { name: editName, interval: editInterval });
    setEditId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Header */}
      <div
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
              background: "rgba(139,92,246,0.1)",
              borderRadius: "12px",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <CalendarClock size={24} color="var(--brand-accent)" />
          </div>
          <div>
            <h2
              style={{ fontSize: "1.6rem", margin: 0, letterSpacing: "-0.5px" }}
            >
              Planificateur
            </h2>
            <div
              className="text-muted"
              style={{ fontSize: "14px", marginTop: "4px" }}
            >
              6 modes de scheduling intelligent — inspiré de l'OS scheduling
              (CS162)
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 22px",
            background: showCreate
              ? "var(--bg-glass)"
              : "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))",
            color: "var(--text-primary)",
            border: showCreate ? "1px solid var(--border-subtle)" : "none",
            borderRadius: "var(--radius-full)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9rem",
            boxShadow: showCreate ? "none" : "0 4px 18px rgba(139,92,246,0.4)",
          }}
        >
          <Plus size={16} /> {showCreate ? "Annuler" : "Nouveau CRON"}
        </button>
      </div>

      {/* Mode Legend */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "10px",
        }}
      >
        {(
          Object.entries(MODE_LABELS) as [
            ScheduleMode,
            (typeof MODE_LABELS)[ScheduleMode],
          ][]
        ).map(([mode, info]) => (
          <div
            key={mode}
            className="glass-panel"
            style={{
              padding: "12px 14px",
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: info.color,
                flexShrink: 0,
                marginTop: "5px",
              }}
            />
            <div>
              <div
                style={{ fontWeight: 600, fontSize: "12px", color: info.color }}
              >
                {info.label}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                  lineHeight: 1.4,
                }}
              >
                {info.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div
          className="glass-panel p-6"
          style={{ border: "1px solid rgba(139,92,246,0.3)" }}
        >
          <h3
            style={{
              margin: "0 0 20px",
              fontSize: "1rem",
              color: "var(--brand-accent)",
            }}
          >
            Créer un nouveau CRON
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 600,
                }}
              >
                Nom
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Ex: Audit Sécurité"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 600,
                }}
              >
                Intervalle
              </label>
              <select
                value={form.interval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, interval: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              >
                {INTERVALS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 600,
                }}
              >
                Agent
              </label>
              <select
                value={form.agentId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, agentId: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              >
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 600,
                }}
              >
                LLM Mode
              </label>
              <select
                value={form.llmMode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    llmMode: e.target.value as "local" | "cloud" | "hybrid",
                  }))
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              >
                <option value="local">Local (Ollama)</option>
                <option value="cloud">Cloud (NVIDIA)</option>
                <option value="hybrid">Hybrid (Privacy Router)</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 600,
                }}
              >
                Mode de Scheduling
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(Object.keys(MODE_LABELS) as ScheduleMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setForm((f) => ({ ...f, mode: m }))}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      background:
                        form.mode === m
                          ? `${MODE_LABELS[m].color}22`
                          : "var(--bg-glass)",
                      border: `1px solid ${form.mode === m ? MODE_LABELS[m].color : "var(--border-subtle)"}`,
                      color:
                        form.mode === m
                          ? MODE_LABELS[m].color
                          : "var(--text-secondary)",
                      transition: "all 0.15s",
                    }}
                  >
                    {MODE_LABELS[m].label}
                  </button>
                ))}
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <AlertCircle size={11} />
                {MODE_LABELS[form.mode].desc}
              </div>
            </div>
          </div>
          <button
            onClick={handleCreate}
            style={{
              padding: "10px 28px",
              background:
                "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))",
              color: "var(--text-primary)",
              border: "none",
              borderRadius: "var(--radius-full)",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            Créer le CRON
          </button>
        </div>
      )}

      {/* Cron List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {loading && (
          <div
            className="text-muted"
            style={{ textAlign: "center", padding: "32px" }}
          >
            Chargement...
          </div>
        )}
        {!loading && crons.length === 0 && (
          <div
            className="glass-panel"
            style={{
              textAlign: "center",
              padding: "48px",
              color: "var(--text-muted)",
            }}
          >
            Aucun CRON planifié — créez-en un ci-dessus
          </div>
        )}
        {crons.map((cron, idx) => {
          const modeInfo = MODE_LABELS[cron.mode as ScheduleMode] ?? {
            label: cron.mode,
            color: "#a1a1aa",
            desc: "",
          };
          const isEditing = editId === cron.id;
          const isDragOver =
            overIdx === idx && dragIdx !== null && dragIdx !== idx;
          return (
            <div
              key={cron.id}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDragEnd={handleDragEnd}
              className="glass-panel"
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                border: isDragOver
                  ? "1px solid var(--brand-accent)"
                  : "1px solid var(--border-subtle)",
                borderTop: isDragOver
                  ? "3px solid var(--brand-accent)"
                  : undefined,
                opacity: cron.active ? 1 : 0.55,
                transition: "all 0.2s",
                cursor: "grab",
              }}
            >
              {/* Drag handle */}
              <div
                style={{
                  flexShrink: 0,
                  color: "var(--text-muted)",
                  cursor: "grab",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <GripVertical size={16} />
              </div>

              {/* Toggle */}
              <button
                onClick={() => handleToggle(cron.id, !cron.active)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: cron.active ? "#10b981" : "#52525b",
                  flexShrink: 0,
                }}
              >
                {cron.active ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} />
                )}
              </button>

              {/* Info — with inline editing */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "6px",
                  }}
                >
                  {isEditing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                      style={{
                        fontWeight: 700,
                        fontSize: "1rem",
                        padding: "2px 8px",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--brand-accent)",
                        borderRadius: 6,
                        color: "var(--text-primary)",
                        width: 180,
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                      {cron.name}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "11px",
                      background: `${modeInfo.color}22`,
                      color: modeInfo.color,
                      padding: "3px 9px",
                      borderRadius: "99px",
                      fontWeight: 700,
                      border: `1px solid ${modeInfo.color}44`,
                    }}
                  >
                    {modeInfo.label}
                  </span>
                  {isEditing ? (
                    <select
                      value={editInterval}
                      onChange={(e) => setEditInterval(e.target.value)}
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "var(--bg-surface)",
                        border: "1px solid var(--brand-accent)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {INTERVALS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      style={{
                        fontSize: "11px",
                        background: "var(--bg-glass)",
                        color: "var(--text-secondary)",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      /{cron.interval}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "20px",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {cron.llmMode === "local" ? (
                      <Server size={11} />
                    ) : (
                      <Zap size={11} />
                    )}
                    {cron.agentId} · {cron.llmMode}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Clock size={11} /> Dernier: {formatRelative(cron.lastRun)}
                  </span>
                  {cron.active && (
                    <span
                      style={{
                        color: "#10b981",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Clock size={11} /> Prochain: {formatNext(cron.nextRun)}
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--mono)" }}>
                    ×{cron.runCount}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={saveEdit}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: "rgba(16,185,129,0.1)",
                        color: "#10b981",
                        border: "1px solid rgba(16,185,129,0.3)",
                        borderRadius: "10px",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "12px",
                      }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: "rgba(239,68,68,0.06)",
                        color: "#ef4444",
                        border: "1px solid rgba(239,68,68,0.15)",
                        borderRadius: "10px",
                        cursor: "pointer",
                      }}
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(cron)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 10px",
                        background: "rgba(139,92,246,0.06)",
                        color: "var(--brand-accent)",
                        border: "1px solid rgba(139,92,246,0.15)",
                        borderRadius: "10px",
                        cursor: "pointer",
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleRun(cron.id)}
                      disabled={running === cron.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 16px",
                        background:
                          running === cron.id
                            ? "rgba(59,130,246,0.1)"
                            : "rgba(59,130,246,0.08)",
                        color: "var(--brand-primary)",
                        border: "1px solid rgba(59,130,246,0.2)",
                        borderRadius: "10px",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "12px",
                        transition: "all 0.2s",
                      }}
                    >
                      <Play size={13} />
                      {running === cron.id ? "Lancé..." : "Lancer"}
                    </button>
                    <button
                      onClick={() => handleDelete(cron.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 10px",
                        background: "rgba(239,68,68,0.06)",
                        color: "#ef4444",
                        border: "1px solid rgba(239,68,68,0.15)",
                        borderRadius: "10px",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline visuel — branché sur /api/pipeline */}
      <div style={{ marginTop: 32 }}>
        <PipelinePanel />
      </div>
    </div>
  );
};
