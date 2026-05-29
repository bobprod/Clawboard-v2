import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText,
  Image,
  Code,
  File,
  X,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

// ─── Lazy-loaded renderers ────────────────────────────────────────────────────

let SyntaxHighlighter: React.ComponentType<{
  language: string;
  style: Record<string, React.CSSProperties>;
  showLineNumbers?: boolean;
  wrapLines?: boolean;
  children: string;
}> | null = null;
let highlightStyle: Record<string, React.CSSProperties> = {};
let ReactMarkdown: any = null;
let remarkGfm: unknown = null;

const CODE_EXTS = new Set([
  ".js", ".ts", ".tsx", ".jsx", ".py", ".sh", ".rb", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".css", ".scss", ".html", ".xml", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".conf", ".sql", ".graphql", ".env", ".mjs",
]);

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".bmp", ".ico"]);
const MARKDOWN_EXTS = new Set([".md", ".mdx", ".markdown"]);
const DIFF_EXTS = new Set([".diff", ".patch"]);
const PDF_EXTS = new Set([".pdf"]);

type PreviewFormat = "code" | "markdown" | "image" | "diff" | "pdf" | "text";

function detectFormat(filename: string): PreviewFormat {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (CODE_EXTS.has(ext)) return "code";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (DIFF_EXTS.has(ext)) return "diff";
  if (PDF_EXTS.has(ext)) return "pdf";
  return "text";
}

function extToLang(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".js": "javascript", ".mjs": "javascript", ".ts": "typescript",
    ".tsx": "tsx", ".jsx": "jsx", ".py": "python", ".sh": "bash",
    ".rb": "ruby", ".go": "go", ".rs": "rust", ".java": "java",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".css": "css",
    ".scss": "scss", ".html": "html", ".xml": "xml", ".yaml": "yaml",
    ".yml": "yaml", ".toml": "toml", ".sql": "sql", ".json": "json",
    ".graphql": "graphql", ".ini": "ini", ".env": "bash",
  };
  return map[ext] || "text";
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FORMAT_ICONS: Record<PreviewFormat, typeof FileText> = {
  code: Code,
  markdown: FileText,
  image: Image,
  diff: FileText,
  pdf: File,
  text: File,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface FSEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  children?: FSEntry[];
}

interface OpenTab {
  path: string;
  name: string;
  format: PreviewFormat;
  content: string | null;
  diff: string | null;
  loading: boolean;
  error: string | null;
}

// ─── Diff Renderer ───────────────────────────────────────────────────────────

