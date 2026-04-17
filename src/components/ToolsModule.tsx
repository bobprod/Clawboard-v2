import { useState, useEffect, useCallback } from "react";
import {
  Wrench,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Save,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  Globe,
  Terminal as TerminalIcon,
  HardDrive,
  Brain,
  Send,
  BotMessageSquare,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tool {
  name: string;
  group: string;
  description: string;
  category: "builtin" | "openclaw";
  security: "safe" | "write" | "destructive" | "elevated" | "network";
  enabled: boolean;
}

interface ToolGroup {
  name: string;
  tools: string[];
  count: number;
}
interface ToolProfile {
  name: string;
  tools: string[];
  active: boolean;
}
interface SecurityLayer {
  name: string;
  description: string;
  status: string;
  hotReloadable: boolean;
  controls: string[];
}

interface ToolsConfig {
  profile: string;
  allow: string[];
  deny: string[];
  security: {
    exec: { allowlist: boolean; timeout: number; maxBuffer: number };
    fs: { readOnly: boolean; blockedExtensions: string[] };
    web: { ssrfProtection: boolean; blockedHosts: string[] };
    messaging: { requireRecipient: boolean };
  };
}

// ─── Security level colors & icons ────────────────────────────────────────────

const SEC_STYLE: Record<
  string,
  { color: string; bg: string; icon: typeof Shield }
> = {
  safe: { color: "#10b981", bg: "rgba(16,185,129,0.1)", icon: ShieldCheck },
  write: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: Shield },
  destructive: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    icon: ShieldAlert,
  },
  elevated: { color: "#f97316", bg: "rgba(249,115,22,0.1)", icon: ShieldAlert },
  network: { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", icon: Globe },
};

