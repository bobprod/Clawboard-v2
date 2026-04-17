import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  Hash,
  FileText,
  Plus,
  Minus,
  Search,
  Tag,
  Code2,
  Eye,
} from "lucide-react";

const BASE = "http://localhost:4000";

interface GitFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
}

interface GitCommitEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email?: string;
  date: string; // ISO
  branch?: string;
  tags?: string[];
  files?: GitFile[];
  diff?: string;
}

interface GitBranchEntry {
  name: string;
  current: boolean;
  lastCommit?: string;
}

const MOCK_BRANCHES: GitBranchEntry[] = [
  { name: "main", current: false, lastCommit: "2026-03-22" },
  {
    name: "claude/analyze-clawdbord-project-BWzCh",
    current: true,
    lastCommit: "2026-03-22",
  },
  { name: "feature/totp-mfa", current: false, lastCommit: "2026-03-20" },
  { name: "fix/approvals-sse", current: false, lastCommit: "2026-03-19" },
];

const MOCK_COMMITS: GitCommitEntry[] = [
  {
    hash: "a3f9e2d1b4c8e5f0",
    shortHash: "a3f9e2d",
    message: "feat: add TOTP MFA + QR pairing + GitLog viewer",
    author: "Claude Agent",
    email: "agent@nemoclaw.ai",
    date: new Date().toISOString(),
    branch: "claude/analyze-clawdbord-project-BWzCh",
    tags: ["v2.1.0"],
    files: [
      {
        path: "src/components/SecurityModule.tsx",
        status: "modified",
        additions: 180,
        deletions: 12,
      },
      {
        path: "src/components/TaskCreator.tsx",
        status: "modified",
        additions: 145,
        deletions: 4,
      },
      {
        path: "src/components/GitLogModule.tsx",
        status: "added",
        additions: 320,
        deletions: 0,
      },
      {
        path: "src/components/ApprovalsWidget.tsx",
        status: "modified",
        additions: 55,
        deletions: 20,
      },
    ],
  },
  {
    hash: "b1d8c3a2e7f6d4b9",
    shortHash: "b1d8c3a",
    message: "Initial commit — Clawboard frontend complet",
    author: "Nemoclaw Dev",
    email: "dev@nemoclaw.ai",
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    branch: "main",
    tags: ["v2.0.0"],
    files: [
      { path: "src/App.tsx", status: "added", additions: 260, deletions: 0 },
      {
        path: "src/components/Dashboard.tsx",
        status: "added",
        additions: 580,
        deletions: 0,
      },
      {
        path: "src/components/TachesPage.tsx",
        status: "added",
        additions: 720,
        deletions: 0,
      },
      {
        path: "src/components/TaskCreator.tsx",
        status: "added",
        additions: 660,
        deletions: 0,
      },
      {
        path: "src/components/AgentChat.tsx",
        status: "added",
        additions: 410,
        deletions: 0,
      },
      {
        path: "src/components/MemoryModule.tsx",
        status: "added",
        additions: 480,
        deletions: 0,
      },
      {
        path: "src/components/TerminalModule.tsx",
        status: "added",
        additions: 390,
        deletions: 0,
      },
    ],
  },
  {
    hash: "c4e1f9b3a8d2c5e7",
    shortHash: "c4e1f9b",
    message: "fix: graceful fallback for optional endpoints",
    author: "Nemoclaw Dev",
    email: "dev@nemoclaw.ai",
    date: new Date(Date.now() - 5 * 86400000).toISOString(),
    files: [
      {
        path: "src/components/ApprovalsWidget.tsx",
        status: "modified",
        additions: 28,
        deletions: 4,
      },
      {
        path: "src/components/GatewayProbes.tsx",
        status: "modified",
        additions: 15,
        deletions: 3,
      },
    ],
  },
  {
    hash: "d7b2a5c9f1e4b8d3",
    shortHash: "d7b2a5c",
    message: "style: add 6 themes — synthwave, nord, catppuccin, ocean",
    author: "Nemoclaw Dev",
    email: "dev@nemoclaw.ai",
    date: new Date(Date.now() - 8 * 86400000).toISOString(),
    files: [
      {
        path: "src/index.css",
        status: "modified",
        additions: 240,
        deletions: 15,
      },
      { path: "src/App.tsx", status: "modified", additions: 18, deletions: 6 },
    ],
  },
  {
    hash: "e9f3d6b1c2a4e8f5",
    shortHash: "e9f3d6b",
    message: "feat: terminal module with builtins and history",
    author: "Nemoclaw Dev",
    email: "dev@nemoclaw.ai",
    date: new Date(Date.now() - 12 * 86400000).toISOString(),
    files: [
      {
        path: "src/components/TerminalModule.tsx",
        status: "added",
        additions: 390,
        deletions: 0,
      },
    ],
  },
];

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

