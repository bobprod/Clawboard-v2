// ─── MCP Catalog ─────────────────────────────────────────────────────────────
// Unified, deduplicated catalog of known MCP servers / connectors.
// Merges the former ConnectorsModule (MCP_LIBRARY) and McpConnectors (CONNECTORS)
// data sources into a single source of truth consumed by McpModule.tsx.

export type McpTransport = "stdio" | "sse" | "streamable-http";

export type McpCategory =
  | "featured"
  | "ai"
  | "dev"
  | "data"
  | "browser"
  | "cloud"
  | "productivity"
  | "google"
  | "marketing"
  | "design"
  | "video"
  | "cms"
  | "system"
  | "docs"
  | "music";

export interface McpEnvField {
  key: string;
  label?: string;
  required?: boolean;
  secret?: boolean;
  /** Optional default/prefilled value */
  value?: string;
}

export interface McpCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: McpCategory;
  icon: string; // emoji
  color: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: McpEnvField[];
  docsUrl?: string;
  npmPackage?: string;
  popular?: number;
  tags?: string[];
}

export const MCP_CATEGORIES: {
  id: McpCategory | "all";
  label: string;
  icon: string;
}[] = [
  { id: "all", label: "Tous", icon: "📦" },
  { id: "featured", label: "Populaires", icon: "⭐" },
  { id: "ai", label: "IA & LLM", icon: "🧠" },
  { id: "dev", label: "Dev Tools", icon: "🔧" },
  { id: "data", label: "Data & Search", icon: "📊" },
  { id: "browser", label: "Browser", icon: "🌐" },
  { id: "cloud", label: "Cloud & Storage", icon: "☁️" },
  { id: "productivity", label: "Productivité", icon: "📋" },
  { id: "google", label: "Google", icon: "🔵" },
  { id: "marketing", label: "Marketing", icon: "📈" },
  { id: "design", label: "Design", icon: "🎨" },
  { id: "video", label: "Vidéo", icon: "🎬" },
  { id: "cms", label: "CMS & E-commerce", icon: "📰" },
  { id: "system", label: "Système", icon: "🖥️" },
  { id: "docs", label: "Documentation", icon: "📚" },
  { id: "music", label: "Musique & Audio", icon: "🎵" },
];

const secret = (key: string, label?: string, required = true): McpEnvField => ({
  key,
  label,
  required,
  secret: true,
});
const text = (key: string, label?: string, required = true): McpEnvField => ({
  key,
  label,
  required,
  secret: false,
});

