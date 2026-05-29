import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Play,
  Square,
  Plus,
  Trash2,
  Search,
  Loader2,
  Cpu,
  CheckCircle2,
  XCircle,
  WifiOff,
  AlertCircle,
  Terminal,
  MemoryStick,
  Zap,
  RotateCcw,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcpAgent {
  id: string;
  name: string;
  command: string;
  args: string[];
  role: "leader" | "teammate" | "standalone";
  status: "idle" | "busy" | "error" | "disconnected" | "stopped";
  pid: number | null;
  detected: boolean;
  config: Record<string, unknown>;
  uptime: number;
  taskCount: number;
  cpu: number;
  memory: number;
  lastError: string | null;
  createdAt: string;
}

interface ScanResult {
  scanned: number;
  agents: { id: string; name: string; command: string; version?: string; provider?: string }[];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Bot; label: string }> = {
  idle: { color: "#10b981", icon: CheckCircle2, label: "Idle" },
  busy: { color: "#f59e0b", icon: Loader2, label: "Busy" },
  error: { color: "#ef4444", icon: XCircle, label: "Error" },
  disconnected: { color: "#6b7280", icon: WifiOff, label: "Disconnected" },
  stopped: { color: "#6b7280", icon: Square, label: "Stopped" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.stopped;
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        background: `${cfg.color}22`,
        color: cfg.color,
        border: `1px solid ${cfg.color}44`,
      }}
    >
      <Icon size={12} className={status === "busy" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

// ─── AcpManager Component ─────────────────────────────────────────────────────

export function AcpManager() {
  const [agents, setAgents] = useState<AcpAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "detected" | "custom">("all");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Add agent form
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCmd, setNewCmd] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newRole, setNewRole] = useState("teammate");

  const fetchAgents = useCallback(async () => {
    try {
      const res = await apiFetch(`${BASE}/api/acp/agents`);
      if (res.ok) {
        setAgents(await res.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const setAction = (id: string, val: boolean) =>
    setActionLoading((prev) => ({ ...prev, [id]: val }));

  const startAgent = async (id: string) => {
    setAction(id, true);
    try {
      await apiFetch(`${BASE}/api/acp/agents/${id}/start`, { method: "POST" });
      await fetchAgents();
    } catch {
      setError(`Failed to start ${id}`);
    } finally {
      setAction(id, false);
    }
  };

  const stopAgent = async (id: string) => {
    setAction(id, true);
    try {
      await apiFetch(`${BASE}/api/acp/agents/${id}/stop`, { method: "POST" });
      await fetchAgents();
    } catch {
      setError(`Failed to stop ${id}`);
    } finally {
      setAction(id, false);
    }
  };

  const restartAgent = async (id: string) => {
    setAction(id, true);
    try {
      await apiFetch(`${BASE}/api/acp/agents/${id}/stop`, { method: "POST" });
      await apiFetch(`${BASE}/api/acp/agents/${id}/start`, { method: "POST" });
      await fetchAgents();
    } catch {
      setError(`Failed to restart ${id}`);
    } finally {
      setAction(id, false);
    }
  };

  const deleteAgent = async (id: string) => {
    setAction(id, true);
    try {
      await apiFetch(`${BASE}/api/acp/agents/${id}`, { method: "DELETE" });
      await fetchAgents();
    } catch {
      setError(`Failed to delete ${id}`);
    } finally {
      setAction(id, false);
    }
  };

  const scanPath = async () => {
    setScanning(true);
    try {
      const res = await apiFetch(`${BASE}/api/acp/scan`, { method: "POST" });
      if (res.ok) {
        const data: ScanResult = await res.json();
        setError(null);
        await fetchAgents();
        if (data.agents.length === 0) {
          setError("No CLI agents found on PATH");
        }
      }
    } catch {
      setError("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const addCustomAgent = async () => {
    if (!newCmd.trim()) return setError("Command is required");
    try {
      await apiFetch(`${BASE}/api/acp/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId || undefined,
          name: newName || newCmd,
          command: newCmd,
          args: newArgs ? newArgs.split(",").map((s) => s.trim()) : [],
          role: newRole,
        }),
      });
      setShowAdd(false);
      setNewId("");
      setNewName("");
      setNewCmd("");
      setNewArgs("");
      setNewRole("teammate");
      await fetchAgents();
    } catch {
      setError("Failed to add agent");
    }
  };

  const filtered = agents.filter((a) => {
    if (filter === "detected") return a.detected;
    if (filter === "custom") return !a.detected;
    return true;
  });

  const runningCount = agents.filter((a) => a.status !== "stopped" && a.status !== "disconnected").length;

  if (loading) {
    return (
      <div className="glass-panel p-6" style={{ textAlign: "center", padding: 48 }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent, #8b5cf6)" }} />
        <p className="text-muted" style={{ marginTop: 12 }}>Loading ACP agents...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="glass-panel p-6" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Bot size={24} style={{ color: "var(--accent, #8b5cf6)" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>ACP Agents</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              {agents.length} registered &middot; {runningCount} running
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={scanPath}
            disabled={scanning}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
              background: "var(--bg-glass, rgba(255,255,255,0.05))",
              color: "var(--text-primary, #fff)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Scan PATH
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--accent, #8b5cf6)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Plus size={14} />
            Add Agent
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="glass-panel"
          style={{
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderColor: "#ef444444",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          <AlertCircle size={14} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Add agent form */}
      {showAdd && (
        <div className="glass-panel p-6">
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>
            <Plus size={16} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Add Custom Agent
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <input
              placeholder="ID (auto-generated)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={inputStyle}>
              <option value="leader">Leader</option>
              <option value="teammate">Teammate</option>
              <option value="standalone">Standalone</option>
            </select>
            <input
              placeholder="Command (required)"
              value={newCmd}
              onChange={(e) => setNewCmd(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Args (comma-separated)"
              value={newArgs}
              onChange={(e) => setNewArgs(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addCustomAgent} style={btnPrimaryStyle}>
                <Plus size={14} /> Create
              </button>
              <button onClick={() => setShowAdd(false)} style={btnGhostStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["all", "detected", "custom"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
              background: filter === f ? "var(--accent, #8b5cf6)" : "var(--bg-glass, rgba(255,255,255,0.05))",
              color: filter === f ? "#fff" : "var(--text-primary, #fff)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {f === "all" ? `All (${agents.length})` : f === "detected" ? `Detected (${agents.filter((a) => a.detected).length})` : `Custom (${agents.filter((a) => !a.detected).length})`}
          </button>
        ))}
      </div>

      {/* Agent cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {filtered.map((agent) => {
          const busy = actionLoading[agent.id];
          const isRunning = agent.status !== "stopped" && agent.status !== "disconnected";
          const providerColor = (agent.config?.color as string) || "var(--accent, #8b5cf6)";

          return (
            <div
              key={agent.id}
              className="glass-panel p-6"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                borderLeft: `3px solid ${providerColor}`,
              }}
            >
              {/* Top row: name + status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{agent.name}</span>
                    {agent.detected && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#3b82f622", color: "#3b82f6" }}>
                        PATH
                      </span>
                    )}
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${providerColor}22`, color: providerColor }}>
                      {agent.role}
                    </span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                    <Terminal size={10} style={{ verticalAlign: "text-bottom" }} /> {agent.command} {(agent.args || []).join(" ")}
                  </div>
                </div>
                <StatusBadge status={agent.status} />
              </div>

              {/* Metrics */}
              {isRunning && (
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted, #9ca3af)" }}>
                  {agent.pid && <span>PID: {agent.pid}</span>}
                  <span>
                    <Cpu size={10} style={{ verticalAlign: "text-bottom" }} /> {agent.cpu}%
                  </span>
                  <span>
                    <MemoryStick size={10} style={{ verticalAlign: "text-bottom" }} /> {agent.memory}MB
                  </span>
                  <span>
                    <Zap size={10} style={{ verticalAlign: "text-bottom" }} /> {agent.taskCount} tasks
                  </span>
                </div>
              )}

              {/* Error */}
              {agent.lastError && (
                <div style={{ fontSize: 12, color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertCircle size={12} /> {agent.lastError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                {isRunning ? (
                  <>
                    <button
                      onClick={() => stopAgent(agent.id)}
                      disabled={busy}
                      style={btnDangerStyle}
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                      Stop
                    </button>
                    <button
                      onClick={() => restartAgent(agent.id)}
                      disabled={busy}
                      style={btnGhostStyle}
                    >
                      <RotateCcw size={12} /> Restart
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startAgent(agent.id)}
                    disabled={busy}
                    style={btnPrimaryStyle}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    Start
                  </button>
                )}
                {!agent.detected && (
                  <button
                    onClick={() => deleteAgent(agent.id)}
                    disabled={busy}
                    style={{ ...btnGhostStyle, marginLeft: "auto", color: "#ef4444" }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="glass-panel p-6" style={{ textAlign: "center", padding: 48, color: "var(--text-muted, #9ca3af)" }}>
          <Bot size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>No agents {filter !== "all" ? `(${filter})` : ""} found.</p>
          <p style={{ fontSize: 13 }}>
            Click <strong>Scan PATH</strong> to detect installed CLI agents, or <strong>Add Agent</strong> to register one manually.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
  background: "var(--bg-input, rgba(255,255,255,0.05))",
  color: "var(--text-primary, #fff)",
  fontSize: 13,
  outline: "none",
};

const btnPrimaryStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent, #8b5cf6)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};

const btnGhostStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
  background: "transparent",
  color: "var(--text-primary, #fff)",
  cursor: "pointer",
  fontSize: 12,
};

const btnDangerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #ef444444",
  background: "#ef444422",
  color: "#ef4444",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};
