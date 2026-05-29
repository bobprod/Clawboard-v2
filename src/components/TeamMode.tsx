import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Play,
  Plus,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Shield,
  ShieldCheck,
  ShieldX,
  Clock,
  RefreshCw,
  Mail,
  Radio,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcpAgent {
  id: string;
  name: string;
  command: string;
  role: string;
  status: string;
  detected: boolean;
  config: Record<string, unknown>;
}

interface TeamSession {
  id: string;
  name: string;
  leaderId: string;
  teammateIds: string[];
  status: string;
}

interface MailboxMessage {
  id: number;
  sessionId: string;
  from: string;
  to: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface PermissionRequest {
  id: string;
  agent: string;
  action: string;
  risk: "low" | "medium" | "high";
  description: string;
}

// ─── TeamMode Component ───────────────────────────────────────────────────────

export function TeamMode() {
  const [agents, setAgents] = useState<AcpAgent[]>([]);
  const [sessions, setSessions] = useState<TeamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create session form
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [selectedTeammates, setSelectedTeammates] = useState<string[]>([]);

  // Active session
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState<MailboxMessage[]>([]);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Task delegation
  const [taskTarget, setTaskTarget] = useState("");
  const [taskPayload, setTaskPayload] = useState("");
  const [taskBroadcast, setTaskBroadcast] = useState(false);
  const [sending, setSending] = useState(false);

  // Permissions
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);

