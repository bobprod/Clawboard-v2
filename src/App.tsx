import React, {
  useState,
  useEffect,
  useRef,
  Suspense,
  lazy,
  Component,
} from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Dropdown } from "./components/Dropdown";
import { TourGuide, resetTour } from "./components/TourGuide";
import { LoginPage } from "./components/LoginPage";
import { ToastProvider } from "./components/ToastProvider";

interface ClawUser {
  username: string;
  displayName: string;
  role: string;
  avatar: string | null;
  demo?: boolean;
}

function readUser(): ClawUser | null {
  try {
    const raw = localStorage.getItem("clawboard-user");
    return raw ? (JSON.parse(raw) as ClawUser) : null;
  } catch {
    return null;
  }
}

// Route-level code splitting — loaded on demand
const Dashboard = lazy(() =>
  import("./components/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const TaskCreator = lazy(() =>
  import("./components/TaskCreator").then((m) => ({ default: m.TaskCreator })),
);
const TachesPage = lazy(() =>
  import("./components/TachesPage").then((m) => ({ default: m.TachesPage })),
);
const SecurityModule = lazy(() =>
  import("./components/SecurityModule").then((m) => ({
    default: m.SecurityModule,
  })),
);
const CollaborationModule = lazy(() =>
  import("./components/CollaborationModule").then((m) => ({
    default: m.CollaborationModule,
  })),
);
const AgentsHierarchyModule = lazy(() =>
  import("./components/AgentsHierarchyModule").then((m) => ({
    default: m.AgentsHierarchyModule,
  })),
);
const MemoryModule = lazy(() =>
  import("./components/MemoryModule").then((m) => ({
    default: m.MemoryModule,
  })),
);
const SettingsModule = lazy(() =>
  import("./components/SettingsModule").then((m) => ({
    default: m.SettingsModule,
  })),
);
const SchedulerModule = lazy(() =>
  import("./components/SchedulerModule").then((m) => ({
    default: m.SchedulerModule,
  })),
);
const ChatModule = lazy(() =>
  import("./components/ChatModule").then((m) => ({ default: m.ChatModule })),
);
const DevToolsPage = lazy(() =>
  import("./components/DevToolsPage").then((m) => ({
    default: m.DevToolsPage,
  })),
);
const IntegrationsPage = lazy(() =>
  import("./components/IntegrationsPage").then((m) => ({
    default: m.IntegrationsPage,
  })),
);
const WorkspaceExplorer = lazy(() =>
  import("./components/WorkspaceExplorer").then((m) => ({
    default: m.WorkspaceExplorer,
  })),
);
const BrowserControl = lazy(() =>
  import("./components/BrowserControl").then((m) => ({
    default: m.BrowserControl,
  })),
);
const CoworkModule = lazy(() =>
  import("./components/CoworkModule").then((m) => ({
    default: m.CoworkModule,
  })),
);
import { AgentChat } from "./components/AgentChat";
import { useSSE } from "./hooks/useSSE";
import {
  TerminalSquare,
  LayoutDashboard,
  ShieldCheck,
  Globe,
  Network,
  BrainCircuit,
  Settings,
  User,
  LogOut,
  Palette,
  CalendarClock,
  MessageSquare,
  MapIcon,
  Terminal,
  Menu,
  Plug,
  HardDrive,
  Layers,
} from "lucide-react";
import "./index.css";
import { GlobalChatProvider } from "./hooks/useGlobalChat";

const THEMES = [
  { id: "dark", label: "Dark", color: "#09090b", accent: "#8b5cf6" },
  { id: "light", label: "Light", color: "#f1f5f9", accent: "#7c3aed" },
  { id: "synthwave", label: "Synthwave", color: "#0d0117", accent: "#ff2d78" },
  { id: "nord", label: "Nord", color: "#2e3440", accent: "#88c0d0" },
  {
    id: "catppuccin",
    label: "Catppuccin",
    color: "#1e1e2e",
    accent: "#cba6f7",
  },
  { id: "ocean", label: "Deep Ocean", color: "#0a1628", accent: "#38bdf8" },
];

const useTheme = () => {
  const [theme, setThemeState] = useState<string>(
    () => localStorage.getItem("clawboard-theme") || "dark",
  );

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("clawboard-theme", theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
};

const ThemeSwitcher = ({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (t: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Changer de thème"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-full)",
          padding: "7px 14px",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
          fontWeight: 500,
          transition: "all 0.2s",
        }}
        onMouseOver={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
        }
        onMouseOut={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.05)")
        }
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: current.accent,
            display: "inline-block",
            boxShadow: `0 0 8px ${current.accent}88`,
          }}
        />
        <Palette size={14} />
        <span>{current.label}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "6px",
            zIndex: 100,
            boxShadow: "var(--shadow-md)",
            minWidth: "160px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "var(--radius-sm)",
                background:
                  theme === t.id ? "rgba(139,92,246,0.1)" : "transparent",
                border:
                  theme === t.id
                    ? "1px solid rgba(139,92,246,0.2)"
                    : "1px solid transparent",
                cursor: "pointer",
                color:
                  theme === t.id
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 500,
                textAlign: "left",
                width: "100%",
                transition: "all 0.15s",
              }}
              onMouseOver={(e) => {
                if (theme !== t.id)
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseOut={(e) => {
                if (theme !== t.id)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: t.accent,
                  boxShadow: `0 0 6px ${t.accent}66`,
                  flexShrink: 0,
                }}
              />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Route-level Error Boundary ─────────────────────────────────────
class RouteErrorBoundary extends Component<
  { children: React.ReactNode; fallbackLabel?: string },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RouteErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            minHeight: "300px",
          }}
        >
          <div style={{ fontSize: "48px" }}>⚠️</div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--status-error)",
            }}
          >
            Erreur dans {this.props.fallbackLabel || "ce module"}
          </div>
          <pre
            style={{
              background: "rgba(239,68,68,0.06)",
              padding: "16px 24px",
              borderRadius: "12px",
              border: "1px solid rgba(239,68,68,0.2)",
              maxWidth: "600px",
              overflowX: "auto",
              fontSize: "12px",
              color: "#fca5a5",
              fontFamily: "var(--mono)",
              lineHeight: 1.6,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-full)",
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#3b82f6",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EB = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => <RouteErrorBoundary fallbackLabel={label}>{children}</RouteErrorBoundary>;

const PageContent = () => {
  const location = useLocation();
  const isChat = location.pathname === "/chat";
  return (
    <div className={`page-content${isChat ? " chat-page" : ""}`}>
      <Suspense
        fallback={
          <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
            Chargement…
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <EB label="Dashboard">
                <Dashboard />
              </EB>
            }
          />
          <Route
            path="/tasks"
            element={
              <EB label="Tâches">
                <TachesPage />
              </EB>
            }
          />
          <Route
            path="/tasks/new"
            element={
              <EB label="Création de tâche">
                <TaskCreator />
              </EB>
            }
          />
          <Route
            path="/tasks/:taskId"
            element={
              <EB label="Tâches">
                <TachesPage />
              </EB>
            }
          />
          <Route
            path="/chat"
            element={
              <EB label="Chat">
                <ChatModule />
              </EB>
            }
          />
          <Route
            path="/scheduler"
            element={
              <EB label="Planificateur">
                <SchedulerModule />
              </EB>
            }
          />
          <Route
            path="/security"
            element={
              <EB label="Sécurité">
                <SecurityModule />
              </EB>
            }
          />
          <Route
            path="/collaborations"
            element={
              <EB label="Collaborations">
                <CollaborationModule />
              </EB>
            }
          />
          <Route
            path="/agents"
            element={
              <EB label="Agents">
                <AgentsHierarchyModule />
              </EB>
            }
          />
          <Route
            path="/memory"
            element={
              <EB label="Mémoire">
                <MemoryModule />
              </EB>
            }
          />
          <Route
            path="/devtools"
            element={
              <EB label="Outils & Logs">
                <DevToolsPage />
              </EB>
            }
          />
          <Route
            path="/integrations"
            element={
              <EB label="Connecteurs & Skills">
                <IntegrationsPage />
              </EB>
            }
          />
          <Route
            path="/workspace"
            element={
              <EB label="Espace de travail">
                <WorkspaceExplorer />
              </EB>
            }
          />
          <Route
            path="/browser"
            element={
              <EB label="Navigateur">
                <BrowserControl />
              </EB>
            }
          />
          <Route
            path="/cowork"
            element={
              <EB label="Cowork Agent">
                <CoworkModule />
              </EB>
            }
          />
          <Route
            path="/settings"
            element={
              <EB label="Paramètres">
                <SettingsModule />
              </EB>
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
};

const NavLink = ({
  to,
  icon: Icon,
  children,
  tourId,
}: {
  to: string;
  icon: any;
  children: React.ReactNode;
  tourId?: string;
}) => {
  const location = useLocation();
  const isActive =
    location.pathname === to ||
    (to !== "/" && location.pathname.startsWith(to));
  return (
    <li>
      <Link
        to={to}
        className={`nav-link ${isActive ? "active" : ""}`}
        {...(tourId ? { "data-tour": tourId } : {})}
      >
        <Icon size={20} />
        <span>{children}</span>
      </Link>
    </li>
  );
};

const Sidebar = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const location = useLocation();
  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose();
  }, [location.pathname]);

  return (
    <>
      <div
        className={`sidebar-backdrop${isOpen ? " visible" : ""}`}
        onClick={onClose}
      />
      <nav className={`sidebar${isOpen ? " open" : ""}`}>
        <div className="sidebar-header">
          <BrainCircuit className="brand-icon" size={28} />
          <h2>ClawBoard</h2>
        </div>
        <ul className="nav-links">
          <NavLink to="/" icon={LayoutDashboard} tourId="nav-dashboard">
            Tableau de bord
          </NavLink>
          <NavLink to="/tasks" icon={TerminalSquare} tourId="nav-tasks">
            Tâches
          </NavLink>
          <NavLink to="/scheduler" icon={CalendarClock} tourId="nav-scheduler">
            Planificateur
          </NavLink>
          <NavLink to="/security" icon={ShieldCheck} tourId="nav-security">
            Sécurité & Scan
          </NavLink>
          <NavLink
            to="/collaborations"
            icon={Globe}
            tourId="nav-collaborations"
          >
            Collaborations
          </NavLink>
          <NavLink to="/agents" icon={Network} tourId="nav-agents">
            Agents Hierarchy
          </NavLink>
          <NavLink to="/memory" icon={BrainCircuit} tourId="nav-memory">
            Mémoire (QMD)
          </NavLink>
          <NavLink to="/devtools" icon={Terminal}>
            Outils & Logs
          </NavLink>
          <NavLink to="/integrations" icon={Plug} tourId="nav-integrations">
            Connecteurs & Skills
          </NavLink>
          <NavLink to="/cowork" icon={Layers} tourId="nav-cowork">
            Cowork Agent
          </NavLink>
        </ul>
        <div className="sidebar-footer">
          <NavLink to="/settings" icon={Settings} tourId="nav-settings">
            Paramètres
          </NavLink>
        </div>
      </nav>
    </>
  );
};

