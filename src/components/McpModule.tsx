import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plug,
  Search,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  ToggleLeft,
  ToggleRight,
  Play,
  Trash2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Wrench,
  ExternalLink,
  Copy,
  Terminal,
  Eye,
  EyeOff,
  Zap,
  Server,
  FileCode2,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import {
  MCP_CATALOG,
  MCP_CATEGORIES,
  getCatalogEntry,
  type McpCatalogEntry,
  type McpCategory,
  type McpTransport,
} from "../data/mcpCatalog";

const BASE = "http://localhost:4000";

// ─── Types ─────────────────────────────────────────────────────────────────

interface McpTool {
  name: string;
  description?: string;
}
interface McpResource {
  uri: string;
  name?: string;
}
interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: McpTransport;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  status: string;
  tools: McpTool[];
  resources?: McpResource[];
  enabled: boolean;
  error?: string | null;
  lastSync?: string | null;
  createdAt?: string | null;
}

type Tab = "discover" | "active";
type DrawerState =
  | null
  | { kind: "catalog"; entryId: string }
  | { kind: "server"; id: string }
  | { kind: "custom" };

// ─── Style tokens ────────────────────────────────────────────────────────────

const transportBadge: Record<McpTransport, { label: string; color: string }> = {
  stdio: { label: "stdio", color: "#10b981" },
  sse: { label: "SSE", color: "#3b82f6" },
  "streamable-http": { label: "HTTP", color: "#8b5cf6" },
};

const statusConfig: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  connected: { bg: "rgba(16,185,129,0.12)", text: "#10b981", label: "Connecté" },
  running: { bg: "rgba(16,185,129,0.12)", text: "#10b981", label: "Actif" },
  disconnected: {
    bg: "rgba(161,161,170,0.1)",
    text: "#a1a1aa",
    label: "Arrêté",
  },
  stopped: { bg: "rgba(161,161,170,0.1)", text: "#a1a1aa", label: "Arrêté" },
  error: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Erreur" },
  testing: { bg: "rgba(245,158,11,0.12)", text: "#f59e0b", label: "Test…" },
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
const mono: React.CSSProperties = {
  ...input,
  fontFamily: "var(--mono)",
  fontSize: "0.82rem",
};
const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: "var(--radius-full)",
  background: "rgba(59,130,246,0.15)",
  border: "1px solid rgba(59,130,246,0.3)",
  color: "#3b82f6",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
  transition: "all 0.15s",
  fontFamily: "inherit",
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: "transparent",
  borderColor: "var(--border-subtle)",
  color: "var(--text-secondary)",
};
const btnSuccess: React.CSSProperties = {
  ...btn,
  background: "rgba(16,185,129,0.12)",
  borderColor: "rgba(16,185,129,0.3)",
  color: "#10b981",
};
const btnDanger: React.CSSProperties = {
  ...btn,
  background: "rgba(239,68,68,0.1)",
  borderColor: "rgba(239,68,68,0.3)",
  color: "#ef4444",
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 700,
  marginBottom: 6,
  color: "var(--text-secondary)",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseEnvText(t: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of t.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k?.trim()) out[k.trim()] = v.join("=").trim();
  }
  return out;
}

const isLive = (s?: McpServer) =>
  !!s && (s.status === "connected" || s.status === "running");

// ─── Component ───────────────────────────────────────────────────────────────

