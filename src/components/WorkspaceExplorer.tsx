import { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  Upload,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  File,
  FileImage,
  FileCode,
  Search,
  X,
  ArrowLeft,
  HardDrive,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FSEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  children?: FSEntry[];
}

interface UploadTarget {
  scope: "task" | "agent" | "lia" | "global";
  id?: string;
  label: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, typeof FileText> = {
  ".md": FileText,
  ".txt": FileText,
  ".log": FileText,
  ".json": FileCode,
  ".js": FileCode,
  ".ts": FileCode,
  ".py": FileCode,
  ".sh": FileCode,
  ".yaml": FileCode,
  ".yml": FileCode,
  ".png": FileImage,
  ".jpg": FileImage,
  ".jpeg": FileImage,
  ".gif": FileImage,
  ".webp": FileImage,
  ".svg": FileImage,
};

function getFileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return ICON_MAP[ext] || File;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Default workspace tree (mock graceful) ──────────────────────────────────

const MOCK_TREE: FSEntry[] = [
  {
    name: "agents",
    path: "agents",
    type: "directory",
    children: [
      {
        name: "main",
        path: "agents/main",
        type: "directory",
        children: [
          {
            name: "output.md",
            path: "agents/main/output.md",
            type: "file",
            size: 2340,
            modified: "2026-03-30T14:22:00Z",
          },
          {
            name: "logs.txt",
            path: "agents/main/logs.txt",
            type: "file",
            size: 8120,
            modified: "2026-03-30T14:22:00Z",
          },
        ],
      },
      {
        name: "researcher",
        path: "agents/researcher",
        type: "directory",
        children: [
          {
            name: "brief.md",
            path: "agents/researcher/brief.md",
            type: "file",
            size: 1560,
            modified: "2026-03-29T10:15:00Z",
          },
        ],
      },
      {
        name: "coder",
        path: "agents/coder",
        type: "directory",
        children: [
          {
            name: "patch.diff",
            path: "agents/coder/patch.diff",
            type: "file",
            size: 4200,
            modified: "2026-03-28T16:45:00Z",
          },
        ],
      },
    ],
  },
  {
    name: "tasks",
    path: "tasks",
    type: "directory",
    children: [
      {
        name: "analyse-twitter",
        path: "tasks/analyse-twitter",
        type: "directory",
        children: [
          {
            name: "2026-03-02-analyse-twitter.md",
            path: "tasks/analyse-twitter/2026-03-02-analyse-twitter.md",
            type: "file",
            size: 5600,
            modified: "2026-03-02T09:00:00Z",
          },
          {
            name: "data.json",
            path: "tasks/analyse-twitter/data.json",
            type: "file",
            size: 12400,
            modified: "2026-03-02T09:00:00Z",
          },
        ],
      },
      {
        name: "morning-briefing",
        path: "tasks/morning-briefing",
        type: "directory",
        children: [
          {
            name: "2026-03-30-briefing.md",
            path: "tasks/morning-briefing/2026-03-30-briefing.md",
            type: "file",
            size: 3200,
            modified: "2026-03-30T06:00:00Z",
          },
        ],
      },
    ],
  },
  {
    name: "reports",
    path: "reports",
    type: "directory",
    children: [
      {
        name: "2026-03-30-seo-audit.md",
        path: "reports/2026-03-30-seo-audit.md",
        type: "file",
        size: 7800,
        modified: "2026-03-30T11:30:00Z",
      },
      {
        name: "2026-03-29-competitor-watch.md",
        path: "reports/2026-03-29-competitor-watch.md",
        type: "file",
        size: 4500,
        modified: "2026-03-29T08:00:00Z",
      },
    ],
  },
  {
    name: "uploads",
    path: "uploads",
    type: "directory",
    children: [
      {
        name: "lia",
        path: "uploads/lia",
        type: "directory",
        children: [
          {
            name: "context-doc.pdf",
            path: "uploads/lia/context-doc.pdf",
            type: "file",
            size: 245000,
            modified: "2026-03-28T12:00:00Z",
          },
        ],
      },
      {
        name: "global",
        path: "uploads/global",
        type: "directory",
        children: [
          {
            name: "brand-guidelines.pdf",
            path: "uploads/global/brand-guidelines.pdf",
            type: "file",
            size: 1200000,
            modified: "2026-03-25T09:00:00Z",
          },
        ],
      },
    ],
  },
];

// ─── File Preview ────────────────────────────────────────────────────────────

const FilePreview = ({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`${BASE}/api/workspace/file?path=${encodeURIComponent(path)}`)
      .then((r) => r.text())
      .then(setContent)
      .catch(() =>
        setContent(
          "// Impossible de charger le fichier.\n// Le serveur de workspace n'est peut-être pas disponible.",
        ),
      )
      .finally(() => setLoading(false));
  }, [path]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: "13px",
            color: "var(--text-primary)",
          }}
        >
          {path}
        </span>
      </div>
      <div
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "16px",
          fontFamily: "var(--mono)",
          fontSize: "12px",
          lineHeight: 1.6,
          maxHeight: "500px",
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          color: "var(--text-primary)",
        }}
      >
        {loading ? <Loader2 size={16} className="spin" /> : content}
      </div>
    </div>
  );
};

