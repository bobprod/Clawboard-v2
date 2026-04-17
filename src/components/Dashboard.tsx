import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { useSSE } from "../hooks/useSSE";
import { apiFetch } from "../lib/apiFetch";
import { SystemVitals } from "./SystemVitals";
import { FuelGauges } from "./FuelGauges";
import { AlertsBanner } from "./AlertsBanner";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ModelCostBreakdown } from "./ModelCostBreakdown";
import { ApprovalsWidget } from "./ApprovalsWidget";
import { GatewayProbes } from "./GatewayProbes";
import { GatewayPresence } from "./GatewayPresence";
import { DashboardTour } from "./DashboardTour";
import { MemoryEngineWidget } from "./MemoryEngineWidget";
import type { Task } from "../data/mockData";

// ── Cowork mini-widget for dashboard ────────────────────────────────
function CoworkWidget() {
  const [stats, setStats] = useState({ active: 0, completed: 0, tokens: 0 });
  useEffect(() => {
    apiFetch("/api/cowork/stats")
      .then((r: any) =>
        setStats({
          active: r.activeSessions ?? 0,
          completed: r.completedSessions ?? 0,
          tokens: r.totalTokens ?? 0,
        }),
      )
      .catch(() => setStats({ active: 1, completed: 3, tokens: 24800 }));
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Actives", value: stats.active, color: "var(--accent)" },
          { label: "Terminées", value: stats.completed, color: "#22c55e" },
          {
            label: "Tokens",
            value:
              stats.tokens > 1000
                ? `${(stats.tokens / 1000).toFixed(1)}k`
                : stats.tokens,
            color: "#f59e0b",
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              minWidth: 80,
              padding: "10px 14px",
              background: "var(--bg-glass)",
              borderRadius: 10,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <a
        href="/cowork"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          background: "var(--accent)",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 600,
          alignSelf: "flex-start",
        }}
      >
        Ouvrir Cowork Agent →
      </a>
    </div>
  );
}

// ── Widget configuration system ─────────────────────────────────────
interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
  span?: 1 | 2; // grid columns
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "alerts", label: "Alertes", visible: true, span: 2 },
  { id: "kpis", label: "KPIs", visible: true, span: 2 },
  { id: "vitals", label: "Vitals Système", visible: true, span: 1 },
  { id: "fuel", label: "Fuel Gauges", visible: true, span: 1 },
  { id: "heatmap", label: "Heatmap Activité", visible: true, span: 2 },
  { id: "costs", label: "Coûts par Modèle", visible: true, span: 1 },
  { id: "flux", label: "Flux d'Exécutions", visible: true, span: 1 },
  { id: "approvals", label: "Approbations", visible: true, span: 1 },
  { id: "probes", label: "Gateway Probes", visible: true, span: 1 },
  { id: "presence", label: "Presence", visible: true, span: 1 },
  { id: "memory-engine", label: "Memory Engine", visible: true, span: 2 },
  { id: "cowork", label: "Cowork Agent", visible: true, span: 2 },
];

const STORAGE_KEY = "clawboard-dashboard-layout";