export function McpModule({ embedded = false }: { embedded?: boolean } = {}) {
  const [tab, setTab] = useState<Tab>("discover");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<McpCategory | "all">("all");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // drawer
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // forms
  const [envForm, setEnvForm] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState(false);
  const [customMode, setCustomMode] = useState<"form" | "json">("form");
  const [customForm, setCustomForm] = useState({
    name: "",
    description: "",
    transport: "stdio" as McpTransport,
    command: "",
    args: "",
    url: "",
    env: "",
  });
  const [jsonInput, setJsonInput] = useState(
    JSON.stringify(
      {
        mcpServers: {
          "my-server": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
            env: {},
          },
        },
      },
      null,
      2,
    ),
  );

  const showMsg = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Data ───────────────────────────────────────────────────────────────
  const fetchServers = useCallback(async () => {
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers`);
      const data = await res.json();
      setServers(Array.isArray(data.servers) ? data.servers : []);
    } catch {
      setServers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Light polling of active servers (keeps status fresh)
  const fetchRef = useRef(fetchServers);
  fetchRef.current = fetchServers;
  useEffect(() => {
    const t = setInterval(() => fetchRef.current(), 20000);
    return () => clearInterval(t);
  }, []);

  // ── Drawer control ────────────────────────────────────────────────────
  const openDrawer = useCallback((d: DrawerState) => {
    setDrawer(d);
    setExpandedTools(false);
    requestAnimationFrame(() => setDrawerOpen(true));
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => setDrawer(null), 280);
  }, []);

  const openCatalog = (entry: McpCatalogEntry) => {
    const existing = servers.find((s) => s.id === entry.id);
    const initialEnv: Record<string, string> = {};
    for (const f of entry.env || []) initialEnv[f.key] = existing?.env?.[f.key] || f.value || "";
    setEnvForm(initialEnv);
    setShowSecret({});
    openDrawer({ kind: "catalog", entryId: entry.id });
  };

  const openCustom = () => {
    setCustomMode("form");
    setCustomForm({
      name: "",
      description: "",
      transport: "stdio",
      command: "",
      args: "",
      url: "",
      env: "",
    });
    openDrawer({ kind: "custom" });
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const connectCatalog = async (entry: McpCatalogEntry) => {
    // validate required env
    for (const f of entry.env || []) {
      if (f.required && !envForm[f.key]?.trim()) {
        showMsg(`Champ requis : ${f.label || f.key}`, false);
        return;
      }
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      transport: entry.transport,
      command: entry.command,
      args: entry.args,
      url: entry.url,
      env: envForm,
    };
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      await fetchServers();
      if (d.error) showMsg(`${entry.name} ajouté (${d.error})`, false);
      else
        showMsg(`✓ ${entry.name} connecté — ${d.tools?.length || 0} outils`);
      closeDrawer();
      setTab("active");
    } catch (e) {
      showMsg(`Échec : ${e instanceof Error ? e.message : "réseau"}`, false);
    }
    setBusy(false);
  };

  const addCustom = async () => {
    if (!customForm.name.trim()) return showMsg("Nom requis", false);
    if (customForm.transport === "stdio" && !customForm.command.trim())
      return showMsg("Commande requise pour stdio", false);
    if (customForm.transport !== "stdio" && !customForm.url.trim())
      return showMsg("URL requise", false);
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: customForm.name,
      description: customForm.description,
      transport: customForm.transport,
      env: parseEnvText(customForm.env),
    };
    if (customForm.transport === "stdio") {
      payload.command = customForm.command;
      payload.args = customForm.args.split(/\s+/).filter(Boolean);
    } else {
      payload.url = customForm.url;
    }
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      await fetchServers();
      showMsg(
        d.error
          ? `${customForm.name} ajouté (${d.error})`
          : `✓ ${customForm.name} connecté`,
        !d.error,
      );
      closeDrawer();
      setTab("active");
    } catch (e) {
      showMsg(`Échec : ${e instanceof Error ? e.message : "réseau"}`, false);
    }
    setBusy(false);
  };

  const importJson = async () => {
    let parsed: { mcpServers?: Record<string, any> };
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      return showMsg("JSON invalide", false);
    }
    const entries = parsed.mcpServers;
    if (!entries || typeof entries !== "object")
      return showMsg('JSON doit contenir la clé "mcpServers"', false);
    setBusy(true);
    let count = 0;
    for (const [name, cfg] of Object.entries(entries)) {
      const c = cfg as Record<string, any>;
      try {
        await apiFetch(`${BASE}/api/mcp/servers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            transport: c.transport || (c.url ? "sse" : "stdio"),
            command: c.command,
            args: Array.isArray(c.args) ? c.args : [],
            url: c.url,
            env: c.env || {},
          }),
        });
        count++;
      } catch {
        /* skip */
      }
    }
    await fetchServers();
    showMsg(`✓ ${count} serveur(s) importé(s)`);
    closeDrawer();
    setTab("active");
    setBusy(false);
  };

  const testServer = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers/${id}/test`, {
        method: "POST",
      });
      const d = await res.json();
      setServers((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: d.ok ? "connected" : "error",
                tools: d.tools || s.tools,
                resources: d.resources || s.resources,
                error: d.error || null,
              }
            : s,
        ),
      );
      showMsg(
        d.ok ? `✓ Connecté — ${d.tools?.length || 0} outils` : `✗ ${d.error}`,
        !!d.ok,
      );
    } catch (e) {
      showMsg(`✗ ${e instanceof Error ? e.message : "erreur"}`, false);
    }
    setTestingId(null);
  };

  const toggleServer = async (id: string) => {
    const cur = servers.find((s) => s.id === id);
    if (!cur) return;
    const next = !cur.enabled;
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: next } : s)),
    ); // optimistic
    try {
      await apiFetch(`${BASE}/api/mcp/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
    } catch {
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: cur.enabled } : s)),
      ); // rollback
      showMsg("Échec du changement d'état", false);
    }
  };

  const removeServer = async (id: string) => {
    const snapshot = servers;
    setServers((prev) => prev.filter((s) => s.id !== id)); // optimistic
    if (drawer?.kind === "server" && drawer.id === id) closeDrawer();
    try {
      await apiFetch(`${BASE}/api/mcp/servers/${id}`, { method: "DELETE" });
      showMsg("Serveur supprimé");
    } catch {
      setServers(snapshot); // rollback
      showMsg("Échec de la suppression", false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeServers = servers.filter((s) => isLive(s));
  const errorCount = servers.filter((s) => s.status === "error").length;
  const totalTools = servers.reduce((n, s) => n + (s.tools?.length || 0), 0);

  const q = search.toLowerCase();
  const filteredCatalog = MCP_CATALOG.filter((e) => {
    if (catFilter !== "all") {
      if (catFilter === "featured") {
        if (!e.popular) return false;
      } else if (e.category !== catFilter) return false;
    }
    if (q) {
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.npmPackage || "").toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.includes(q))
      );
    }
    return true;
  });
  const filteredServers = servers.filter((s) => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        padding: embedded ? 0 : "24px",
        maxWidth: embedded ? "none" : 1400,
        margin: embedded ? 0 : "0 auto",
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            zIndex: 2000,
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "12px 20px",
            boxShadow: "var(--shadow-lg)",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {toast.ok ? (
            <CheckCircle2 size={16} color="#10b981" />
          ) : (
            <AlertCircle size={16} color="#ef4444" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Plug size={24} color="var(--brand-accent)" /> MCP & Connecteurs
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
              marginTop: 4,
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span>
              <b style={{ color: "#10b981" }}>{activeServers.length}</b> actif
              {activeServers.length > 1 ? "s" : ""}
            </span>
            <span>
              <b style={{ color: "var(--text-primary)" }}>{totalTools}</b> outils
            </span>
            {errorCount > 0 && (
              <span style={{ color: "#ef4444" }}>
                <b>{errorCount}</b> erreur{errorCount > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openCustom}
          style={{
            ...btn,
            background: "rgba(139,92,246,0.15)",
            borderColor: "rgba(139,92,246,0.3)",
            color: "var(--brand-accent)",
          }}
        >
          <Plus size={16} /> Serveur personnalisé
        </button>
      </div>

      {/* Search + Tabs */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "discover"
                ? "Rechercher dans le répertoire…"
                : "Rechercher dans mes serveurs…"
            }
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            style={{ ...input, paddingLeft: 36 }}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "var(--bg-glass)",
            borderRadius: "var(--radius-md)",
            padding: 4,
            border: "1px solid var(--border-subtle)",
          }}
        >
          {(
            [
              { id: "discover", label: "Découvrir", icon: Search },
              { id: "active", label: "Mes serveurs", icon: Server },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: "calc(var(--radius-md) - 2px)",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 0.2s",
                background: tab === t.id ? "var(--brand-primary)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--text-secondary)",
              }}
            >
              <t.icon size={15} />
              {t.label}
              {t.id === "active" && servers.length > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background:
                      tab === t.id ? "rgba(255,255,255,0.25)" : "var(--bg-glass)",
                  }}
                >
                  {servers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── DISCOVER ─────────────────────────────────────────────────────── */}
      {tab === "discover" && (
        <>
          <div
            style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}
          >
            {MCP_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(c.id as McpCategory | "all")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor:
                    catFilter === c.id
                      ? "var(--brand-accent)"
                      : "var(--border-subtle)",
                  background:
                    catFilter === c.id ? "rgba(139,92,246,0.12)" : "transparent",
                  color:
                    catFilter === c.id
                      ? "var(--brand-accent)"
                      : "var(--text-muted)",
                }}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 14,
            }}
          >
            {filteredCatalog.map((e) => {
              const installed = isLive(servers.find((s) => s.id === e.id));
              const tb = transportBadge[e.transport];
              return (
                <div
                  key={e.id}
                  className="glass-panel"
                  onClick={() => openCatalog(e)}
                  style={{
                    padding: 18,
                    cursor: "pointer",
                    transition: "all 0.18s",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-lg)",
                  }}
                  onMouseOver={(ev) => {
                    ev.currentTarget.style.borderColor = `${e.color}55`;
                    ev.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseOut={(ev) => {
                    ev.currentTarget.style.borderColor = "var(--border-subtle)";
                    ev.currentTarget.style.transform = "none";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 12,
                        background: `${e.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                      }}
                    >
                      {e.icon}
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      {e.popular && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "rgba(245,158,11,0.1)",
                            color: "#f59e0b",
                          }}
                        >
                          #{e.popular}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: "0.66rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 4,
                          background: `${tb.color}15`,
                          color: tb.color,
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {tb.label}
                      </span>
                      {installed && <CheckCircle2 size={16} color="#10b981" />}
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.98rem",
                      marginBottom: 5,
                    }}
                  >
                    {e.name}
                  </div>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      margin: 0,
                    }}
                  >
                    {e.description}
                  </p>
                </div>
              );
            })}
          </div>
          {filteredCatalog.length === 0 && (
            <EmptyState
              icon={<Search size={40} />}
              title={`Aucun connecteur pour "${search}"`}
            />
          )}
        </>
      )}

      {/* ── ACTIVE ───────────────────────────────────────────────────────── */}
      {tab === "active" && (
        <>
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: 60,
                color: "var(--text-muted)",
              }}
            >
              <Loader2 size={24} className="spin" />
            </div>
          ) : filteredServers.length === 0 ? (
            <EmptyState
              icon={<Plug size={40} />}
              title="Aucun serveur configuré"
              subtitle="Explore le répertoire pour connecter un outil, ou ajoute un serveur personnalisé."
              action={
                <button onClick={() => setTab("discover")} style={btn}>
                  <Search size={14} /> Explorer le répertoire
                </button>
              }
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredServers.map((s) => {
                const cat = getCatalogEntry(s.id);
                const st = statusConfig[s.status] || statusConfig.disconnected;
                const tb = transportBadge[s.transport] || transportBadge.stdio;
                const isTesting = testingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="glass-panel"
                    onClick={() => openDrawer({ kind: "server", id: s.id })}
                    style={{
                      padding: 18,
                      cursor: "pointer",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-lg)",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      opacity: s.enabled ? 1 : 0.55,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: `${cat?.color || "#8b5cf6"}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        flexShrink: 0,
                      }}
                    >
                      {cat?.icon || "🔌"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.95rem",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {s.name}
                        <span
                          style={{
                            fontSize: "0.64rem",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 4,
                            background: `${tb.color}15`,
                            color: tb.color,
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {tb.label}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginTop: 4,
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: st.bg,
                            color: st.text,
                            fontWeight: 600,
                          }}
                        >
                          {isTesting ? "Test…" : st.label}
                        </span>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Wrench size={11} /> {s.tools?.length || 0} outils
                        </span>
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <IconBtn
                        title="Tester"
                        onClick={() => testServer(s.id)}
                        disabled={isTesting}
                      >
                        {isTesting ? (
                          <Loader2 size={16} className="spin" />
                        ) : (
                          <Play size={16} />
                        )}
                      </IconBtn>
                      <IconBtn
                        title={s.enabled ? "Désactiver" : "Activer"}
                        onClick={() => toggleServer(s.id)}
                        color={s.enabled ? "#10b981" : "var(--text-muted)"}
                      >
                        {s.enabled ? (
                          <ToggleRight size={20} />
                        ) : (
                          <ToggleLeft size={20} />
                        )}
                      </IconBtn>
                      <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── DRAWER ───────────────────────────────────────────────────────── */}
      {drawer && (
        <>
          <div
            onClick={closeDrawer}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 1000,
              opacity: drawerOpen ? 1 : 0,
              transition: "opacity 0.25s",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: 480,
              maxWidth: "94vw",
              background: "var(--bg-surface-elevated, var(--bg-surface))",
              borderLeft: "1px solid var(--border-subtle)",
              zIndex: 1001,
              transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
              overflowY: "auto",
              padding: 24,
            }}
          >
            <button
              onClick={closeDrawer}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
            >
              <X size={20} />
            </button>

            {drawer.kind === "catalog" &&
              renderCatalogDrawer(getCatalogEntry(drawer.entryId))}
            {drawer.kind === "server" &&
              renderServerDrawer(servers.find((s) => s.id === drawer.id))}
            {drawer.kind === "custom" && renderCustomDrawer()}
          </div>
        </>
      )}
    </div>
  );

  // ── Drawer renderers (closures using component state) ──────────────────

  function renderCatalogDrawer(entry?: McpCatalogEntry) {
    if (!entry) return null;
    const existing = servers.find((s) => s.id === entry.id);
    const live = isLive(existing);
    return (
      <div>
        <DrawerHeader icon={entry.icon} color={entry.color} title={entry.name}>
          {entry.description}
        </DrawerHeader>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Badge color={transportBadge[entry.transport].color}>
            {transportBadge[entry.transport].label}
          </Badge>
          {entry.tags?.includes("remote-script") && (
            <Badge color="#f59e0b">Remote Script</Badge>
          )}
          {live && <Badge color="#10b981">Déjà installé</Badge>}
        </div>

        {/* Remote Script warning banner */}
        {entry.tags?.includes("remote-script") && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.35)",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "#f59e0b",
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ⚠️ Installation en 2 étapes
            </div>
            <ol
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              {entry.id === "ableton-mcp" && (
                <>
                  <li>
                    Téléchargez le dossier{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      AbletonMCP_Remote_Script/
                    </code>{" "}
                    depuis{" "}
                    <a
                      href="https://github.com/ahujasid/ableton-mcp"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#f59e0b" }}
                    >
                      GitHub
                    </a>
                  </li>
                  <li>
                    Copiez le dossier dans le répertoire Ableton Remote Scripts :
                    <br />
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                      Windows :{" "}
                      <code
                        style={{
                          fontFamily: "var(--mono)",
                          background: "rgba(0,0,0,0.3)",
                          padding: "1px 4px",
                          borderRadius: 4,
                        }}
                      >
                        %ProgramData%\Ableton\Live x.x\Resources\MIDI Remote Scripts\
                      </code>
                    </span>
                    <br />
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                      Mac :{" "}
                      <code
                        style={{
                          fontFamily: "var(--mono)",
                          background: "rgba(0,0,0,0.3)",
                          padding: "1px 4px",
                          borderRadius: 4,
                        }}
                      >
                        /Applications/Ableton Live.app/Contents/App-Resources/MIDI Remote Scripts/
                      </code>
                    </span>
                  </li>
                  <li>
                    Dans Ableton → <strong>Settings → Link, Tempo &amp; MIDI</strong> → Control
                    Surface → sélectionnez{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      AbletonMCP
                    </code>
                  </li>
                  <li>
                    Installez{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      uv
                    </code>{" "}
                    si absent :{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      pip install uv
                    </code>
                  </li>
                  <li>Cliquez <strong>Connecter</strong> ci-dessous — le serveur MCP démarre automatiquement</li>
                </>
              )}
              {entry.id === "ableton-osc" && (
                <>
                  <li>
                    Téléchargez le dossier{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      AbletonOSC/
                    </code>{" "}
                    depuis{" "}
                    <a
                      href="https://github.com/ideoforms/AbletonOSC"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#f59e0b" }}
                    >
                      GitHub
                    </a>{" "}
                    et copiez-le dans le répertoire Remote Scripts d'Ableton
                  </li>
                  <li>
                    Activez dans Ableton → <strong>Settings → MIDI</strong> → Control Surface →{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      AbletonOSC
                    </code>
                  </li>
                  <li>
                    OSC écoute sur{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      port 11000
                    </code>{" "}
                    — testez avec{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        background: "rgba(0,0,0,0.3)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontSize: "0.76rem",
                      }}
                    >
                      python run-console.py
                    </code>
                  </li>
                  <li>Le bridge MCP-OSC communique sur <strong>port 11001</strong> (réponses)</li>
                </>
              )}
            </ol>
          </div>
        )}

        {/* Command preview */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid var(--border-subtle)",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--text-muted)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Terminal size={12} /> Commande
          </div>
          <code
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.8rem",
              color: "#10b981",
              wordBreak: "break-all",
            }}
          >
            {entry.transport === "stdio"
              ? `${entry.command} ${(entry.args || []).join(" ")}`
              : entry.url}
          </code>
        </div>

        {/* Env fields */}
        {entry.env && entry.env.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={label}>Configuration</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {entry.env.map((f) => (
                <div key={f.key}>
                  <label
                    style={{
                      fontSize: "0.74rem",
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: 3,
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {f.label || f.key}{" "}
                    {f.required && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={f.secret && !showSecret[f.key] ? "password" : "text"}
                      value={envForm[f.key] || ""}
                      onChange={(e) =>
                        setEnvForm((p) => ({ ...p, [f.key]: e.target.value }))
                      }
                      placeholder={f.secret ? "••••••••" : ""}
                      style={mono}
                    />
                    {f.secret && (
                      <button
                        onClick={() =>
                          setShowSecret((p) => ({ ...p, [f.key]: !p[f.key] }))
                        }
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                        }}
                      >
                        {showSecret[f.key] ? (
                          <EyeOff size={15} />
                        ) : (
                          <Eye size={15} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {live ? (
            <button
              onClick={() =>
                existing && openDrawer({ kind: "server", id: existing.id })
              }
              style={btn}
            >
              <Server size={14} /> Gérer le serveur
            </button>
          ) : (
            <button
              onClick={() => connectCatalog(entry)}
              disabled={busy}
              style={btnSuccess}
            >
              {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              Connecter
            </button>
          )}
          {entry.npmPackage && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`npx -y ${entry.npmPackage}`);
                showMsg("✓ Copié");
              }}
              style={btnGhost}
            >
              <Copy size={14} /> Copier npx
            </button>
          )}
          {entry.command === "uvx" && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${entry.command} ${(entry.args || []).join(" ")}`
                );
                showMsg("✓ Copié");
              }}
              style={btnGhost}
            >
              <Copy size={14} /> Copier uvx
            </button>
          )}
          {entry.docsUrl && (
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...btnGhost, textDecoration: "none" }}
            >
              <ExternalLink size={14} /> Docs
            </a>
          )}
        </div>
      </div>
    );
  }

  function renderServerDrawer(s?: McpServer) {
    if (!s) return null;
    const cat = getCatalogEntry(s.id);
    const st = statusConfig[s.status] || statusConfig.disconnected;
    const isTesting = testingId === s.id;
    return (
      <div>
        <DrawerHeader
          icon={cat?.icon || "🔌"}
          color={cat?.color || "#8b5cf6"}
          title={s.name}
        >
          {s.description || cat?.description || ""}
        </DrawerHeader>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: st.bg,
            border: `1px solid ${st.text}22`,
            marginBottom: 16,
          }}
        >
          {isLive(s) ? (
            <CheckCircle2 size={16} color="#10b981" />
          ) : s.status === "error" ? (
            <AlertCircle size={16} color="#ef4444" />
          ) : (
            <WifiOff size={16} color="#a1a1aa" />
          )}
          <span style={{ fontWeight: 600, color: st.text, fontSize: "0.85rem" }}>
            {st.label}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {s.tools?.length || 0} outils · {s.resources?.length || 0} ressources
          </span>
        </div>

        {s.error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              fontSize: "0.8rem",
              color: "#ef4444",
              marginBottom: 16,
            }}
          >
            {s.error}
          </div>
        )}

        {/* Config */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(0,0,0,0.2)",
            fontFamily: "var(--mono)",
            fontSize: "0.78rem",
            marginBottom: 16,
            wordBreak: "break-all",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            {s.transport === "stdio" ? "Commande : " : "URL : "}
          </span>
          {s.transport === "stdio"
            ? `${s.command} ${(s.args || []).join(" ")}`
            : s.url}
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
        >
          <button
            onClick={() => testServer(s.id)}
            disabled={isTesting}
            style={btnSuccess}
          >
            {isTesting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Tester / Redécouvrir
          </button>
          <button onClick={() => toggleServer(s.id)} style={btnGhost}>
            {s.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {s.enabled ? "Activé" : "Désactivé"}
          </button>
          <button onClick={() => removeServer(s.id)} style={btnDanger}>
            <Trash2 size={14} /> Supprimer
          </button>
        </div>

        {/* Tools */}
        {s.tools && s.tools.length > 0 && (
          <div>
            <button
              onClick={() => setExpandedTools((v) => !v)}
              style={{
                ...btnGhost,
                width: "100%",
                justifyContent: "space-between",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Wrench size={14} /> Outils ({s.tools.length})
              </span>
              {expandedTools ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
            {expandedTools && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {s.tools.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      padding: "9px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(0,0,0,0.2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <code
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: "var(--brand-accent)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {t.name}
                    </code>
                    {t.description && (
                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--text-muted)",
                          marginTop: 3,
                        }}
                      >
                        {t.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderCustomDrawer() {
    return (
      <div>
        <DrawerHeader icon="🔌" color="#8b5cf6" title="Serveur personnalisé">
          Connecte n'importe quel serveur MCP (stdio, SSE ou HTTP) ou importe une
          config <code>mcpServers</code>.
        </DrawerHeader>

        {/* Mode switch */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "var(--bg-glass)",
            borderRadius: "var(--radius-md)",
            padding: 4,
            border: "1px solid var(--border-subtle)",
            width: "fit-content",
            marginBottom: 18,
          }}
        >
          {(
            [
              { id: "form", label: "Formulaire", icon: Plus },
              { id: "json", label: "Import JSON", icon: FileCode2 },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setCustomMode(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: "calc(var(--radius-md) - 2px)",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background:
                  customMode === m.id ? "var(--brand-primary)" : "transparent",
                color: customMode === m.id ? "#fff" : "var(--text-secondary)",
              }}
            >
              <m.icon size={14} /> {m.label}
            </button>
          ))}
        </div>

        {customMode === "form" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={label}>
                Nom <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                value={customForm.name}
                onChange={(e) =>
                  setCustomForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="my-mcp-server"
                style={input}
              />
            </div>
            <div>
              <label style={label}>Description</label>
              <input
                value={customForm.description}
                onChange={(e) =>
                  setCustomForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Que fait ce serveur ?"
                style={input}
              />
            </div>
            <div>
              <label style={label}>Transport</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["stdio", "sse", "streamable-http"] as McpTransport[]).map(
                  (t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setCustomForm((p) => ({ ...p, transport: t }))
                      }
                      style={{
                        ...btnGhost,
                        padding: "8px 14px",
                        fontFamily: "var(--mono)",
                        fontSize: "0.8rem",
                        background:
                          customForm.transport === t
                            ? `${transportBadge[t].color}15`
                            : "transparent",
                        borderColor:
                          customForm.transport === t
                            ? `${transportBadge[t].color}44`
                            : "var(--border-subtle)",
                        color:
                          customForm.transport === t
                            ? transportBadge[t].color
                            : "var(--text-secondary)",
                      }}
                    >
                      {transportBadge[t].label}
                    </button>
                  ),
                )}
              </div>
            </div>
            {customForm.transport === "stdio" ? (
              <>
                <div>
                  <label style={label}>
                    Commande <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    value={customForm.command}
                    onChange={(e) =>
                      setCustomForm((p) => ({ ...p, command: e.target.value }))
                    }
                    placeholder="npx"
                    style={mono}
                  />
                </div>
                <div>
                  <label style={label}>Arguments</label>
                  <input
                    value={customForm.args}
                    onChange={(e) =>
                      setCustomForm((p) => ({ ...p, args: e.target.value }))
                    }
                    placeholder="-y @my/mcp-server --flag"
                    style={mono}
                  />
                </div>
              </>
            ) : (
              <div>
                <label style={label}>
                  URL endpoint <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={customForm.url}
                  onChange={(e) =>
                    setCustomForm((p) => ({ ...p, url: e.target.value }))
                  }
                  placeholder="http://localhost:3001/mcp"
                  style={mono}
                />
              </div>
            )}
            <div>
              <label style={label}>
                Variables d'environnement{" "}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  (KEY=value, une par ligne)
                </span>
              </label>
              <textarea
                value={customForm.env}
                onChange={(e) =>
                  setCustomForm((p) => ({ ...p, env: e.target.value }))
                }
                placeholder={"API_KEY=sk-...\nDATABASE_URL=postgres://..."}
                rows={4}
                style={{ ...mono, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>
            <button onClick={addCustom} disabled={busy} style={btnSuccess}>
              {busy ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              Connecter
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
              Colle le format <code>mcpServers</code> (Claude Desktop, Cursor…).
            </p>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={14}
              style={{ ...mono, resize: "vertical", lineHeight: 1.5 }}
            />
            <button onClick={importJson} disabled={busy} style={btnSuccess}>
              {busy ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              Importer & connecter
            </button>
          </div>
        )}
      </div>
    );
  }
}

// ─── Small presentational helpers ────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        color: color || "var(--text-secondary)",
        padding: 4,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      style={{
        fontSize: "0.7rem",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 999,
        background: `${color}15`,
        color,
        fontFamily: "var(--mono)",
      }}
    >
      {children}
    </span>
  );
}

function DrawerHeader({
  icon,
  color,
  title,
  children,
}: {
  icon: string;
  color: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18, paddingRight: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
          }}
        >
          {icon}
        </div>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{title}</h3>
      </div>
      {children && (
        <p
          style={{
            fontSize: "0.84rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {children}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="glass-panel"
      style={{
        textAlign: "center",
        padding: "60px 20px",
        color: "var(--text-muted)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ opacity: 0.3 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-secondary)" }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: "0.85rem", maxWidth: 420 }}>{subtitle}</div>}
      {action}
    </div>
  );
}

export default McpModule;
