import { useState, lazy, Suspense, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Terminal, GitBranch, ScrollText, MonitorPlay } from "lucide-react";

const TerminalModule = lazy(() =>
  import("./TerminalModule").then((m) => ({ default: m.TerminalModule })),
);
const GitLogModule = lazy(() =>
  import("./GitLogModule").then((m) => ({ default: m.GitLogModule })),
);
const AuditLogsModule = lazy(() =>
  import("./AuditLogsModule").then((m) => ({ default: m.AuditLogsModule })),
);
const PreviewPanel = lazy(() => import("./PreviewPanel"));

type Tab = "terminal" | "gitlog" | "audit" | "preview";

const TABS: { id: Tab; label: string; icon: typeof Terminal }[] = [
  { id: "terminal", label: "Terminal",   icon: Terminal     },
  { id: "gitlog",   label: "Git Log",    icon: GitBranch    },
  { id: "audit",    label: "Audit",      icon: ScrollText   },
  { id: "preview",  label: "Preview",    icon: MonitorPlay  },
];

export const DevToolsPage = () => {
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (urlTab && ["terminal","gitlog","audit","preview"].includes(urlTab))
      return urlTab;
    return "terminal";
  });

  // Sync if URL tab param changes (e.g. redirect from /preview)
  useEffect(() => {
    if (urlTab && ["terminal","gitlog","audit","preview"].includes(urlTab))
      setActiveTab(urlTab);
  }, [urlTab]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* ── Sub-tabs ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          background: "var(--bg-glass)",
          borderRadius: "var(--radius-md)",
          padding: "4px",
          border: "1px solid var(--border-subtle)",
          width: "fit-content",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 18px",
              borderRadius: "calc(var(--radius-md) - 2px)",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              transition: "all 0.2s",
              background:
                activeTab === tab.id ? "var(--brand-primary)" : "transparent",
              color: activeTab === tab.id ? "#fff" : "var(--text-secondary)",
              boxShadow:
                activeTab === tab.id
                  ? "0 2px 8px rgba(139,92,246,0.3)"
                  : "none",
            }}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <Suspense
        fallback={
          <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
            Chargement…
          </div>
        }
      >
        {activeTab === "terminal" && (
          <div
            className="glass-panel p-0"
            style={{ height: "calc(100vh - 220px)" }}
          >
            <TerminalModule />
          </div>
        )}
        {activeTab === "gitlog"   && <GitLogModule />}
        {activeTab === "audit"    && <AuditLogsModule />}
        {activeTab === "preview"  && <PreviewPanel />}
      </Suspense>
    </div>
  );
};
