import { useState, useEffect, useCallback } from "react";
import {
  Plug,
  Search,
  X,
  Loader2,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Settings,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  WifiOff,
  Zap,
  Globe,
  Eye,
  EyeOff,
  ArrowLeft,
  Clock,
  Plus,
  Terminal,
  Wrench,
  Play,
  Copy,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";
const STORAGE_KEY = "clawboard-mcp-servers";

// ─── MCP Protocol types ──────────────────────────────────────────────────────

type McpTransport = "stdio" | "sse" | "streamable-http";

interface McpToolDef {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface McpResourceDef {
  uri: string;
  name: string;
  mimeType?: string;
}

interface McpServerDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  apiKey?: string;
  popular?: number;
  docsUrl?: string;
  npmPackage?: string;
  category: McpCategory;
}

interface McpServerState {
  id: string;
  enabled: boolean;
  status: "running" | "stopped" | "error" | "connecting";
  config: Record<string, string>;
  tools: McpToolDef[];
  resources: McpResourceDef[];
  lastPing?: string;
  error?: string;
  pid?: number;
}

type McpCategory =
  | "featured"
  | "ai"
  | "dev"
  | "data"
  | "browser"
  | "cloud"
  | "productivity"
  | "custom";

const CATEGORIES: { id: McpCategory | "all"; label: string; icon: string }[] = [
  { id: "all", label: "Tous", icon: "📦" },
  { id: "featured", label: "Populaires", icon: "⭐" },
  { id: "ai", label: "IA & LLM", icon: "🧠" },
  { id: "dev", label: "Dev Tools", icon: "🔧" },
  { id: "data", label: "Data & Search", icon: "📊" },
  { id: "browser", label: "Browser", icon: "🌐" },
  { id: "cloud", label: "Cloud & Storage", icon: "☁️" },
  { id: "productivity", label: "Productivité", icon: "📋" },
  { id: "custom", label: "Custom", icon: "🔌" },
];

// ─── MCP Server Library ──────────────────────────────────────────────────────

const MCP_LIBRARY: McpServerDef[] = [
  // ── Featured ───────────────────────────────────────────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Accédez aux fichiers locaux en lecture/écriture. Permet aux agents de lire, créer et modifier des fichiers dans des répertoires autorisés.",
    icon: "📂",
    color: "#64748b",
    transport: "stdio",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/home/user/projects",
    ],
    popular: 2,
    category: "featured",
    npmPackage: "@modelcontextprotocol/server-filesystem",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
  {
    id: "github-mcp",
    name: "GitHub",
    description:
      "Créez et gérez des repos, issues, PRs, branches. Code search et file operations via le protocole MCP.",
    icon: "🐙",
    color: "#8b5cf6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    popular: 3,
    category: "featured",
    npmPackage: "@modelcontextprotocol/server-github",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
  },
  {
    id: "playwright-mcp",
    name: "Playwright",
    description:
      "Automatisation navigateur via MCP. Screenshots, navigation, clics, remplissage de formulaires, scraping structuré.",
    icon: "🎭",
    color: "#45ba4b",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-playwright"],
    popular: 1,
    category: "featured",
    npmPackage: "@anthropic/mcp-playwright",
    docsUrl: "https://github.com/anthropics/mcp-playwright",
  },
  {
    id: "memory-mcp",
    name: "Memory",
    description:
      "Stockage de mémoire persistante pour les agents. Knowledge graph avec entités, relations et observations.",
    icon: "🧠",
    color: "#8b5cf6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    popular: 4,
    category: "featured",
    npmPackage: "@modelcontextprotocol/server-memory",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },

  // ── AI & LLM ──────────────────────────────────────────────────────────
  {
    id: "claude-code",
    name: "Claude Code",
    description:
      "Sub-agent Claude pour l'exécution de code, editing et tool use dans un sandbox sécurisé.",
    icon: "🤖",
    color: "#d97757",
    transport: "stdio",
    command: "claude",
    args: ["mcp", "serve"],
    category: "ai",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/mcp",
  },
  {
    id: "context7",
    name: "Context7",
    description:
      "Documentation technique à jour pour n'importe quelle library. Resolve library ID + fetch docs en temps réel.",
    icon: "📚",
    color: "#10b981",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    popular: 5,
    category: "ai",
    npmPackage: "@upstash/context7-mcp",
    docsUrl: "https://context7.com/",
  },
  {
    id: "huggingface-mcp",
    name: "Hugging Face",
    description:
      "Recherchez des modèles, datasets, papers et Spaces sur le Hub HF. Exécutez des inférences via l'API.",
    icon: "🤗",
    color: "#ff9d00",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@huggingface/mcp-server"],
    env: { HF_TOKEN: "" },
    category: "ai",
    npmPackage: "@huggingface/mcp-server",
    docsUrl: "https://huggingface.co/docs",
  },
  {
    id: "ollama-mcp",
    name: "Ollama",
    description:
      "Gérez vos modèles locaux — list, pull, run, chat. Proxy d'inférence locale via Ollama.",
    icon: "🦙",
    color: "#ffffff",
    transport: "streamable-http",
    url: "http://localhost:11434",
    category: "ai",
    docsUrl: "https://ollama.com/",
  },
  {
    id: "minimax-mcp",
    name: "MiniMax MCP",
    description:
      "TTS (Speech 2.6), génération d'images, vidéos Hailuo 2.3, musique, voice clone & voice design via l'API MiniMax.",
    icon: "🎙️",
    color: "#6366f1",
    transport: "stdio",
    command: "npx",
    args: ["-y", "minimax-mcp-js"],
    env: {
      MINIMAX_API_KEY: "",
      MINIMAX_API_HOST: "https://api.minimaxi.chat",
      MINIMAX_MCP_BASE_PATH: "~/Desktop/minimax-output",
    },
    popular: 6,
    category: "ai",
    npmPackage: "minimax-mcp-js",
    docsUrl: "https://github.com/MiniMax-AI/MiniMax-MCP-JS",
  },
  {
    id: "minimax-search-mcp",
    name: "MiniMax Search",
    description:
      "Recherche web et navigation de pages via MiniMax. Web search + browsing pour les agents.",
    icon: "🔍",
    color: "#6366f1",
    transport: "stdio",
    command: "uvx",
    args: ["minimax-search"],
    env: { MINIMAX_API_KEY: "" },
    category: "ai",
    docsUrl: "https://github.com/MiniMax-AI/minimax_search",
  },
  {
    id: "minimax-coding-mcp",
    name: "MiniMax Coding Plan",
    description:
      "MCP optimisé pour le dev : AI-powered search + vision analysis pour workflows de code.",
    icon: "💻",
    color: "#6366f1",
    transport: "stdio",
    command: "uvx",
    args: ["minimax-coding-plan-mcp"],
    env: { MINIMAX_API_KEY: "" },
    category: "ai",
    docsUrl: "https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP",
  },
  {
    id: "zai-glm",
    name: "Z.ai (GLM)",
    description:
      "Modèles GLM-5 et GLM-4.7 de Z.ai — raisonnement avancé, coding multilingue, tool calling. API OpenAI-compatible.",
    icon: "🇿",
    color: "#7c3aed",
    transport: "streamable-http",
    url: "https://api.z.ai/api/paas/v4",
    env: { ZAI_API_KEY: "" },
    category: "ai",
    docsUrl: "https://docs.z.ai/guides/overview/quick-start",
  },

  // ── Dev Tools ─────────────────────────────────────────────────────────
  {
    id: "docker-mcp",
    name: "Docker",
    description:
      "Gérez conteneurs, images et volumes Docker. Listez, démarrez, stoppez et inspectez les conteneurs.",
    icon: "🐳",
    color: "#2496ed",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-docker"],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-docker",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "postgres-mcp",
    name: "PostgreSQL",
    description:
      "Requêtez et explorez vos bases PostgreSQL. Schéma introspection, SELECT, et analyse de données.",
    icon: "🐘",
    color: "#336791",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    env: { POSTGRES_URL: "" },
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-postgres",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
  },
  {
    id: "redis-mcp",
    name: "Redis",
    description:
      "Accédez à vos données Redis — GET, SET, KEYS, HGETALL. Monitoring et cache management.",
    icon: "🔴",
    color: "#dc382d",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-redis"],
    env: { REDIS_URL: "" },
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-redis",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "git-mcp",
    name: "Git",
    description:
      "Opérations Git — log, diff, blame, branch, status. Inspectez l'historique de vos repositories.",
    icon: "📝",
    color: "#f05032",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git"],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-git",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
  },
  {
    id: "sentry-mcp",
    name: "Sentry",
    description:
      "Récupérez les erreurs et crashs depuis Sentry. Analysez les stack traces et identifiez les régressions.",
    icon: "🛡️",
    color: "#362d59",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    env: { SENTRY_AUTH_TOKEN: "" },
    category: "dev",
    npmPackage: "@sentry/mcp-server",
    docsUrl: "https://docs.sentry.io/",
  },
  {
    id: "capcut-mcp",
    name: "CapCut",
    description:
      "Contrôlez CapCut/剪映 via MCP — créez des drafts, ajoutez vidéos, audio, textes, sous-titres, effets, stickers et exportez. API HTTP + MCP.",
    icon: "🎬",
    color: "#00e5ff",
    transport: "streamable-http",
    url: "http://localhost:9000/mcp",
    category: "dev",
    docsUrl: "https://github.com/fancyboi999/capcut-mcp",
  },
  {
    id: "premiere-pro-mcp",
    name: "Premiere Pro",
    description:
      "269 outils pour contrôler Adobe Premiere Pro — timeline, effets, keyframes, export, color grading, audio. Via CEP/ExtendScript.",
    icon: "🎞️",
    color: "#9999ff",
    transport: "stdio",
    command: "npx",
    args: ["-y", "premiere-pro-mcp"],
    env: { PREMIERE_TEMP_DIR: "" },
    category: "dev",
    npmPackage: "premiere-pro-mcp",
    docsUrl: "https://github.com/leancoderkavy/premiere-pro-mcp",
  },
  {
    id: "adobe-suite-mcp",
    name: "Adobe Suite",
    description:
      "Serveur MCP unifié pour Adobe Creative Suite — Photoshop, Premiere Pro, Illustrator, InDesign. Contrôle IA via UXP plugins.",
    icon: "🎨",
    color: "#ff0000",
    transport: "stdio",
    command: "adobe-photoshop",
    category: "dev",
    docsUrl: "https://github.com/stewberticus/adobe-mcp",
  },

  // ── Data & Search ─────────────────────────────────────────────────────
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Recherche web via l'API Brave Search. Résultats structurés, web + news + images.",
    icon: "🦁",
    color: "#fb542b",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    category: "data",
    npmPackage: "@modelcontextprotocol/server-brave-search",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
  },
  {
    id: "fetch-mcp",
    name: "Fetch",
    description:
      "Récupérez le contenu de n'importe quelle URL. Convertit HTML en Markdown ou texte brut pour les agents.",
    icon: "🌍",
    color: "#3b82f6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    category: "data",
    npmPackage: "@modelcontextprotocol/server-fetch",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "apify-mcp",
    name: "Apify",
    description:
      "Milliers de scrapers et actors depuis l'Apify Store. Web scraping à grande échelle via MCP.",
    icon: "🕷️",
    color: "#97d700",
    transport: "stdio",
    command: "npx",
    args: ["-y", "apify-mcp-server"],
    env: { APIFY_TOKEN: "" },
    category: "data",
    npmPackage: "apify-mcp-server",
    docsUrl: "https://docs.apify.com/",
  },

  // ── Browser ───────────────────────────────────────────────────────────
  {
    id: "chrome-mcp",
    name: "Chrome DevTools",
    description:
      "Contrôlez Chrome via le protocol DevTools. Navigation, DOM inspect, console, network, screenshots.",
    icon: "🌐",
    color: "#4285f4",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-chrome"],
    category: "browser",
    npmPackage: "@anthropic/mcp-chrome",
    docsUrl: "https://developer.chrome.com/docs/devtools/",
  },
  {
    id: "puppeteer-mcp",
    name: "Puppeteer",
    description:
      "Automatisation Chrome headless — screenshots, PDF génération, formulaires, scraping.",
    icon: "🤖",
    color: "#00d8a2",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    category: "browser",
    npmPackage: "@modelcontextprotocol/server-puppeteer",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
  },

  // ── Cloud & Storage ───────────────────────────────────────────────────
  {
    id: "computer-use-anthropic",
    name: "Computer Use (Anthropic)",
    description:
      "Contrôle complet du bureau via l'API Claude Computer Use — screenshots, souris, clavier, scroll. Agent loop intégré.",
    icon: "🖥️",
    color: "#d97706",
    transport: "streamable-http",
    url: "http://localhost:4000/api/computer-use",
    category: "browser",
    docsUrl:
      "https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool",
  },
  {
    id: "openwork-mcp",
    name: "OpenWork",
    description:
      "Alternative open-source à Claude Cowork — sessions longues, skills réutilisables, Slack/Telegram, automations. 13k⭐ GitHub.",
    icon: "🔧",
    color: "#2563eb",
    transport: "stdio",
    command: "npx",
    args: ["-y", "openwork-orchestrator"],
    category: "browser",
    npmPackage: "openwork-orchestrator",
    docsUrl: "https://github.com/different-ai/openwork",
  },
  {
    id: "eigent-mcp",
    name: "Eigent AI",
    description:
      "Multi-agent workforce desktop — sous-agents parallèles, 200+ MCP tools, CAMEL-AI, local-first. Apache 2.0.",
    icon: "🏢",
    color: "#7c3aed",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@eigent/desktop"],
    category: "browser",
    npmPackage: "@eigent/desktop",
    docsUrl: "https://github.com/eigent-ai/eigent",
  },
  {
    id: "vnc-bridge-mcp",
    name: "VNC Bridge",
    description:
      "Pont VNC/noVNC pour contrôle de bureau distant. Connectez un Docker container ou VM pour le Computer Use sandboxé.",
    icon: "📺",
    color: "#0ea5e9",
    transport: "sse",
    url: "http://localhost:6080",
    category: "browser",
    docsUrl:
      "https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo",
  },
  {
    id: "google-drive-mcp",
    name: "Google Drive",
    description:
      "Listez, recherchez, importez et exportez des fichiers depuis Google Drive via MCP.",
    icon: "📁",
    color: "#4285f4",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    env: { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" },
    category: "cloud",
    npmPackage: "@modelcontextprotocol/server-gdrive",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive",
  },
  {
    id: "aws-mcp",
    name: "AWS",
    description:
      "Gérez vos ressources AWS — S3, Lambda, EC2, CloudWatch. CLI AWS encapsulée en MCP.",
    icon: "☁️",
    color: "#ff9900",
    transport: "stdio",
    command: "npx",
    args: ["-y", "aws-mcp-server"],
    env: {
      AWS_ACCESS_KEY_ID: "",
      AWS_SECRET_ACCESS_KEY: "",
      AWS_REGION: "eu-west-1",
    },
    category: "cloud",
    npmPackage: "aws-mcp-server",
    docsUrl: "https://docs.aws.amazon.com/",
  },
  {
    id: "supabase-mcp",
    name: "Supabase",
    description:
      "Requêtez et gérez vos projets Supabase — database, auth, storage, edge functions.",
    icon: "⚡",
    color: "#3ecf8e",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@supabase/mcp-server"],
    env: { SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "" },
    category: "cloud",
    npmPackage: "@supabase/mcp-server",
    docsUrl: "https://supabase.com/docs",
  },

  // ── Productivity ──────────────────────────────────────────────────────
  {
    id: "slack-mcp",
    name: "Slack",
    description:
      "Envoyez et lisez des messages Slack, gérez les channels et répondez aux threads via MCP.",
    icon: "💬",
    color: "#4a154b",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "" },
    category: "productivity",
    npmPackage: "@modelcontextprotocol/server-slack",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
  },
  {
    id: "notion-mcp",
    name: "Notion",
    description:
      "Lisez et éditez des pages et databases Notion. Sync bidirectionnel de contenu.",
    icon: "📝",
    color: "#000000",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/mcp-server"],
    env: { NOTION_TOKEN: "" },
    category: "productivity",
    npmPackage: "@notionhq/mcp-server",
    docsUrl: "https://developers.notion.com/",
  },
  {
    id: "gmail-mcp",
    name: "Gmail",
    description:
      "Lisez, recherchez et envoyez des emails via Gmail. Inbox monitoring pour les agents.",
    icon: "📧",
    color: "#ea4335",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-gmail"],
    env: { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" },
    category: "productivity",
    npmPackage: "@anthropic/mcp-gmail",
    docsUrl: "https://developers.google.com/gmail/api",
  },
  {
    id: "google-calendar-mcp",
    name: "Google Calendar",
    description:
      "Lisez et créez des événements Google Calendar. Synchronisez les récurrences NemoClaw.",
    icon: "📅",
    color: "#4285f4",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-google-calendar"],
    env: { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" },
    category: "productivity",
    npmPackage: "@anthropic/mcp-google-calendar",
    docsUrl: "https://developers.google.com/calendar",
  },
  {
    id: "windows-mcp",
    name: "Windows MCP",
    description:
      "Contrôlez Windows — PowerShell, fichiers, fenêtres, applications. Mode local ou cloud sandbox.",
    icon: "🪟",
    color: "#0078d4",
    transport: "stdio",
    command: "npx",
    args: ["-y", "windows-mcp-server"],
    category: "productivity",
    npmPackage: "windows-mcp-server",
    docsUrl: "https://windowsmcp.io/",
  },
];

// ─── Style helpers ───────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  padding: "20px",
  transition: "all 0.2s",
  cursor: "pointer",
  position: "relative",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
const monoInput: React.CSSProperties = {
  ...inputStyle,
  fontFamily: "var(--mono)",
  fontSize: "0.82rem",
};
const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 20px",
  borderRadius: "var(--radius-full)",
  background: "rgba(59,130,246,0.15)",
  border: "1px solid rgba(59,130,246,0.3)",
  color: "#3b82f6",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
  transition: "all 0.2s",
  fontFamily: "inherit",
};
const statusColors: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  running: { bg: "rgba(16,185,129,0.1)", text: "#10b981", label: "Actif" },
  stopped: { bg: "rgba(161,161,170,0.1)", text: "#a1a1aa", label: "Arrêté" },
  error: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", label: "Erreur" },
  connecting: {
    bg: "rgba(245,158,11,0.1)",
    text: "#f59e0b",
    label: "Connexion…",
  },
};
const transportBadge: Record<McpTransport, { label: string; color: string }> = {
  stdio: { label: "stdio", color: "#10b981" },
  sse: { label: "SSE", color: "#3b82f6" },
  "streamable-http": { label: "Streamable HTTP", color: "#8b5cf6" },
};

