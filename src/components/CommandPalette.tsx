import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  TerminalSquare,
  Plus,
  FolderKanban,
  Layers,
  Network,
  BrainCircuit,
  Globe,
  ShieldCheck,
  Terminal,
  HardDrive,
  Compass,
  Settings,
  Puzzle,
  Search,
  CornerDownLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type CommandGroup = "Navigation" | "Actions";

interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  path: string;
  icon: LucideIcon;
  /** Mots-clés (minuscules, sans accents) pour la recherche */
  keywords: string;
}

const COMMANDS: Command[] = [
  // ── Navigation ──
  { id: "dashboard", label: "Tableau de bord", group: "Navigation", path: "/", icon: LayoutDashboard, keywords: "tableau bord dashboard accueil home stats vue ensemble" },
  { id: "tasks", label: "Tâches", group: "Navigation", path: "/tasks", icon: TerminalSquare, keywords: "taches tasks kanban scheduler planification liste" },
  { id: "projects", label: "Projets", group: "Navigation", path: "/projects", icon: FolderKanban, keywords: "projets projects dossiers kanban groupés" },
  { id: "cowork", label: "Cowork", group: "Navigation", path: "/agents?tab=cowork", icon: Layers, keywords: "cowork coworking collaboration chat agents simultane" },
  { id: "agents", label: "Agents", group: "Navigation", path: "/agents", icon: Network, keywords: "agents acp reseau network hub installer team store graphe liste" },
  { id: "memory", label: "Mémoire", group: "Navigation", path: "/memory", icon: BrainCircuit, keywords: "memoire memory qmd notes base semantique connaissances" },
  { id: "collaborations", label: "Collaborations", group: "Navigation", path: "/collaborations", icon: Globe, keywords: "collaborations multi agents externes web reseau" },
  { id: "security", label: "Sécurité", group: "Navigation", path: "/security", icon: ShieldCheck, keywords: "securite security scan vulnerabilites audit parefeu shield" },
  { id: "devtools", label: "Outils & Logs", group: "Navigation", path: "/devtools", icon: Terminal, keywords: "outils logs devtools console terminal journal debug preview" },
  { id: "workspace", label: "Workspace", group: "Navigation", path: "/workspace", icon: HardDrive, keywords: "workspace espace travail fichiers disque explorateur arborescence" },
  { id: "browser", label: "Navigateur", group: "Navigation", path: "/browser", icon: Compass, keywords: "navigateur browser web internet pages compass navigation" },
  { id: "settings", label: "Paramètres", group: "Navigation", path: "/settings", icon: Settings, keywords: "settings parametres preferences configuration reglages voix micro themes" },
  { id: "capacites", label: "Capacités", group: "Navigation", path: "/settings?tab=capacites", icon: Puzzle, keywords: "capacites settings parametres mcp skills plugins outils extensions puzzle" },
  // ── Actions ──
  { id: "task-new", label: "Créer une tâche", group: "Actions", path: "/tasks/new", icon: Plus, keywords: "creer nouvelle tache new task ajouter action" },
];

/**
 * Palette de commandes globale (Ctrl+K / Cmd+K).
 * Composant 100% autonome : il s'auto-ouvre via un écouteur clavier global,
 * aucune prop ni wiring externe ne sont nécessaires — il suffit de le monter
 * une fois dans l'AppShell : `<CommandPalette />`.
 */
export const CommandPalette = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Ferme la palette et remet la recherche / sélection à zéro. */
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  /** Exécute une commande : navigation puis fermeture propre. */
  const execute = useCallback(
    (cmd: Command) => {
      navigate(cmd.path);
      close();
    },
    [navigate, close],
  );

  // ── Écouteur global : Ctrl+K / Cmd+K ouvre, Échap ferme ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (open && e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // ── Autofocus de l'input à l'ouverture ──
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // ── Filtrage insensible à la casse (libellé + mots-clés, tous les mots doivent matcher) ──
  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return COMMANDS;
    return COMMANDS.filter((cmd) => {
      const haystack = `${cmd.label} ${cmd.keywords}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [query]);

  // ── Regroupement consécutif pour l'affichage (index plat conservé pour la sélection) ──
  const grouped = useMemo(() => {
    const groups: { group: CommandGroup; entries: { cmd: Command; index: number }[] }[] = [];
    filtered.forEach((cmd, index) => {
      const last = groups[groups.length - 1];
      if (last && last.group === cmd.group) {
        last.entries.push({ cmd, index });
      } else {
        groups.push({ group: cmd.group, entries: [{ cmd, index }] });
      }
    });
    return groups;
  }, [filtered]);

  // ── Maintien de la sélection dans les bornes quand la liste se réduit ──
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(0);
    }
  }, [filtered.length, selectedIndex]);

  // ── L'élément sélectionné reste visible quand la liste scrolle ──
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open, filtered.length]);

  // ── Navigation clavier dans l'input : ↑ ↓ Entrée ──
  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((i) => (i + 1) % filtered.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIndex] ?? filtered[0];
      if (cmd) {
        execute(cmd);
      }
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0); // la sélection revient au premier résultat
  };

  if (!open) return null;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "16vh",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "calc(100% - 32px)",
          maxWidth: "560px",
          background: "var(--bg-surface-elevated)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "pageFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ── Input de recherche ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 12px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Rechercher une page ou une action…"
            spellCheck={false}
            aria-label="Rechercher une commande"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: "15px",
              fontFamily: "inherit",
              padding: "13px 0",
            }}
          />
          <span
            style={{
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              padding: "2px 7px",
              letterSpacing: "0.05em",
            }}
          >
            ESC
          </span>
        </div>

        {/* ── Résultats ── */}
        <div
          ref={listRef}
          style={{
            maxHeight: "min(400px, 55vh)",
            overflowY: "auto",
            padding: "6px",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "28px 12px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Aucun résultat pour « {query.trim()} »
            </div>
          ) : (
            grouped.map(({ group, entries }) => (
              <div key={group}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    padding: "8px 10px 4px",
                  }}
                >
                  {group}
                </div>
                {entries.map(({ cmd, index }) => {
                  const selected = index === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-cmd-index={index}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        padding: "9px 10px",
                        background: selected ? "rgba(255,255,255,0.06)" : "transparent",
                        border: "none",
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        color: selected ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: 500,
                        fontSize: 14,
                        fontFamily: "inherit",
                        textAlign: "left",
                        boxShadow: selected ? "inset 2px 0 0 var(--brand-accent)" : "none",
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      <cmd.icon
                        size={16}
                        style={{
                          flexShrink: 0,
                          color: selected ? "var(--brand-accent)" : "var(--text-muted)",
                        }}
                      />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cmd.label}
                      </span>
                      {selected && (
                        <CornerDownLeft size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* ── Aide footer ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderTop: "1px solid var(--border-subtle)",
            padding: "8px 14px",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span>↑↓ Naviguer</span>
          <span>↵ Ouvrir</span>
          <span style={{ marginLeft: "auto", opacity: 0.7 }}>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};