const STATUS_COLOR: Record<string, string> = {
  added: "#10b981",
  modified: "#f59e0b",
  deleted: "#ef4444",
  renamed: "#3b82f6",
};

const STATUS_LABEL: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
};

// ── Inline Diff Viewer ────────────────────────────────────────────────────────
function InlineDiffViewer({
  hash,
  filePath,
  onClose,
}: {
  hash: string;
  filePath?: string;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filePath ? `?file=${encodeURIComponent(filePath)}` : "";
    apiFetch(`${BASE}/api/git/diff/${hash}${params}`)
      .then((r) => r.json())
      .then((d) => setDiff(d.diff ?? ""))
      .catch(() => setDiff("(diff non disponible — mock mode)"))
      .finally(() => setLoading(false));
  }, [hash, filePath]);

  const lines = (diff ?? "").split("\n");

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border-subtle)",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          background: "rgba(0,0,0,0.15)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <Code2 size={13} />
          <span style={{ fontFamily: "var(--mono)" }}>
            {filePath || "Diff complet"}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          ✕ Fermer
        </button>
      </div>
      {/* Content */}
      <div
        style={{
          maxHeight: 400,
          overflowY: "auto",
          overflowX: "auto",
          fontFamily: "var(--mono)",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        {loading ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <RefreshCw
              size={16}
              style={{ animation: "spin 1s linear infinite", marginBottom: 6 }}
            />
            <div>Chargement du diff…</div>
          </div>
        ) : lines.length <= 1 && !lines[0] ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            Aucune modification
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {lines.map((line, i) => {
                const isAdd = line.startsWith("+") && !line.startsWith("+++");
                const isDel = line.startsWith("-") && !line.startsWith("---");
                const isHunk = line.startsWith("@@");
                const isHeader =
                  line.startsWith("diff ") ||
                  line.startsWith("index ") ||
                  line.startsWith("---") ||
                  line.startsWith("+++");
                const bg = isAdd
                  ? "rgba(16,185,129,0.08)"
                  : isDel
                    ? "rgba(239,68,68,0.08)"
                    : isHunk
                      ? "rgba(59,130,246,0.06)"
                      : "transparent";
                const color = isAdd
                  ? "#10b981"
                  : isDel
                    ? "#ef4444"
                    : isHunk
                      ? "#3b82f6"
                      : isHeader
                        ? "var(--text-muted)"
                        : "var(--text-secondary)";
                return (
                  <tr key={i} style={{ background: bg }}>
                    <td
                      style={{
                        width: 40,
                        textAlign: "right",
                        padding: "0 8px",
                        color: "var(--text-muted)",
                        fontSize: 10,
                        userSelect: "none",
                        borderRight: "1px solid var(--border-subtle)",
                        opacity: 0.5,
                      }}
                    >
                      {!isHeader && !isHunk ? i + 1 : ""}
                    </td>
                    <td
                      style={{
                        padding: "0 12px",
                        color,
                        whiteSpace: "pre",
                        fontWeight: isHunk ? 600 : 400,
                      }}
                    >
                      {line}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export const GitLogModule = () => {
  const [commits, setCommits] = useState<GitCommitEntry[]>([]);
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
  const [activeBranch, setActiveBranch] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [diffView, setDiffView] = useState<{
    hash: string;
    file?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  const fetchAll = useCallback(async (branch: string, lim: number) => {
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.all([
        apiFetch(`${BASE}/api/git/branches`).then((r) => r.json()),
        apiFetch(`${BASE}/api/git/log?branch=${branch}&limit=${lim}`).then(
          (r) => r.json(),
        ),
      ]);
      setBranches(Array.isArray(bRes) ? bRes : []);
      setCommits(Array.isArray(cRes) ? cRes : []);
    } catch {
      // Mock graceful fallback
      setBranches(MOCK_BRANCHES);
      setCommits(MOCK_COMMITS);
      if (!branch)
        setActiveBranch(MOCK_BRANCHES.find((b) => b.current)?.name ?? "main");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll("", 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBranchChange = (br: string) => {
    setActiveBranch(br);
    fetchAll(br, limit);
  };

  const filtered = commits.filter(
    (c) =>
      c.message.toLowerCase().includes(search.toLowerCase()) ||
      c.author.toLowerCase().includes(search.toLowerCase()) ||
      c.shortHash.toLowerCase().includes(search.toLowerCase()),
  );

  const totalAdditions = commits.reduce(
    (acc, c) =>
      acc + (c.files?.reduce((s, f) => s + (f.additions ?? 0), 0) ?? 0),
    0,
  );
  const totalDeletions = commits.reduce(
    (acc, c) =>
      acc + (c.files?.reduce((s, f) => s + (f.deletions ?? 0), 0) ?? 0),
    0,
  );

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
          <GitBranch size={28} />
        </div>
        <div>
          <h2
            style={{
              fontSize: "1.5rem",
              margin: 0,
              color: "var(--text-primary)",
            }}
          >
            Git Log
          </h2>
          <div className="text-muted" style={{ marginTop: 4, fontSize: 13 }}>
            {commits.length} commit{commits.length !== 1 ? "s" : ""} ·{" "}
            <span style={{ color: "#10b981" }}>+{totalAdditions}</span>{" "}
            <span style={{ color: "#ef4444" }}>−{totalDeletions}</span>
          </div>
        </div>
        <button
          onClick={() => fetchAll(activeBranch, limit)}
          disabled={loading}
          style={{
            marginLeft: "auto",
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
            style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
          />
          Actualiser
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Branch selector */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {branches.map((br) => (
            <button
              key={br.name}
              onClick={() => handleBranchChange(br.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 13px",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                background:
                  activeBranch === br.name || (!activeBranch && br.current)
                    ? "var(--brand-accent)"
                    : "var(--bg-glass)",
                color:
                  activeBranch === br.name || (!activeBranch && br.current)
                    ? "#fff"
                    : "var(--text-secondary)",
                border: `1px solid ${
                  activeBranch === br.name || (!activeBranch && br.current)
                    ? "var(--brand-accent)"
                    : "var(--border-subtle)"
                }`,
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <GitBranch size={11} />
              {br.name}
              {br.current && (
                <span style={{ fontSize: 9, opacity: 0.8 }}>●</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
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
            placeholder="Filtrer commits…"
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
      </div>

      {/* Commit list */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "var(--text-muted)",
          }}
        >
          <Loader
            size={28}
            style={{
              margin: "0 auto 12px",
              display: "block",
              animation: "spin 1s linear infinite",
            }}
          />
          Chargement du log Git…
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Aucun commit trouvé
            </div>
          ) : (
            filtered.map((commit, idx) => {
              const isOpen = expanded === commit.hash;
              return (
                <div
                  key={commit.hash}
                  style={{
                    borderBottom:
                      idx < filtered.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                  }}
                >
                  {/* Commit row */}
                  <div
                    onClick={() => setExpanded(isOpen ? null : commit.hash)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 14,
                      padding: "14px 18px",
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
                    {/* Graph dot */}
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "var(--brand-accent)",
                          boxShadow: "0 0 8px var(--brand-accent)",
                          marginTop: 4,
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            fontWeight: 600,
                            fontSize: 14,
                            color: "var(--text-primary)",
                            lineHeight: 1.4,
                          }}
                        >
                          {commit.message}
                        </span>
                        {commit.tags?.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                              fontSize: 10,
                              fontWeight: 700,
                              background: "rgba(245,158,11,0.12)",
                              border: "1px solid rgba(245,158,11,0.3)",
                              color: "#f59e0b",
                              borderRadius: 99,
                              padding: "2px 7px",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            <Tag size={8} /> {tag}
                          </span>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 14,
                          fontSize: 11.5,
                          color: "var(--text-muted)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Hash size={10} />
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              color: "var(--brand-accent)",
                            }}
                          >
                            {commit.shortHash}
                          </span>
                        </span>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <User size={10} /> {commit.author}
                        </span>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Clock size={10} /> {timeAgo(commit.date)}
                        </span>
                        {commit.files && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <FileText size={10} /> {commit.files.length} fichier
                            {commit.files.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {commit.files &&
                          (() => {
                            const add = commit.files.reduce(
                              (s, f) => s + (f.additions ?? 0),
                              0,
                            );
                            const del = commit.files.reduce(
                              (s, f) => s + (f.deletions ?? 0),
                              0,
                            );
                            return (
                              <>
                                {add > 0 && (
                                  <span style={{ color: "#10b981" }}>
                                    +{add}
                                  </span>
                                )}
                                {del > 0 && (
                                  <span style={{ color: "#ef4444" }}>
                                    −{del}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <div
                      style={{
                        flexShrink: 0,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </div>
                  </div>

                  {/* Expanded file list */}
                  {isOpen && commit.files && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border-subtle)",
                        background: "rgba(0,0,0,0.12)",
                        padding: "12px 18px 14px 42px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.4px",
                          marginBottom: 8,
                        }}
                      >
                        Fichiers modifiés
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        {commit.files.map((f) => (
                          <div
                            key={f.path}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 12.5,
                            }}
                          >
                            {/* Status badge */}
                            <span
                              style={{
                                flexShrink: 0,
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                background: `${STATUS_COLOR[f.status]}20`,
                                border: `1px solid ${STATUS_COLOR[f.status]}40`,
                                color: STATUS_COLOR[f.status],
                                fontSize: 9,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {STATUS_LABEL[f.status]}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                fontFamily: "var(--mono)",
                                color: "var(--text-secondary)",
                                fontSize: 12,
                              }}
                            >
                              {f.path}
                            </span>
                            {/* View diff button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDiffView((prev) =>
                                  prev?.hash === commit.hash &&
                                  prev?.file === f.path
                                    ? null
                                    : { hash: commit.hash, file: f.path },
                                );
                              }}
                              title="Voir le diff"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "2px 7px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                background:
                                  diffView?.hash === commit.hash &&
                                  diffView?.file === f.path
                                    ? "rgba(139,92,246,0.15)"
                                    : "rgba(255,255,255,0.04)",
                                border: "1px solid var(--border-subtle)",
                                color:
                                  diffView?.hash === commit.hash &&
                                  diffView?.file === f.path
                                    ? "var(--brand-accent)"
                                    : "var(--text-muted)",
                                cursor: "pointer",
                                transition: "all 0.15s",
                              }}
                            >
                              <Eye size={9} /> diff
                            </button>
                            {/* Additions/deletions mini bar */}
                            {(f.additions !== undefined ||
                              f.deletions !== undefined) && (
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  flexShrink: 0,
                                }}
                              >
                                {f.additions !== undefined &&
                                  f.additions > 0 && (
                                    <span
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        color: "#10b981",
                                      }}
                                    >
                                      <Plus size={9} />
                                      {f.additions}
                                    </span>
                                  )}
                                {f.deletions !== undefined &&
                                  f.deletions > 0 && (
                                    <span
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        color: "#ef4444",
                                      }}
                                    >
                                      <Minus size={9} />
                                      {f.deletions}
                                    </span>
                                  )}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Full hash */}
                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          color: "var(--text-muted)",
                        }}
                      >
                        <GitCommit size={11} />
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {commit.hash}
                        </span>
                        {commit.email && (
                          <span style={{ marginLeft: 8 }}>
                            &lt;{commit.email}&gt;
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDiffView((prev) =>
                              prev?.hash === commit.hash && !prev?.file
                                ? null
                                : { hash: commit.hash },
                            );
                          }}
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 12px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              diffView?.hash === commit.hash && !diffView?.file
                                ? "rgba(139,92,246,0.15)"
                                : "rgba(255,255,255,0.04)",
                            border: "1px solid var(--border-subtle)",
                            color:
                              diffView?.hash === commit.hash && !diffView?.file
                                ? "var(--brand-accent)"
                                : "var(--text-muted)",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          <Code2 size={11} /> Diff complet
                        </button>
                      </div>

                      {/* Inline diff viewer */}
                      {diffView?.hash === commit.hash && (
                        <InlineDiffViewer
                          hash={commit.hash}
                          filePath={diffView.file}
                          onClose={() => setDiffView(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Load more */}
      {!loading && filtered.length >= limit && (
        <button
          onClick={() => {
            setLimit((l) => l + 50);
            fetchAll(activeBranch, limit + 50);
          }}
          style={{
            alignSelf: "center",
            padding: "8px 22px",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 9,
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Charger plus de commits
        </button>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

// Minimal loader icon fallback
function Loader({
  size,
  style,
}: {
  size: number;
  style?: React.CSSProperties;
}) {
  return <RefreshCw size={size} style={style} />;
}