const LiveCost = () => {
  const { data } = useSSE<{ totalCost24h: number } | null>("/api/quota", null);
  const cost = Number(data?.totalCost24h ?? 2.64);
  return (
    <div className="api-cost-widget">
      <span className="text-muted">Coût API (24h) :</span>
      <span className="cost-value" style={{ transition: "color 0.5s" }}>
        ${cost.toFixed(2)}
      </span>
    </div>
  );
};

// ── Page-aware context for the floating assistant ──────────────────
const PAGE_CONTEXTS: Record<string, string> = {
  "/": `Tu es sur le Tableau de bord (Dashboard) de ClawBoard.
Ce module affiche : les KPI temps réel (tâches actives, complétées, CRONs, échecs 24h), les vitaux système (CPU, RAM, uptime), les jauges LLM Fuel (consommation par modèle IA — Claude, GPT, Kimi, Qwen local), le heatmap d'activité des 30 derniers jours, la ventilation des coûts par modèle (7j/30j/all), les alertes intelligentes (seuils configurables dans localStorage clawboard-alerts-settings), les approbations en attente (risque élevé/moyen/faible), les probes de santé des providers (latence, auto-refresh 60s), et le gateway presence.
Tu peux aider à interpréter les métriques, expliquer les tendances de coûts, conseiller sur les seuils d'alertes, et suggérer des optimisations de consommation des modèles IA.`,

  "/tasks": `Tu es sur la page Tâches de ClawBoard.
Ce module gère le cycle de vie complet des tâches IA : onglet Tâches (liste avec statuts RUNNING/TERMINÉ/FAILED/QUEUED, clone, rejouer les FAILED), onglet Modèles (templates réutilisables avec badges last-exec ✓/✕), onglet Récurrences (CRONs avec badge ÉCHEC), onglet Pré-instructions (instructions système injectées avant chaque tâche), onglet Archives (search + filtres status + export CSV).
Chaque tâche a : un prompt, un modèle LLM, une destination, des skills optionnels, un timeout, des tokens consommés et un coût.
Tu peux aider à créer des prompts efficaces, diagnostiquer les tâches échouées, optimiser les récurrences, et expliquer les coûts par tâche.`,

  "/tasks/new": `Tu es sur la page de Création de tâche de ClawBoard.
Ce formulaire permet de créer une nouvelle tâche IA avec : prompt (compteur mots/chars), modèle LLM (Claude, GPT, Kimi, Qwen…), destination de sortie, skills (via SkillsPicker), timeout suggéré, option save-as-model.
Il supporte l'auto-save draft (localStorage clawboard-task-creator-draft), le clone/replay depuis une tâche existante (prefill via navigation state), et la ValidationBanner (erreurs: no-model, warnings: no-dest, short-prompt).
Tu peux aider à rédiger des prompts optimaux, choisir le bon modèle selon la tâche, et configurer les paramètres avancés.`,

  "/chat": `Tu es sur la page Chat avec Lia de ClawBoard.
Ce module est un chat complet avec l'IA en streaming SSE. Il supporte : multi-agents (main, assistant, research, coder), sélection de modèle, modes de conversation, pré-instructions personnalisées, historique des messages, tool calls avec affichage des appels d'outils.
Tu peux aider à formuler des requêtes complexes, expliquer les tool calls, et choisir le bon agent/mode pour chaque besoin.`,

  "/scheduler": `Tu es sur le Planificateur de ClawBoard.
Ce module gère le scheduling intelligent inspiré de l'OS scheduling (CS162) avec 6 modes : Toujours (exécution à chaque intervalle), Si inactif (seulement quand aucune tâche ne tourne), Si non exécuté (garantit une fraîcheur minimale), Debounce (ignore si exécuté récemment), Anti-conflit (évite la contention avec d'autres tâches), File prioritaire (préempte les tâches moins critiques).
Il inclut aussi un éditeur de Pipeline visuel avec des nodes : trigger, llm, tool, condition, output.
Tu peux aider à configurer les CRONs, choisir le bon mode de scheduling, et construire des pipelines d'automatisation.`,

  "/security": `Tu es sur la page Sécurité & Scan de ClawBoard.
Ce module gère : l'audit de sécurité, le scan de vulnérabilités, les API keys (création/révocation/rotation), les permissions et rôles, les politiques d'accès, et le monitoring de sécurité.
Tu peux aider à configurer les règles de sécurité, interpréter les résultats de scan, et recommander les bonnes pratiques de sécurité pour l'orchestrateur IA.`,

  "/collaborations": `Tu es sur la page Collaborations de ClawBoard.
Ce module gère le travail collaboratif : partage de tâches entre utilisateurs, espaces de travail partagés, permissions par projet, activité des collaborateurs, et notifications d'équipe.
Tu peux aider à organiser le workflow collaboratif et configurer les permissions.`,

  "/agents": `Tu es sur la page Agents Hierarchy de ClawBoard.
Ce module affiche et gère la hiérarchie des agents IA : agent principal (orchestrateur), sous-agents spécialisés (research, coder, assistant), leurs statuts, capacités, et relations parent-enfant. Il permet de visualiser l'arborescence complète, configurer les agents, et ouvrir un chat contextuel avec chaque agent.
Tu peux aider à comprendre les rôles des agents, configurer leurs capacités, et optimiser la hiérarchie pour de meilleurs résultats.`,

  "/memory": `Tu es sur la page Mémoire (QMD) de ClawBoard.
Ce module gère les fichiers de mémoire de l'agent IA : accès rapide à MEMORY.md, HEARTBEAT.md, CLAUDE.md, NOTES.md. Il offre des modes Edit, Split et Preview, un filtre par type de fichier, un rendu Markdown inline, et un indicateur de synchronisation.
Endpoints : GET /api/memory, PATCH /api/memory/:id.
Tu peux aider à organiser les notes de mémoire, structurer les fichiers markdown, et expliquer le système de mémoire persistante.`,

  "/devtools": `Tu es sur la page Outils & Logs de ClawBoard.
Cette page regroupe 3 sous-modules :\n- Terminal : terminal interactif avec historique ↑↓, Ctrl+L clear, Ctrl+C annuler, builtins (help, clear, version, status, tasks, run <id>, logs <id>)\n- Git Log : visualiseur de l'historique Git avec les commits, branches, et diffs\n- Audit : journal d'audit complet avec traçabilité des actions (CREATE, RUN, UPDATE, DELETE, APPROVE, LOGIN), filtres par type et recherche, export CSV, pagination\nTu peux aider à interpréter les logs, exécuter des commandes, naviguer l'historique Git, et analyser les événements d'audit.`,

  "/integrations": `Tu es sur la page Connecteurs & Skills de ClawBoard.\n- Connecteurs : gestion des serveurs MCP (Model Context Protocol) avec 27 serveurs pré-configurés en 8 catégories (Cloud & DevOps, Données & Search, Productivité, Communication, Design & Media, Dev Tools, Monitoring, Custom). Supporte 3 transports (stdio, SSE, streamable-http), découverte d'outils/ressources, formulaire de serveur custom.\n- Skills : bibliothèque de compétences IA (blog-writer, code-fix, code-gen, competitor-watch, data-analysis, etc.) avec filtres par catégorie (local/github/npm) et cartes avec status/tags.\nTu peux aider à configurer les connecteurs MCP, résoudre les problèmes de connexion, et choisir les bons skills pour chaque tâche.`,

  "/workspace": `Tu es sur la page Espace de travail de ClawBoard.
Ce module est un explorateur de fichiers pour les sorties des agents et tâches IA. Il affiche l'arborescence du workspace (~/.openclaw/workspace/) avec les dossiers : agents/, tasks/, reports/, uploads/. Il supporte le drag-and-drop pour l'upload de documents, la prévisualisation de fichiers, et 4 cibles d'upload (global, lia, task, agent).
Tu peux aider à naviguer les fichiers de sortie, organiser le workspace, et expliquer les résultats des agents.`,

  "/browser": `Tu es sur la page Navigateur de ClawBoard.
Ce module permet de contrôler un navigateur Chrome via MCP Playwright. Il offre : barre d'URL, presets de viewport (Desktop 1920×1080, Tablet 768×1024, Mobile 375×812), 6 types d'actions (navigate, click, type, screenshot, evaluate, scroll), console log, et historique des actions.
Tu peux aider à automatiser la navigation web, extraire des données de pages, et déboguer les interactions navigateur.`,

  "/cowork": `Tu es sur la page Cowork Agent de ClawBoard.
Ce module implémente un agent IA Cowork inspiré de Claude Cowork (Anthropic) et des alternatives open-source (OpenWork, Eigent, Kuse).
Fonctionnalités : sessions longues multi-étapes, accès fichiers dans un workspace isolé, planification de tâches, coordination de sous-agents (researcher, coder, reviewer, writer, analyst), Computer Use (capture d'écran, souris, clavier, scroll), human-in-the-loop (approbation/rejet pour actions risquées), 3 modes (Autonome, Supervisé, Manuel), SSE temps réel pour la progression.
Tu peux aider à créer des sessions Cowork, choisir le bon mode (autonome vs supervisé), configurer Computer Use, interpréter les plans de travail, et comprendre les résultats des sous-agents.`,

  "/settings": `Tu es sur la page Paramètres de ClawBoard.
Ce module gère la configuration globale : profil utilisateur, thème & apparence (6 thèmes : Dark, Light, Synthwave, Nord, Catppuccin, Deep Ocean), clés API, préférences de notification, et configuration avancée de l'orchestrateur.
Tu peux aider à configurer l'application, gérer les clés API, et personnaliser l'expérience utilisateur.`,
};

