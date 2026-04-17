import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Database,
  FileText,
  BrainCircuit,
  Plus,
  Trash2,
  Save,
  X,
  RefreshCw,
  Check,
  Edit3,
  Eye,
  Code2,
  AlertTriangle,
  Server,
  Download,
  Upload,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

interface MemDoc {
  id: string;
  title: string;
  type: string;
  content: string;
  tags: string[];
  chars: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Quick-access system files (Nemoclaw/OpenClaw workspace) ──────────────────
const SYSTEM_FILES = [
  // Workspace OpenClaw fondamentaux
  {
    label: "AGENTS.md",
    icon: "🤖",
    hint: "Instructions et règles de comportement agent",
    group: "workspace",
  },
  {
    label: "SOUL.md",
    icon: "✨",
    hint: "Persona, ton et limites de l'agent",
    group: "workspace",
  },
  {
    label: "IDENTITY.md",
    icon: "🪪",
    hint: "Nom, emoji et marqueurs d'identité",
    group: "workspace",
  },
  {
    label: "USER.md",
    icon: "👤",
    hint: "Profil utilisateur et préférences",
    group: "workspace",
  },
  {
    label: "TOOLS.md",
    icon: "🔧",
    hint: "Documentation des outils locaux",
    group: "workspace",
  },
  // Nemoclaw-specific
  {
    label: "MEMORY.md",
    icon: "🧠",
    hint: "Mémoire persistante de l'agent",
    group: "memory",
  },
  {
    label: "HEARTBEAT.md",
    icon: "💓",
    hint: "Fichier de santé et statut live",
    group: "memory",
  },
  {
    label: "CLAUDE.md",
    icon: "⚡",
    hint: "Instructions système principales",
    group: "memory",
  },
  {
    label: "NOTES.md",
    icon: "📝",
    hint: "Notes de travail de l'agent",
    group: "memory",
  },
];

const DOC_TYPES = [
  "Tous",
  "Document",
  "System Concept",
  "User Data",
  "Project Knowledge",
  "Secrets (Encrypted)",
  "Agent Rules",
];

// ─── Minimal Markdown renderer ────────────────────────────────────────────────
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /^### (.+)$/gm,
      '<h3 style="font-size:0.95rem;margin:16px 0 6px;color:var(--text-primary)">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 style="font-size:1.05rem;margin:20px 0 8px;color:var(--text-primary)">$1</h2>',
    )
    .replace(
      /^# (.+)$/gm,
      '<h1 style="font-size:1.2rem;margin:0 0 12px;color:var(--text-primary)">$1</h1>',
    )
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong style="color:var(--text-primary)">$1</strong>',
    )
    .replace(/\*(.+?)\*/g, '<em style="opacity:0.8">$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background:rgba(139,92,246,0.12);color:var(--brand-accent);padding:1px 5px;border-radius:3px;font-size:0.85em;font-family:var(--mono)">$1</code>',
    )
    .replace(
      /^---+$/gm,
      '<hr style="border:none;border-top:1px solid var(--border-subtle);margin:14px 0"/>',
    )
    .replace(
      /^[-*] (.+)$/gm,
      '<li style="margin:3px 0;padding-left:4px">$1</li>',
    )
    .replace(
      /(<li.*<\/li>\n?)+/g,
      '<ul style="padding-left:18px;margin:8px 0">$&</ul>',
    )
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const MemoryModule = () => {
  const [docs, setDocs] = useState<MemDoc[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [selected, setSelected] = useState<MemDoc | null>(null);
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">(
    "edit",
  );
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "Document",
    content: "",
    tags: "",
  });
  const [sandboxSync, setSandboxSync] = useState<{
    file: string;
    content: string;
  } | null>(null);
  const [sandboxSyncing, setSandboxSyncing] = useState(false);
  const [sandboxWriting, setSandboxWriting] = useState(false);
  const [sandboxName, setSandboxName] = useState("my-assistant");
  const [serverSearch, setServerSearch] = useState<MemDoc[] | null>(null); // résultats recherche serveur
  const [, setServerSearching] = useState(false);
  const [semanticMode, setSemanticMode] = useState(false); // pgvector semantic search

  const showMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDocs = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await apiFetch(`${BASE}/api/memory`).then((r) => r.json());
      setDocs(Array.isArray(data) ? data : (data.docs ?? data.data ?? []));
      setLastSync(new Date());
    } catch {}
    setSyncing(false);
  }, []);

  // Recherche texte ou sémantique côté serveur (filtre client sinon)
  useEffect(() => {
    if (search.length < 3) {
      setServerSearch(null);
      return;
    }
    const timer = setTimeout(async () => {
      setServerSearching(true);
      try {
        const params = new URLSearchParams({ q: search });
        if (semanticMode) params.set("semantic", "1");
        const r = await apiFetch(`${BASE}/api/memory?${params}`);
        const data = await r.json();
        const results = Array.isArray(data)
          ? data
          : (data.docs ?? data.data ?? null);
        setServerSearch(results);
      } catch {
        setServerSearch(null); // Fallback: filtre client
      } finally {
        setServerSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, semanticMode]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleSelect = (doc: MemDoc) => {
    setSelected(doc);
    setEditContent(doc.content || "");
    setDirty(false);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    // Sandbox doc — route to sandbox write
    if (selected.id.startsWith("__sandbox__")) {
      await handleSandboxWrite();
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(`${BASE}/api/memory/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      const updated = await r.json();
      setDocs((prev) => prev.map((d) => (d.id === selected.id ? updated : d)));
      setSelected(updated);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      showMsg("✓ Document sauvegardé");
    } catch {
      showMsg("Erreur sauvegarde");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce document ?")) return;
    await apiFetch(`${BASE}/api/memory/${id}`, { method: "DELETE" }).catch(
      () => {},
    );
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const r = await apiFetch(`${BASE}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tags }),
      });
      const d = await r.json();
      setDocs((prev) => [...prev, d]);
      setForm({ title: "", type: "Document", content: "", tags: "" });
      setShowForm(false);
      showMsg("✓ Document créé");
      handleSelect(d);
    } catch {
      showMsg("Erreur création");
    }
    setSaving(false);
  };

  // Quick-load a system file by label
  const handleQuickFile = (label: string) => {
    const existing = docs.find(
      (d) => d.title === label || d.title.toLowerCase() === label.toLowerCase(),
    );
    if (existing) {
      handleSelect(existing);
      return;
    }
    // Show as virtual doc
    setSelected({
      id: "__virtual__" + label,
      title: label,
      type: "System Concept",
      content: "",
      tags: [],
      chars: 0,
      createdAt: "",
      updatedAt: "",
    });
    setEditContent("");
    setDirty(false);
    setShowForm(false);
  };

  // ── NemoClaw sandbox memory sync ──────────────────────────────────────────
  const handleSandboxRead = async (file: string) => {
    setSandboxSyncing(true);
    try {
      const r = await apiFetch(
        `${BASE}/api/nemoclaw/${sandboxName}/memory/${file}`,
      );
      const data = await r.json();
      setSandboxSync({ file, content: data.content || "" });
      // Also show as selected/editable doc
      setSelected({
        id: `__sandbox__${file}`,
        title: `[Sandbox] ${file}`,
        type: "System Concept",
        content: data.content || "",
        tags: ["sandbox", sandboxName],
        chars: (data.content || "").length,
        createdAt: "",
        updatedAt: "",
      });
      setEditContent(data.content || "");
      setDirty(false);
      showMsg(`✓ ${file} chargé depuis le sandbox`);
    } catch {
      showMsg(`Erreur lecture ${file} depuis sandbox`);
    }
    setSandboxSyncing(false);
  };

  const handleSandboxWrite = async () => {
    if (!selected?.id.startsWith("__sandbox__") || !sandboxSync) return;
    setSandboxWriting(true);
    try {
      await apiFetch(
        `${BASE}/api/nemoclaw/${sandboxName}/memory/${sandboxSync.file}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent }),
        },
      );
      setSandboxSync({ file: sandboxSync.file, content: editContent });
      setDirty(false);
      showMsg(`✓ ${sandboxSync.file} écrit dans le sandbox`);
    } catch {
      showMsg(`Erreur écriture dans sandbox`);
    }
    setSandboxWriting(false);
  };

  // Si le serveur a renvoyé des résultats pour la recherche, les utiliser ; sinon filtre client
  const filtered = (serverSearch !== null ? serverSearch : docs)
    .filter((d) => typeFilter === "Tous" || d.type === typeFilter)
    .filter(
      (d) =>
        !search ||
        serverSearch !== null ||
        [d.title, d.type, ...d.tags].some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        ),
    );

  const wordCount = editContent.trim()
    ? editContent.trim().split(/\s+/).length
    : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        height: "100%",
        paddingBottom: 32,
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 80,
            right: 24,
            zIndex: 9999,
            background: "#10b981",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: "13px",
            boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
          }}
        >
          {toast}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              background: "var(--brand-secondary)",
              padding: 12,
              borderRadius: 14,
              color: "#fff",
            }}
          >
            <BrainCircuit size={28} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "1.5rem",
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Mémoire QMD
            </h2>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {docs.length} document{docs.length !== 1 ? "s" : ""}
              {lastSync && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "11px",
                    color: "#10b981",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#10b981",
                      display: "inline-block",
                    }}
                  />
                  Sync{" "}
                  {lastSync.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={fetchDocs}
            disabled={syncing}
            title="Resynchroniser avec Nemoclaw"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 9,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: syncing ? "spin 1s linear infinite" : "none",
              }}
            />
            {syncing ? "Sync…" : "Actualiser"}
          </button>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setSelected(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              borderRadius: 9,
              border: "none",
              background: showForm
                ? "var(--bg-glass)"
                : "var(--brand-secondary)",
              color: showForm ? "var(--text-primary)" : "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {showForm ? <X size={15} /> : <Plus size={17} />}
            {showForm ? "Annuler" : "Nouveau Doc"}
          </button>
        </div>
      </div>

      {/* ── Quick-access system files ────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Workspace OpenClaw */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              whiteSpace: "nowrap",
            }}
          >
            Workspace
          </span>
          {SYSTEM_FILES.filter((f) => f.group === "workspace").map((f) => (
            <button
              key={f.label}
              onClick={() => handleQuickFile(f.label)}
              title={f.hint}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 20,
                cursor: "pointer",
                background:
                  selected?.title === f.label
                    ? "rgba(139,92,246,0.15)"
                    : "var(--bg-glass)",
                border: `1px solid ${selected?.title === f.label ? "rgba(139,92,246,0.4)" : "var(--border-subtle)"}`,
                color:
                  selected?.title === f.label
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                fontSize: "12px",
                fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
        {/* Mémoire Nemoclaw */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              whiteSpace: "nowrap",
            }}
          >
            Mémoire
          </span>
          {SYSTEM_FILES.filter((f) => f.group === "memory").map((f) => (
            <button
              key={f.label}
              onClick={() => handleQuickFile(f.label)}
              title={f.hint}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 20,
                cursor: "pointer",
                background:
                  selected?.title === f.label
                    ? "rgba(236,72,153,0.1)"
                    : "var(--bg-glass)",
                border: `1px solid ${selected?.title === f.label ? "rgba(236,72,153,0.35)" : "var(--border-subtle)"}`,
                color:
                  selected?.title === f.label
                    ? "var(--brand-secondary)"
                    : "var(--text-secondary)",
                fontSize: "12px",
                fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── NemoClaw Sandbox Sync ───────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          background: "rgba(118,185,0,0.05)",
          border: "1px solid rgba(118,185,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Server size={14} style={{ color: "#76b900" }} />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#76b900",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Sandbox NemoClaw
            </span>
            <input
              value={sandboxName}
              onChange={(e) => setSandboxName(e.target.value)}
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                borderRadius: 5,
                background: "rgba(118,185,0,0.08)",
                border: "1px solid rgba(118,185,0,0.25)",
                color: "#76b900",
                width: 120,
                outline: "none",
              }}
              placeholder="my-assistant"
            />
          </div>
          {selected?.id.startsWith("__sandbox__") && sandboxSync && (
            <button
              onClick={handleSandboxWrite}
              disabled={sandboxWriting || !dirty}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 11px",
                borderRadius: 6,
                fontSize: "11px",
                fontWeight: 700,
                cursor: sandboxWriting || !dirty ? "not-allowed" : "pointer",
                background: dirty ? "rgba(118,185,0,0.15)" : "var(--bg-glass)",
                border: `1px solid ${dirty ? "rgba(118,185,0,0.4)" : "var(--border-subtle)"}`,
                color: dirty ? "#76b900" : "var(--text-muted)",
                opacity: sandboxWriting ? 0.7 : 1,
              }}
            >
              <Upload size={11} />
              {sandboxWriting ? "Écriture…" : `Écrire dans sandbox`}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "MEMORY.md",
            "SOUL.md",
            "AGENTS.md",
            "HEARTBEAT.md",
            "CLAUDE.md",
            "NOTES.md",
          ].map((file) => (
            <button
              key={file}
              onClick={() => handleSandboxRead(file)}
              disabled={sandboxSyncing}
              title={`Lire ${file} depuis le sandbox ${sandboxName}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 20,
                cursor: sandboxSyncing ? "wait" : "pointer",
                background:
                  sandboxSync?.file === file &&
                  selected?.id.startsWith("__sandbox__")
                    ? "rgba(118,185,0,0.15)"
                    : "var(--bg-glass)",
                border: `1px solid ${sandboxSync?.file === file && selected?.id.startsWith("__sandbox__") ? "rgba(118,185,0,0.4)" : "var(--border-subtle)"}`,
                color:
                  sandboxSync?.file === file &&
                  selected?.id.startsWith("__sandbox__")
                    ? "#76b900"
                    : "var(--text-secondary)",
                fontSize: "11.5px",
                fontWeight: 600,
                transition: "all 0.15s",
                opacity: sandboxSyncing ? 0.6 : 1,
              }}
            >
              <Download size={10} />
              {file}
            </button>
          ))}
          {sandboxSyncing && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: "11px",
                color: "#76b900",
              }}
            >
              <RefreshCw
                size={11}
                style={{ animation: "spin 1s linear infinite" }}
              />
              Lecture sandbox…
            </span>
          )}
        </div>
      </div>

      {/* ── Type filter tabs ────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: 12,
        }}
      >
        {DOC_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{
              padding: "5px 12px",
              borderRadius: 20,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "11px",
              transition: "all 0.15s",
              background:
                typeFilter === t ? "rgba(236,72,153,0.1)" : "transparent",
              color:
                typeFilter === t
                  ? "var(--brand-secondary)"
                  : "var(--text-muted)",
            }}
          >
            {t}{" "}
            {t !== "Tous" && docs.filter((d) => d.type === t).length > 0 && (
              <span style={{ opacity: 0.7, fontSize: "10px" }}>
                ({docs.filter((d) => d.type === t).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1.2fr) 2fr",
          gap: 20,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left: document list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 11,
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
              style={{ ...inputStyle, paddingLeft: 32, paddingRight: 90 }}
            />
            <button
              onClick={() => setSemanticMode((m) => !m)}
              title={
                semanticMode
                  ? "Recherche sémantique (pgvector)"
                  : "Recherche textuelle"
              }
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 6,
                background: semanticMode
                  ? "rgba(139,92,246,0.15)"
                  : "rgba(255,255,255,0.05)",
                border: `1px solid ${semanticMode ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
                color: semanticMode
                  ? "var(--brand-accent)"
                  : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <BrainCircuit size={10} /> {semanticMode ? "Sémantique" : "Texte"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              overflowY: "auto",
              maxHeight: 580,
            }}
          >
            {filtered.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                {docs.length === 0
                  ? "Aucun document. Créez le premier."
                  : "Aucun résultat."}
              </div>
            )}
            {filtered.map((doc) => {
              const isEncrypted = doc.type === "Secrets (Encrypted)";
              return (
                <div
                  key={doc.id}
                  onClick={() => handleSelect(doc)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    background:
                      selected?.id === doc.id
                        ? "rgba(236,72,153,0.08)"
                        : "var(--bg-glass)",
                    border: `1px solid ${selected?.id === doc.id ? "rgba(236,72,153,0.35)" : "var(--border-subtle)"}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <FileText
                        size={13}
                        color={
                          isEncrypted ? "#f59e0b" : "var(--brand-secondary)"
                        }
                      />
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {doc.title}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#ef4444",
                        display: "flex",
                        opacity: 0,
                      }}
                      className="delete-btn"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginTop: 4,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: "10px",
                        fontWeight: 600,
                        background: isEncrypted
                          ? "rgba(245,158,11,0.1)"
                          : "rgba(236,72,153,0.08)",
                        color: isEncrypted
                          ? "#f59e0b"
                          : "var(--brand-secondary)",
                      }}
                    >
                      {doc.type}
                    </span>
                    <span style={{ fontFamily: "var(--mono)" }}>
                      {doc.chars} ch.
                    </span>
                  </div>
                  {doc.tags?.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        marginTop: 6,
                      }}
                    >
                      {doc.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            background: "rgba(236,72,153,0.1)",
                            color: "var(--brand-secondary)",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: "9px",
                            fontWeight: 600,
                          }}
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: editor */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {showForm ? (
            <div
              style={{
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1rem",
                  color: "var(--text-primary)",
                }}
              >
                Nouveau document QMD
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <label
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                    }}
                  >
                    Titre *
                  </label>
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="architecture_nemoclaw.qmd"
                  />
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <label
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                    }}
                  >
                    Type
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, type: e.target.value }))
                    }
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    {DOC_TYPES.slice(1).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    gridColumn: "1 / -1",
                  }}
                >
                  <label
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                    }}
                  >
                    Tags (virgule)
                  </label>
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tags: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="core, architecture, active…"
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                  }}
                >
                  Contenu (Markdown)
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, content: e.target.value }))
                  }
                  rows={10}
                  style={{
                    ...inputStyle,
                    fontFamily: "var(--mono)",
                    fontSize: "13px",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                  placeholder={`# Titre\n\n## Section\n\nContenu...`}
                />
              </div>
              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <button
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: "8px 18px",
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.title.trim() || saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 18px",
                    background: "var(--brand-secondary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    opacity: !form.title.trim() ? 0.5 : 1,
                  }}
                >
                  <Save size={14} />
                  {saving ? "Création…" : "Créer"}
                </button>
              </div>
            </div>
          ) : selected ? (
            <>
              {/* Editor toolbar */}
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--bg-glass)",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    fontSize: "13px",
                    minWidth: 0,
                  }}
                >
                  <Edit3 size={15} color="var(--text-secondary)" />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selected.title}
                  </span>
                  {dirty && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#f59e0b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ● Non sauvegardé
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {/* View mode toggle */}
                  <div
                    style={{
                      display: "flex",
                      background: "var(--bg-glass)",
                      padding: "3px",
                      borderRadius: 7,
                      border: "1px solid var(--border-subtle)",
                      gap: 2,
                    }}
                  >
                    {(
                      [
                        ["edit", <Code2 size={12} />, "Éditer"],
                        ["split", <Eye size={12} />, "Split"],
                        ["preview", <FileText size={12} />, "Preview"],
                      ] as const
                    ).map(([mode, icon, label]) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        title={label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 9px",
                          borderRadius: 5,
                          border: "none",
                          cursor: "pointer",
                          background:
                            viewMode === mode
                              ? "rgba(236,72,153,0.15)"
                              : "transparent",
                          color:
                            viewMode === mode
                              ? "var(--brand-secondary)"
                              : "var(--text-muted)",
                          fontSize: "11px",
                          fontWeight: 600,
                          transition: "all 0.15s",
                        }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      background: saved
                        ? "rgba(16,185,129,0.12)"
                        : dirty
                          ? "var(--brand-secondary)"
                          : "var(--bg-glass)",
                      color: saved
                        ? "#10b981"
                        : dirty
                          ? "#fff"
                          : "var(--text-muted)",
                      border: "none",
                      borderRadius: 7,
                      cursor: dirty ? "pointer" : "default",
                      fontWeight: 600,
                      fontSize: "12px",
                      transition: "all 0.2s",
                    }}
                  >
                    {saved ? (
                      <Check size={13} />
                    ) : saving ? (
                      <RefreshCw
                        size={13}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : (
                      <Save size={13} />
                    )}
                    {saved ? "Sauvegardé !" : "Enregistrer"}
                  </button>
                </div>
              </div>

              {/* Editor/Preview area */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                {/* Raw editor */}
                {(viewMode === "edit" || viewMode === "split") && (
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      setDirty(true);
                      setSaved(false);
                    }}
                    style={{
                      flex: 1,
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      padding: 18,
                      border: "none",
                      resize: "none",
                      outline: "none",
                      fontSize: "13px",
                      lineHeight: 1.7,
                      fontFamily: "var(--mono)",
                      minHeight: 360,
                      borderRight:
                        viewMode === "split"
                          ? "1px solid var(--border-subtle)"
                          : "none",
                    }}
                  />
                )}
                {/* Markdown preview */}
                {(viewMode === "preview" || viewMode === "split") && (
                  <div
                    style={{
                      flex: 1,
                      padding: 20,
                      overflowY: "auto",
                      fontSize: "13px",
                      lineHeight: 1.7,
                      color: "var(--text-secondary)",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: editContent
                        ? renderMarkdown(editContent)
                        : '<p style="opacity:0.4;font-style:italic">Aperçu vide — commencez à écrire…</p>',
                    }}
                  />
                )}
              </div>

              {/* Footer stats */}
              <div
                style={{
                  padding: "7px 16px",
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  display: "flex",
                  gap: 18,
                  alignItems: "center",
                }}
              >
                <span>{editContent.length} chars</span>
                <span>{wordCount} mots</span>
                <span>{editContent.split("\n").length} lignes</span>
                {selected.updatedAt && (
                  <span style={{ marginLeft: "auto" }}>
                    Mis à jour :{" "}
                    {new Date(selected.updatedAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {selected.type === "Secrets (Encrypted)" && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: "#f59e0b",
                    }}
                  >
                    <AlertTriangle size={10} /> Contenu chiffré
                  </span>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                minHeight: 300,
                color: "var(--text-muted)",
                gap: 14,
              }}
            >
              <Database size={36} style={{ opacity: 0.2 }} />
              <div
                style={{
                  textAlign: "center",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  opacity: 0.6,
                }}
              >
                Sélectionnez un document pour l'éditer
                <br />
                <span style={{ fontSize: "11px" }}>
                  ou cliquez sur un fichier système Nemoclaw ci-dessus
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {SYSTEM_FILES.slice(0, 2).map((f) => (
                  <button
                    key={f.label}
                    onClick={() => handleQuickFile(f.label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "6px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "rgba(236,72,153,0.06)",
                      border: "1px solid rgba(236,72,153,0.2)",
                      color: "var(--brand-secondary)",
                    }}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .delete-btn { opacity: 0 !important; transition: opacity 0.15s; }
        div:hover > .delete-btn { opacity: 0.7 !important; }
      `}</style>
    </div>
  );
};
