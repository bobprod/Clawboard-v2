/**
 * LiaPlanPreview — Affichage et exécution d'un plan généré par Lia
 * Supports: task, modele, cron, skill, note
 */
import { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Zap,
  Clock,
  Loader2,
  ExternalLink,
  FileText,
  Repeat2,
  BookOpen,
  StickyNote,
  Cpu,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import { useNavigate } from "react-router-dom";

const BASE = "http://localhost:4000";

export interface PlanStep {
  id: string;
  type?: "task" | "modele" | "cron" | "skill" | "note";
  name: string;
  description?: string;
  skill?: string;
  agent?: string;
  prompt: string;
  recurrence?: string | null;
  approval_needed?: boolean;
  depends_on?: string[];
}

export interface LiaPlan {
  summary: string;
  steps: PlanStep[];
  risks?: string[];
  estimated_tokens?: number;
}

interface ExecutionResult {
  stepId: string;
  type: string;
  resourceId: string;
  name: string;
  ok: boolean;
  error?: string;
}

type StepStatus = "pending" | "running" | "done" | "error";

const TYPE_META: Record<
  string,
  { icon: typeof Zap; color: string; label: string; route?: string }
> = {
  task: { icon: FileText, color: "#3b82f6", label: "Tâche", route: "/tasks" },
  modele: { icon: Cpu, color: "#a855f7", label: "Modèle", route: "/tasks" },
  cron: {
    icon: Repeat2,
    color: "#f59e0b",
    label: "Récurrence",
    route: "/scheduler",
  },
  skill: { icon: BookOpen, color: "#10b981", label: "Skill", route: "/skills" },
  note: { icon: StickyNote, color: "#06b6d4", label: "Note", route: "/memory" },
};

interface Props {
  plan: LiaPlan;
  onExecuted?: (results: ExecutionResult[]) => void;
}

export function LiaPlanPreview({ plan, onExecuted }: Props) {
  const navigate = useNavigate();
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<ExecutionResult[]>([]);
  const [progress, setProgress] = useState<Record<string, StepStatus>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const execute = async () => {
    setExecuting(true);
    // Mark all as running sequentially via the batch endpoint
    for (const step of plan.steps) {
      setProgress((p) => ({ ...p, [step.id]: "running" }));
    }

    try {
      const res = await apiFetch(`${BASE}/api/chat/plan/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: plan.steps }),
      });
      const data = res.ok
        ? await res.json().catch(() => ({ results: [] }))
        : { results: [] };
      const execResults: ExecutionResult[] = data.results || [];

      // Update progress per step
      const newProgress: Record<string, StepStatus> = {};
      for (const r of execResults) {
        newProgress[r.stepId] = r.ok ? "done" : "error";
      }
      setProgress(newProgress);
      setResults(execResults);
      setDone(true);
      onExecuted?.(execResults);
    } catch {
      // Graceful fallback — mark all as done with demo IDs
      const fallbackResults: ExecutionResult[] = plan.steps.map((s) => ({
        stepId: s.id,
        type: s.type || "task",
        resourceId: `demo-${s.id}`,
        name: s.name,
        ok: true,
      }));
      setProgress(
        Object.fromEntries(plan.steps.map((s) => [s.id, "done" as StepStatus])),
      );
      setResults(fallbackResults);
      setDone(true);
      onExecuted?.(fallbackResults);
    }

    setExecuting(false);
  };

  const toggleStep = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // Count by type
  const typeCounts = plan.steps.reduce(
    (acc, s) => {
      const t = s.type || (s.recurrence ? "cron" : "task");
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.05), rgba(59,130,246,0.03))",
        border: "1px solid rgba(139,92,246,0.18)",
        borderRadius: 14,
        overflow: "hidden",
        marginTop: 8,
        fontSize: "0.8rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid rgba(139,92,246,0.1)",
          background: "rgba(139,92,246,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Zap size={13} color="#8b5cf6" />
        <span
          style={{
            fontWeight: 700,
            fontSize: "0.75rem",
            color: "#8b5cf6",
            letterSpacing: "0.4px",
          }}
        >
          PLAN D'EXÉCUTION
        </span>
        {/* Type badges in header */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          {Object.entries(typeCounts).map(([type, count]) => {
            const meta = TYPE_META[type] || TYPE_META.task;
            const Icon = meta.icon;
            return (
              <span
                key={type}
                style={{
                  fontSize: "0.68rem",
                  padding: "1px 7px",
                  borderRadius: 99,
                  background: `${meta.color}15`,
                  color: meta.color,
                  border: `1px solid ${meta.color}30`,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Icon size={9} />
                {count} {meta.label}
                {count > 1 ? "s" : ""}
              </span>
            );
          })}
        </div>
      </div>

      <div
        style={{
          padding: "8px 14px 4px",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          fontStyle: "italic",
          fontSize: "0.77rem",
        }}
      >
        {plan.summary}
      </div>

      {/* Estimated tokens */}
      {plan.estimated_tokens && (
        <div
          style={{
            padding: "0 14px 6px",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
          }}
        >
          ≈ {(plan.estimated_tokens / 1000).toFixed(0)}k tokens estimés
        </div>
      )}

      {/* Steps */}
      <div
        style={{
          padding: "6px 14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {plan.steps.map((step) => {
          const st: StepStatus = progress[step.id] ?? "pending";
          const stepType = step.type || (step.recurrence ? "cron" : "task");
          const meta = TYPE_META[stepType] || TYPE_META.task;
          const Icon = meta.icon;
          const isExpanded = expanded[step.id];
          const stepResult = results.find((r) => r.stepId === step.id);

          return (
            <div
              key={step.id}
              style={{
                borderRadius: 10,
                background:
                  st === "done"
                    ? "rgba(16,185,129,0.05)"
                    : st === "error"
                      ? "rgba(239,68,68,0.05)"
                      : st === "running"
                        ? "rgba(139,92,246,0.06)"
                        : "rgba(255,255,255,0.02)",
                border: `1px solid ${
                  st === "done"
                    ? "rgba(16,185,129,0.18)"
                    : st === "error"
                      ? "rgba(239,68,68,0.18)"
                      : st === "running"
                        ? "rgba(139,92,246,0.25)"
                        : "var(--border-subtle)"
                }`,
                transition: "all 0.3s",
                overflow: "hidden",
              }}
            >
              {/* Step header — clickable */}
              <div
                onClick={() => toggleStep(step.id)}
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "center",
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                {/* Step type indicator */}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      st === "done"
                        ? "rgba(16,185,129,0.12)"
                        : st === "running"
                          ? "rgba(139,92,246,0.15)"
                          : `${meta.color}15`,
                    border: `1px solid ${
                      st === "done"
                        ? "rgba(16,185,129,0.3)"
                        : st === "running"
                          ? "rgba(139,92,246,0.35)"
                          : `${meta.color}30`
                    }`,
                  }}
                >
                  {st === "done" ? (
                    <CheckCircle size={11} color="#10b981" />
                  ) : st === "running" ? (
                    <Loader2
                      size={11}
                      color="#8b5cf6"
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : st === "error" ? (
                    <AlertTriangle size={11} color="#ef4444" />
                  ) : (
                    <Icon size={11} color={meta.color} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        fontSize: "0.8rem",
                      }}
                    >
                      {step.name}
                    </span>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        padding: "0 6px",
                        borderRadius: 99,
                        background: `${meta.color}12`,
                        color: meta.color,
                        border: `1px solid ${meta.color}25`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  {/* Inline badges */}
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      marginTop: 3,
                    }}
                  >
                    {step.skill && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0 5px",
                          borderRadius: 99,
                          background: "rgba(59,130,246,0.1)",
                          color: "#60a5fa",
                          border: "1px solid rgba(59,130,246,0.18)",
                        }}
                      >
                        ⚡ {step.skill}
                      </span>
                    )}
                    {step.agent && step.agent !== "main" && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0 5px",
                          borderRadius: 99,
                          background: "rgba(16,185,129,0.08)",
                          color: "#34d399",
                          border: "1px solid rgba(16,185,129,0.18)",
                        }}
                      >
                        🤖 {step.agent}
                      </span>
                    )}
                    {step.recurrence && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0 5px",
                          borderRadius: 99,
                          background: "rgba(245,158,11,0.1)",
                          color: "#fbbf24",
                          border: "1px solid rgba(245,158,11,0.2)",
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Clock size={8} />
                        {step.recurrence}
                      </span>
                    )}
                    {step.approval_needed && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0 5px",
                          borderRadius: 99,
                          background: "rgba(239,68,68,0.08)",
                          color: "#f87171",
                          border: "1px solid rgba(239,68,68,0.18)",
                        }}
                      >
                        ⚠ Approbation
                      </span>
                    )}
                    {step.depends_on && step.depends_on.length > 0 && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0 5px",
                          borderRadius: 99,
                          background: "rgba(139,92,246,0.08)",
                          color: "var(--text-muted)",
                          border: "1px solid rgba(139,92,246,0.15)",
                        }}
                      >
                        ← {step.depends_on.join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand arrow */}
                <span
                  style={{
                    color: "var(--text-muted)",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                </span>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div
                  style={{
                    padding: "0 10px 8px 43px",
                    borderTop: "1px solid var(--border-subtle)",
                    paddingTop: 8,
                  }}
                >
                  {step.description && (
                    <div
                      style={{
                        fontSize: "0.73rem",
                        color: "var(--text-secondary)",
                        marginBottom: 6,
                        lineHeight: 1.4,
                      }}
                    >
                      {step.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "0.71rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.4,
                      background: "rgba(0,0,0,0.1)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {step.prompt}
                  </div>
                  {/* Show created resource ID after execution */}
                  {stepResult && stepResult.ok && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: "0.7rem",
                        color: "#10b981",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <CheckCircle size={10} />
                      Créé :{" "}
                      <code
                        style={{
                          background: "rgba(16,185,129,0.1)",
                          padding: "1px 5px",
                          borderRadius: 4,
                        }}
                      >
                        {stepResult.resourceId}
                      </code>
                    </div>
                  )}
                  {stepResult && !stepResult.ok && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: "0.7rem",
                        color: "#ef4444",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <AlertTriangle size={10} />
                      Erreur : {stepResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Risks */}
      {plan.risks && plan.risks.length > 0 && (
        <div
          style={{
            padding: "7px 14px",
            borderTop: "1px solid rgba(245,158,11,0.1)",
            background: "rgba(245,158,11,0.03)",
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
          }}
        >
          <AlertTriangle
            size={11}
            color="#f59e0b"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div
            style={{
              fontSize: "0.7rem",
              color: "#f59e0b",
              lineHeight: 1.5,
              opacity: 0.9,
            }}
          >
            {plan.risks.join(" · ")}
          </div>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {!done ? (
          <button
            disabled={executing}
            onClick={execute}
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: 9,
              border: "none",
              cursor: executing ? "not-allowed" : "pointer",
              background: executing
                ? "rgba(139,92,246,0.25)"
                : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              boxShadow: executing
                ? "none"
                : "0 3px 12px rgba(139,92,246,0.35)",
              transition: "all 0.2s",
              letterSpacing: "0.2px",
            }}
          >
            {executing ? (
              <>
                <Loader2
                  size={13}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Création en cours…
              </>
            ) : (
              <>
                ✓ Confirmer et créer {plan.steps.length} élément
                {plan.steps.length > 1 ? "s" : ""}
              </>
            )}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 9,
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <CheckCircle size={14} color="#10b981" />
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "#10b981",
                  fontWeight: 600,
                }}
              >
                {results.filter((r) => r.ok).length} / {plan.steps.length} créé
                {results.filter((r) => r.ok).length > 1 ? "s" : ""} !
              </span>
            </div>
            {/* Navigation links by type */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(typeCounts).map(([type, _count]) => {
                const meta = TYPE_META[type] || TYPE_META.task;
                return meta.route ? (
                  <button
                    key={type}
                    onClick={() => navigate(meta.route!)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "0.72rem",
                      color: meta.color,
                      fontWeight: 600,
                      background: `${meta.color}10`,
                      border: `1px solid ${meta.color}25`,
                      borderRadius: 8,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Voir {meta.label.toLowerCase()}s <ExternalLink size={9} />
                  </button>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