function getPageContext(pathname: string): string {
  if (PAGE_CONTEXTS[pathname]) return PAGE_CONTEXTS[pathname];
  // Match prefix routes like /tasks/:id
  for (const [route, ctx] of Object.entries(PAGE_CONTEXTS)) {
    if (route !== "/" && pathname.startsWith(route)) return ctx;
  }
  return "Tu es l'assistant IA de ClawBoard, un orchestrateur d'agents IA (NemoClaw). Aide l'utilisateur avec ses questions sur le module actuel.";
}

const AppShell = ({
  theme,
  setTheme,
  onLogout,
}: {
  theme: string;
  setTheme: (t: string) => void;
  onLogout: () => void;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tourRun, setTourRun] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = readUser();
  const displayName = user?.displayName ?? "Admin";
  const avatarSeed = encodeURIComponent(user?.username ?? "Admin");
  const avatarSrc =
    user?.avatar ??
    `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=8b5cf6`;

  const handleLogout = () => {
    localStorage.removeItem("clawboard-token");
    localStorage.removeItem("clawboard-user");
    onLogout();
  };

  const handleRestartTour = () => {
    resetTour();
    setTourRun(true);
  };

  return (
    <div className="app-container">
      <TourGuide
        run={tourRun || undefined}
        onFinish={() => setTourRun(false)}
      />
      {/* Mobile hamburger */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
      >
        <Menu size={22} />
      </button>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <header className="topbar glass-panel">
          <h1>Bienvenue sur ClawBoard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* ── Quick-access buttons ─────────────────────────── */}
            {[
              {
                to: "/chat",
                icon: MessageSquare,
                label: "Chat Lia",
                color: "#8b5cf6",
              },
              {
                to: "/workspace",
                icon: HardDrive,
                label: "Workspace",
                color: "#3b82f6",
              },
              {
                to: "/browser",
                icon: Globe,
                label: "Navigateur",
                color: "#10b981",
              },
              {
                to: "/cowork",
                icon: Layers,
                label: "Cowork",
                color: "#f59e0b",
              },
            ].map((btn) => (
              <button
                key={btn.to}
                onClick={() => navigate(btn.to)}
                title={btn.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "var(--radius-full)",
                  background:
                    location.pathname === btn.to
                      ? `${btn.color}20`
                      : "rgba(255,255,255,0.05)",
                  border: `1px solid ${location.pathname === btn.to ? `${btn.color}40` : "var(--border-subtle)"}`,
                  color:
                    location.pathname === btn.to
                      ? btn.color
                      : "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                <btn.icon size={14} />
                <span className="topbar-btn-label">{btn.label}</span>
              </button>
            ))}
            <div
              style={{
                width: "1px",
                height: "24px",
                background: "var(--border-subtle)",
              }}
            />
            <LiveCost />
            {user?.demo && (
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: "999px",
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  color: "#f59e0b",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                Démo
              </div>
            )}
            <ThemeSwitcher theme={theme} setTheme={setTheme} />

            <Dropdown
              trigger={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(255,255,255,0.05)",
                    padding: "6px 16px 6px 6px",
                    borderRadius: "999px",
                    border: "1px solid var(--border-subtle)",
                    transition: "background 0.2s",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.05)")
                  }
                >
                  <img
                    src={avatarSrc}
                    alt="Profile"
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "50%",
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    {displayName}
                  </span>
                </div>
              }
              items={[
                {
                  icon: User,
                  label: "Mon Profil",
                  onClick: () => navigate("/settings?tab=profile"),
                },
                {
                  icon: Palette,
                  label: "Thème & Apparence",
                  onClick: () => navigate("/settings?tab=theme"),
                },
                {
                  icon: MapIcon,
                  label: "Revoir le tour",
                  onClick: handleRestartTour,
                },
                {
                  icon: Settings,
                  label: "Paramètres",
                  onClick: () => navigate("/settings"),
                },
                {
                  icon: LogOut,
                  label: "Se déconnecter",
                  danger: true,
                  onClick: handleLogout,
                },
              ]}
            />
          </div>
        </header>

        <PageContent />
      </main>
      <AgentChat pageContext={getPageContext(location.pathname)} />
    </div>
  );
};

const App = () => {
  const { theme, setTheme } = useTheme();
  const [authenticated, setAuthenticated] = useState<boolean>(() =>
    Boolean(localStorage.getItem("clawboard-token")),
  );

  if (!authenticated) {
    return (
      <Router>
        <LoginPage onLogin={() => setAuthenticated(true)} />
      </Router>
    );
  }

  return (
    <Router>
      <ToastProvider>
        <GlobalChatProvider>
          <AppShell
            theme={theme}
            setTheme={setTheme}
            onLogout={() => setAuthenticated(false)}
          />
        </GlobalChatProvider>
      </ToastProvider>
    </Router>
  );
};

export default App;
