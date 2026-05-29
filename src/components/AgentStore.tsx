import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Trash2,
  Search,
  Loader2,
  CheckCircle2,
  Store,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  provider: string;
  model: string;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  skills: string[];
  config: Record<string, unknown>;
  tags: string[];
  popular: number;
  installed: boolean;
  createdAt: string;
}

const CATEGORIES: { id: string | "all"; label: string; icon: string }[] = [
  { id: "all", label: "Tous", icon: "📦" },
  { id: "coding", label: "Code", icon: "💻" },
  { id: "data", label: "Data & Recherche", icon: "📊" },
  { id: "content", label: "Contenu", icon: "✍️" },
  { id: "security", label: "Securite", icon: "🛡️" },
  { id: "productivity", label: "Productivite", icon: "📋" },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#d97706",
  openai: "#10b981",
  google: "#3b82f6",
  openrouter: "#8b5cf6",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentStore() {
  const [agents, setAgents] = useState<StoreAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStore = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (search) params.set("search", search);
      const res = await apiFetch(`${BASE}/api/agent-store?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    fetchStore();
  }, [fetchStore]);

  const install = async (id: string) => {
    setInstalling(id);
    setError(null);
    try {
      const res = await apiFetch(`${BASE}/api/agent-store/${id}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, installed: true } : a)));
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Install failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setInstalling(null);
    }
  };

  const uninstall = async (id: string) => {
    setUninstalling(id);
    setError(null);
    try {
      const res = await apiFetch(`${BASE}/api/agent-store/${id}/install`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, installed: false } : a)));
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Uninstall failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUninstalling(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel p-6" style={{ textAlign: "center", padding: 48 }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent, #8b5cf6)" }} />
        <p className="text-muted" style={{ marginTop: 12 }}>Loading Agent Store...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="glass-panel p-6" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Store size={24} style={{ color: "var(--accent, #8b5cf6)" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Agent Store</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              {agents.length} agents disponibles · Installez en 1 clic
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-panel" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, borderColor: "#ef444444", color: "#ef4444", fontSize: 13 }}>
          <Sparkles size={14} />
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>
            &times;
          </button>
        </div>
      )}

      {/* Search + Filters */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un agent..."
            autoComplete="off"
            data-lpignore="true"
            style={{ width: "100%", padding: "8px 12px 8px 36px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid",
                borderColor: category === cat.id ? "var(--accent, #8b5cf6)" : "var(--border-subtle)",
                background: category === cat.id ? "rgba(139,92,246,0.12)" : "transparent",
                color: category === cat.id ? "var(--accent, #8b5cf6)" : "var(--text-muted)",
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {agents.map((agent) => {
          const providerColor = PROVIDER_COLORS[agent.provider] || "#8b5cf6";
          const isInstalling = installing === agent.id;
          const isUninstalling = uninstalling === agent.id;

          return (
            <div
              key={agent.id}
              className="glass-panel"
              style={{
                padding: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                borderLeft: `3px solid ${agent.color}`,
              }}
            >
              {/* Card Header */}
              <div style={{ padding: "16px 20px 12px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{agent.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{agent.name}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${providerColor}22`, color: providerColor, fontWeight: 600 }}>
                          {agent.provider}
                        </span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(139,92,246,0.08)", color: "var(--text-muted)" }}>
                          {agent.model}
                        </span>
                      </div>
                    </div>
                  </div>
                  {agent.popular > 0 && agent.popular <= 10 && (
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontWeight: 700 }}>
                      <Sparkles size={9} style={{ verticalAlign: "text-bottom", marginRight: 2 }} /> TOP {agent.popular}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                  {agent.description}
                </div>

                {/* Skills */}
                {agent.skills && agent.skills.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                    {agent.skills.slice(0, 3).map((skill) => (
                      <span key={skill} style={{ padding: "2px 7px", background: "rgba(59,130,246,0.08)", borderRadius: "var(--radius-full)", fontSize: 10, color: "#3b82f6", fontWeight: 500 }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {agent.tags && agent.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                    {agent.tags.slice(0, 4).map((tag) => (
                      <span key={tag} style={{ padding: "1px 6px", background: "rgba(139,92,246,0.06)", borderRadius: "var(--radius-full)", fontSize: 9, color: "var(--text-muted)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: "10px 20px 16px", display: "flex", gap: 8, borderTop: "1px solid var(--border-subtle)" }}>
                {agent.installed ? (
                  <>
                    <button
                      style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 14px",
                        borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.1)",
                        color: "#10b981", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={13} /> Installed
                    </button>
                    <button
                      onClick={() => uninstall(agent.id)}
                      disabled={isUninstalling}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 10px",
                        borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", background: "transparent",
                        color: "#ef4444", cursor: isUninstalling ? "wait" : "pointer", fontSize: 11,
                      }}
                    >
                      {isUninstalling ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Remove
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => install(agent.id)}
                    disabled={isInstalling}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "6px 14px",
                      borderRadius: 8, border: "none", background: "var(--accent, #8b5cf6)",
                      color: "#fff", cursor: isInstalling ? "wait" : "pointer", fontSize: 12, fontWeight: 600,
                      opacity: isInstalling ? 0.7 : 1,
                    }}
                  >
                    {isInstalling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Install
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {agents.length === 0 && (
        <div className="glass-panel p-6" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <Store size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>No agents {search ? `for "${search}"` : ""} found.</p>
        </div>
      )}
    </div>
  );
}