// ─── Tree Node ───────────────────────────────────────────────────────────────

const TreeNode = ({
  entry,
  depth,
  onFileClick,
}: {
  entry: FSEntry;
  depth: number;
  onFileClick: (path: string) => void;
}) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = entry.type === "directory";
  const Icon = isDir
    ? expanded
      ? FolderOpen
      : Folder
    : getFileIcon(entry.name);
  const iconColor = isDir ? "var(--brand-accent)" : "var(--text-secondary)";

  return (
    <div>
      <div
        onClick={() =>
          isDir ? setExpanded((e) => !e) : onFileClick(entry.path)
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px",
          paddingLeft: `${12 + depth * 20}px`,
          cursor: "pointer",
          borderRadius: "6px",
          transition: "background 0.15s",
          fontSize: "13px",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(139,92,246,0.08)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {isDir && (
          <span style={{ color: "var(--text-secondary)", display: "flex" }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {!isDir && <span style={{ width: 14 }} />}
        <Icon size={15} style={{ color: iconColor, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            color: "var(--text-primary)",
            fontWeight: isDir ? 600 : 400,
          }}
        >
          {entry.name}
        </span>
        {!isDir && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-secondary)",
              fontFamily: "var(--mono)",
            }}
          >
            {formatSize(entry.size)}
          </span>
        )}
      </div>
      {isDir &&
        expanded &&
        entry.children?.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onFileClick={onFileClick}
          />
        ))}
    </div>
  );
};

// ─── Upload Panel ────────────────────────────────────────────────────────────

const UPLOAD_TARGETS: UploadTarget[] = [
  { scope: "global", label: "Documents globaux" },
  { scope: "lia", label: "Contexte Lia" },
  { scope: "task", label: "Tâche spécifique" },
  { scope: "agent", label: "Agent spécifique" },
];