const GROUP_ICONS: Record<string, typeof Wrench> = {
  sessions: BotMessageSquare,
  modeles: Brain,
  automation: Zap,
  memory: Brain,
  fs: HardDrive,
  runtime: TerminalIcon,
  web: Globe,
  messaging: Send,
  nemoclaw: ShieldCheck,
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ToolsModule = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [, setGroups] = useState<ToolGroup[]>([]);
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [config, setConfig] = useState<ToolsConfig | null>(null);
  const [securityLayers, setSecurityLayers] = useState<SecurityLayer[]>([]);
  const [posture, setPosture] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // ── Fetch all tools data ─────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, secRes] = await Promise.all([
        apiFetch(`${BASE}/api/tools`).then((r) => r.json()),
        apiFetch(`${BASE}/api/tools/security`).then((r) => r.json()),
      ]);
      setTools(toolsRes.tools || []);
      setGroups(toolsRes.groups || []);
      setProfiles(toolsRes.profiles || []);
      setConfig(toolsRes.config || null);
      setSecurityLayers(secRes.layers || []);
      setPosture(secRes.posture || "");
    } catch {
      // Graceful mock fallback
      setTools([]);
      showToast("Erreur chargement outils");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Change profile ───────────────────────────────────────────────────────

  const handleProfileChange = (profileName: string) => {
    if (!config) return;
    setConfig({ ...config, profile: profileName });
    setDirty(true);
  };

  // ── Toggle tool deny ─────────────────────────────────────────────────────

  const handleToggleTool = (toolName: string, currentlyEnabled: boolean) => {
    if (!config) return;
    let newDeny = [...config.deny];
    let newAllow = [...config.allow];
    if (currentlyEnabled) {
      // Disable: add to deny
      if (!newDeny.includes(toolName)) newDeny.push(toolName);
      newAllow = newAllow.filter((t) => t !== toolName);
    } else {
      // Enable: remove from deny, add to allow
      newDeny = newDeny.filter((t) => t !== toolName);
      if (!newAllow.includes(toolName)) newAllow.push(toolName);
    }
    setConfig({ ...config, allow: newAllow, deny: newDeny });
    // Recompute tool enabled state locally
    setTools((prev) =>
      prev.map((t) =>
        t.name === toolName ? { ...t, enabled: !currentlyEnabled } : t,
      ),
    );
    setDirty(true);
  };

  // ── Save config ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${BASE}/api/tools/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("✓ Configuration sauvegardée");
        setDirty(false);
        fetchAll(); // Refresh to get computed state
      } else {
        showToast(`Erreur: ${data.error}`);
      }
    } catch {
      showToast("Erreur sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // ── Group tools by group ─────────────────────────────────────────────────

  const toolsByGroup: Record<string, Tool[]> = {};
  for (const t of tools) {
    (toolsByGroup[t.group] ??= []).push(t);
  }

  const enabledCount = tools.filter((t) => t.enabled).length;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 0",
          gap: 12,
          color: "var(--text-muted)",
        }}
      >
        <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        Chargement des outils…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 80,
            right: 24,
            zIndex: 9999,
            background: toast.startsWith("✓") ? "#10b981" : "#ef4444",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: "13px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {toast}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              background: "var(--brand-accent)",
              padding: 12,
              borderRadius: 14,
              color: "#fff",
            }}
          >
            <Wrench size={28} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "1.5rem",
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Outils Agent (LIA)
            </h2>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                marginTop: 4,
              }}
            >
              {enabledCount}/{tools.length} outils actifs · Profile:{" "}
              <strong>{config?.profile ?? "full"}</strong>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={fetchAll}
            title="Rafraîchir"
            style={btnStyle("#3b82f6")}
          >
            <RefreshCw size={14} /> Rafraîchir
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{ ...btnStyle("#10b981"), opacity: dirty ? 1 : 0.4 }}
          >
            {saving ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Save size={14} />
            )}
            Sauvegarder
          </button>
        </div>
      </div>

      {/* ── Profile Selector ────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "0.9rem",
            marginBottom: 14,
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Zap size={16} color="var(--brand-accent)" />
          Profil d'outils (OpenClaw compatible)
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {profiles.map((p) => {
            const isActive = config?.profile === p.name;
            return (
              <button
                key={p.name}
                onClick={() => handleProfileChange(p.name)}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid ${isActive ? "var(--brand-accent)" : "var(--border-subtle)"}`,
                  background: isActive
                    ? "rgba(139,92,246,0.1)"
                    : "var(--bg-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    color: isActive
                      ? "var(--brand-accent)"
                      : "var(--text-primary)",
                    textTransform: "capitalize",
                  }}
                >
                  {p.name}
                  {isActive && (
                    <CheckCircle2
                      size={14}
                      style={{ marginLeft: 6, verticalAlign: "middle" }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  {p.tools.length} outil{p.tools.length > 1 ? "s" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tools by Group ──────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "0.9rem",
            marginBottom: 14,
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Wrench size={16} color="var(--brand-accent)" />
          Outils par groupe
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(toolsByGroup).map(([group, groupTools]) => {
            const isExpanded = expandedGroup === group;
            const enabledInGroup = groupTools.filter((t) => t.enabled).length;
            const GroupIcon = GROUP_ICONS[group] || Wrench;
            return (
              <div
                key={group}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : group)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "12px 16px",
                    background: isExpanded
                      ? "rgba(139,92,246,0.05)"
                      : "var(--bg-surface)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <GroupIcon size={16} color="var(--brand-accent)" />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      color: "var(--text-primary)",
                      flex: 1,
                    }}
                  >
                    group:{group}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      padding: "2px 8px",
                      background: "rgba(139,92,246,0.08)",
                      borderRadius: 20,
                    }}
                  >
                    {enabledInGroup}/{groupTools.length}
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={14} color="var(--text-muted)" />
                  ) : (
                    <ChevronDown size={14} color="var(--text-muted)" />
                  )}
                </button>
                {isExpanded && (
                  <div
                    style={{
                      padding: "8px 16px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      background: "var(--bg-surface)",
                    }}
                  >
                    {groupTools.map((tool) => {
                      const sec = SEC_STYLE[tool.security] || SEC_STYLE.safe;
                      const SecIcon = sec.icon;
                      return (
                        <div
                          key={tool.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: "var(--bg-glass)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <button
                            onClick={() =>
                              handleToggleTool(tool.name, tool.enabled)
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                            }}
                          >
                            {tool.enabled ? (
                              <ToggleRight
                                size={22}
                                color="var(--brand-accent)"
                              />
                            ) : (
                              <ToggleLeft size={22} color="var(--text-muted)" />
                            )}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "0.8rem",
                                color: tool.enabled
                                  ? "var(--text-primary)"
                                  : "var(--text-muted)",
                                fontFamily: "var(--mono)",
                              }}
                            >
                              {tool.name}
                            </div>
                            <div
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              {tool.description}
                            </div>
                          </div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              borderRadius: 20,
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: sec.color,
                              background: sec.bg,
                            }}
                          >
                            <SecIcon size={11} /> {tool.security}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              padding: "2px 8px",
                              borderRadius: 20,
                              background:
                                tool.category === "openclaw"
                                  ? "rgba(59,130,246,0.08)"
                                  : "rgba(139,92,246,0.08)",
                            }}
                          >
                            {tool.category}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Security Posture (4 layers) ─────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ShieldCheck size={16} color="#10b981" />
            Posture de sécurité NemoClaw
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 20,
              background: "rgba(16,185,129,0.1)",
              color: "#10b981",
              textTransform: "uppercase",
            }}
          >
            {posture || "locked-down"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {securityLayers.map((layer) => {
            const isExp = expandedLayer === layer.name;
            const layerColor =
              layer.status === "active" ? "#10b981" : "#f59e0b";
            return (
              <div
                key={layer.name}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setExpandedLayer(isExp ? null : layer.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "12px 16px",
                    background: isExp
                      ? "rgba(16,185,129,0.04)"
                      : "var(--bg-surface)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: layerColor,
                      boxShadow: `0 0 6px ${layerColor}`,
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      color: "var(--text-primary)",
                      flex: 1,
                      textTransform: "capitalize",
                    }}
                  >
                    {layer.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--text-muted)",
                      maxWidth: 350,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {layer.description}
                  </span>
                  {layer.hotReloadable && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        padding: "1px 6px",
                        borderRadius: 8,
                        background: "rgba(59,130,246,0.1)",
                        color: "#3b82f6",
                        fontWeight: 600,
                      }}
                    >
                      hot-reload
                    </span>
                  )}
                  {isExp ? (
                    <ChevronUp size={14} color="var(--text-muted)" />
                  ) : (
                    <ChevronDown size={14} color="var(--text-muted)" />
                  )}
                </button>
                {isExp && (
                  <div
                    style={{
                      padding: "8px 16px 14px",
                      background: "var(--bg-surface)",
                    }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {layer.controls.map((ctrl, i) => (
                        <li
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            fontSize: "0.78rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <ShieldCheck
                            size={12}
                            color="#10b981"
                            style={{ flexShrink: 0, marginTop: 2 }}
                          />
                          {ctrl}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Dirty indicator ─────────────────────────────────────────────────── */}
      {dirty && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#f59e0b",
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={14} />
          Modifications non sauvegardées — cliquez "Sauvegarder" pour appliquer.
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// ── Shared button style helper ─────────────────────────────────────────────

function btnStyle(color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 10,
    background: `${color}15`,
    border: `1px solid ${color}30`,
    color,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.8rem",
    transition: "all 0.2s",
  };
}
