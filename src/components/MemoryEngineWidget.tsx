import { useState, useEffect, useCallback } from "react";
import {
  BrainCircuit,
  Layers,
  RefreshCw,
  Zap,
  GitFork,
  Clock,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Database,
  Activity,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

interface EngineStatus {
  sessions: number;
  cachedFiles: number;
  indexMaxLines: number;
  indexMaxChars: number;
  features: string[];
}

interface SessionSummary {
  id: string;
  agentId: string;
  taskId: string | null;
  state: string;
  title: string;
  worklogSize: number;
  errorsCount: number;
  learningsCount: number;
  createdAt: string;
  lastActivity: string;
}

interface DreamResult {
  status: string;
  before?: number;
  after?: number;
  actions?: { type: string; topic?: string; removed?: string | number }[];
}

interface SearchResult {
  index: { topic: string; summary: string; file: string | null }[];
  topics: { file: string; preview: string }[];
  transcripts: { matches: number }[];
}

const pill: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: "11px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

export function MemoryEngineWidget() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dreamResult, setDreamResult] = useState<DreamResult | null>(null);
  const [dreaming, setDreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"overview" | "sessions" | "search">(
    "overview",
  );

  const fetchStatus = useCallback(() => {
    apiFetch(`${BASE}/api/memory/engine/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setStatus({
          sessions: 0,
          cachedFiles: 0,
          indexMaxLines: 100,
          indexMaxChars: 150,
          features: [
            "3-layer-memory",
            "autoDream",
            "structured-sessions",
            "file-dedup",
            "subagent-fork",
            "context-budget",
          ],
        }),
      );
  }, []);

  const fetchSessions = useCallback(() => {
    apiFetch(`${BASE}/api/memory/engine/sessions`)
      .then((r) => r.json())
      .then((d) => setSessions(Array.isArray(d) ? d : []))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSessions();
    const iv = setInterval(() => {
      fetchStatus();
      fetchSessions();
    }, 30000);
    return () => clearInterval(iv);
  }, [fetchStatus, fetchSessions]);

  const runAutoDream = async () => {
    setDreaming(true);
    setDreamResult(null);
    try {
      const r = await apiFetch(`${BASE}/api/memory/engine/autodream`, {
        method: "POST",
      });
      const data = await r.json();
      setDreamResult(data);
    } catch {
      setDreamResult({ status: "error", actions: [] });
    }
    setDreaming(false);
  };

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const r = await apiFetch(`${BASE}/api/memory/engine/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      setSearchResults(await r.json());
    } catch {
      setSearchResults({
        index: [],
        topics: [],
        transcripts: [{ matches: 0 }],
      });
    }
    setSearching(false);
  };

  const featureIcons: Record<string, React.ReactNode> = {
    "3-layer-memory": <Layers size={12} />,
    autoDream: <Sparkles size={12} />,
    "structured-sessions": <Clock size={12} />,
    "file-dedup": <Database size={12} />,
    "subagent-fork": <GitFork size={12} />,
    "context-budget": <Activity size={12} />,
  };

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: 16,
        border: "1px solid var(--border-subtle)",
        padding: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrainCircuit size={20} style={{ color: "var(--brand-accent)" }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Memory Engine</span>
          <span
            style={{
              ...pill,
              background: "rgba(139,92,246,0.15)",
              color: "var(--brand-accent)",
            }}
          >
            <Zap size={10} /> NemoClaw
          </span>
        </div>
        <button
          onClick={() => {
            fetchStatus();
            fetchSessions();
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            padding: 4,
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}
      >
        {(["overview", "sessions", "search"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background:
                tab === t ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
              color:
                tab === t ? "var(--brand-accent)" : "var(--text-secondary)",
              transition: "all 0.2s",
            }}
          >
            {t === "overview"
              ? "Vue d'ensemble"
              : t === "sessions"
                ? "Sessions"
                : "Recherche"}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Stats row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            <StatBox
              label="Sessions actives"
              value={status?.sessions ?? 0}
              icon={<Activity size={14} />}
            />
            <StatBox
              label="Fichiers cachés"
              value={status?.cachedFiles ?? 0}
              icon={<Database size={14} />}
            />
            <StatBox
              label="Index max"
              value={`${status?.indexMaxLines ?? 100} lignes`}
              icon={<Layers size={14} />}
            />
          </div>

          {/* Features */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Fonctionnalités actives
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(status?.features || []).map((f) => (
                <span
                  key={f}
                  style={{
                    ...pill,
                    background: "rgba(16,185,129,0.12)",
                    color: "#10b981",
                  }}
                >
                  {featureIcons[f] || <CheckCircle2 size={10} />} {f}
                </span>
              ))}
            </div>
          </div>

          {/* Architecture diagram */}
          <div
            style={{
              background: "var(--bg-glass)",
              borderRadius: 12,
              padding: 16,
              fontFamily: "monospace",
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              Architecture Mémoire 3 Couches
            </div>
            <div>┌─────────────────────────────────────────────┐</div>
            <div>
              │ <span style={{ color: "#f59e0b" }}>L1 INDEX</span> │ MEMORY.md
              (toujours chargé, ~150 chars/ligne) │
            </div>
            <div>├─────────────────────────────────────────────┤</div>
            <div>
              │ <span style={{ color: "#3b82f6" }}>L2 TOPICS</span> │ Fichiers
              thématiques (chargés à la demande) │
            </div>
            <div>├─────────────────────────────────────────────┤</div>
            <div>
              │ <span style={{ color: "#6b7280" }}>L3 TRANSCRIPTS</span> │ Logs
              bruts (jamais lus, uniquement grep) │
            </div>
            <div>└─────────────────────────────────────────────┘</div>
          </div>

          {/* autoDream button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={runAutoDream}
              disabled={dreaming}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                cursor: dreaming ? "wait" : "pointer",
                background:
                  "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))",
                color: "var(--brand-accent)",
                fontWeight: 600,
                fontSize: 12,
                transition: "all 0.2s",
              }}
            >
              {dreaming ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {dreaming ? "Consolidation…" : "autoDream"}
            </button>
            {dreamResult && (
              <span
                style={{
                  fontSize: 11,
                  color:
                    dreamResult.status === "ok"
                      ? "#10b981"
                      : "var(--text-secondary)",
                }}
              >
                {dreamResult.status === "ok"
                  ? `✓ ${dreamResult.before}→${dreamResult.after} entrées, ${dreamResult.actions?.length || 0} actions`
                  : dreamResult.status === "no-index"
                    ? "Pas d'index MEMORY.md trouvé"
                    : "Erreur"}
              </span>
            )}
          </div>
          {dreamResult?.actions && dreamResult.actions.length > 0 && (
            <div
              style={{
                maxHeight: 120,
                overflowY: "auto",
                fontSize: 11,
                color: "var(--text-secondary)",
                padding: "8px 12px",
                background: "var(--bg-glass)",
                borderRadius: 8,
              }}
            >
              {dreamResult.actions.map((a, i) => (
                <div key={i} style={{ marginBottom: 2 }}>
                  <span
                    style={{
                      color:
                        a.type === "dedup"
                          ? "#f59e0b"
                          : a.type === "prune"
                            ? "#ef4444"
                            : a.type === "merge"
                              ? "#3b82f6"
                              : "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    [{a.type}]
                  </span>{" "}
                  {typeof a.removed === "string"
                    ? a.removed
                    : a.topic
                      ? `${a.topic}: ${a.removed} supprimées`
                      : `${a.removed} supprimées`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {tab === "sessions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: 24,
                color: "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              Aucune session active
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                style={{
                  background: "var(--bg-glass)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {s.title || s.id}
                  </span>
                  <span
                    style={{
                      ...pill,
                      background:
                        s.state === "active"
                          ? "rgba(16,185,129,0.15)"
                          : "rgba(107,114,128,0.15)",
                      color: s.state === "active" ? "#10b981" : "#6b7280",
                    }}
                  >
                    {s.state}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>🤖 {s.agentId}</span>
                  <span>📋 {s.worklogSize} étapes</span>
                  {s.errorsCount > 0 && (
                    <span style={{ color: "#ef4444" }}>
                      <AlertTriangle
                        size={10}
                        style={{ verticalAlign: "middle" }}
                      />{" "}
                      {s.errorsCount}
                    </span>
                  )}
                  <span>💡 {s.learningsCount} learnings</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Search Tab */}
      {tab === "search" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Rechercher dans les 3 couches mémoire…"
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--bg-glass)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={runSearch}
              disabled={searching}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "rgba(139,92,246,0.2)",
                color: "var(--brand-accent)",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {searching ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Search size={14} />
              )}
            </button>
          </div>

          {searchResults && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Layer 1 results */}
              <LayerResults
                label="L1 INDEX"
                color="#f59e0b"
                count={searchResults.index.length}
              >
                {searchResults.index.map((e, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 12, color: "var(--text-secondary)" }}
                  >
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                      [{e.topic}]
                    </span>{" "}
                    {e.summary}
                    {e.file && (
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {" "}
                        → {e.file}
                      </span>
                    )}
                  </div>
                ))}
              </LayerResults>

              {/* Layer 2 results */}
              <LayerResults
                label="L2 TOPICS"
                color="#3b82f6"
                count={searchResults.topics.length}
              >
                {searchResults.topics.map((t, i) => (
                  <div key={i} style={{ fontSize: 12 }}>
                    <span style={{ color: "#3b82f6", fontWeight: 600 }}>
                      {t.file}
                    </span>
                    <pre
                      style={{
                        fontSize: 10,
                        color: "var(--text-secondary)",
                        margin: "4px 0",
                        whiteSpace: "pre-wrap",
                        maxHeight: 60,
                        overflow: "hidden",
                      }}
                    >
                      {t.preview}
                    </pre>
                  </div>
                ))}
              </LayerResults>

              {/* Layer 3 results */}
              <LayerResults
                label="L3 TRANSCRIPTS"
                color="#6b7280"
                count={searchResults.transcripts[0]?.matches || 0}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {searchResults.transcripts[0]?.matches || 0} occurrences dans
                  les logs d&apos;activité
                </div>
              </LayerResults>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-glass)",
        borderRadius: 10,
        padding: "12px 14px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "var(--brand-accent)",
          marginBottom: 4,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div
        style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)" }}
      >
        {value}
      </div>
      <div
        style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}
      >
        {label}
      </div>
    </div>
  );
}

function LayerResults({
  label,
  color,
  count,
  children,
}: {
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-glass)",
        borderRadius: 10,
        padding: "10px 14px",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 11, color }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {count} résultat{count !== 1 ? "s" : ""}
        </span>
      </div>
      {children}
    </div>
  );
}