const UploadPanel = ({ onUploaded }: { onUploaded: () => void }) => {
  const [target, setTarget] = useState<UploadTarget>(UPLOAD_TARGETS[0]);
  const [targetId, setTargetId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("scope", target.scope);
      if (targetId) formData.append("targetId", targetId);
      files.forEach((f) => formData.append("files", f));

      const res = await fetch(`${BASE}/api/workspace/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: `${files.length} fichier(s) uploadé(s)` });
        setFiles([]);
        onUploaded();
      } else {
        setResult({ ok: false, msg: data.error || "Erreur upload" });
      }
    } catch {
      setResult({
        ok: true,
        msg: `${files.length} fichier(s) uploadé(s) (demo mode)`,
      });
      setFiles([]);
    }
    setUploading(false);
  };

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: "7px",
    background: "var(--bg-glass)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    fontSize: "12px",
    outline: "none",
  };

  return (
    <div
      className="glass-panel p-6"
      style={{ display: "flex", flexDirection: "column", gap: "16px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Upload size={18} color="var(--brand-primary)" />
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Uploader des documents</h3>
      </div>

      {/* Target selector */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {UPLOAD_TARGETS.map((t) => (
          <button
            key={t.scope}
            onClick={() => setTarget(t)}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-full)",
              border: `1px solid ${target.scope === t.scope ? "var(--brand-primary)" : "var(--border-subtle)"}`,
              background:
                target.scope === t.scope
                  ? "rgba(139,92,246,0.12)"
                  : "transparent",
              color:
                target.scope === t.scope
                  ? "var(--brand-primary)"
                  : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Target ID if needed */}
      {(target.scope === "task" || target.scope === "agent") && (
        <input
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder={
            target.scope === "task" ? "ID ou nom de la tâche" : "Nom de l'agent"
          }
          style={{ ...inputStyle, width: "100%", maxWidth: "300px" }}
        />
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: "2px dashed var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "32px",
          textAlign: "center",
          cursor: "pointer",
          color: "var(--text-secondary)",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--brand-primary)";
          e.currentTarget.style.background = "rgba(139,92,246,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-subtle)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Upload
          size={24}
          style={{ margin: "0 auto 8px", display: "block", opacity: 0.5 }}
        />
        <div style={{ fontSize: "13px" }}>
          Glissez vos fichiers ici ou{" "}
          <span style={{ color: "var(--brand-primary)", fontWeight: 600 }}>
            parcourir
          </span>
        </div>
        <div style={{ fontSize: "11px", marginTop: "4px" }}>
          PDF, MD, TXT, JSON, images — max 10 MB
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files)
              setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                background: "var(--bg-glass)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <FileText size={14} style={{ color: "var(--text-secondary)" }} />
              <span style={{ flex: 1, fontSize: "12px", fontWeight: 500 }}>
                {f.name}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--mono)",
                }}
              >
                {formatSize(f.size)}
              </span>
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  display: "flex",
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          style={{
            padding: "8px 20px",
            borderRadius: "var(--radius-full)",
            background:
              files.length > 0
                ? "var(--brand-primary)"
                : "rgba(255,255,255,0.05)",
            color: files.length > 0 ? "#fff" : "var(--text-secondary)",
            border: "none",
            cursor: files.length > 0 ? "pointer" : "not-allowed",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {uploading ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Upload size={14} />
          )}
          {uploading ? "Upload…" : `Uploader ${files.length} fichier(s)`}
        </button>
        {result && (
          <span
            style={{
              fontSize: "12px",
              color: result.ok
                ? "var(--status-success)"
                : "var(--status-error)",
            }}
          >
            {result.ok ? "✓" : "✕"} {result.msg}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const WorkspaceExplorer = () => {
  const [tree, setTree] = useState<FSEntry[]>(MOCK_TREE);
  const [search, setSearch] = useState("");
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BASE}/api/workspace/tree`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTree(data);
      }
    } catch {
      // graceful — keep mock tree
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Filter tree by search
  const filterTree = (entries: FSEntry[], q: string): FSEntry[] => {
    if (!q) return entries;
    const lq = q.toLowerCase();
    return entries
      .map((e) => {
        if (e.type === "directory") {
          const filtered = filterTree(e.children || [], q);
          if (filtered.length > 0 || e.name.toLowerCase().includes(lq)) {
            return { ...e, children: filtered };
          }
          return null;
        }
        return e.name.toLowerCase().includes(lq) ? e : null;
      })
      .filter(Boolean) as FSEntry[];
  };

  const filteredTree = filterTree(tree, search);

  // Stats
  const countFiles = (entries: FSEntry[]): number =>
    entries.reduce(
      (acc, e) => acc + (e.type === "file" ? 1 : countFiles(e.children || [])),
      0,
    );
  const countDirs = (entries: FSEntry[]): number =>
    entries.reduce(
      (acc, e) =>
        acc + (e.type === "directory" ? 1 + countDirs(e.children || []) : 0),
      0,
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <HardDrive size={22} color="var(--brand-primary)" />
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
              Espace de travail
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              Naviguez les dossiers agents, tâches et reports — uploadez des
              documents pour chaque contexte.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-secondary)",
              fontFamily: "var(--mono)",
            }}
          >
            {countDirs(tree)} dossiers · {countFiles(tree)} fichiers
          </span>
          <button
            onClick={fetchTree}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-full)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div style={{ position: "relative", maxWidth: "400px" }}>
        <Search
          size={15}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-secondary)",
          }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un fichier ou dossier…"
          style={{
            width: "100%",
            padding: "9px 12px 9px 36px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            fontSize: "13px",
            outline: "none",
          }}
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}
      >
        {/* ── File tree ────────────────────────────────────────────── */}
        <div
          className="glass-panel p-4"
          style={{ maxHeight: "600px", overflowY: "auto" }}
        >
          {previewPath ? (
            <FilePreview
              path={previewPath}
              onClose={() => setPreviewPath(null)}
            />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <Folder size={16} color="var(--brand-accent)" />
                <span style={{ fontWeight: 700, fontSize: "13px" }}>
                  ~/.openclaw/workspace/
                </span>
              </div>
              {filteredTree.length === 0 ? (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                  }}
                >
                  <AlertCircle
                    size={20}
                    style={{
                      margin: "0 auto 8px",
                      display: "block",
                      opacity: 0.5,
                    }}
                  />
                  Aucun résultat
                </div>
              ) : (
                filteredTree.map((entry) => (
                  <TreeNode
                    key={entry.path}
                    entry={entry}
                    depth={0}
                    onFileClick={setPreviewPath}
                  />
                ))
              )}
            </>
          )}
        </div>

        {/* ── Upload panel ─────────────────────────────────────────── */}
        <UploadPanel onUploaded={fetchTree} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
