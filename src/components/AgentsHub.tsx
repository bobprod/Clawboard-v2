import { lazy, Suspense, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  List,
  Network,
  Layers,
  Download,
  Users,
  Store,
  Loader2,
} from "lucide-react";

// Heavy modules — lazy-loaded per tab
const AgentsOverview = lazy(() =>
  import("./AgentsOverview").then((m) => ({ default: m.AgentsOverview })),
);
const AgentsHierarchyModule = lazy(() =>
  import("./AgentsHierarchyModule").then((m) => ({
    default: m.AgentsHierarchyModule,
  })),
);
const CoworkModule = lazy(() =>
  import("./CoworkModule").then((m) => ({ default: m.CoworkModule })),
);
const AcpManager = lazy(() =>
  import("./AcpManager").then((m) => ({ default: m.AcpManager })),
);
const TeamMode = lazy(() =>
  import("./TeamMode").then((m) => ({ default: m.TeamMode })),
);
const AgentStore = lazy(() =>
  import("./AgentStore").then((m) => ({ default: m.AgentStore })),
);

// ─── Tab definitions ──────────────────────────────────────────────────────────

// Fusion A3 : l'onglet « map » est fusionné dans « overview » (vue Graphe).
// L'id « map » reste accepté en entrée pour la compatibilité des liens
// existants (?tab=map → onglet Agents, vue Graphe active).
type TabId = "overview" | "cowork" | "installer" | "team" | "store";
type OverviewView = "list" | "graph";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof LayoutGrid;
  desc: string;
}

const TABS: TabDef[] = [
  {
    id: "overview",
    label: "Agents",
    icon: LayoutGrid,
    desc: "Tous vos agents IA — vue Liste ou Graphe d'orchestration",
  },
  {
    id: "cowork",
    label: "Cowork",
    icon: Layers,
    desc: "Sessions de travail autonomes",
  },
  {
    id: "installer",
    label: "Installateur",
    icon: Download,
    desc: "Gérer et connecter des agents CLI",
  },
  {
    id: "team",
    label: "Team Mode",
    icon: Users,
    desc: "Équipes multi-agents et rôles",
  },
  {
    id: "store",
    label: "Store",
    icon: Store,
    desc: "Catalogue d'assistants IA",
  },
];

// ─── Vue de l'onglet fusionné « Agents » (Liste ↔ Graphe) ─────────────────────

const VIEW_OPTIONS: {
  id: OverviewView;
  label: string;
  icon: typeof LayoutGrid;
  desc: string;
}[] = [
  { id: "list",  label: "Liste",  icon: List,    desc: "Cartes d'agents — orchestrateur, agents internes et CLI" },
  { id: "graph", label: "Graphe", icon: Network, desc: "Graphe d'orchestration NemoClaw (expérimental)" },
];

// ─── Spinner fallback ─────────────────────────────────────────────────────────

const TabFallback = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "12px",
      padding: "64px",
      color: "var(--text-muted)",
      fontSize: "14px",
    }}
  >
    <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
    Chargement…
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const AgentsHub = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const rawTab = params.get("tab");
  const rawView = params.get("view");
  // Compatibilité URL : l'ancien ?tab=map ouvre l'onglet fusionné
  // avec la vue Graphe active.
  const isLegacyMap = rawTab === "map";

  const activeTab: TabId =
    rawTab && TABS.some((t) => t.id === rawTab)
      ? (rawTab as TabId)
      : "overview";

  // Vue courante de l'onglet fusionné « overview » (Liste ↔ Graphe).
  const [view, setView] = useState<OverviewView>(() =>
    isLegacyMap || rawView === "graph" ? "graph" : "list",
  );

  // Un lien entrant (?tab=map, ?view=graph/list) pilote la vue active ;
  // changer d'onglet sans paramètre de vue conserve la vue choisie.
  useEffect(() => {
    if (isLegacyMap || rawView === "graph") setView("graph");
    else if (rawView === "list") setView("list");
  }, [isLegacyMap, rawView]);

  const setTab = (id: TabId) =>
    navigate(
      id === "overview"
        ? `/agents?tab=overview&view=${view}`
        : `/agents?tab=${id}`,
      { replace: true },
    );

  const setViewParam = (v: OverviewView) =>
    navigate(`/agents?tab=overview&view=${v}`, { replace: true });

  const activeTabDef = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "3px",
          background: "var(--bg-glass)",
          borderRadius: "var(--radius-md)",
          padding: "4px",
          border: "1px solid var(--border-subtle)",
          width: "fit-content",
          marginBottom: "6px",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              title={tab.desc}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 16px",
                borderRadius: "calc(var(--radius-md) - 2px)",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: isActive ? 700 : 500,
                transition: "all 0.2s",
                background: isActive
                  ? "rgba(139,92,246,0.18)"
                  : "transparent",
                color: isActive
                  ? "var(--brand-accent)"
                  : "var(--text-secondary)",
                boxShadow: isActive
                  ? "0 2px 8px rgba(139,92,246,0.15)"
                  : "none",
              }}
            >
              <tab.icon size={14} style={{ opacity: isActive ? 1 : 0.65 }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Active tab description ──────────────────────────────────────── */}
      <p
        style={{
          margin: "0 0 20px 4px",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}
      >
        {activeTabDef.desc}
      </p>

      {/* ── Segmented toggle : Liste ↔ Graphe (onglet « Agents » fusionné) ── */}
      {activeTab === "overview" && (
        <div
          style={{
            display: "flex",
            gap: "3px",
            background: "var(--bg-glass)",
            borderRadius: "var(--radius-md)",
            padding: "4px",
            border: "1px solid var(--border-subtle)",
            width: "fit-content",
            marginBottom: "14px",
            flexShrink: 0,
          }}
        >
          {VIEW_OPTIONS.map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setViewParam(v.id)}
                title={v.desc}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "6px 14px",
                  borderRadius: "calc(var(--radius-md) - 2px)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12.5px",
                  fontWeight: isActive ? 700 : 500,
                  transition: "all 0.2s",
                  background: isActive
                    ? "rgba(139,92,246,0.18)"
                    : "transparent",
                  color: isActive
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                  boxShadow: isActive
                    ? "0 2px 8px rgba(139,92,246,0.15)"
                    : "none",
                }}
              >
                <v.icon size={13} style={{ opacity: isActive ? 1 : 0.65 }} />
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Suspense fallback={<TabFallback />}>
          {activeTab === "overview"   && (view === "graph" ? <AgentsHierarchyModule /> : <AgentsOverview />)}
          {activeTab === "cowork"     && <CoworkModule />}
          {activeTab === "installer"  && <AcpManager />}
          {activeTab === "team"       && <TeamMode />}
          {activeTab === "store"      && <AgentStore />}
        </Suspense>
      </div>
    </div>
  );
};