function loadServers(): Record<string, McpServerState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveServers(d: Record<string, McpServerState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ConnectorsModule = () => {
  const [servers, setServers] =
    useState<Record<string, McpServerState>>(loadServers);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<McpCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"library" | "detail" | "add-custom">(
    "library",
  );
  const [envForm, setEnvForm] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = useState<McpToolDef[]>([]);
  const [discoveredResources, setDiscoveredResources] = useState<
    McpResourceDef[]
  >([]);
  const [customForm, setCustomForm] = useState({
    name: "",
    description: "",
    transport: "stdio" as McpTransport,
    command: "",
    args: "",
    url: "",
    env: "",
  });

  useEffect(() => {
    saveServers(servers);
  }, [servers]);
  const showMsg = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const selected = MCP_LIBRARY.find((s) => s.id === selectedId) || null;
  const serverState = selectedId ? servers[selectedId] : null;
  const activeCount = Object.values(servers).filter(
    (s) => s.status === "running",
  ).length;

  const filtered = MCP_LIBRARY.filter((s) => {
    if (catFilter !== "all") {
      if (catFilter === "featured") {
        if (!s.popular) return false;
      } else if (s.category !== catFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.npmPackage || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openDetail = (id: string) => {
    setSelectedId(id);
    const def = MCP_LIBRARY.find((s) => s.id === id);
    const existing = servers[id];
    setEnvForm(existing?.config || def?.env || {});
    setShowSecrets({});
    setDiscoveredTools(existing?.tools || []);
    setDiscoveredResources(existing?.resources || []);
    setView("detail");
  };

  // ── Connect (start MCP server) ─────────────────────────────────────
  const handleConnect = async () => {
    if (!selected) return;
    setSaving(true);
    const mcpConfig = {
      id: selected.id,
      name: selected.name,
      transport: selected.transport,
      command: selected.command,
      args: selected.args,
      url: selected.url,
      env: envForm,
    };
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mcpConfig),
      });
      const data = await res.json();
      setServers((prev) => ({
        ...prev,
        [selected.id]: {
          id: selected.id,
          enabled: true,
          status: data.status || "running",
          config: { ...envForm },
          tools: data.tools || [],
          resources: data.resources || [],
          lastPing: new Date().toISOString(),
          pid: data.pid,
        },
      }));
      setDiscoveredTools(data.tools || []);
      setDiscoveredResources(data.resources || []);
      showMsg(
        `✓ ${selected.name} — ${data.tools?.length || 0} outils découverts`,
      );
    } catch {
      const mockTools = getMockTools(selected.id);
      setServers((prev) => ({
        ...prev,
        [selected.id]: {
          id: selected.id,
          enabled: true,
          status: "running",
          config: { ...envForm },
          tools: mockTools,
          resources: [],
          lastPing: new Date().toISOString(),
        },
      }));
      setDiscoveredTools(mockTools);
      showMsg(`✓ ${selected.name} — ${mockTools.length} outils (démo)`);
    }
    setSaving(false);
  };

  const handleDisconnect = async (id: string) => {
    try {
      await apiFetch(`${BASE}/api/mcp/servers/${id}`, { method: "DELETE" });
    } catch {
      /* graceful */
    }
    setServers((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    showMsg("Serveur MCP arrêté");
    if (selectedId === id) setView("library");
  };

  const handleDiscover = async (id: string) => {
    setTesting(true);
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers/${id}/tools`);
      const data = await res.json();
      setDiscoveredTools(data.tools || []);
      setDiscoveredResources(data.resources || []);
      setServers((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          tools: data.tools || [],
          resources: data.resources || [],
          lastPing: new Date().toISOString(),
        },
      }));
      showMsg(
        `✓ ${data.tools?.length || 0} outils, ${data.resources?.length || 0} ressources`,
      );
    } catch {
      const mockTools = getMockTools(id);
      setDiscoveredTools(mockTools);
      showMsg(`✓ ${mockTools.length} outils (démo)`);
    }
    setTesting(false);
  };

  const handleToggle = (id: string) => {
    setServers((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        enabled: !prev[id]?.enabled,
        status: prev[id]?.enabled ? "stopped" : "running",
      },
    }));
  };

  const handleAddCustom = async () => {
    if (!customForm.name.trim()) {
      showMsg("Nom requis");
      return;
    }
    setSaving(true);
    const id = `custom-${customForm.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const envParsed: Record<string, string> = {};
    if (customForm.env.trim()) {
      customForm.env.split("\n").forEach((line) => {
        const [k, ...v] = line.split("=");
        if (k?.trim()) envParsed[k.trim()] = v.join("=").trim();
      });
    }
    const mcpConfig = {
      id,
      name: customForm.name,
      transport: customForm.transport,
      command:
        customForm.transport === "stdio" ? customForm.command : undefined,
      args:
        customForm.transport === "stdio"
          ? customForm.args.split(" ").filter(Boolean)
          : undefined,
      url: customForm.transport !== "stdio" ? customForm.url : undefined,
      env: envParsed,
    };
    try {
      const res = await apiFetch(`${BASE}/api/mcp/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mcpConfig),
      });
      const data = await res.json();
      setServers((prev) => ({
        ...prev,
        [id]: {
          id,
          enabled: true,
          status: data.status || "running",
          config: envParsed,
          tools: data.tools || [],
          resources: data.resources || [],
          lastPing: new Date().toISOString(),
          pid: data.pid,
        },
      }));
      showMsg(`✓ ${customForm.name} connecté`);
    } catch {
      setServers((prev) => ({
        ...prev,
        [id]: {
          id,
          enabled: true,
          status: "running",
          config: envParsed,
          tools: [],
          resources: [],
          lastPing: new Date().toISOString(),
        },
      }));
      showMsg(`✓ ${customForm.name} ajouté (démo)`);
    }
    setCustomForm({
      name: "",
      description: "",
      transport: "stdio",
      command: "",
      args: "",
      url: "",
      env: "",
    });
    setSaving(false);
    setView("library");
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", maxWidth: "1400px" }}>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            zIndex: 9999,
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "12px 20px",
            boxShadow: "var(--shadow-lg)",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "slideIn 0.3s ease",
          }}
        >
          {toast.startsWith("✓") ? (
            <CheckCircle2 size={16} color="#10b981" />
          ) : toast.startsWith("✗") ? (
            <AlertCircle size={16} color="#ef4444" />
          ) : (
            <Loader2 size={16} className="spin" />
          )}
          {toast}
        </div>
      )}

      {/* ─── Library ──────────────────────────────────────────────────── */}
      {view === "library" && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <Plug size={24} /> Serveurs MCP
              </h2>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  marginTop: "4px",
                }}
              >
                Connectez des outils aux agents via le Model Context Protocol.{" "}
                {activeCount > 0 && (
                  <span style={{ color: "#10b981", fontWeight: 600 }}>
                    {activeCount} actif{activeCount > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setView("add-custom")}
              style={{
                ...btnPrimary,
                background: "rgba(139,92,246,0.15)",
                borderColor: "rgba(139,92,246,0.3)",
                color: "var(--brand-accent)",
              }}
            >
              <Plus size={16} /> Serveur custom
            </button>
          </div>

          {/* Search + categories */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ position: "relative", flex: "1 1 300px" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un serveur MCP…"
                style={{ ...inputStyle, paddingLeft: "36px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCatFilter(cat.id as McpCategory | "all")}
                  style={{
                    ...btnPrimary,
                    padding: "8px 14px",
                    fontSize: "0.8rem",
                    background:
                      catFilter === cat.id
                        ? "rgba(139,92,246,0.15)"
                        : "transparent",
                    borderColor:
                      catFilter === cat.id
                        ? "rgba(139,92,246,0.3)"
                        : "var(--border-subtle)",
                    color:
                      catFilter === cat.id
                        ? "var(--brand-accent)"
                        : "var(--text-secondary)",
                  }}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active servers */}
          {activeCount > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  marginBottom: "12px",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <CheckCircle2 size={16} color="#10b981" /> Serveurs actifs
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                  gap: "12px",
                }}
              >
                {Object.entries(servers)
                  .filter(([, s]) => s.status === "running")
                  .map(([id, s]) => {
                    const def = MCP_LIBRARY.find((d) => d.id === id);
                    const nm = def?.name || id;
                    const ic = def?.icon || "🔌";
                    const cl = def?.color || "#8b5cf6";
                    return (
                      <div
                        key={id}
                        onClick={() => (def ? openDetail(id) : undefined)}
                        style={{
                          ...cardStyle,
                          borderColor: `${cl}33`,
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.borderColor = `${cl}66`;
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.borderColor = `${cl}33`;
                          e.currentTarget.style.transform = "none";
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: `${cl}15`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "22px",
                            flexShrink: 0,
                          }}
                        >
                          {ic}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                            {nm}
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginTop: "2px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "999px",
                                background: "rgba(16,185,129,0.1)",
                                color: "#10b981",
                                fontWeight: 600,
                              }}
                            >
                              Actif
                            </span>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                            >
                              <Wrench size={11} /> {s.tools?.length || 0} outils
                            </span>
                            {def && (
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: `${transportBadge[def.transport].color}15`,
                                  color: transportBadge[def.transport].color,
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  fontFamily: "var(--mono)",
                                }}
                              >
                                {transportBadge[def.transport].label}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          style={{ color: "var(--text-muted)", flexShrink: 0 }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Library grid */}
          <div>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                marginBottom: "12px",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Globe size={16} /> Répertoire MCP ({filtered.length})
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "14px",
              }}
            >
              {filtered.map((s) => {
                const isActive = servers[s.id]?.status === "running";
                const tb = transportBadge[s.transport];
                return (
                  <div
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    style={{ ...cardStyle, opacity: isActive ? 0.7 : 1 }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = `${s.color}44`;
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = `0 4px 20px ${s.color}15`;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--border-subtle)";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 14,
                          background: `${s.color}12`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "24px",
                        }}
                      >
                        {s.icon}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          alignItems: "center",
                        }}
                      >
                        {s.popular && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: "rgba(245,158,11,0.1)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245,158,11,0.2)",
                            }}
                          >
                            #{s.popular}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: `${tb.color}12`,
                            color: tb.color,
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {tb.label}
                        </span>
                        {isActive && <CheckCircle2 size={16} color="#10b981" />}
                      </div>
                    </div>
                    <h4
                      style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        marginBottom: "6px",
                      }}
                    >
                      {s.name}
                    </h4>
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                        marginBottom: "10px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {s.description}
                    </p>
                    {s.npmPackage && (
                      <code
                        style={{
                          fontSize: "0.7rem",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-muted)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {s.npmPackage}
                      </code>
                    )}
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "var(--text-muted)",
                }}
              >
                <Plug
                  size={40}
                  style={{ opacity: 0.3, marginBottom: "12px" }}
                />
                <div>Aucun serveur MCP trouvé</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Detail ───────────────────────────────────────────────────── */}
      {view === "detail" && selected && (
        <>
          <button
            onClick={() => setView("library")}
            style={{
              ...btnPrimary,
              marginBottom: "20px",
              background: "transparent",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <ArrowLeft size={16} /> Retour
          </button>
          <div
            className="glass-panel"
            style={{ padding: "28px", maxWidth: "900px" }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "24px",
              }}
            >
              <div
                style={{ display: "flex", gap: "16px", alignItems: "center" }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: `${selected.color}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "28px",
                  }}
                >
                  {selected.icon}
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    {selected.name}
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: "4px",
                        background: `${transportBadge[selected.transport].color}12`,
                        color: transportBadge[selected.transport].color,
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {transportBadge[selected.transport].label}
                    </span>
                  </h2>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                      marginTop: "4px",
                    }}
                  >
                    {selected.description}
                  </p>
                </div>
              </div>
              {serverState?.status === "running" && (
                <button
                  onClick={() => handleDisconnect(selected.id)}
                  style={{
                    ...btnPrimary,
                    background: "rgba(239,68,68,0.1)",
                    borderColor: "rgba(239,68,68,0.3)",
                    color: "#ef4444",
                  }}
                >
                  <X size={14} /> Arrêter
                </button>
              )}
            </div>

            {/* Command preview */}
            <div
              style={{
                marginBottom: "20px",
                padding: "14px 18px",
                borderRadius: "var(--radius-md)",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Terminal size={13} /> Commande MCP
              </div>
              <code
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "0.82rem",
                  color: "#10b981",
                  wordBreak: "break-all",
                }}
              >
                {selected.transport === "stdio"
                  ? `${selected.command} ${(selected.args || []).join(" ")}`
                  : selected.url || "http://localhost:..."}
              </code>
            </div>

            {/* Status */}
            {serverState && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "20px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: (
                    statusColors[serverState.status] || statusColors.stopped
                  ).bg,
                  border: `1px solid ${(statusColors[serverState.status] || statusColors.stopped).text}22`,
                }}
              >
                {serverState.status === "running" ? (
                  <CheckCircle2 size={18} color="#10b981" />
                ) : serverState.status === "error" ? (
                  <AlertCircle size={18} color="#ef4444" />
                ) : (
                  <WifiOff size={18} color="#a1a1aa" />
                )}
                <span
                  style={{
                    fontWeight: 600,
                    color: (
                      statusColors[serverState.status] || statusColors.stopped
                    ).text,
                  }}
                >
                  {
                    (statusColors[serverState.status] || statusColors.stopped)
                      .label
                  }
                </span>
                <span
                  style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}
                >
                  {serverState.tools?.length || 0} outils ·{" "}
                  {serverState.resources?.length || 0} ressources
                </span>
                {serverState.lastPing && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginLeft: "auto",
                    }}
                  >
                    <Clock size={12} />{" "}
                    {new Date(serverState.lastPing).toLocaleString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Env config */}
            {selected.env && Object.keys(selected.env).length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Settings size={16} /> Variables d'environnement
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {Object.keys(selected.env).map((key) => (
                    <div key={key}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          marginBottom: "4px",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {key} <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showSecrets[key] ? "text" : "password"}
                          value={envForm[key] || ""}
                          onChange={(e) =>
                            setEnvForm((p) => ({ ...p, [key]: e.target.value }))
                          }
                          placeholder={`Valeur pour ${key}`}
                          style={monoInput}
                        />
                        <button
                          onClick={() =>
                            setShowSecrets((p) => ({ ...p, [key]: !p[key] }))
                          }
                          style={{
                            position: "absolute",
                            right: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            padding: "4px",
                          }}
                        >
                          {showSecrets[key] ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "24px",
              }}
            >
              {serverState?.status !== "running" ? (
                <button
                  onClick={handleConnect}
                  disabled={saving}
                  style={{
                    ...btnPrimary,
                    background: "rgba(16,185,129,0.15)",
                    borderColor: "rgba(16,185,129,0.3)",
                    color: "#10b981",
                  }}
                >
                  {saving ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Play size={15} />
                  )}{" "}
                  Démarrer le serveur
                </button>
              ) : (
                <button
                  onClick={() => handleDiscover(selected.id)}
                  disabled={testing}
                  style={btnPrimary}
                >
                  {testing ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <RefreshCw size={15} />
                  )}{" "}
                  Redécouvrir les outils
                </button>
              )}
              {selected.npmPackage && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `npx -y ${selected.npmPackage}`,
                    );
                    showMsg("✓ Copié");
                  }}
                  style={{
                    ...btnPrimary,
                    background: "transparent",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Copy size={14} /> npx -y {selected.npmPackage}
                </button>
              )}
              {selected.docsUrl && (
                <a
                  href={selected.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...btnPrimary,
                    textDecoration: "none",
                    background: "transparent",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <ExternalLink size={14} /> Docs
                </a>
              )}
            </div>

            {/* Tools */}
            {discoveredTools.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Wrench size={16} /> Outils disponibles (
                  {discoveredTools.length})
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {discoveredTools.map((tool) => (
                    <div
                      key={tool.name}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(0,0,0,0.2)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <code
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "var(--brand-accent)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {tool.name}
                      </code>
                      {tool.description && (
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                            marginTop: "4px",
                          }}
                        >
                          {tool.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resources */}
            {discoveredResources.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Globe size={16} /> Ressources ({discoveredResources.length})
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {discoveredResources.map((r) => (
                    <div
                      key={r.uri}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(0,0,0,0.2)",
                        border: "1px solid var(--border-subtle)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <code
                        style={{
                          fontSize: "0.78rem",
                          color: "#3b82f6",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {r.uri}
                      </code>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {r.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle */}
            {serverState?.status === "running" && (
              <div
                style={{
                  paddingTop: "20px",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    Serveur actif
                  </div>
                  <div
                    style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                  >
                    Désactivez pour suspendre sans supprimer la config
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(selected.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: serverState.enabled
                      ? "#10b981"
                      : "var(--text-muted)",
                  }}
                >
                  {serverState.enabled ? (
                    <ToggleRight size={32} />
                  ) : (
                    <ToggleLeft size={32} />
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Add Custom MCP Server ────────────────────────────────────── */}
      {view === "add-custom" && (
        <>
          <button
            onClick={() => setView("library")}
            style={{
              ...btnPrimary,
              marginBottom: "20px",
              background: "transparent",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <ArrowLeft size={16} /> Retour
          </button>
          <div
            className="glass-panel"
            style={{ padding: "28px", maxWidth: "700px" }}
          >
            <h2
              style={{
                fontSize: "1.3rem",
                fontWeight: 700,
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <Plus size={20} /> Ajouter un serveur MCP
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--text-secondary)",
                  }}
                >
                  Nom <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={customForm.name}
                  onChange={(e) =>
                    setCustomForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="my-mcp-server"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--text-secondary)",
                  }}
                >
                  Description
                </label>
                <input
                  value={customForm.description}
                  onChange={(e) =>
                    setCustomForm((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Que fait ce serveur MCP ?"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--text-secondary)",
                  }}
                >
                  Transport <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["stdio", "sse", "streamable-http"] as McpTransport[]).map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() =>
                          setCustomForm((p) => ({ ...p, transport: t }))
                        }
                        style={{
                          ...btnPrimary,
                          padding: "8px 16px",
                          fontSize: "0.82rem",
                          fontFamily: "var(--mono)",
                          background:
                            customForm.transport === t
                              ? `${transportBadge[t].color}15`
                              : "transparent",
                          borderColor:
                            customForm.transport === t
                              ? `${transportBadge[t].color}44`
                              : "var(--border-subtle)",
                          color:
                            customForm.transport === t
                              ? transportBadge[t].color
                              : "var(--text-secondary)",
                        }}
                      >
                        {transportBadge[t].label}
                      </button>
                    ),
                  )}
                </div>
              </div>
              {customForm.transport === "stdio" && (
                <>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Commande <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      value={customForm.command}
                      onChange={(e) =>
                        setCustomForm((p) => ({
                          ...p,
                          command: e.target.value,
                        }))
                      }
                      placeholder="npx"
                      style={monoInput}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Arguments
                    </label>
                    <input
                      value={customForm.args}
                      onChange={(e) =>
                        setCustomForm((p) => ({ ...p, args: e.target.value }))
                      }
                      placeholder="-y @my/mcp-server --flag"
                      style={monoInput}
                    />
                  </div>
                </>
              )}
              {customForm.transport !== "stdio" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      marginBottom: "6px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    URL endpoint <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    value={customForm.url}
                    onChange={(e) =>
                      setCustomForm((p) => ({ ...p, url: e.target.value }))
                    }
                    placeholder="http://localhost:3001/mcp"
                    style={monoInput}
                  />
                </div>
              )}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--text-secondary)",
                  }}
                >
                  Variables d'environnement{" "}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 400,
                      color: "var(--text-muted)",
                    }}
                  >
                    (KEY=value, une par ligne)
                  </span>
                </label>
                <textarea
                  value={customForm.env}
                  onChange={(e) =>
                    setCustomForm((p) => ({ ...p, env: e.target.value }))
                  }
                  placeholder={"API_KEY=sk-...\nDATABASE_URL=postgres://..."}
                  rows={4}
                  style={{ ...monoInput, resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
              <button
                onClick={handleAddCustom}
                disabled={saving}
                style={{
                  ...btnPrimary,
                  background: "rgba(16,185,129,0.15)",
                  borderColor: "rgba(16,185,129,0.3)",
                  color: "#10b981",
                }}
              >
                {saving ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Zap size={15} />
                )}{" "}
                Connecter
              </button>
              <button
                onClick={() => setView("library")}
                style={{
                  ...btnPrimary,
                  background: "transparent",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Mock tools for demo mode ────────────────────────────────────────────────

function getMockTools(serverId: string): McpToolDef[] {
  const m: Record<string, McpToolDef[]> = {
    filesystem: [
      { name: "read_file", description: "Lire le contenu d'un fichier" },
      { name: "write_file", description: "Écrire du contenu dans un fichier" },
      {
        name: "list_directory",
        description: "Lister le contenu d'un répertoire",
      },
      {
        name: "search_files",
        description: "Rechercher des fichiers par pattern",
      },
      {
        name: "get_file_info",
        description: "Obtenir les métadonnées d'un fichier",
      },
      { name: "move_file", description: "Déplacer ou renommer un fichier" },
    ],
    "github-mcp": [
      { name: "create_issue", description: "Créer une issue GitHub" },
      { name: "create_pull_request", description: "Ouvrir une pull request" },
      { name: "search_code", description: "Rechercher dans le code du repo" },
      { name: "list_commits", description: "Lister les commits récents" },
      { name: "get_file_contents", description: "Lire un fichier du repo" },
      { name: "create_branch", description: "Créer une branche" },
      { name: "list_issues", description: "Lister les issues" },
    ],
    "playwright-mcp": [
      { name: "browser_navigate", description: "Naviguer vers une URL" },
      { name: "browser_click", description: "Cliquer sur un élément" },
      { name: "browser_type", description: "Saisir du texte dans un champ" },
      {
        name: "browser_snapshot",
        description: "Snapshot d'accessibilité de la page",
      },
      { name: "browser_take_screenshot", description: "Capture d'écran" },
      { name: "browser_evaluate", description: "Exécuter du JavaScript" },
      { name: "browser_fill_form", description: "Remplir un formulaire" },
    ],
    "memory-mcp": [
      {
        name: "create_entities",
        description: "Créer des entités dans le knowledge graph",
      },
      {
        name: "create_relations",
        description: "Créer des relations entre entités",
      },
      {
        name: "add_observations",
        description: "Ajouter des observations à une entité",
      },
      { name: "search_nodes", description: "Rechercher dans le graph" },
      { name: "read_graph", description: "Lire le knowledge graph complet" },
    ],
    context7: [
      {
        name: "resolve-library-id",
        description: "Résoudre l'ID d'une library",
      },
      {
        name: "get-library-docs",
        description: "Récupérer la documentation d'une library",
      },
    ],
    "brave-search": [
      { name: "brave_web_search", description: "Recherche web via Brave" },
      { name: "brave_local_search", description: "Recherche locale via Brave" },
    ],
    "postgres-mcp": [
      { name: "query", description: "Exécuter une requête SQL SELECT" },
      { name: "list_tables", description: "Lister les tables de la base" },
      { name: "describe_table", description: "Décrire le schéma d'une table" },
    ],
    "docker-mcp": [
      { name: "list_containers", description: "Lister les conteneurs Docker" },
      { name: "start_container", description: "Démarrer un conteneur" },
      { name: "stop_container", description: "Arrêter un conteneur" },
      { name: "container_logs", description: "Voir les logs d'un conteneur" },
      { name: "list_images", description: "Lister les images Docker" },
    ],
    "claude-code": [
      { name: "run_code", description: "Exécuter du code dans un sandbox" },
      { name: "edit_file", description: "Modifier un fichier" },
      { name: "search_codebase", description: "Rechercher dans le codebase" },
    ],
    "fetch-mcp": [
      {
        name: "fetch",
        description: "Récupérer le contenu d'une URL en Markdown",
      },
    ],
    "slack-mcp": [
      { name: "send_message", description: "Envoyer un message Slack" },
      { name: "list_channels", description: "Lister les channels" },
      { name: "get_thread", description: "Lire un thread de discussion" },
    ],
    "google-drive-mcp": [
      { name: "search_files", description: "Rechercher des fichiers Drive" },
      { name: "read_file", description: "Lire le contenu d'un fichier" },
      { name: "create_file", description: "Créer un fichier sur Drive" },
    ],
    "git-mcp": [
      { name: "git_log", description: "Historique des commits" },
      { name: "git_diff", description: "Différences entre commits" },
      { name: "git_status", description: "Status du working tree" },
      { name: "git_blame", description: "Blame d'un fichier" },
    ],
    "notion-mcp": [
      { name: "search_pages", description: "Rechercher dans Notion" },
      { name: "read_page", description: "Lire une page Notion" },
      { name: "create_page", description: "Créer une page Notion" },
      { name: "query_database", description: "Requêter une database Notion" },
    ],
    "huggingface-mcp": [
      {
        name: "model_search",
        description: "Rechercher des modèles sur le Hub",
      },
      { name: "dataset_search", description: "Rechercher des datasets" },
      { name: "paper_search", description: "Rechercher des papers" },
      { name: "space_search", description: "Rechercher des Spaces" },
    ],
    "windows-mcp": [
      {
        name: "run_powershell",
        description: "Exécuter une commande PowerShell",
      },
      { name: "list_windows", description: "Lister les fenêtres ouvertes" },
      { name: "screenshot", description: "Capture d'écran du bureau" },
    ],
    "sentry-mcp": [
      { name: "list_issues", description: "Lister les erreurs Sentry" },
      { name: "get_issue_details", description: "Détails d'une erreur" },
      { name: "search_events", description: "Rechercher des événements" },
    ],
    "ollama-mcp": [
      {
        name: "list_models",
        description: "Lister les modèles Ollama installés",
      },
      { name: "pull_model", description: "Télécharger un modèle" },
      { name: "chat", description: "Chat avec un modèle local" },
      { name: "generate", description: "Complétion de texte" },
    ],
    "redis-mcp": [
      { name: "get", description: "GET une clé Redis" },
      { name: "set", description: "SET une clé Redis" },
      { name: "keys", description: "Lister les clés matchant un pattern" },
      { name: "hgetall", description: "Récupérer un hash Redis" },
    ],
    "supabase-mcp": [
      { name: "query", description: "Requête SQL sur Supabase" },
      { name: "list_tables", description: "Lister les tables" },
      { name: "auth_list_users", description: "Lister les utilisateurs" },
      { name: "storage_list", description: "Lister les fichiers storage" },
    ],
    "gmail-mcp": [
      { name: "search_emails", description: "Rechercher des emails" },
      { name: "read_email", description: "Lire le contenu d'un email" },
      { name: "send_email", description: "Envoyer un email" },
    ],
    "google-calendar-mcp": [
      { name: "list_events", description: "Lister les événements à venir" },
      { name: "create_event", description: "Créer un événement" },
      { name: "delete_event", description: "Supprimer un événement" },
    ],
    "aws-mcp": [
      { name: "s3_list_buckets", description: "Lister les buckets S3" },
      { name: "s3_get_object", description: "Télécharger un objet S3" },
      { name: "lambda_invoke", description: "Exécuter une Lambda" },
      { name: "cloudwatch_logs", description: "Lire les logs CloudWatch" },
    ],
    "apify-mcp": [
      { name: "run_actor", description: "Exécuter un actor Apify" },
      { name: "get_dataset", description: "Récupérer un dataset" },
      { name: "list_actors", description: "Lister les actors disponibles" },
    ],
    "chrome-mcp": [
      { name: "navigate", description: "Naviguer vers une URL" },
      { name: "screenshot", description: "Capture d'écran" },
      { name: "evaluate", description: "Exécuter du JavaScript" },
      { name: "get_dom", description: "Récupérer le DOM" },
    ],
    "puppeteer-mcp": [
      { name: "navigate", description: "Naviguer vers une URL" },
      { name: "screenshot", description: "Capture d'écran" },
      { name: "click", description: "Cliquer sur un élément" },
      { name: "type", description: "Saisir du texte" },
      { name: "pdf", description: "Générer un PDF" },
    ],
  };
  return (
    m[serverId] || [
      { name: "ping", description: "Test de connectivité" },
      { name: "list_tools", description: "Lister les outils" },
    ]
  );
}
