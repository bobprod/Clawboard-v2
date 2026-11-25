// ─── Améliorations des agents — boucle d'auto-amélioration (Phase C.UI) ──────
//
// 1 concept = 1 page : ici on voit les propositions d'amélioration des agents,
// leur provenance, et on décide (ou on laisse le mode automatique agir).
//
// 3 modes par agent :
//   human  → rien sans accord humain (défaut)
//   safe   → auto-applique uniquement les corrections réversibles
//   auto   → auto-applique tout, SAUF les règles de sécurité
//
// Pause globale = « prendre la main à tout moment ».

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  Check,
  X,
  Wrench,
  Fingerprint,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import { useToast } from "./ToastProvider";

const BASE = "http://localhost:4000";

export interface ImprovementProposal {
  id: string;
  agent_id?: string | null;
  agent?: string | null;
  trigger_pattern?: string | null;
  counts?: Record<string, number> | null;
  payload?: Record<string, unknown> | null;
  kind?: string | null;
  status?: string | null;
  proposed_at?: string | null;
  updated_at?: string | null;
  approved_by?: string | null;
  provenance?: { signature?: string; store?: string } | null;
}

interface ControlState {
  paused: boolean;
  default_mode: string;
  modes: Array<{ agent_id: string; mode: string; updated_at?: string }>;
  store?: { backend?: string; git_repo?: string | null; vault_dir?: string | null };
}

const MODE_LABELS: Record<string, string> = {
  human: "Validation humaine",
  safe: "Auto (sûr)",
  auto: "Auto (complet)",
};

function statusColor(status: string | null | undefined): string {
  switch (status) {
    case "applied":
      return "var(--status-success)";
    case "approved":
      return "var(--status-info)";
    case "rejected":
      return "var(--status-error)";
    default:
      return "var(--status-warning)";
  }
}

function formatAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const ImprovementsPage = () => {
  const { addToast } = useToast();
  const [proposals, setProposals] = useState<ImprovementProposal[]>([]);
  const [control, setControl] = useState<ControlState | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c, a] = await Promise.all([
        getJson<{ proposals?: ImprovementProposal[] }>(
          "/api/improvements/proposals",
        ),
        getJson<ControlState>("/api/improvements/control"),
        getJson<{ counts?: Record<string, number> }>(
          "/api/improvements/analysis",
        ),
      ]);
      setProposals(p?.proposals ?? []);
      setControl(c);
      setCounts(a?.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const modes = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of control?.modes ?? []) map.set(m.agent_id, m.mode);
    return map;
  }, [control]);

  const agents = useMemo(() => {
    const set = new Set<string>();
    for (const p of proposals) if (p.agent_id) set.add(p.agent_id);
    return [...set].sort();
  }, [proposals]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return proposals;
    return proposals.filter(
      (p) =>
        (p.agent_id ?? "").toLowerCase().includes(f) ||
        (p.trigger_pattern ?? "").toLowerCase().includes(f) ||
        (p.kind ?? "").toLowerCase().includes(f),
    );
  }, [proposals, filter]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      addToast(
        "Échec de l'opération",
        "error",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const setStatus = (p: ImprovementProposal, status: string) =>
    run(p.id, async () => {
      await getJson(`/api/improvements/proposals/${encodeURIComponent(p.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actor: "human" }),
      });
      addToast(
        status === "approved"
          ? "Proposition approuvée"
          : status === "rejected"
            ? "Proposition rejetée"
            : "Statut mis à jour",
        "success",
      );
    });

  const applyProposal = (p: ImprovementProposal) =>
    run(p.id, async () => {
      const res = await getJson<{ result?: { store?: string } }>(
        `/api/improvements/proposals/${encodeURIComponent(p.id)}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor: "human" }),
        },
      );
      addToast("Amélioration appliquée", "success", res?.result?.store);
    });

  const verifyProvenance = (p: ImprovementProposal) =>
    run(p.id, async () => {
      const res = await getJson<{ verified?: boolean }>(
        "/api/improvements/record-provenance",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_id: p.id,
            type: p.kind ?? "improvement",
            agent_id: p.agent_id,
            content: JSON.stringify(p.payload ?? {}),
          }),
        },
      );
      addToast(
        res?.verified ? "Provenance vérifiée" : "Provenance non vérifiable",
        res?.verified ? "success" : "warning",
      );
    });

  const togglePause = () =>
    run("control", async () => {
      const action = control?.paused ? "resume" : "pause";
      await getJson("/api/improvements/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      addToast(
        action === "pause"
          ? "Prise de main activée — plus rien ne s'auto-applique"
          : "Boucle automatique relancée",
        "info",
      );
    });

  const changeMode = (agentId: string, mode: string) =>
    run("control", async () => {
      await getJson("/api/improvements/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, mode }),
      });
      addToast(`Mode de ${agentId} : ${MODE_LABELS[mode] ?? mode}`, "info");
    });

  return (
    <div className="improvements-page">
      <header className="improvements-header">
        <div className="improvements-icon">
          <Lightbulb size={26} />
        </div>
        <div>
          <h2>Améliorations des agents</h2>
          <div className="text-muted">
            {proposals.length} proposition(s) ·{" "}
            {Object.values(counts).reduce((a, b) => a + b, 0)} événement(s)
            capturé(s)
          </div>
        </div>
        <span className="improvements-spacer" />
        <button
          className="btn btn-secondary"
          onClick={togglePause}
          disabled={busyId === "control"}
          title={
            control?.paused
              ? "Rendre la main à la boucle automatique"
              : "Prendre la main : bloquer toute auto-application"
          }
        >
          {control?.paused ? (
            <PlayCircle size={14} />
          ) : (
            <PauseCircle size={14} />
          )}
          {control?.paused ? "Rendre la main" : "Prendre la main"}
        </button>
        <button className="btn btn-secondary" onClick={() => void load()}>
          <RefreshCw size={14} /> Rafraîchir
        </button>
      </header>

      {control?.paused && (
        <div className="improvements-banner">
          <ShieldCheck size={16} />
          Boucle automatique en pause : aucune proposition n'est appliquée sans
          votre accord.
        </div>
      )}

      <div className="improvements-toolbar">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer par agent, pattern ou type…"
          className="improvements-filter"
        />
        <div className="improvements-modes">
          {agents.length === 0 && (
            <span className="text-muted">Aucun agent avec proposition</span>
          )}
          {agents.map((agentId) => {
            const mode = modes.get(agentId) ?? "human";
            return (
              <label key={agentId} className="improvements-mode">
                <span className="improvements-mode-agent">{agentId}</span>
                <select
                  value={mode}
                  onChange={(e) => void changeMode(agentId, e.target.value)}
                  disabled={busyId === "control"}
                >
                  {Object.entries(MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="text-muted improvements-empty">Chargement…</div>
      ) : error ? (
        <div className="glass-panel improvements-error">
          <span>Erreur de chargement : {error}</span>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-panel improvements-empty">
          Aucune proposition d'amélioration. Les erreurs répétées (3 fois en 7
          jours) créeront automatiquement une proposition ici.
        </div>
      ) : (
        <div className="improvements-list">
          {visible.map((p) => {
            const color = statusColor(p.status);
            const occurrences = Number(p.counts?.occurrences ?? 0);
            return (
              <article key={p.id} className="improvements-card">
                <div className="improvements-card-top">
                  <span
                    className="improvements-badge"
                    style={{
                      color,
                      background: `color-mix(in srgb, ${color} 18%, transparent)`,
                      borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                    }}
                  >
                    {p.status ?? "pending"}
                  </span>
                  <strong>{p.agent || p.agent_id || "Agent inconnu"}</strong>
                  <span className="text-muted improvements-kind">
                    {p.kind ?? "—"}
                  </span>
                  <span className="text-muted">{formatAge(p.proposed_at)}</span>
                  <span className="improvements-spacer" />
                  <button
                    className="improvements-expand"
                    onClick={() =>
                      setExpandedId((e) => (e === p.id ? null : p.id))
                    }
                    title="Détails"
                  >
                    <ChevronDown
                      size={16}
                      style={{
                        transform:
                          expandedId === p.id ? "rotate(180deg)" : undefined,
                        transition: "transform 0.2s",
                      }}
                    />
                  </button>
                </div>

                <code className="improvements-trigger">
                  {p.trigger_pattern ?? "(aucun pattern)"}
                </code>

                <div className="improvements-meta">
                  <span>{occurrences} occurrence(s)</span>
                  {p.approved_by && <span>approuvé par {p.approved_by}</span>}
                  {p.provenance?.store && (
                    <span>store : {p.provenance.store}</span>
                  )}
                </div>

                {expandedId === p.id && (
                  <pre className="improvements-payload">
                    {JSON.stringify(p.payload ?? {}, null, 2)}
                  </pre>
                )}

                <div className="improvements-actions">
                  {p.status !== "applied" && (
                    <>
                      <button
                        className="btn btn-primary"
                        disabled={busyId === p.id}
                        onClick={() => void applyProposal(p)}
                      >
                        <Wrench size={14} /> Appliquer
                      </button>
                      {p.status === "pending" && (
                        <>
                          <button
                            className="btn btn-secondary"
                            disabled={busyId === p.id}
                            onClick={() => void setStatus(p, "approved")}
                          >
                            <Check size={14} /> Approuver
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={busyId === p.id}
                            onClick={() => void setStatus(p, "rejected")}
                          >
                            <X size={14} /> Rejeter
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <button
                    className="btn btn-secondary"
                    disabled={busyId === p.id}
                    onClick={() => void verifyProvenance(p)}
                  >
                    <Fingerprint size={14} /> Provenance
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImprovementsPage;