  const mailboxRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    try {
      const res = await apiFetch(`${BASE}/api/acp/agents`);
      if (res.ok) setAgents(await res.json());
    } catch {}
  }, []);

  const fetchMailbox = useCallback(async () => {
    if (!activeSession) return;
    setMailboxLoading(true);
    try {
      const url = `${BASE}/api/acp/team/${activeSession}/mailbox?limit=100${unreadOnly ? "&unread=true" : ""}`;
      const res = await apiFetch(url);
      if (res.ok) setMailbox(await res.json());
    } catch {} finally {
      setMailboxLoading(false);
    }
  }, [activeSession, unreadOnly]);

  useEffect(() => {
    Promise.all([fetchAgents()]).finally(() => setLoading(false));
  }, [fetchAgents]);

  useEffect(() => {
    fetchMailbox();
    if (activeSession) {
      const interval = setInterval(fetchMailbox, 3000);
      return () => clearInterval(interval);
    }
  }, [activeSession, fetchMailbox]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const createSession = async () => {
    if (!leaderId || selectedTeammates.length === 0) {
      return setError("Select a leader and at least one teammate");
    }
    try {
      const res = await apiFetch(`${BASE}/api/acp/team/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName || `Team ${Date.now()}`,
          leaderId,
          teammateIds: selectedTeammates,
        }),
      });
      if (res.ok) {
        const session = await res.json();
        setSessions((prev) => [...prev, session]);
        setActiveSession(session.id);
        setShowCreate(false);
        setSessionName("");
        setLeaderId("");
        setSelectedTeammates([]);
        setError(null);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to create session");
      }
    } catch {
      setError("Failed to create session");
    }
  };

  const delegateTask = async () => {
    if (!activeSession) return;
    if (!taskBroadcast && !taskTarget) return setError("Select a target agent or enable broadcast");
    let parsed;
    try {
      parsed = taskPayload ? JSON.parse(taskPayload) : {};
    } catch {
      parsed = { message: taskPayload };
    }
    setSending(true);
    try {
      const res = await apiFetch(`${BASE}/api/acp/team/${activeSession}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAgentId: taskBroadcast ? undefined : taskTarget,
          task: parsed,
          broadcast: taskBroadcast,
        }),
      });
      if (res.ok) {
        setTaskPayload("");
        await fetchMailbox();
      } else {
        const err = await res.json();
        setError(err.error || "Task delegation failed");
      }
    } catch {
      setError("Task delegation failed");
    } finally {
      setSending(false);
    }
  };

  const approvePermission = (id: string) => {
    setPermissions((prev) => prev.filter((p) => p.id !== id));
  };

  const rejectPermission = (id: string) => {
    setPermissions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleTeammate = (id: string) => {
    setSelectedTeammates((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id;

  const msgTypeIcon = (type: string) => {
    switch (type) {
      case "task": return <Send size={12} />;
      case "result": return <CheckCircle2 size={12} style={{ color: "#10b981" }} />;
      case "error": return <XCircle size={12} style={{ color: "#ef4444" }} />;
      case "permission_request": return <Shield size={12} style={{ color: "#f59e0b" }} />;
      case "permission_grant": return <ShieldCheck size={12} style={{ color: "#10b981" }} />;
      case "status": return <Radio size={12} />;
      default: return <MessageSquare size={12} />;
    }
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return ts;
    }
  };

  const availableAgents = agents.filter((a) => a.status !== "stopped");

  if (loading) {
    return (
      <div className="glass-panel p-6" style={{ textAlign: "center", padding: 48 }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent, #8b5cf6)" }} />
        <p className="text-muted" style={{ marginTop: 12 }}>Loading Team Mode...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="glass-panel p-6" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users size={24} style={{ color: "var(--accent, #8b5cf6)" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Team Mode</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} &middot; Leader/Teammate orchestration
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
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
          New Team
        </button>
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
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            &times;
          </button>
        </div>
      )}

      {/* Permission approvals */}
      {permissions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {permissions.map((p) => (
            <div
              key={p.id}
              className="glass-panel"
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderLeft: `3px solid ${p.risk === "high" ? "#ef4444" : p.risk === "medium" ? "#f59e0b" : "#10b981"}`,
              }}
            >
              <Shield size={16} style={{ color: p.risk === "high" ? "#ef4444" : p.risk === "medium" ? "#f59e0b" : "#10b981" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  <strong>{agentName(p.agent)}</strong> requests: {p.action}
                </div>
                <div className="text-muted" style={{ fontSize: 12 }}>{p.description}</div>
              </div>
              <span style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 9999,
                background: p.risk === "high" ? "#ef444422" : p.risk === "medium" ? "#f59e0b22" : "#10b98122",
                color: p.risk === "high" ? "#ef4444" : p.risk === "medium" ? "#f59e0b" : "#10b981",
                textTransform: "uppercase",
                fontWeight: 600,
              }}>
                {p.risk}
              </span>
              <button
                onClick={() => approvePermission(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#10b98122",
                  color: "#10b981",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <ShieldCheck size={12} /> Approve
              </button>
              <button
                onClick={() => rejectPermission(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #ef444444",
                  background: "transparent",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <ShieldX size={12} /> Reject
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create session form */}
      {showCreate && (
        <div className="glass-panel p-6">
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>
            <Users size={16} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Create Team Session
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              placeholder="Session name (optional)"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              style={inputStyle}
            />

            {/* Leader picker */}
            <div>
              <label className="text-muted" style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Leader Agent
              </label>
              <select
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- Select leader --</option>
                {availableAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.command})
                  </option>
                ))}
              </select>
            </div>

            {/* Teammates picker */}
            <div>
              <label className="text-muted" style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Teammates ({selectedTeammates.length} selected)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {availableAgents
                  .filter((a) => a.id !== leaderId)
                  .map((a) => {
                    const selected = selectedTeammates.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleTeammate(a.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? "var(--accent, #8b5cf6)" : "var(--border-subtle, rgba(255,255,255,0.1))"}`,
                          background: selected ? "var(--accent, #8b5cf6)" : "transparent",
                          color: selected ? "#fff" : "var(--text-primary, #fff)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {selected ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                        {a.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={createSession} style={btnPrimaryStyle}>
                <Play size={14} /> Create & Start
              </button>
              <button onClick={() => setShowCreate(false)} style={btnGhostStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session list + active session */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, minHeight: 400 }}>
        {/* Session sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="text-muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
            Sessions
          </div>
          {sessions.length === 0 ? (
            <div className="glass-panel p-6" style={{ textAlign: "center", padding: 24, fontSize: 13, color: "var(--text-muted, #9ca3af)" }}>
              No sessions yet. Create one to get started.
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                className="glass-panel"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "10px 14px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: activeSession === s.id ? "1px solid var(--accent, #8b5cf6)" : undefined,
                  background: activeSession === s.id ? "var(--accent, #8b5cf6)11" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name || s.id}</span>
                  <span style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: s.status === "running" ? "#10b98122" : "#6b728022",
                    color: s.status === "running" ? "#10b981" : "#6b7280",
                  }}>
                    {s.status}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  Leader: {agentName(s.leaderId)} &middot; {(s.teammateIds || []).length} teammates
                </div>
              </button>
            ))
          )}
        </div>

        {/* Active session detail */}
        {activeSession ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Task delegation */}
            <div className="glass-panel p-6">
              <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
                <Send size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
                Delegate Task
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={taskTarget}
                  onChange={(e) => setTaskTarget(e.target.value)}
                  disabled={taskBroadcast}
                  style={{ ...inputStyle, flex: 1, opacity: taskBroadcast ? 0.5 : 1 }}
                >
                  <option value="">-- Target agent --</option>
                  {availableAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={taskBroadcast}
                    onChange={(e) => setTaskBroadcast(e.target.checked)}
                  />
                  <Radio size={12} /> Broadcast
                </label>
              </div>
              <textarea
                placeholder="Task payload (JSON or plain text)"
                value={taskPayload}
                onChange={(e) => setTaskPayload(e.target.value)}
                style={{
                  ...inputStyle,
                  width: "100%",
                  minHeight: 60,
                  marginTop: 8,
                  resize: "vertical",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              />
              <button
                onClick={delegateTask}
                disabled={sending}
                style={{ ...btnPrimaryStyle, marginTop: 8 }}
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {taskBroadcast ? "Broadcast to All" : "Send Task"}
              </button>
            </div>

            {/* Mailbox */}
            <div className="glass-panel p-6" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  <Mail size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
                  Mailbox ({mailbox.length})
                </h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={unreadOnly}
                      onChange={(e) => setUnreadOnly(e.target.checked)}
                    />
                    Unread only
                  </label>
                  <button
                    onClick={fetchMailbox}
                    disabled={mailboxLoading}
                    style={{ ...btnGhostStyle, padding: "4px 8px" }}
                  >
                    <RefreshCw size={12} className={mailboxLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              <div
                ref={mailboxRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 300,
                }}
              >
                {mailbox.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted, #9ca3af)", fontSize: 13 }}>
                    <MessageSquare size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p>No messages yet. Delegate a task to see results here.</p>
                  </div>
                ) : (
                  mailbox.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: msg.read ? "transparent" : "var(--accent, #8b5cf6)08",
                        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ marginTop: 2 }}>{msgTypeIcon(msg.type)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>
                            <strong>{agentName(msg.from)}</strong>
                            <span className="text-muted" style={{ margin: "0 4px" }}>&rarr;</span>
                            <strong>{agentName(msg.to)}</strong>
                          </span>
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            <Clock size={10} style={{ verticalAlign: "text-bottom" }} /> {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        <div className="text-muted" style={{ marginTop: 2, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
                          {typeof msg.payload === "string"
                            ? msg.payload
                            : JSON.stringify(msg.payload).slice(0, 300)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel p-6" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted, #9ca3af)" }}>
            <div style={{ textAlign: "center" }}>
              <Users size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
              <p>Select a session or create a new one.</p>
            </div>
          </div>
        )}
      </div>
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
  width: "100%",
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