function DiffView({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <pre
      style={{
        fontFamily: "var(--mono)",
        fontSize: "12px",
        lineHeight: 1.7,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {lines.map((line, i) => {
        let color = "var(--text-primary)";
        let bg = "transparent";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          color = "#10b981";
          bg = "rgba(16,185,129,0.08)";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          color = "#ef4444";
          bg = "rgba(239,68,68,0.08)";
        } else if (line.startsWith("@@")) {
          color = "var(--brand-accent)";
        } else if (line.startsWith("diff --git") || line.startsWith("index ")) {
          color = "var(--text-secondary)";
        }
        return (
          <div key={i} style={{ background: bg, color, paddingLeft: "8px" }}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

// ─── Image Preview ───────────────────────────────────────────────────────────

function ImagePreview({ src, filename }: { src: string; filename: string }) {
  const [zoom, setZoom] = useState(1);
  const isSvg = filename.toLowerCase().endsWith(".svg");
  const dataUrl = isSvg
    ? `data:image/svg+xml;base64,${btoa(src)}`
    : `data:image/${filename.slice(filename.lastIndexOf(".") + 1)};base64,${src}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          style={zoomBtnStyle}
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", minWidth: "48px", textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          style={zoomBtnStyle}
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button onClick={() => setZoom(1)} style={zoomBtnStyle} title="Reset">
          <RotateCcw size={14} />
        </button>
      </div>
      <div
        style={{
          maxHeight: "60vh",
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          width: "100%",
        }}
      >
        <img
          src={dataUrl}
          alt={filename}
          style={{
            maxWidth: "100%",
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            borderRadius: "var(--radius-sm)",
            transition: "transform 0.15s ease",
          }}
        />
      </div>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  borderRadius: "var(--radius-sm)",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

// ─── PDF Preview ─────────────────────────────────────────────────────────────

function PdfPreview({ data }: { data: string }) {
  return (
    <iframe
      src={`data:application/pdf;base64,${data}`}
      style={{
        width: "100%",
        height: "70vh",
        border: "none",
        borderRadius: "var(--radius-sm)",
        background: "#fff",
      }}
      title="PDF Preview"
    />
  );
}

// ─── File Tree Node ──────────────────────────────────────────────────────────

function TreeNode({
  entry,
  depth,
  onFileClick,
  activePath,
}: {
  entry: FSEntry;
  depth: number;
  onFileClick: (path: string, name: string) => void;
  activePath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = entry.type === "directory";
  const isActive = !isDir && entry.path === activePath;

  return (
    <div>
      <div
        onClick={() => (isDir ? setExpanded((e) => !e) : onFileClick(entry.path, entry.name))}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 8px",
          paddingLeft: `${8 + depth * 16}px`,
          cursor: "pointer",
          borderRadius: "6px",
          transition: "background 0.15s",
          fontSize: "12px",
          background: isActive ? "rgba(139,92,246,0.12)" : "transparent",
          borderLeft: isActive ? "2px solid var(--brand-accent)" : "2px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "rgba(139,92,246,0.06)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        {isDir ? (
          <>
            <span style={{ color: "var(--text-secondary)", display: "flex" }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {expanded ? (
              <FolderOpen size={14} color="var(--brand-accent)" />
            ) : (
              <Folder size={14} color="var(--brand-accent)" />
            )}
          </>
        ) : (
          <>
            <span style={{ width: 12 }} />
            <FileIcon filename={entry.name} />
          </>
        )}
        <span
          style={{
            flex: 1,
            color: isActive ? "var(--brand-accent)" : "var(--text-primary)",
            fontWeight: isDir ? 600 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.name}
        </span>
        {!isDir && entry.size != null && (
          <span
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              fontFamily: "var(--mono)",
              flexShrink: 0,
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
            activePath={activePath}
          />
        ))}
    </div>
  );
}

function FileIcon({ filename }: { filename: string }) {
  const format = detectFormat(filename);
  const ICONS: Record<PreviewFormat, typeof FileText> = {
    code: Code,
    markdown: FileText,
    image: Image,
    diff: FileText,
    pdf: File,
    text: File,
  };
  const Icon = ICONS[format];
  return <Icon size={14} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />;
}

// ─── Preview Content ─────────────────────────────────────────────────────────

function PreviewContent({ tab }: { tab: OpenTab }) {
  const [libsLoaded, setLibsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (tab.format === "code" && !SyntaxHighlighter) {
        try {
          const mod = await import("react-syntax-highlighter");
          const styleMod = await import("react-syntax-highlighter/dist/esm/styles/prism");
          SyntaxHighlighter = mod.Prism;
          highlightStyle = styleMod.vscDarkPlus;
        } catch {
          // fallback to plain text
        }
      }
      if (tab.format === "markdown" && !ReactMarkdown) {
        try {
          const [mdMod, gfmMod] = await Promise.all([
            import("react-markdown"),
            import("remark-gfm"),
          ]);
          ReactMarkdown = mdMod.default;
          remarkGfm = gfmMod.default;
        } catch {
          // fallback
        }
      }
      if (!cancelled) setLibsLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [tab.format]);

  if (tab.loading) {
    return (
      <div style={centerStyle}>
        <Loader2 size={24} className="spin" style={{ color: "var(--brand-accent)" }} />
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Loading…</span>
      </div>
    );
  }

  if (tab.error) {
    return (
      <div style={centerStyle}>
        <AlertCircle size={24} style={{ color: "var(--status-error)" }} />
        <span style={{ fontSize: "13px", color: "var(--status-error)" }}>{tab.error}</span>
      </div>
    );
  }

  if (!tab.content && tab.format !== "diff") {
    return (
      <div style={centerStyle}>
        <File size={24} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Empty file</span>
      </div>
    );
  }

  switch (tab.format) {
    case "code":
      if (SyntaxHighlighter && libsLoaded) {
        return (
          <SyntaxHighlighter
            language={extToLang(tab.path)}
            style={highlightStyle}
            showLineNumbers
            wrapLines
          >
            {tab.content || ""}
          </SyntaxHighlighter>
        );
      }
      return <pre style={preStyle}>{tab.content}</pre>;

    case "markdown":
      if (ReactMarkdown && libsLoaded) {
        return (
          <div className="markdown-body" style={{ padding: "16px" }}>
            <ReactMarkdown remarkPlugins={remarkGfm ? [remarkGfm] : []}>
              {tab.content || ""}
            </ReactMarkdown>
          </div>
        );
      }
      return <pre style={preStyle}>{tab.content}</pre>;

    case "diff":
      return <DiffView content={tab.diff || tab.content || ""} />;

    case "image":
      return <ImagePreview src={tab.content || ""} filename={tab.name} />;

    case "pdf":
      return <PdfPreview data={tab.content || ""} />;

    default:
      return <pre style={preStyle}>{tab.content}</pre>;
  }
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  height: "100%",
  minHeight: "200px",
};

const preStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: "13px",
  lineHeight: 1.7,
  margin: 0,
  padding: "16px",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "var(--text-primary)",
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface PreviewPanelProps {
  workspaceRoot?: string;
  initialFile?: string | null;
  onClose?: () => void;
  position?: "side" | "bottom";
}

const BASE = "http://localhost:4000";

export default function PreviewPanel({
  initialFile = null,
  onClose,
  position = "side",
}: PreviewPanelProps) {
  const [tree, setTree] = useState<FSEntry[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [treeLoading, setTreeLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch file tree
  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await apiFetch(`${BASE}/api/files`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTree(data);
      }
    } catch {
      // graceful fallback — empty tree
    }
    setTreeLoading(false);
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Open initial file
  useEffect(() => {
    if (initialFile) openFile(initialFile, initialFile.split("/").pop() || initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  // Open a file in a new tab
  const openFile = useCallback(async (path: string, name: string) => {
    // Already open?
    const existing = tabs.findIndex((t) => t.path === path);
    if (existing >= 0) {
      setActiveIdx(existing);
      return;
    }

    const format = detectFormat(name);
    const newTab: OpenTab = { path, name, format, content: null, diff: null, loading: true, error: null };
    const idx = tabs.length;
    setTabs((prev) => [...prev, newTab]);
    setActiveIdx(idx);

    try {
      if (format === "diff") {
        const res = await apiFetch(`${BASE}/api/files/diff/${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTabs((prev) =>
          prev.map((t, i) =>
            i === idx ? { ...t, diff: data.diff || data.content || "", content: data.diff || "", loading: false } : t,
          ),
        );
      } else if (format === "image") {
        const res = await apiFetch(`${BASE}/api/files/${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTabs((prev) =>
          prev.map((t, i) => (i === idx ? { ...t, content: data.content, loading: false } : t)),
        );
      } else {
        const res = await apiFetch(`${BASE}/api/files/${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTabs((prev) =>
          prev.map((t, i) => (i === idx ? { ...t, content: data.content, loading: false } : t)),
        );
      }
    } catch (err) {
      setTabs((prev) =>
        prev.map((t, i) =>
          i === idx
            ? { ...t, loading: false, error: err instanceof Error ? err.message : "Failed to load" }
            : t,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const closeTab = useCallback(
    (idx: number) => {
      setTabs((prev) => prev.filter((_, i) => i !== idx));
      setActiveIdx((prev) => {
        if (idx < prev) return prev - 1;
        if (idx === prev) return Math.max(0, prev - 1);
        return prev;
      });
    },
    [],
  );

  // Filter tree
  const filterTree = useCallback((entries: FSEntry[], q: string): FSEntry[] => {
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
  }, []);

  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search, filterTree]);

  const isSide = position === "side";

  return (
    <div
      className="glass-panel"
      style={{
        display: "flex",
        flexDirection: isSide ? "row" : "column",
        height: isSide ? "100%" : "50vh",
        width: isSide ? "100%" : "100%",
        overflow: "hidden",
      }}
    >
      {/* ── File Tree Sidebar ──────────────────────────────────────── */}
      <div
        style={{
          width: isSide ? "240px" : "100%",
          minWidth: isSide ? "240px" : undefined,
          height: isSide ? "100%" : "auto",
          borderRight: isSide ? "1px solid var(--border-subtle)" : "none",
          borderBottom: isSide ? "none" : "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Tree header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
            FILES
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-secondary)",
                display: "flex",
                padding: "2px",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ padding: "8px 10px", flexShrink: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter files…"
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: "12px",
              outline: "none",
            }}
          />
        </div>

        {/* Tree content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 8px" }}>
          {treeLoading ? (
            <div style={{ ...centerStyle, minHeight: "100px" }}>
              <Loader2 size={18} className="spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : filteredTree.length === 0 ? (
            <div style={{ ...centerStyle, minHeight: "100px" }}>
              <AlertCircle size={16} style={{ color: "var(--text-muted)" }} />
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {search ? "No matches" : "No files"}
              </span>
            </div>
          ) : (
            filteredTree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                onFileClick={openFile}
                activePath={tabs[activeIdx]?.path ?? null}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Preview Area ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Tabs */}
        {tabs.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid var(--border-subtle)",
              flexShrink: 0,
              overflowX: "auto",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            {tabs.map((tab, i) => {
              const FormatIcon = FORMAT_ICONS[tab.format];
              return (
                <div
                  key={tab.path}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: i === activeIdx ? 600 : 400,
                    color: i === activeIdx ? "var(--brand-accent)" : "var(--text-secondary)",
                    borderBottom: i === activeIdx ? "2px solid var(--brand-accent)" : "2px solid transparent",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  <FormatIcon size={13} />
                  <span>{tab.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(i);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      display: "flex",
                      padding: "1px",
                      marginLeft: "4px",
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tabs.length === 0 ? (
            <div style={centerStyle}>
              <File size={32} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Select a file to preview
              </span>
            </div>
          ) : (
            <PreviewContent tab={tabs[activeIdx]} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
