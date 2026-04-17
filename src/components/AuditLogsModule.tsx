import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";
import {
  ScrollText,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Pencil,
  Play,
  Shield,
  Key,
  Settings,
  Globe,
} from "lucide-react";

const BASE = "http://localhost:4000";

interface AuditLog {
  id: number;
  ts: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  ip?: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: "#10b981",
  update: "#3b82f6",
  delete: "#ef4444",
  run: "#f59e0b",
  login: "#8b5cf6",
  approve: "#10b981",
  reject: "#ef4444",
};

const ACTION_ICONS: Record<string, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  run: Play,
  login: Key,
  approve: CheckCircle2,
  reject: AlertTriangle,
};

const ENTITY_ICONS: Record<string, typeof Settings> = {
  task: Play,
  modele: Settings,
  recurrence: Clock,
  skill: Globe,
  cron: Clock,
  auth: Shield,
  approval: Shield,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

const MOCK_LOGS: AuditLog[] = [
  {
    id: 1,
    ts: new Date(Date.now() - 5 * 60000).toISOString(),
    action: "create",
    entityType: "task",
    entityId: "tsk_42",
    payload: { name: "Veille concurrentielle" },
    ip: "127.0.0.1",
  },
  {
    id: 2,
    ts: new Date(Date.now() - 15 * 60000).toISOString(),
    action: "run",
    entityType: "task",
    entityId: "tsk_41",
    payload: { duration: 3200 },
    ip: "127.0.0.1",
  },
  {
    id: 3,
    ts: new Date(Date.now() - 30 * 60000).toISOString(),
    action: "update",
    entityType: "modele",
    entityId: "mod_001",
    payload: { field: "instructions" },
    ip: "127.0.0.1",
  },
  {
    id: 4,
    ts: new Date(Date.now() - 45 * 60000).toISOString(),
    action: "approve",
    entityType: "approval",
    entityId: "apr-1",
    payload: { decision: "approve", risk: "high" },
    ip: "127.0.0.1",
  },
  {
    id: 5,
    ts: new Date(Date.now() - 60 * 60000).toISOString(),
    action: "login",
    entityType: "auth",
    entityId: "admin",
    payload: { method: "password" },
    ip: "127.0.0.1",
  },
  {
    id: 6,
    ts: new Date(Date.now() - 2 * 3600000).toISOString(),
    action: "delete",
    entityType: "task",
    entityId: "tsk_38",
    payload: { name: "Tâche test" },
    ip: "127.0.0.1",
  },
  {
    id: 7,
    ts: new Date(Date.now() - 3 * 3600000).toISOString(),
    action: "create",
    entityType: "recurrence",
    entityId: "rec_005",
    payload: { cronExpr: "0 9 * * 1-5" },
    ip: "127.0.0.1",
  },
  {
    id: 8,
    ts: new Date(Date.now() - 5 * 3600000).toISOString(),
    action: "run",
    entityType: "cron",
    entityId: "cron_002",
    payload: { name: "Morning Briefing" },
    ip: "127.0.0.1",
  },
];

export const AuditLogsModule = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      });
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entity_type", entityFilter);
      if (search) params.set("q", search);
      const r = await apiFetch(`${BASE}/api/audit?${params}`);
      const data = await r.json();
      setLogs(Array.isArray(data) ? data : (data.logs ?? data.data ?? []));
    } catch {
      setLogs(MOCK_LOGS);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const actions = [...new Set(logs.map((l) => l.action))];
  const entities = [...new Set(logs.map((l) => l.entityType))];

  const filtered = logs.filter((l) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !l.action.includes(s) &&
        !l.entityType.includes(s) &&
        !l.entityId.toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  const exportCSV = () => {
    const header = "id,ts,action,entity_type,entity_id,ip\n";
    const rows = filtered
      .map(
        (l) =>
          `${l.id},${l.ts},${l.action},${l.entityType},${l.entityId},${l.ip ?? ""}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        height: "100%",
        paddingBottom: 32,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            background: "var(--brand-accent)",
            padding: 12,
            borderRadius: 14,
            color: "#fff",
          }}
        >
          <ScrollText size={28} />
        </div>
        <div>
          <h2
            style={{
              fontSize: "1.5rem",
              margin: 0,
              color: "var(--text-primary)",
            }}
          >
            Journal d'audit
          </h2>
          <div className="text-muted" style={{ marginTop: 4, fontSize: 13 }}>
            {filtered.length} entrée{filtered.length !== 1 ? "s" : ""} ·
            Traçabilité complète des actions
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={exportCSV}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 9,
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 9,
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: loading ? "spin 1s linear infinite" : "none",
              }}
            />
            Actualiser
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
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
            placeholder="Rechercher…"
            style={{
              width: "100%",
              padding: "7px 12px 7px 30px",
              borderRadius: 8,
              boxSizing: "border-box",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Filter size={13} style={{ color: "var(--text-muted)" }} />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 12,
              outline: "none",
            }}
          >
            <option value="">Toutes actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 12,
              outline: "none",
            }}
          >
            <option value="">Tous types</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs list */}
      <div
        className="glass-panel"
        style={{ padding: 0, overflow: "hidden", flex: 1 }}
      >
        {loading && filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "var(--text-muted)",
            }}
          >
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Aucune entrée d'audit
          </div>
        ) : (
          filtered.map((log, idx) => {
            const color = ACTION_COLORS[log.action] ?? "#6b7280";
            const ActionIcon = ACTION_ICONS[log.action] ?? AlertTriangle;
            const EntityIcon = ENTITY_ICONS[log.entityType] ?? Settings;
            const isOpen = expanded === log.id;

            return (
              <div
                key={log.id}
                style={{
                  borderBottom:
                    idx < filtered.length - 1
                      ? "1px solid var(--border-subtle)"
                      : "none",
                }}
              >
                <div
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 18px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.03)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Action icon */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: `${color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color,
                    }}
                  >
                    <ActionIcon size={14} />
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color,
                          textTransform: "uppercase",
                          letterSpacing: "0.3px",
                        }}
                      >
                        {log.action}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <EntityIcon size={11} /> {log.entityType}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                          color: "var(--brand-accent)",
                        }}
                      >
                        {log.entityId}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 3,
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Clock size={10} /> {timeAgo(log.ts)}
                      </span>
                      {log.ip && (
                        <span style={{ fontFamily: "var(--mono)" }}>
                          {log.ip}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, color: "var(--text-muted)" }}>
                    {isOpen ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </div>
                </div>
                {isOpen && log.payload && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border-subtle)",
                      padding: "10px 18px 14px 64px",
                      background: "rgba(0,0,0,0.1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        marginBottom: 6,
                        letterSpacing: "0.4px",
                      }}
                    >
                      Payload
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}
                    >
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            cursor: page === 0 ? "not-allowed" : "pointer",
            fontSize: 12,
            opacity: page === 0 ? 0.4 : 1,
          }}
        >
          ← Précédent
        </button>
        <span
          style={{
            padding: "6px 12px",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          Page {page + 1}
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={filtered.length < limit}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            cursor: filtered.length < limit ? "not-allowed" : "pointer",
            fontSize: 12,
            opacity: filtered.length < limit ? 0.4 : 1,
          }}
        >
          Suivant →
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