function loadLayout(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const saved: WidgetConfig[] = JSON.parse(raw);
    // Merge: keep saved order/visibility but ensure all widgets exist
    const ids = new Set(saved.map((w) => w.id));
    const merged = saved.filter((w) =>
      DEFAULT_WIDGETS.some((d) => d.id === w.id),
    );
    for (const dw of DEFAULT_WIDGETS) {
      if (!ids.has(dw.id)) merged.push(dw);
    }
    return merged;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function saveLayout(widgets: WidgetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

const statusStyle = (status: string) => ({
  padding: "5px 12px",
  borderRadius: "99px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  background:
    status === "completed"
      ? "rgba(16,185,129,0.12)"
      : status === "running"
        ? "rgba(59,130,246,0.12)"
        : status === "failed"
          ? "rgba(239,68,68,0.12)"
          : "rgba(255,255,255,0.06)",
  color:
    status === "completed"
      ? "var(--status-success)"
      : status === "running"
        ? "var(--brand-primary)"
        : status === "failed"
          ? "var(--status-error)"
          : "var(--text-secondary)",
});

export const Dashboard = () => {
  const { data: liveTasks } = useSSE<Task[] | null>(
    "/api/tasks?stream=1",
    null,
  );
  const tasks = liveTasks ?? [];
  const [cronsActive, setCronsActive] = useState(0);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(loadLayout);
  const [configOpen, setConfigOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const configRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("http://localhost:4000/api/recurrences")
      .then((r) => r.json())
      .then((crons: any[]) => {
        setCronsActive(crons.filter((c) => c.active).length);
      })
      .catch(() => {});
  }, []);

  // Close config panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node))
        setConfigOpen(false);
    };
    if (configOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [configOpen]);

  const updateWidgets = useCallback((next: WidgetConfig[]) => {
    setWidgets(next);
    saveLayout(next);
  }, []);

  const toggleWidget = (id: string) => {
    updateWidgets(
      widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
    );
  };

  const resetLayout = () => {
    updateWidgets([...DEFAULT_WIDGETS]);
  };

  // Drag & drop reorder
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...widgets];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    updateWidgets(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const kpis = {
    activeTasks: tasks.filter((t) => t.status === "running").length,
    completedToday: tasks.filter((t) => t.status === "completed").length,
    failedToday: tasks.filter((t) => t.status === "failed").length,
    cronsActive,
  };

  // Widget renderer
  const renderWidget = (id: string) => {
    switch (id) {
      case "alerts":
        return (
          <div data-tour="dashboard-alerts">
            <AlertsBanner />
          </div>
        );
      case "kpis":
        return (
          <div
            data-tour="dashboard-kpis"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "20px",
            }}
          >
            {[
              {
                icon: Activity,
                label: "Tâches Actives",
                value: kpis.activeTasks,
                color: "rgba(59,130,246,0.1)",
                iconColor: "var(--brand-primary)",
              },
              {
                icon: CheckCircle,
                label: "Complétées Aujourd'hui",
                value: kpis.completedToday,
                color: "rgba(16,185,129,0.1)",
                iconColor: "var(--status-success)",
              },
              {
                icon: Clock,
                label: "CRONs Actifs",
                value: kpis.cronsActive,
                color: "rgba(139,92,246,0.1)",
                iconColor: "var(--brand-accent)",
              },
              {
                icon: AlertCircle,
                label: "Échecs (24h)",
                value: kpis.failedToday,
                color: "rgba(239,68,68,0.1)",
                iconColor: "var(--status-error)",
              },
            ].map((kpi, i) => (
              <div
                key={i}
                className="glass-panel p-6"
                style={{ display: "flex", alignItems: "center", gap: "16px" }}
              >
                <div
                  style={{
                    padding: "14px",
                    background: kpi.color,
                    borderRadius: "14px",
                    color: kpi.iconColor,
                  }}
                >
                  <kpi.icon size={26} />
                </div>
                <div>
                  <div className="text-muted">{kpi.label}</div>
                  <div
                    style={{
                      fontSize: "28px",
                      fontWeight: 600,
                      letterSpacing: "-0.5px",
                    }}
                  >
                    {kpi.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      case "vitals":
        return <SystemVitals />;
      case "fuel":
        return <FuelGauges />;
      case "heatmap":
        return (
          <div data-tour="dashboard-heatmap">
            <ActivityHeatmap />
          </div>
        );
      case "costs":
        return (
          <div data-tour="dashboard-costs">
            <ModelCostBreakdown />
          </div>
        );
      case "flux":
        return (
          <div className="glass-panel p-6">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "24px",
              }}
            >
              <TrendingUp size={18} color="var(--brand-primary)" />
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
                Flux d'Exécutions
              </h2>
              {liveTasks && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "11px",
                    color: "#10b981",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#10b981",
                      display: "inline-block",
                      animation: "pulseDot 2s ease-in-out infinite",
                    }}
                  />
                  Live
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxHeight: 360,
                overflowY: "auto",
              }}
            >
              {(tasks.length ? tasks : []).map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: "var(--bg-glass)",
                    borderRadius: "10px",
                    border: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: "4px",
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {(task as any).name || task.title}
                    </div>
                    <div
                      className="text-muted"
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        fontSize: "11px",
                      }}
                    >
                      <span>{task.agentId}</span>
                      <span>·</span>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          background: "rgba(255,255,255,0.08)",
                          padding: "1px 5px",
                          borderRadius: "3px",
                          fontSize: "10px",
                        }}
                      >
                        {(
                          (task as any).llmModel?.split("/").pop() ??
                          task.llmMode ??
                          "—"
                        ).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      flexShrink: 0,
                    }}
                  >
                    {task.tokensUsed &&
                      task.tokensUsed.prompt + task.tokensUsed.completion >
                        0 && (
                        <span
                          style={{
                            color: "var(--status-success)",
                            fontFamily: "var(--mono)",
                            fontWeight: 600,
                            fontSize: "12px",
                          }}
                        >
                          ${Number(task.cost ?? 0).toFixed(4)}
                        </span>
                      )}
                    <span style={statusStyle(task.status)}>
                      {task.status?.toUpperCase() ?? "—"}
                    </span>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div
                  className="text-muted"
                  style={{
                    textAlign: "center",
                    padding: "24px",
                    fontSize: "13px",
                  }}
                >
                  Aucune tâche récente
                </div>
              )}
            </div>
          </div>
        );
      case "approvals":
        return (
          <div data-tour="dashboard-approvals">
            <ApprovalsWidget />
          </div>
        );
      case "probes":
        return (
          <div data-tour="dashboard-probes">
            <GatewayProbes />
          </div>
        );
      case "presence":
        return <GatewayPresence />;
      case "memory-engine":
        return <MemoryEngineWidget />;
      case "cowork":
        return <CoworkWidget />;
      default:
        return null;
    }
  };

  // Group visible widgets into rows based on span
  const visibleWidgets = widgets.filter((w) => w.visible);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <DashboardTour />

      {/* ── Config bar ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          position: "relative",
        }}
        ref={configRef}
      >
        <button
          onClick={() => setConfigOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            background: configOpen
              ? "rgba(139,92,246,0.15)"
              : "rgba(255,255,255,0.05)",
            border: `1px solid ${configOpen ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-full)",
            cursor: "pointer",
            color: configOpen ? "var(--brand-accent)" : "var(--text-secondary)",
            fontSize: "13px",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          <Settings2 size={15} /> Personnaliser
        </button>

        {configOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              zIndex: 50,
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              minWidth: "280px",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "14px" }}>
                Widgets du Dashboard
              </span>
              <button
                onClick={resetLayout}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {widgets.map((w, idx) => (
                <div
                  key={w.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    cursor: "grab",
                    background:
                      dragOverIdx === idx
                        ? "rgba(139,92,246,0.1)"
                        : "transparent",
                    border:
                      dragOverIdx === idx
                        ? "1px dashed rgba(139,92,246,0.4)"
                        : "1px solid transparent",
                    opacity: dragIdx === idx ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  <GripVertical
                    size={14}
                    style={{
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: "13px",
                      color: w.visible
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {w.label}
                  </span>
                  <button
                    onClick={() => toggleWidget(w.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: w.visible
                        ? "var(--brand-accent)"
                        : "var(--text-secondary)",
                      padding: "2px",
                      display: "flex",
                    }}
                  >
                    {w.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Widgets grid ──────────────────────────────────────────────── */}
      {visibleWidgets.map((w, idx) => {
        const isFullWidth = w.span === 2;
        // Check if next widget is also span 1 to pair them
        const nextW = visibleWidgets[idx + 1];
        const isPairStart = !isFullWidth && nextW && nextW.span !== 2;

        // Skip if this is the second in a pair (already rendered)
        if (!isFullWidth && idx > 0) {
          const prev = visibleWidgets[idx - 1];
          if (prev && prev.span !== 2) {
            // Check if I was already rendered as part of a pair
            let pairCount = 0;
            for (let i = 0; i < idx; i++) {
              if (visibleWidgets[i].span === 2) pairCount = 0;
              else pairCount++;
            }
            if (pairCount % 2 === 1) return null; // second in pair, skip
          }
        }

        if (isFullWidth) {
          return <div key={w.id}>{renderWidget(w.id)}</div>;
        }

        // Pair two span-1 widgets
        if (isPairStart) {
          return (
            <div
              key={w.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
              }}
            >
              {renderWidget(w.id)}
              {renderWidget(nextW.id)}
            </div>
          );
        }

        // Orphan span-1 (no pair)
        return <div key={w.id}>{renderWidget(w.id)}</div>;
      })}

      <style>{`
        @keyframes pulseDot {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
};
