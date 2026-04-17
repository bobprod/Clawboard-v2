import { useState, lazy, Suspense } from "react";
import { Plug, ToyBrick, Wrench } from "lucide-react";

const ConnectorsModule = lazy(() =>
  import("./ConnectorsModule").then((m) => ({ default: m.ConnectorsModule })),
);
const SkillsModule = lazy(() =>
  import("./SkillsModule").then((m) => ({ default: m.SkillsModule })),
);
const ToolsModule = lazy(() =>
  import("./ToolsModule").then((m) => ({ default: m.ToolsModule })),
);

type Tab = "connectors" | "skills" | "tools";

const TABS: { id: Tab; label: string; icon: typeof Plug }[] = [
  { id: "connectors", label: "Connecteurs", icon: Plug },
  { id: "skills", label: "Skills", icon: ToyBrick },
  { id: "tools", label: "Outils Agent", icon: Wrench },
];

export const IntegrationsPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>("connectors");

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
        {activeTab === "connectors" && <ConnectorsModule />}
        {activeTab === "skills" && <SkillsModule />}
        {activeTab === "tools" && <ToolsModule />}
      </Suspense>
    </div>
  );
};