export const MCP_CATALOG: McpCatalogEntry[] = [
  // ── Featured / Populaires ────────────────────────────────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Accès fichiers locaux en lecture/écriture : read/write/edit, list/search directories, move, metadata. Sandbox sécurisé.",
    icon: "📂",
    color: "#3b82f6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    category: "featured",
    popular: 1,
    npmPackage: "@modelcontextprotocol/server-filesystem",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    tags: ["filesystem", "files", "read", "write", "official"],
  },
  {
    id: "github",
    name: "GitHub",
    description:
      "Gérez repos, issues, PRs, branches. Code search et file operations via le protocole MCP.",
    icon: "🐙",
    color: "#8b5cf6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: [secret("GITHUB_PERSONAL_ACCESS_TOKEN", "Personal Access Token")],
    category: "featured",
    popular: 2,
    npmPackage: "@modelcontextprotocol/server-github",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    tags: ["github", "git", "repos", "issues", "ci/cd"],
  },
  {
    id: "playwright",
    name: "Playwright",
    description:
      "Automatisation navigateur via MCP : screenshots, navigation, clics, remplissage de formulaires, scraping structuré.",
    icon: "🎭",
    color: "#45ba4b",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp"],
    category: "featured",
    popular: 3,
    npmPackage: "@playwright/mcp",
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    tags: ["browser", "automation", "scraping", "screenshots"],
  },
  {
    id: "memory",
    name: "Memory",
    description:
      "Mémoire persistante pour agents : knowledge graph avec entités, relations et observations.",
    icon: "🧠",
    color: "#8b5cf6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    category: "featured",
    popular: 4,
    npmPackage: "@modelcontextprotocol/server-memory",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    tags: ["memory", "knowledge-graph", "persistence"],
  },
  {
    id: "desktop-commander",
    name: "Desktop Commander",
    description:
      "Contrôle desktop, fichiers, navigateur, terminal. Le MCP le plus complet pour l'automatisation locale.",
    icon: "🖥️",
    color: "#10b981",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@wonderwhy-er/desktop-commander-mcp"],
    category: "featured",
    popular: 5,
    npmPackage: "@wonderwhy-er/desktop-commander-mcp",
    docsUrl: "https://github.com/wonderwhy-er/DesktopCommanderMCP",
    tags: ["filesystem", "browser", "terminal", "automation"],
  },

  // ── IA & LLM ───────────────────────────────────────────────────────────
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
    tags: ["claude", "code", "sandbox"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description:
      "Recherchez modèles, datasets, papers et Spaces sur le Hub HF. Inférences via l'API.",
    icon: "🤗",
    color: "#ff9d00",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@huggingface/mcp-server"],
    env: [secret("HF_TOKEN", "Hugging Face Token", false)],
    category: "ai",
    npmPackage: "@huggingface/mcp-server",
    docsUrl: "https://huggingface.co/docs",
    tags: ["models", "datasets", "papers", "inference"],
  },
  {
    id: "ollama",
    name: "Ollama",
    description:
      "Gérez vos modèles locaux : list, pull, run, chat. Proxy d'inférence locale.",
    icon: "🦙",
    color: "#a3a3a3",
    transport: "streamable-http",
    url: "http://localhost:11434",
    category: "ai",
    docsUrl: "https://ollama.com/",
    tags: ["local", "llm", "inference"],
  },
  {
    id: "minimax",
    name: "MiniMax MCP",
    description:
      "TTS, génération d'images, vidéos Hailuo, musique, voice clone & design via l'API MiniMax.",
    icon: "🎙️",
    color: "#6366f1",
    transport: "stdio",
    command: "npx",
    args: ["-y", "minimax-mcp-js"],
    env: [
      secret("MINIMAX_API_KEY", "API Key"),
      text("MINIMAX_API_HOST", "API Host", false),
    ],
    category: "ai",
    popular: 6,
    npmPackage: "minimax-mcp-js",
    docsUrl: "https://github.com/MiniMax-AI/MiniMax-MCP-JS",
    tags: ["tts", "image", "video", "voice"],
  },
  {
    id: "context7",
    name: "Context7",
    description:
      "Documentation technique à jour pour n'importe quelle library. Resolve library ID + fetch docs en temps réel.",
    icon: "📚",
    color: "#00c853",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    env: [secret("CONTEXT7_API_KEY", "API Key (upstash.com)", false)],
    category: "docs",
    popular: 7,
    npmPackage: "@upstash/context7-mcp",
    docsUrl: "https://context7.com/",
    tags: ["documentation", "docs", "llm", "libraries"],
  },

  // ── Dev Tools ────────────────────────────────────────────────────────────
  {
    id: "docker",
    name: "Docker",
    description:
      "Gérez conteneurs, images et volumes. Listez, démarrez, stoppez et inspectez les conteneurs.",
    icon: "🐳",
    color: "#2496ed",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-docker"],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-docker",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["docker", "containers", "devops"],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description:
      "Requêtez et explorez vos bases PostgreSQL. Schéma introspection, SELECT, analyse de données.",
    icon: "🐘",
    color: "#336791",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    env: [secret("POSTGRES_URL", "Connection String")],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-postgres",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    tags: ["postgresql", "database", "sql"],
  },
  {
    id: "redis",
    name: "Redis",
    description:
      "Accédez à vos données Redis : GET, SET, KEYS, HGETALL. Monitoring et cache management.",
    icon: "🔴",
    color: "#dc382d",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-redis"],
    env: [secret("REDIS_URL", "Redis URL")],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-redis",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["redis", "cache", "database"],
  },
  {
    id: "git",
    name: "Git",
    description:
      "Opérations Git : log, diff, blame, branch, status. Inspectez l'historique de vos repositories.",
    icon: "📝",
    color: "#f05032",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git"],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-git",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    tags: ["git", "version-control"],
  },
  {
    id: "sentry",
    name: "Sentry",
    description:
      "Récupérez erreurs et crashs depuis Sentry. Analysez les stack traces et identifiez les régressions.",
    icon: "🛡️",
    color: "#362d59",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    env: [secret("SENTRY_AUTH_TOKEN", "Auth Token")],
    category: "dev",
    npmPackage: "@sentry/mcp-server",
    docsUrl: "https://docs.sentry.io/",
    tags: ["sentry", "errors", "monitoring"],
  },

  // ── Data & Search ──────────────────────────────────────────────────────
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Recherche web via l'API Brave Search. Résultats structurés : web + news + images.",
    icon: "🦁",
    color: "#fb542b",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: [secret("BRAVE_API_KEY", "Brave API Key")],
    category: "data",
    npmPackage: "@modelcontextprotocol/server-brave-search",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    tags: ["search", "web", "brave"],
  },
  {
    id: "fetch",
    name: "Fetch",
    description:
      "Récupérez le contenu de n'importe quelle URL. Convertit HTML en Markdown ou texte brut.",
    icon: "🌍",
    color: "#3b82f6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    category: "data",
    npmPackage: "@modelcontextprotocol/server-fetch",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    tags: ["fetch", "url", "markdown", "scraping"],
  },
  {
    id: "apify",
    name: "Apify",
    description:
      "Milliers de scrapers et actors depuis l'Apify Store. Web scraping à grande échelle via MCP.",
    icon: "🕷️",
    color: "#97d700",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@apify/actors-mcp-server"],
    env: [secret("APIFY_TOKEN", "Apify Token")],
    category: "data",
    npmPackage: "@apify/actors-mcp-server",
    docsUrl: "https://docs.apify.com/",
    tags: ["scraping", "actors", "data-extraction"],
  },

  // ── Browser & Automation ─────────────────────────────────────────────────
  {
    id: "puppeteer",
    name: "Puppeteer",
    description:
      "Automatisation Chrome headless : screenshots, génération PDF, formulaires, scraping.",
    icon: "🤖",
    color: "#00d8a2",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    category: "browser",
    npmPackage: "@modelcontextprotocol/server-puppeteer",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    tags: ["browser", "chrome", "headless", "pdf"],
  },
  {
    id: "computer-use-anthropic",
    name: "Computer Use (Anthropic)",
    description:
      "Contrôle complet du bureau via l'API Claude Computer Use : screenshots, souris, clavier, scroll.",
    icon: "🖱️",
    color: "#d97706",
    transport: "streamable-http",
    url: "http://localhost:4000/api/computer-use",
    category: "browser",
    docsUrl:
      "https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool",
    tags: ["computer-use", "desktop", "automation"],
  },

  // ── Cloud & Storage ──────────────────────────────────────────────────────
  {
    id: "aws",
    name: "AWS",
    description:
      "Gérez vos ressources AWS : S3, Lambda, EC2, CloudWatch. CLI AWS encapsulée en MCP.",
    icon: "☁️",
    color: "#ff9900",
    transport: "stdio",
    command: "npx",
    args: ["-y", "aws-mcp-server"],
    env: [
      secret("AWS_ACCESS_KEY_ID", "Access Key ID"),
      secret("AWS_SECRET_ACCESS_KEY", "Secret Access Key"),
      text("AWS_REGION", "Region", false),
    ],
    category: "cloud",
    npmPackage: "aws-mcp-server",
    docsUrl: "https://docs.aws.amazon.com/",
    tags: ["aws", "s3", "lambda", "cloud"],
  },
  {
    id: "supabase",
    name: "Supabase",
    description:
      "Requêtez et gérez vos projets Supabase : database, auth, storage, edge functions.",
    icon: "⚡",
    color: "#3ecf8e",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@supabase/mcp-server"],
    env: [
      text("SUPABASE_URL", "Supabase URL"),
      secret("SUPABASE_SERVICE_KEY", "Service Key"),
    ],
    category: "cloud",
    npmPackage: "@supabase/mcp-server",
    docsUrl: "https://supabase.com/docs",
    tags: ["supabase", "database", "auth", "storage"],
  },

  // ── Productivité ───────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    description:
      "Envoyez et lisez des messages Slack, gérez les channels et répondez aux threads.",
    icon: "💬",
    color: "#4a154b",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: [secret("SLACK_BOT_TOKEN", "Bot Token (xoxb-...)")],
    category: "productivity",
    npmPackage: "@modelcontextprotocol/server-slack",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    tags: ["slack", "messaging", "channels"],
  },
  {
    id: "notion",
    name: "Notion",
    description:
      "Lisez et éditez des pages et databases Notion. Sync bidirectionnel de contenu.",
    icon: "📝",
    color: "#a3a3a3",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: [secret("NOTION_TOKEN", "Integration Token")],
    category: "productivity",
    npmPackage: "@notionhq/notion-mcp-server",
    docsUrl: "https://developers.notion.com/",
    tags: ["notion", "wiki", "docs", "database"],
  },
  {
    id: "windows-mcp",
    name: "Windows MCP",
    description:
      "Contrôlez Windows : PowerShell, fichiers, fenêtres, applications. Mode local ou cloud sandbox.",
    icon: "🪟",
    color: "#0078d4",
    transport: "stdio",
    command: "npx",
    args: ["-y", "windows-mcp-server"],
    category: "system",
    npmPackage: "windows-mcp-server",
    docsUrl: "https://windowsmcp.io/",
    tags: ["windows", "powershell", "desktop"],
  },

  // ── Google ───────────────────────────────────────────────────────────────
  {
    id: "google-workspace",
    name: "Google Workspace",
    description:
      "Gmail, Drive, Calendar, Docs, Sheets, Slides. Automatisez votre suite Google.",
    icon: "🔵",
    color: "#4285f4",
    transport: "sse",
    url: "https://google-workspace-mcp.example.com/sse",
    env: [
      text("GOOGLE_CLIENT_ID", "Client ID"),
      secret("GOOGLE_CLIENT_SECRET", "Client Secret"),
      secret("GOOGLE_REFRESH_TOKEN", "Refresh Token"),
    ],
    category: "google",
    docsUrl: "https://developers.google.com/workspace",
    tags: ["gmail", "drive", "calendar", "docs", "sheets"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description:
      "Listez, recherchez, importez et exportez des fichiers depuis Google Drive via MCP.",
    icon: "📁",
    color: "#4285f4",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    env: [
      text("GOOGLE_CLIENT_ID", "Client ID"),
      secret("GOOGLE_CLIENT_SECRET", "Client Secret"),
    ],
    category: "google",
    npmPackage: "@modelcontextprotocol/server-gdrive",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive",
    tags: ["drive", "files", "google"],
  },
  {
    id: "bigquery",
    name: "Google BigQuery",
    description:
      "Interrogez vos données massives dans BigQuery avec SQL. Analyse et reporting automatisé.",
    icon: "📊",
    color: "#669df6",
    transport: "sse",
    url: "https://bigquery-mcp.example.com/sse",
    env: [
      text("GOOGLE_APPLICATION_CREDENTIALS", "Service Account JSON (chemin)"),
      text("BIGQUERY_PROJECT_ID", "Project ID"),
    ],
    category: "google",
    docsUrl: "https://cloud.google.com/bigquery/docs",
    tags: ["bigquery", "sql", "analytics", "data"],
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description:
      "Geocoding, itinéraires, Places, Distance Matrix. Intégrez la géolocalisation dans vos agents.",
    icon: "🗺️",
    color: "#34a853",
    transport: "sse",
    url: "https://google-maps-mcp.example.com/sse",
    env: [secret("GOOGLE_MAPS_API_KEY", "API Key")],
    category: "google",
    docsUrl: "https://developers.google.com/maps",
    tags: ["maps", "geocoding", "directions", "places"],
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    description:
      "Récupérez et analysez vos données GA4. Rapports automatisés et insights.",
    icon: "📈",
    color: "#f9ab00",
    transport: "sse",
    url: "https://google-analytics-mcp.example.com/sse",
    env: [
      text("GA4_PROPERTY_ID", "Property ID"),
      text("GOOGLE_APPLICATION_CREDENTIALS", "Service Account JSON (chemin)"),
    ],
    category: "google",
    docsUrl: "https://developers.google.com/analytics",
    tags: ["analytics", "ga4", "reporting"],
  },

  // ── Marketing ──────────────────────────────────────────────────────────
  {
    id: "meta-marketing",
    name: "Meta Marketing API",
    description:
      "Gérez vos campagnes Facebook & Instagram Ads, audiences, rapports de performance et creative studio.",
    icon: "📣",
    color: "#1877f2",
    transport: "sse",
    url: "https://mcp.facebook.com/sse",
    env: [
      secret("META_ACCESS_TOKEN", "Access Token"),
      text("META_APP_ID", "App ID"),
      secret("META_APP_SECRET", "App Secret"),
      text("META_AD_ACCOUNT_ID", "Ad Account ID", false),
    ],
    category: "marketing",
    docsUrl: "https://developers.facebook.com/docs/marketing-apis",
    tags: ["facebook", "instagram", "ads", "marketing"],
  },
  {
    id: "meta-graph",
    name: "Meta Graph API",
    description:
      "Accès complet au Graph API Facebook : pages, posts, comments, messenger, insights.",
    icon: "👥",
    color: "#1877f2",
    transport: "sse",
    url: "https://mcp.facebook.com/graph/sse",
    env: [
      secret("META_ACCESS_TOKEN", "Access Token"),
      text("META_APP_ID", "App ID"),
    ],
    category: "marketing",
    docsUrl: "https://developers.facebook.com/docs/graph-api/",
    tags: ["facebook", "graph-api", "pages", "messenger"],
  },

  // ── Design ─────────────────────────────────────────────────────────────
  {
    id: "canva",
    name: "Canva MCP",
    description:
      "Générez des designs, présentations, posts réseaux sociaux via l'API Canva. Templates et brand kit.",
    icon: "🎨",
    color: "#00c4cc",
    transport: "sse",
    url: "https://mcp.canva.com/sse",
    env: [
      secret("CANVA_API_KEY", "API Key"),
      text("CANVA_TEAM_ID", "Team ID", false),
    ],
    category: "design",
    docsUrl: "https://www.canva.dev/docs/mcp/",
    tags: ["canva", "design", "graphics", "templates"],
  },
  {
    id: "adobe-suite",
    name: "Adobe Suite",
    description:
      "Serveur MCP unifié pour Adobe Creative Suite : Photoshop, Premiere Pro, Illustrator, InDesign.",
    icon: "🖌️",
    color: "#ff0000",
    transport: "stdio",
    command: "adobe-photoshop",
    category: "design",
    docsUrl: "https://github.com/stewberticus/adobe-mcp",
    tags: ["adobe", "photoshop", "premiere", "design"],
  },

  // ── Vidéo ──────────────────────────────────────────────────────────────
  {
    id: "capcut",
    name: "CapCut",
    description:
      "Contrôlez CapCut/剪映 via MCP : créez des drafts, ajoutez vidéos, audio, textes, sous-titres, effets, exportez.",
    icon: "🎬",
    color: "#00e5ff",
    transport: "streamable-http",
    url: "http://localhost:9000/mcp",
    category: "video",
    docsUrl: "https://github.com/fancyboi999/capcut-mcp",
    tags: ["capcut", "video", "editing", "subtitles"],
  },
  {
    id: "premiere-pro",
    name: "Premiere Pro",
    description:
      "269 outils pour contrôler Adobe Premiere Pro : timeline, effets, keyframes, export, color grading, audio.",
    icon: "🎞️",
    color: "#9999ff",
    transport: "stdio",
    command: "npx",
    args: ["-y", "premiere-pro-mcp"],
    env: [text("PREMIERE_TEMP_DIR", "Dossier temporaire", false)],
    category: "video",
    npmPackage: "premiere-pro-mcp",
    docsUrl: "https://github.com/leancoderkavy/premiere-pro-mcp",
    tags: ["premiere", "video", "editing", "timeline"],
  },
  {
    id: "higgsfield",
    name: "Higgsfield",
    description:
      "Création de vidéos IA, avatars virtuels, contenus vidéo personnalisés.",
    icon: "🎥",
    color: "#8b5cf6",
    transport: "sse",
    url: "https://mcp.higgsfield.ai/sse",
    env: [secret("HIGGSFIELD_API_KEY", "API Key")],
    category: "video",
    docsUrl: "https://higgsfield.ai/mcp",
    tags: ["video", "ai", "avatars"],
  },

  // ── CMS & E-commerce ─────────────────────────────────────────────────────
  {
    id: "easy-mcp-ai",
    name: "Easy MCP AI (WordPress)",
    description:
      "Le serveur MCP WordPress le plus complet : 204 outils (posts, WooCommerce, SEO, GA, Semrush). OAuth one-click.",
    icon: "📰",
    color: "#21759b",
    transport: "sse",
    url: "https://your-site.com/wp-json/easy-mcp-ai/v1/mcp",
    env: [
      text("WP_SITE_URL", "WordPress Site URL"),
      secret("WP_BEARER_TOKEN", "Bearer Token", false),
    ],
    category: "cms",
    docsUrl: "https://wordpress.org/plugins/easy-mcp-ai/",
    tags: ["wordpress", "woocommerce", "seo", "cms"],
  },
  {
    id: "wordpress-adapter",
    name: "WordPress MCP Adapter",
    description:
      "Adapter officiel WordPress. Transforme les Abilities API en outils MCP : posts, pages, media, users, menus.",
    icon: "🅦",
    color: "#21759b",
    transport: "sse",
    url: "https://your-site.com/wp-json/mcp/v1/sse",
    env: [
      text("WP_SITE_URL", "WordPress Site URL"),
      text("WP_MCP_NAMESPACE", "MCP Namespace", false),
    ],
    category: "cms",
    docsUrl: "https://github.com/WordPress/mcp-adapter",
    tags: ["wordpress", "cms", "posts", "pages"],
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    description:
      "46 outils WooCommerce : produits, commandes, clients, coupons, livraison, paiements, rapports ventes.",
    icon: "🛒",
    color: "#7f54b3",
    transport: "sse",
    url: "https://your-site.com/wp-json/easy-mcp-ai/v1/mcp",
    env: [
      text("WP_SITE_URL", "WordPress Site URL"),
      secret("WP_BEARER_TOKEN", "Bearer Token"),
    ],
    category: "cms",
    docsUrl: "https://woocommerce.com/documentation/",
    tags: ["woocommerce", "ecommerce", "products", "orders"],
  },

  // ── Additional Connectors ────────────────────────────────────────────────
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description:
      "Raisonnement structuré pas-a-pas pour les LLM. Decomposition de problemes complexes, chain-of-thought dynamique et revision.",
    icon: "🧩",
    color: "#8b5cf6",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    category: "ai",
    popular: 8,
    npmPackage: "@modelcontextprotocol/server-sequential-thinking",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["thinking", "reasoning", "chain-of-thought", "planning"],
  },
  {
    id: "everything",
    name: "MCP Everything (Test)",
    description:
      "Serveur de reference MCP avec tous les types de contenu : tools, resources, prompts, sampling. Ideal pour tester vos integrations.",
    icon: "🧪",
    color: "#a1a1aa",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    category: "dev",
    npmPackage: "@modelcontextprotocol/server-everything",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["testing", "reference", "tools", "resources"],
  },
  {
    id: "sqlite",
    name: "SQLite",
    description:
      "Requetez et modifiez des bases SQLite locales. Schema introspection, INSERT/UPDATE, analyse de donnees.",
    icon: "🗃️",
    color: "#003b57",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite"],
    env: [text("SQLITE_DB_PATH", "Chemin vers le fichier .db", false)],
    category: "data",
    npmPackage: "@modelcontextprotocol/server-sqlite",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    tags: ["sqlite", "database", "sql", "local"],
  },
  {
    id: "time",
    name: "Time",
    description:
      "Obtenez l heure actuelle dans n importe quel fuseau horaire. Conversion entre formats de date et calculs de duree.",
    icon: "⏰",
    color: "#6366f1",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-time"],
    category: "productivity",
    npmPackage: "@modelcontextprotocol/server-time",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["time", "timezone", "date", "scheduling"],
  },
  {
    id: "stripe",
    name: "Stripe",
    description:
      "Gerez paiements, customers, subscriptions et invoices via l API Stripe. Webhooks et refund inclus.",
    icon: "💳",
    color: "#635bff",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-stripe"],
    env: [
      secret("STRIPE_SECRET_KEY", "Stripe Secret Key (sk_...)"),
    ],
    category: "cloud",
    npmPackage: "@anthropic/mcp-stripe",
    docsUrl: "https://docs.stripe.com/",
    tags: ["stripe", "payments", "subscriptions", "billing"],
  },
  {
    id: "linear",
    name: "Linear",
    description:
      "Gerez issues, projects et cycles dans Linear. Creation, mise a jour et recherche de tickets.",
    icon: "📐",
    color: "#5e6ad2",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-linear"],
    env: [secret("LINEAR_API_KEY", "Linear API Key")],
    category: "productivity",
    npmPackage: "mcp-linear",
    docsUrl: "https://linear.app/",
    tags: ["linear", "issues", "project-management", "tickets"],
  },
  {
    id: "jira",
    name: "Jira",
    description:
      "Creez et suivez des tickets Jira, gerez les sprints et les boards. Recherche avancee JQL.",
    icon: "📋",
    color: "#0052cc",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-atlassian"],
    env: [
      text("JIRA_BASE_URL", "Jira URL (https://xxx.atlassian.net)"),
      secret("JIRA_API_TOKEN", "Jira API Token"),
      text("JIRA_USER_EMAIL", "Jira User Email"),
    ],
    category: "productivity",
    npmPackage: "@anthropic/mcp-atlassian",
    docsUrl: "https://www.atlassian.com/",
    tags: ["jira", "issues", "agile", "project-management"],
  },
  {
    id: "confluence",
    name: "Confluence",
    description:
      "Recherchez et creez des pages Confluence. Acces au wiki d entreprise et gestion de contenu.",
    icon: "📘",
    color: "#172b4d",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@anthropic/mcp-atlassian"],
    env: [
      text("CONFLUENCE_BASE_URL", "Confluence URL"),
      secret("CONFLUENCE_API_TOKEN", "Confluence API Token"),
      text("CONFLUENCE_USER_EMAIL", "Confluence User Email"),
    ],
    category: "productivity",
    npmPackage: "@anthropic/mcp-atlassian",
    docsUrl: "https://www.atlassian.com/",
    tags: ["confluence", "wiki", "documentation", "atlassian"],
  },
  {
    id: "shopify",
    name: "Shopify",
    description:
      "Gerez produits, commandes, clients et inventory sur Shopify. Analytics et discount codes.",
    icon: "🛍️",
    color: "#96bf48",
    transport: "sse",
    url: "https://shopify-mcp.example.com/sse",
    env: [
      text("SHOPIFY_SHOP_DOMAIN", "Shop domain (xxx.myshopify.com)"),
      secret("SHOPIFY_ACCESS_TOKEN", "Shopify Access Token"),
    ],
    category: "cms",
    docsUrl: "https://shopify.dev/",
    tags: ["shopify", "ecommerce", "products", "orders"],
  },
  {
    id: "discord",
    name: "Discord",
    description:
      "Envoyez des messages, lisez les channels et gerez les serveurs Discord via le Bot API.",
    icon: "🎮",
    color: "#5865f2",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-discord"],
    env: [secret("DISCORD_BOT_TOKEN", "Discord Bot Token")],
    category: "productivity",
    npmPackage: "mcp-discord",
    docsUrl: "https://discord.com/developers/docs",
    tags: ["discord", "messaging", "communities", "bots"],
  },
  {
    id: "airtable",
    name: "Airtable",
    description:
      "Lisez et ecrivez dans vos bases Airtable. Recherche, filtres et creation d enregistrements.",
    icon: "📊",
    color: "#18bfff",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-airtable"],
    env: [
      secret("AIRTABLE_API_KEY", "Airtable Personal Access Token"),
      text("AIRTABLE_BASE_ID", "Base ID (appXX...)"),
    ],
    category: "data",
    npmPackage: "mcp-airtable",
    docsUrl: "https://airtable.com/developers",
    tags: ["airtable", "database", "spreadsheet", "no-code"],
  },
  {
    id: "exa",
    name: "Exa (Neural Search)",
    description:
      "Recherche semantique AI-powered : trouve des pages web par contenu, pas par keywords. Ideal pour le research avance.",
    icon: "🔍",
    color: "#7c3aed",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-exa"],
    env: [secret("EXA_API_KEY", "Exa API Key")],
    category: "data",
    npmPackage: "mcp-exa",
    docsUrl: "https://exa.ai/",
    tags: ["search", "neural", "semantic", "research"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description:
      "Generez du texte, des images et des embeddings via l API OpenAI. GPT-4o, DALL-E, Whisper.",
    icon: "✨",
    color: "#10a37f",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@openai/mcp"],
    env: [secret("OPENAI_API_KEY", "OpenAI API Key")],
    category: "ai",
    popular: 9,
    npmPackage: "@openai/mcp",
    docsUrl: "https://platform.openai.com/",
    tags: ["openai", "gpt-4o", "dall-e", "embeddings"],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description:
      "Synthese vocale et clone de voix AI. Generez du speech naturel en 29 langues, voice cloning, sound effects.",
    icon: "🎙️",
    color: "#000000",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-elevenlabs"],
    env: [secret("ELEVENLABS_API_KEY", "ElevenLabs API Key")],
    category: "ai",
    npmPackage: "mcp-elevenlabs",
    docsUrl: "https://elevenlabs.io/",
    tags: ["tts", "speech", "voice", "audio", "clone"],
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description:
      "Scraping web AI-powered : convertit n importe quelle page en Markdown propre. Supporte JavaScript rendering et batch crawl.",
    icon: "🔥",
    color: "#ef4444",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-firecrawl"],
    env: [secret("FIRECRAWL_API_KEY", "Firecrawl API Key")],
    category: "data",
    npmPackage: "mcp-firecrawl",
    docsUrl: "https://firecrawl.dev/",
    tags: ["scraping", "crawl", "markdown", "web", "extraction"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description:
      "Automatisez LinkedIn : recherche de profils, posts, jobs et networking. Scraping et analyse de donnees.",
    icon: "💼",
    color: "#0a66c2",
    transport: "sse",
    url: "https://linkedin-mcp.example.com/sse",
    env: [secret("LINKEDIN_ACCESS_TOKEN", "LinkedIn Access Token")],
    category: "marketing",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/",
    tags: ["linkedin", "professional", "networking", "jobs"],
  },
  {
    id: "google-cloud-sql",
    name: "Google Cloud SQL",
    description:
      "Connectez-vous a vos bases PostgreSQL/MySQL managees sur Google Cloud. Proxy Cloud SQL integre.",
    icon: "🗃️",
    color: "#4285f4",
    transport: "sse",
    url: "https://cloudsql-mcp.example.com/sse",
    env: [
      text("CLOUDSQL_INSTANCE", "Instance Connection Name"),
      text("CLOUDSQL_DATABASE", "Database"),
      text("CLOUDSQL_USER", "User"),
      secret("CLOUDSQL_PASSWORD", "Password"),
    ],
    category: "cloud",
    docsUrl: "https://cloud.google.com/sql/docs",
    tags: ["cloud-sql", "database", "postgresql", "mysql", "google"],
  },
  {
    id: "google-security-ops",
    name: "Google Security Operations",
    description:
      "SIEM Chronicle, detection de menaces, investigation securite. Analyse de logs et threat intelligence.",
    icon: "🛡️",
    color: "#ea4335",
    transport: "sse",
    url: "https://google-security-mcp.example.com/sse",
    env: [
      text("CHRONICLE_CUSTOMER_ID", "Customer ID"),
      secret("CHRONICLE_API_KEY", "API Key"),
    ],
    category: "dev",
    docsUrl: "https://cloud.google.com/chronicle/docs",
    tags: ["security", "siem", "chronicle", "threat", "google"],
  },
{
    id: 'stripe-billing',
    name: 'Stripe Billing',
    description:
      'Subscriptions, invoices, usage-based billing et customer portal via Stripe Billing.',
    icon: '💰',
    color: '#635bff',
    transport: 'stdio',
    command: 'npx',
    args: ['mcp-stripe-billing'],
    env: [secret('STRIPE_SECRET_KEY', 'Stripe Secret Key (sk_...)')],
    category: 'cloud',
    npmPackage: 'mcp-stripe-billing',
    docsUrl: 'https://docs.stripe.com/billing',
    tags: ['stripe', 'billing', 'subscriptions', 'invoices'],
  },

  // ── Video & Animation ─────────────────────────────────────────────────────
  {
    id: 'remotion',
    name: 'Remotion',
    description:
      'Crée des vidéos programmatically avec React. Rendu MP4, compositions, animations, thumbnails. Intégration FFmpeg.',
    icon: '🎬',
    color: '#ff0057',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'remotion-mcp-server'],
    env: [
      text('REMOTION_TEMPLATE_DIR', 'Dossier des templates Remotion', false),
      text('REMOTION_OUTPUT_DIR', 'Dossier de sortie vidéo', false),
    ],
    category: 'video',
    npmPackage: 'remotion-mcp-server',
    docsUrl: 'https://www.remotion.dev/',
    tags: ['video', 'react', 'animation', 'rendering', 'ffmpeg'],
  },
  {
    id: 'remotion-skills',
    name: 'Remotion Skills',
    description:
      'Skills Remotion pour agents IA : génération de vidéos, templates dynamiques, rendering cloud. API complète pour automation vidéo.',
    icon: '✨',
    color: '#ff0057',
    transport: 'streamable-http',
    url: 'https://skills.remotion.dev/mcp',
    env: [secret('REMOTION_SKILLS_API_KEY', 'Remotion Skills API Key')],
    category: 'video',
    docsUrl: 'https://github.com/remotion-dev/skills',
    tags: ['remotion', 'skills', 'video', 'templates', 'cloud-rendering'],
  },
  {
    id: 'heygen-hyperframes',
    name: 'Heygen Hyperframes',
    description:
      'Crée des frames vidéo interactives avec Heygen. Avatars AI, overlays, QR codes, call-to-action dynamiques.',
    icon: '🖼️',
    color: '#00d4ff',
    transport: 'streamable-http',
    url: 'https://api.heygen.com/hyperframes/mcp',
    env: [
      secret('HEYGEN_API_KEY', 'Heygen API Key'),
      text('HEYGEN_WORKSPACE_ID', 'Workspace ID', false),
    ],
    category: 'video',
    docsUrl: 'https://hyperframes.heygen.com/',
    tags: ['heygen', 'hyperframes', 'avatar', 'interactive', 'video'],
  },

  // ── Musique & Audio ──────────────────────────────────────────────────────────
  {
    id: "ableton-mcp",
    name: "Ableton Live MCP",
    description:
      "Contrôle Ableton Live directement via Claude : créer des pistes MIDI/audio, éditer des clips, charger des instruments, ajuster le tempo, déclencher des scènes. Requiert le Remote Script AbletonMCP installé dans Ableton.",
    icon: "🎛️",
    color: "#ff6b35",
    transport: "stdio",
    command: "uvx",
    args: ["ableton-mcp"],
    category: "music",
    popular: undefined,
    docsUrl: "https://github.com/ahujasid/ableton-mcp",
    tags: [
      "ableton",
      "music",
      "midi",
      "daw",
      "live",
      "production",
      "remote-script",
      "uvx",
    ],
  },
  {
    id: "ableton-osc",
    name: "AbletonOSC",
    description:
      "Remote Script OSC bas-niveau pour Ableton Live 11+ : expose l'intégralité du Live Object Model via OSC (port 11000). Contrôle pistes, clips, devices, tempo, scènes avec wildcards et listeners temps réel. Installation manuelle du Remote Script requise.",
    icon: "🎚️",
    color: "#a855f7",
    transport: "stdio",
    command: "python3",
    args: ["-m", "ableton_osc_bridge"],
    category: "music",
    docsUrl: "https://github.com/ideoforms/AbletonOSC",
    tags: [
      "ableton",
      "osc",
      "live-object-model",
      "midi",
      "remote-script",
      "realtime",
      "python",
    ],
  },
];

/** Lookup a catalog entry by id. */
export function getCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}
