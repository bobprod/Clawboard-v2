import { useState, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Settings,
  Server,
  Key,
  User,
  Bell,
  Shield,
  Save,
  Check,
  Loader2,
  Trash2,
  ExternalLink,
  RefreshCw,
  Zap,
  AlertTriangle,
  Wifi,
  WifiOff,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Send,
  MessageSquare,
  Mail,
  Webhook,
  Download,
  HardDrive,
  ChevronRight,
  X,
  CheckCircle2,
  Puzzle,
  Radio,
  Wrench,
  BarChart2,
  Package,
  Plug,
  ToyBrick,
  Info,
} from "lucide-react";
import { useApiKeys } from "../hooks/useApiKeys";
import { apiFetch } from "../lib/apiFetch";

// Heavy capability modules — lazy-loaded so they don't bloat the settings chunk
const McpModule = lazy(() =>
  import("./McpModule").then((m) => ({ default: m.McpModule })),
);
const SkillsModule = lazy(() =>
  import("./SkillsModule").then((m) => ({ default: m.SkillsModule })),
);
const ToolsModule = lazy(() =>
  import("./ToolsModule").then((m) => ({ default: m.ToolsModule })),
);

// ─── Provider catalogue ───────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  shortName?: string;
  category: string;
  color: string;
  logo: string; // emoji fallback
  keyPrefix?: string; // hint for key format
  docsUrl: string;
  models: string[];
}

const PROVIDERS: Provider[] = [
  // ── Tier 1 — International AI labs
  {
    id: "anthropic",
    name: "Anthropic",
    category: "International",
    color: "#d97757",
    logo: "🤖",
    keyPrefix: "sk-ant-",
    docsUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "International",
    color: "#10a37f",
    logo: "🧠",
    keyPrefix: "sk-",
    docsUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    shortName: "Gemini",
    category: "International",
    color: "#4285f4",
    logo: "✨",
    keyPrefix: "AIza",
    docsUrl: "https://aistudio.google.com/app/apikey",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    shortName: "Mistral",
    category: "International",
    color: "#ff7000",
    logo: "💨",
    docsUrl: "https://console.mistral.ai/api-keys/",
    models: [
      "mistral-large-latest",
      "mistral-small-latest",
      "codestral-latest",
    ],
  },
  {
    id: "cohere",
    name: "Cohere",
    category: "International",
    color: "#39594d",
    logo: "🔷",
    docsUrl: "https://dashboard.cohere.com/api-keys",
    models: ["command-r-plus", "command-r", "command"],
  },
  {
    id: "xai",
    name: "xAI / Grok",
    shortName: "xAI",
    category: "International",
    color: "#1da1f2",
    logo: "𝕏",
    keyPrefix: "xai-",
    docsUrl: "https://console.x.ai/",
    models: ["grok-2-latest", "grok-beta"],
  },

  // ── Tier 2 — Asie & nouvelles frontières
  {
    id: "moonshot",
    name: "MoonShot (Kimi)",
    shortName: "Kimi",
    category: "Asie",
    color: "#1677ff",
    logo: "🌙",
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    models: ["kimi-k2", "moonshot-v1-128k", "moonshot-v1-32k"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "Asie",
    color: "#0070f3",
    logo: "🌊",
    keyPrefix: "sk-",
    docsUrl: "https://platform.deepseek.com/api_keys",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
  },
  {
    id: "qwen",
    name: "Alibaba Qwen",
    shortName: "Qwen",
    category: "Asie",
    color: "#ff6a00",
    logo: "🏔️",
    docsUrl: "https://bailian.console.aliyun.com/",
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen2.5-72b-instruct"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    category: "Asie",
    color: "#7c3aed",
    logo: "⚡",
    docsUrl:
      "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    models: ["abab6.5s-chat", "abab6.5g-chat", "abab5.5-chat"],
  },
  {
    id: "baidu",
    name: "Baidu ERNIE",
    shortName: "ERNIE",
    category: "Asie",
    color: "#2932e1",
    logo: "🐻",
    docsUrl:
      "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application",
    models: ["ERNIE-4.0-8K", "ERNIE-3.5-8K"],
  },
  {
    id: "zhipu",
    name: "Zhipu AI (GLM)",
    shortName: "GLM",
    category: "Asie",
    color: "#0066ff",
    logo: "🧿",
    docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: ["glm-4", "glm-4-flash", "glm-3-turbo"],
  },

  // ── Tier 3 — Infrastructure & agrégateurs
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "Agrégateurs",
    color: "#6d28d9",
    logo: "🔀",
    keyPrefix: "sk-or-",
    docsUrl: "https://openrouter.ai/settings/keys",
    models: ["openrouter/auto", "300+ modèles disponibles"],
  },
  {
    id: "huggingface",
    name: "HuggingFace",
    shortName: "HF",
    category: "Agrégateurs",
    color: "#ff9d00",
    logo: "🤗",
    keyPrefix: "hf_",
    docsUrl: "https://huggingface.co/settings/tokens",
    models: ["Inference API", "Serverless endpoints"],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    shortName: "NVIDIA",
    category: "Agrégateurs",
    color: "#76b900",
    logo: "⚙️",
    keyPrefix: "nvapi-",
    docsUrl: "https://build.nvidia.com/settings/api-key",
    models: [
      "MiniMax M2.5 · GLM-5 · Kimi K2.5 · DeepSeek R1 · Qwen3 Coder · Llama 4 · +150 modèles",
    ],
  },
  {
    id: "together",
    name: "Together AI",
    shortName: "Together",
    category: "Agrégateurs",
    color: "#e11d48",
    logo: "🤝",
    docsUrl: "https://api.together.ai/settings/api-keys",
    models: ["Llama-3.3-70B", "Mixtral-8x22B", "Qwen2.5-72B"],
  },
  {
    id: "groq",
    name: "Groq",
    category: "Agrégateurs",
    color: "#f97316",
    logo: "⚡",
    keyPrefix: "gsk_",
    docsUrl: "https://console.groq.com/keys",
    models: ["llama-3.3-70b-versatile", "gemma2-9b-it", "mixtral-8x7b"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    category: "Agrégateurs",
    color: "#20b2aa",
    logo: "🔍",
    keyPrefix: "pplx-",
    docsUrl: "https://www.perplexity.ai/settings/api",
    models: ["sonar-pro", "sonar", "sonar-reasoning"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    shortName: "Cloudflare",
    category: "Agrégateurs",
    color: "#f38020",
    logo: "☁️",
    docsUrl: "https://dash.cloudflare.com/?to=/:account/ai/workers-ai/api-quick-start",
    models: ["Llama 3.1", "Mistral 7B", "Gemma", "Flux", "Whisper"],
  },
  {
    id: "cloudflare_account",
    name: "Cloudflare Account ID",
    shortName: "CF Account",
    category: "Agrégateurs",
    color: "#f38020",
    logo: "🆔",
    docsUrl: "https://dash.cloudflare.com/",
    models: ["Requis pour Cloudflare Workers AI"],
  },
];

const CATEGORIES = ["International", "Asie", "Agrégateurs"];

// ─── Settings sections ────────────────────────────────────────────────────────

type Section =
  | "mcp"
  | "skills"
  | "plugins"
  | "tools"
  | "server"
  | "apikeys"
  | "ollama"
  | "security"
  | "notifications"
  | "profile";

interface NavItem {
  id: Section;
  label: string;
  icon: any;
  badge?: () => number;
}

// Grouped navigation — Settings is the single hub for everything.
const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "Extensions & Capacités",
    items: [
      { id: "mcp", label: "MCP & Connecteurs", icon: Plug },
      { id: "skills", label: "Skills", icon: ToyBrick },
      { id: "plugins", label: "Plugins", icon: Puzzle },
      { id: "tools", label: "Outils Agent", icon: Wrench },
    ],
  },
  {
    group: "Configuration",
    items: [
      { id: "server", label: "Serveur & Connexions", icon: Server },
      { id: "apikeys", label: "Clés API & BYOK", icon: Key },
      { id: "ollama", label: "LLMs Locaux", icon: HardDrive },
      { id: "security", label: "Règles de Sécurité", icon: Shield },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    group: "Compte",
    items: [{ id: "profile", label: "Profil Utilisateur", icon: User }],
  },
];

// Flat list for lookups
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// "App-like" sections render their own full module (no boxed form panel).
const APP_SECTIONS = new Set<Section>(["mcp", "skills", "tools"]);

// Extension sections show a one-line clarifier so MCP / Skills / Plugins /
// Outils stay distinct and complementary in the user's mind.
const EXTENSION_HINTS: Partial<Record<Section, string>> = {
  mcp: "Outils externes branchés via le protocole MCP (filesystem, GitHub, APIs…). Complémentaire des Skills (compétences) et des Plugins (canaux).",
  skills: "Compétences/prompts réutilisables (rédaction, code, analyse…). Ce ne sont pas des outils : elles orientent le comportement de l'agent.",
  plugins: "Extensions du runtime OpenClaw : canaux de communication (Twitch, Matrix, Teams…), outils cœur et diagnostics. Différent des serveurs MCP.",
  tools: "Gouvernance des outils intégrés : profils, permissions allow/deny. Contrôle ce que les agents ont le droit d'exécuter.",
};

// ─── KeyRow component ─────────────────────────────────────────────────────────

const KeyRow = ({
  provider,
  value,
  onChange,
  onClear,
  backendConfigured = false,
}: {
  provider: Provider;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  backendConfigured?: boolean;
}) => {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(value);
  const hasLocal = value.trim().length > 0;
  const configured = hasLocal || backendConfigured;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleBlur = () => {
    if (draft !== value) onChange(draft);
  };

  const maskedValue = configured
    ? value.slice(0, 6) +
      "•".repeat(Math.max(0, Math.min(value.length - 10, 20))) +
      value.slice(-4)
    : "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 16px",
        borderRadius: 12,
        background: configured
          ? "rgba(16,185,129,0.04)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${configured ? "rgba(16,185,129,0.15)" : "var(--border-subtle)"}`,
        transition: "all 0.2s",
      }}
    >
      {/* Logo + name */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 170,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            flexShrink: 0,
            background: `${provider.color}18`,
            border: `1px solid ${provider.color}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.1rem",
          }}
        >
          {provider.logo}
        </div>
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: "0.85rem",
              color: "var(--text-primary)",
            }}
          >
            {provider.shortName || provider.name}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {provider.models.slice(0, 2).join(" · ")}
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{ flex: 1, position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={show ? draft : configured ? maskedValue : draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onFocus={() => {
            setShow(true);
            setDraft(value);
          }}
          onBlur={() => {
            setShow(false);
            handleBlur();
          }}
          placeholder={
            provider.keyPrefix
              ? `${provider.keyPrefix}…`
              : "Collez votre clé API…"
          }
          style={{
            width: "100%",
            padding: "9px 12px",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: "0.82rem",
            fontFamily: "var(--mono)",
            outline: "none",
            letterSpacing: show ? 0 : 1,
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.borderColor = "var(--brand-primary)";
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        />
      </div>

      {/* Status + actions */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      >
        {/* Status badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: 20,
            background: configured
              ? "rgba(16,185,129,0.12)"
              : "rgba(255,255,255,0.05)",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: configured ? "#10b981" : "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {hasLocal ? (
            <>
              <CheckCircle size={11} /> Configuré
            </>
          ) : backendConfigured ? (
            <>
              <CheckCircle size={11} /> Serveur
            </>
          ) : (
            <>Non configuré</>
          )}
        </div>

        {/* Docs link */}
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Obtenir une clé ${provider.name}`}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
            textDecoration: "none",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(59,130,246,0.1)";
            e.currentTarget.style.color = "#3b82f6";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <ExternalLink size={13} />
        </a>

        {/* Clear button */}
        {configured && (
          <button
            onClick={onClear}
            title="Effacer la clé"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.1)";
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── LLM Health Check ─────────────────────────────────────────────────────────

interface HealthResult {
  provider: string;
  status: string;
  latency?: number;
  error?: string;
  model?: string;
  preview?: string;
  models?: string[];
  modelsPath?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  nvidia: "NVIDIA NIM",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  moonshot: "Moonshot / Kimi",
  zhipu: "Zhipu (GLM)",
  ollama: "Ollama (local)",
};

const LLMHealthCheck = () => {
  const [results, setResults] = useState<HealthResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const data = (await apiFetch("/api/llm/health")) as {
        providers?: HealthResult[];
        ts?: number;
      };
      setResults(data.providers || []);
      setLastCheck(data.ts || Date.now());
    } catch {
      setResults([
        { provider: "system", status: "error", error: "Serveur inaccessible" },
      ]);
      setLastCheck(Date.now());
    }
    setLoading(false);
  };

  const statusColor = (s: string) => {
    if (s === "ok") return "#10b981";
    if (s === "empty") return "#f59e0b";
    if (s === "no-key") return "var(--text-muted)";
    if (s === "offline") return "#6b7280";
    return "#ef4444";
  };

  const statusLabel = (s: string) => {
    if (s === "ok") return "✓ OK";
    if (s === "empty") return "⚠ Aucun modèle";
    if (s === "no-key") return "— Pas de clé";
    if (s === "offline") return "✕ Hors ligne";
    return "✕ Erreur";
  };

  const okCount = results.filter((r) => r.status === "ok").length;
  const errCount = results.filter((r) => r.status === "error").length;

  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        background: "var(--bg-glass)",
        border: "1px solid var(--border-subtle)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <Radio size={16} color="var(--brand-accent)" />
        <span style={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
          Diagnostic LLM
        </span>
        {results.length > 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {okCount} ok · {errCount} erreur{errCount > 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={runCheck}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            background: loading ? "transparent" : "rgba(139,92,246,0.12)",
            color: "var(--brand-accent)",
            cursor: loading ? "wait" : "pointer",
            fontSize: "0.78rem",
            fontWeight: 600,
          }}
        >
          {loading ? (
            <Loader2
              size={13}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <RefreshCw size={13} />
          )}
          {loading ? "Test en cours…" : "Tester tous les LLMs"}
        </button>
      </div>

      {results.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 8,
          }}
        >
          {results.map((r) => (
            <div
              key={r.provider}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background:
                  r.status === "ok"
                    ? "rgba(16,185,129,0.06)"
                    : r.status === "error"
                      ? "rgba(239,68,68,0.06)"
                      : "rgba(255,255,255,0.03)",
                border: `1px solid ${
                  r.status === "ok"
                    ? "rgba(16,185,129,0.2)"
                    : r.status === "error"
                      ? "rgba(239,68,68,0.2)"
                      : "var(--border-subtle)"
                }`,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor(r.status),
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  {PROVIDER_LABELS[r.provider] || r.provider}
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: statusColor(r.status),
                    marginTop: 1,
                  }}
                >
                  {statusLabel(r.status)}
                  {r.latency != null && ` · ${r.latency}ms`}
                  {r.error && r.status === "error" && (
                    <span style={{ color: "#ef4444" }}>
                      {" "}
                      — {r.error.slice(0, 60)}
                    </span>
                  )}
                  {r.provider === "ollama" &&
                    r.models &&
                    r.models.length > 0 && (
                      <span>
                        {" "}
                        · {r.models.length} modèle
                        {r.models.length > 1 ? "s" : ""}
                      </span>
                    )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lastCheck && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            marginTop: 8,
            textAlign: "right",
          }}
        >
          Dernier test : {new Date(lastCheck).toLocaleTimeString("fr-FR")}
        </div>
      )}
    </div>
  );
};

// ─── Section: API Keys ────────────────────────────────────────────────────────

const ApiKeysSection = () => {
  const {
    keys,
    setKey,
    clearKey,
    syncToBackend,
    syncing,
    lastSync,
    syncError,
    configuredCount,
    backendStatus,
  } = useApiKeys();
  const [searchFilter, setSearchFilter] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Tous");

  const filtered = PROVIDERS.filter((p) => {
    const matchSearch =
      !searchFilter ||
      p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.category.toLowerCase().includes(searchFilter.toLowerCase());
    const matchCat = activeCategory === "Tous" || p.category === activeCategory;
    return matchSearch && matchCat;
  });

  const handleSyncAndSave = async () => {
    await syncToBackend();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          borderRadius: 12,
          background: "rgba(139,92,246,0.07)",
          border: "1px solid rgba(139,92,246,0.2)",
        }}
      >
        <Zap size={18} color="var(--brand-accent)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
            BYOK — Bring Your Own Key
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            Vos clés sont stockées localement (localStorage) et envoyées
            uniquement à votre backend ClawBoard sur{" "}
            <code
              style={{
                background: "rgba(0,0,0,0.2)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              localhost:4000
            </code>
            . Elles ne transitent jamais vers des serveurs externes.
          </div>
        </div>
        <div
          style={{
            padding: "5px 12px",
            borderRadius: 20,
            background:
              configuredCount > 0
                ? "rgba(16,185,129,0.15)"
                : "rgba(255,255,255,0.06)",
            border: `1px solid ${configuredCount > 0 ? "rgba(16,185,129,0.3)" : "var(--border-subtle)"}`,
            fontSize: "0.8rem",
            fontWeight: 700,
            color: configuredCount > 0 ? "#10b981" : "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {configuredCount} / {PROVIDERS.length} configuré
          {configuredCount > 1 ? "s" : ""}
        </div>
      </div>

      {/* Warning */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(251,191,36,0.07)",
          border: "1px solid rgba(251,191,36,0.2)",
        }}
      >
        <AlertTriangle
          size={15}
          color="#f59e0b"
          style={{ flexShrink: 0, marginTop: 1 }}
        />
        <span
          style={{ fontSize: "0.78rem", color: "#f59e0b", lineHeight: 1.5 }}
        >
          Ne partagez jamais vos clés API. Cliquez sur{" "}
          <strong>Enregistrer &amp; Synchroniser</strong> pour que Lia puisse
          utiliser le bon modèle lors de vos conversations.
        </span>
      </div>

      {/* LLM Health Check */}
      <LLMHealthCheck />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Rechercher un provider…"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 180,
            padding: "8px 12px",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: "0.83rem",
            outline: "none",
          }}
        />
        {["Tous", ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "7px 14px",
              borderRadius: 20,
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              background:
                activeCategory === cat
                  ? "var(--brand-primary)"
                  : "rgba(255,255,255,0.05)",
              border: `1px solid ${activeCategory === cat ? "var(--brand-primary)" : "var(--border-subtle)"}`,
              color: activeCategory === cat ? "#fff" : "var(--text-secondary)",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Provider groups */}
      {(activeCategory === "Tous" ? CATEGORIES : [activeCategory]).map(
        (cat) => {
          const catProviders = filtered.filter((p) => p.category === cat);
          if (catProviders.length === 0) return null;
          return (
            <div key={cat}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                {cat}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {catProviders.map((p) => (
                  <KeyRow
                    key={p.id}
                    provider={p}
                    value={keys[p.id] || ""}
                    onChange={(v) => setKey(p.id, v)}
                    onClear={() => clearKey(p.id)}
                    backendConfigured={!!backendStatus[p.id]}
                  />
                ))}
              </div>
            </div>
          );
        },
      )}

      {/* Sync footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          borderRadius: 12,
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-subtle)",
          marginTop: 4,
        }}
      >
        <div style={{ flex: 1 }}>
          {syncError ? (
            <div
              style={{
                fontSize: "0.8rem",
                color: "#ef4444",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <AlertTriangle size={13} /> {syncError}
            </div>
          ) : lastSync ? (
            <div
              style={{
                fontSize: "0.8rem",
                color: "#10b981",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <CheckCircle size={13} /> Synchronisé le{" "}
              {lastSync.toLocaleTimeString("fr-FR")}
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Cliquez sur Enregistrer pour que Lia utilise ces clés.
            </div>
          )}
        </div>
        <button
          onClick={handleSyncAndSave}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 20px",
            borderRadius: 8,
            border: "none",
            background: "var(--brand-primary)",
            color: "#fff",
            cursor: syncing ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: "0.85rem",
            transition: "all 0.2s",
          }}
        >
          {syncing ? (
            <Loader2
              size={15}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <RefreshCw size={15} />
          )}
          Enregistrer &amp; Synchroniser
        </button>
      </div>
    </div>
  );
};

// ─── Section: Ollama Local LLMs ──────────────────────────────────────────────

const BASE_API = "http://localhost:4000";

const POPULAR_MODELS: {
  name: string;
  label: string;
  size: string;
  cat: string;
}[] = [
  // Texte / Raisonnement
  { name: "qwen3.5:4b", label: "Qwen3.5 4B", size: "3.4 GB", cat: "💬 Texte" },
  { name: "qwen3.5:9b", label: "Qwen3.5 9B", size: "6.6 GB", cat: "💬 Texte" },
  { name: "llama3.2", label: "Llama 3.2", size: "2 GB", cat: "💬 Texte" },
  { name: "mistral", label: "Mistral 7B", size: "4 GB", cat: "💬 Texte" },
  { name: "phi4", label: "Phi-4", size: "9 GB", cat: "💬 Texte" },
  { name: "deepseek-r1", label: "DeepSeek R1", size: "4 GB", cat: "💬 Texte" },
  // Vision / Image
  { name: "qwen3-vl:8b", label: "Qwen3-VL 8B", size: "7 GB", cat: "🖼️ Vision" },
  {
    name: "qwen3.5:latest",
    label: "Qwen3.5 Vision",
    size: "6.6 GB",
    cat: "🖼️ Vision",
  },
  {
    name: "openbmb/minicpm-v4.5",
    label: "MiniCPM-V 4.5",
    size: "~6 GB",
    cat: "🖼️ Vision",
  },
  {
    name: "granite3.2-vision",
    label: "Granite Vision 2B",
    size: "~2 GB",
    cat: "🖼️ Vision",
  },
  // Vidéo
  {
    name: "anas/video-llava",
    label: "Video-LLaVA",
    size: "~7 GB",
    cat: "🎬 Vidéo",
  },
  {
    name: "ahmadwaqar/smolvlm2-500m-video",
    label: "SmolVLM2 Video",
    size: "~1 GB",
    cat: "🎬 Vidéo",
  },
  {
    name: "openbmb/minicpm-v2.6",
    label: "MiniCPM-V 2.6",
    size: "~6 GB",
    cat: "🎬 Vidéo",
  },
  // Audio / Speech
  {
    name: "dimavz/whisper-tiny",
    label: "Whisper Tiny",
    size: "~150 MB",
    cat: "🎙️ Audio",
  },
  {
    name: "karanchopda333/whisper",
    label: "Whisper Full",
    size: "~1.5 GB",
    cat: "🎙️ Audio",
  },
  // Code
  {
    name: "qwen2.5-coder",
    label: "Qwen2.5 Coder",
    size: "4 GB",
    cat: "💻 Code",
  },
  {
    name: "deepseek-coder-v2",
    label: "DeepSeek Coder V2",
    size: "8 GB",
    cat: "💻 Code",
  },
];

interface OllamaModel {
  name: string;
  size: number;
  details?: { parameter_size?: string; quantization_level?: string };
}

interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
}

interface DiskInfo {
  mount: string;
  label: string;
  total: number;
  free: number;
  used: number;
  type: string;
}

// ── Smart Routing: auto-detect best local LLM per task type ──────────────────

const TASK_TYPES = [
  { id: "code", label: "💻 Code", desc: "Génération, debug, refactoring" },
  { id: "text", label: "💬 Texte", desc: "Rédaction, résumé, traduction" },
  {
    id: "vision",
    label: "🖼️ Vision",
    desc: "Analyse d'images, OCR, screenshots",
  },
  { id: "audio", label: "🎙️ Audio", desc: "Transcription, speech-to-text" },
  { id: "math", label: "🧮 Raisonnement", desc: "Math, logique, analyse" },
];

const MODEL_ROUTING: Record<
  string,
  { tasks: string[]; priority: number; desc: string }
> = {
  "qwen2.5-coder": {
    tasks: ["code"],
    priority: 1,
    desc: "Spécialiste code — complétion, debug, refactoring",
  },
  "deepseek-coder-v2": {
    tasks: ["code"],
    priority: 2,
    desc: "Code avancé — raisonnement sur l'architecture",
  },
  "qwen3.5:4b": {
    tasks: ["text"],
    priority: 1,
    desc: "Rapide pour texte court, chat",
  },
  "qwen3.5:9b": {
    tasks: ["text", "math"],
    priority: 2,
    desc: "Texte long, raisonnement",
  },
  "llama3.2": {
    tasks: ["text"],
    priority: 1,
    desc: "Polyvalent léger, chat rapide",
  },
  mistral: {
    tasks: ["text"],
    priority: 2,
    desc: "Bon raisonnement, multi-langues",
  },
  phi4: {
    tasks: ["text", "math"],
    priority: 3,
    desc: "Raisonnement avancé, analyse longue",
  },
  "deepseek-r1": {
    tasks: ["text", "math"],
    priority: 1,
    desc: "Raisonnement mathématique, logique",
  },
  "qwen3-vl:8b": {
    tasks: ["vision"],
    priority: 1,
    desc: "Analyse d'images, OCR",
  },
  "qwen3.5:latest": {
    tasks: ["vision", "text"],
    priority: 2,
    desc: "Vision + texte combinés",
  },
};

const SmartRouting = ({ models }: { models: OllamaModel[] }) => {
  const installedNames = models.map((m) => m.name);

  // Build routing table: for each task type, find the best installed model
  const routingTable = TASK_TYPES.map((taskType) => {
    const candidates = Object.entries(MODEL_ROUTING)
      .filter(([, info]) => info.tasks.includes(taskType.id))
      .sort((a, b) => a[1].priority - b[1].priority);

    const installed = candidates.filter(([name]) =>
      installedNames.some(
        (m) => m === name || m.startsWith(name.split(":")[0]),
      ),
    );
    const notInstalled = candidates.filter(
      ([name]) =>
        !installedNames.some(
          (m) => m === name || m.startsWith(name.split(":")[0]),
        ),
    );

    return {
      ...taskType,
      activeModel: installed[0]
        ? { name: installed[0][0], ...installed[0][1] }
        : null,
      alternatives: installed
        .slice(1)
        .map(([name, info]) => ({ name, ...info })),
      suggested: notInstalled[0]
        ? { name: notInstalled[0][0], ...notInstalled[0][1] }
        : null,
    };
  });

  return (
    <div>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Zap size={11} />
        Routage intelligent — Orchestration automatique
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        ClawBoard route automatiquement chaque tâche vers le meilleur modèle
        local installé selon son type. Les modèles sont activés et utilisés sous{" "}
        <code
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          ollama/&lt;nom&gt;
        </code>{" "}
        dans le créateur de tâches.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {routingTable.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 10,
              background: row.activeModel
                ? "rgba(16,185,129,0.06)"
                : "rgba(245,158,11,0.06)",
              border: `1px solid ${row.activeModel ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
            }}
          >
            <div style={{ fontSize: 20, width: 32, textAlign: "center" }}>
              {row.label.split(" ")[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                >
                  {row.label.split(" ").slice(1).join(" ")}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {row.desc}
                </span>
              </div>
              {row.activeModel ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#10b981",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <CheckCircle size={11} /> Actif
                  </span>
                  <code
                    style={{
                      fontSize: 11,
                      background: "rgba(16,185,129,0.1)",
                      padding: "1px 6px",
                      borderRadius: 4,
                      color: "#10b981",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    ollama/{row.activeModel.name}
                  </code>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {row.activeModel.desc}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#f59e0b",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <AlertTriangle size={11} /> Aucun modèle
                  </span>
                  {row.suggested && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      → Installer <strong>{row.suggested.name}</strong>{" "}
                      recommandé
                    </span>
                  )}
                </div>
              )}
              {row.alternatives.length > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginTop: 3,
                  }}
                >
                  Alternatives :{" "}
                  {row.alternatives.map((a) => a.name).join(", ")}
                </div>
              )}
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: row.activeModel ? "#10b981" : "#f59e0b",
                boxShadow: row.activeModel
                  ? "0 0 6px #10b981"
                  : "0 0 6px #f59e0b",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const OllamaSection = () => {
  const [status, setStatus] = useState<{
    running: boolean;
    version?: string;
  } | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingMdl, setLoadingMdl] = useState(false);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullProg, setPullProg] = useState<PullProgress | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pullDone, setPullDone] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [modelsPath, setModelsPath] = useState("");
  const [savingPath, setSavingPath] = useState(false);
  const [pathSaved, setPathSaved] = useState(false);

  const loadDisks = async () => {
    try {
      const r = await apiFetch(`${BASE_API}/api/system/disks`, {
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      setDisks(d.disks || []);
      if (d.currentModelsPath) setModelsPath(d.currentModelsPath);
    } catch {
      /* ignore */
    }
  };

  const saveModelsPath = async (path: string) => {
    setSavingPath(true);
    setPathSaved(false);
    try {
      const r = await apiFetch(`${BASE_API}/api/ollama/models-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (r.ok) {
        setModelsPath(path);
        setPathSaved(true);
        setTimeout(() => setPathSaved(false), 3000);
      }
    } catch {
      /* ignore */
    }
    setSavingPath(false);
  };

  const selectDisk = (mount: string) => {
    const sep = mount.includes("\\") || mount.match(/^[A-Z]:/) ? "\\" : "/";
    const newPath = mount.endsWith(sep)
      ? `${mount}.ollama${sep}models`
      : `${mount}${sep}.ollama${sep}models`;
    setModelsPath(newPath);
    saveModelsPath(newPath);
  };

  const startOllama = async () => {
    setStarting(true);
    try {
      await apiFetch(`${BASE_API}/api/ollama/start`, { method: "POST" });
      await checkStatus();
    } catch {
      /* ignore */
    }
    setStarting(false);
  };

  const checkStatus = async () => {
    // Try via backend first
    try {
      const r = await apiFetch(`${BASE_API}/api/ollama/status`, {
        signal: AbortSignal.timeout(2500),
      });
      const d = await r.json();
      if (d.running !== undefined) {
        setStatus(d);
        if (d.running) loadModels();
        return;
      }
    } catch {
      /* backend offline, try direct */
    }
    // Fallback: ping Ollama directly from browser
    try {
      const r = await fetch("http://localhost:11434/api/version", {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        const d = await r.json();
        setStatus({ running: true, version: d.version });
        loadModelsDirect();
        return;
      }
    } catch {
      /* ignore */
    }
    setStatus({ running: false });
  };

  const loadModels = async () => {
    setLoadingMdl(true);
    try {
      const r = await apiFetch(`${BASE_API}/api/ollama/models`, {
        signal: AbortSignal.timeout(3000),
      });
      const d = await r.json();
      setModels(Array.isArray(d) ? d : d.models || []);
    } catch {
      await loadModelsDirect();
    } finally {
      setLoadingMdl(false);
    }
  };

  const loadModelsDirect = async () => {
    setLoadingMdl(true);
    try {
      const r = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(3000),
      });
      const d = await r.json();
      setModels(d.models || []);
    } catch {
      setModels([]);
    } finally {
      setLoadingMdl(false);
    }
  };

  useEffect(() => {
    checkStatus();
    loadDisks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePull = async () => {
    if (!pullName.trim()) return;
    setPulling(true);
    setPullProg({ status: "Démarrage du téléchargement…" });
    setPullDone(null);
    try {
      const r = await apiFetch(`${BASE_API}/api/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pullName.trim() }),
      });

      const contentType = r.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && r.body) {
        // SSE streaming
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop()!;
          for (const line of lines) {
            const m = line.match(/^data:\s*(.+)/);
            if (!m) continue;
            try {
              const p: PullProgress = JSON.parse(m[1]);
              if (p.status === "success" || p.status === "done") {
                setPullDone(pullName.trim());
                setPullProg(null);
              } else setPullProg(p);
            } catch (_) {}
          }
        }
        // If we exit the loop without setting done
        if (!pullDone) {
          setPullDone(pullName.trim());
          setPullProg(null);
        }
      } else {
        // JSON response (error or immediate result)
        const data = await r.json();
        if (data.error) {
          setPullProg({ status: `Erreur: ${data.error}` });
        } else {
          setPullDone(pullName.trim());
          setPullProg(null);
        }
      }
    } catch (e: unknown) {
      setPullProg({
        status: `Erreur: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    setPulling(false);
    loadModels();
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    setDeleting(name);
    try {
      await apiFetch(
        `${BASE_API}/api/ollama/models/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      setModels((m) => m.filter((x) => x.name !== name));
    } catch {
      alert("Erreur lors de la suppression");
    }
    setDeleting(null);
  };

  const fmtSize = (bytes: number) => {
    if (!bytes) return "?";
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
  };

  const pullPct = pullProg?.total
    ? Math.round(((pullProg.completed ?? 0) / pullProg.total) * 100)
    : null;

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background:
                status === null
                  ? "#94a3b8"
                  : status.running
                    ? "#10b981"
                    : "#ef4444",
              boxShadow: status?.running ? "0 0 8px #10b981" : "none",
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: "var(--text-primary)",
            }}
          >
            {status === null
              ? "Vérification…"
              : status.running
                ? `Ollama actif${status.version ? ` v${status.version}` : ""}`
                : "Ollama inactif"}
          </span>
        </div>
        <button
          onClick={checkStatus}
          title="Rafraîchir"
          style={{
            background: "none",
            border: "1px solid var(--border-subtle)",
            borderRadius: 7,
            padding: "5px 10px",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
          }}
        >
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      {status && !status.running && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 13,
            color: "#fca5a5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            Ollama n'est pas en cours d'exécution. Lance{" "}
            <code
              style={{
                background: "rgba(0,0,0,0.3)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              ollama serve
            </code>{" "}
            dans ton terminal.
          </span>
          <button
            onClick={startOllama}
            disabled={starting}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: 7,
              border: "none",
              cursor: starting ? "not-allowed" : "pointer",
              background: starting
                ? "rgba(16,185,129,0.3)"
                : "rgba(16,185,129,0.15)",
              color: "#10b981",
              fontWeight: 600,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: starting ? 0.7 : 1,
            }}
          >
            {starting ? (
              <>
                <Loader2
                  size={12}
                  style={{ animation: "spin 1s linear infinite" }}
                />{" "}
                Démarrage…
              </>
            ) : (
              "▶ Démarrer Ollama"
            )}
          </button>
        </div>
      )}

      {/* ── Stockage des modèles — choix du disque ──────────────────── */}
      {disks.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <HardDrive size={11} />
            Stockage des modèles — Choisir le disque
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {disks.map((disk) => {
              const pct =
                disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
              const freeGB = (disk.free / 1e9).toFixed(1);
              const totalGB = (disk.total / 1e9).toFixed(1);
              const sep =
                disk.mount.includes("\\") || disk.mount.match(/^[A-Z]:/)
                  ? "\\"
                  : "/";
              const diskPath = disk.mount.endsWith(sep)
                ? `${disk.mount}.ollama${sep}models`
                : `${disk.mount}${sep}.ollama${sep}models`;
              const isActive =
                modelsPath === diskPath || modelsPath.startsWith(disk.mount);
              const isFull = disk.free < 2e9; // Less than 2GB free

              return (
                <button
                  key={disk.mount}
                  onClick={() => !isFull && selectDisk(disk.mount)}
                  disabled={savingPath}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "14px 16px",
                    borderRadius: 10,
                    textAlign: "left",
                    cursor: isFull ? "not-allowed" : "pointer",
                    background: isActive
                      ? "rgba(139,92,246,0.1)"
                      : "var(--bg-glass)",
                    border: `2px solid ${isActive ? "var(--brand-accent)" : isFull ? "rgba(239,68,68,0.3)" : "var(--border-subtle)"}`,
                    opacity: isFull ? 0.5 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: isActive
                          ? "var(--brand-accent)"
                          : "var(--text-primary)",
                      }}
                    >
                      {disk.mount}
                    </span>
                    {isActive && (
                      <Check
                        size={16}
                        style={{ color: "var(--brand-accent)" }}
                      />
                    )}
                    {isFull && (
                      <AlertTriangle size={14} style={{ color: "#ef4444" }} />
                    )}
                  </div>
                  {disk.label !== disk.mount && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {disk.label}
                    </span>
                  )}
                  <div
                    style={{
                      width: "100%",
                      height: 6,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 3,
                        width: `${pct}%`,
                        background:
                          pct > 90
                            ? "#ef4444"
                            : pct > 70
                              ? "#f59e0b"
                              : "#10b981",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>{freeGB} GB libre</span>
                    <span>{totalGB} GB total</span>
                  </div>
                  {isFull && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#ef4444",
                        fontWeight: 600,
                      }}
                    >
                      Espace insuffisant (&lt;2 GB)
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Current path display */}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Chemin actuel :</span>
            <code
              style={{
                background: "rgba(0,0,0,0.2)",
                padding: "2px 8px",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontFamily: "var(--mono)",
                fontSize: 11,
              }}
            >
              {modelsPath || "~/.ollama/models"}
            </code>
            {pathSaved && (
              <span style={{ color: "#10b981", fontWeight: 600, fontSize: 11 }}>
                ✓ Sauvegardé
              </span>
            )}
            {savingPath && (
              <Loader2
                size={12}
                style={{
                  animation: "spin 1s linear infinite",
                  color: "var(--text-muted)",
                }}
              />
            )}
          </div>

          {/* Custom path input */}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <input
              value={modelsPath}
              onChange={(e) => setModelsPath(e.target.value)}
              placeholder="Chemin personnalisé, ex: D:\.ollama\models"
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "var(--mono)",
                outline: "none",
              }}
            />
            <button
              onClick={() =>
                modelsPath.trim() && saveModelsPath(modelsPath.trim())
              }
              disabled={savingPath || !modelsPath.trim()}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "var(--brand-primary)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity: !modelsPath.trim() ? 0.5 : 1,
              }}
            >
              <Save size={12} /> Appliquer
            </button>
          </div>
        </div>
      )}

      {/* Modèles installés */}
      {status?.running && (
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              <HardDrive
                size={11}
                style={{ marginRight: 5, verticalAlign: "middle" }}
              />
              Modèles installés ({models.length})
            </span>
            {loadingMdl && (
              <Loader2
                size={12}
                style={{ animation: "spin 1s linear infinite" }}
              />
            )}
          </div>
          {models.length === 0 && !loadingMdl ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                padding: "10px 0",
              }}
            >
              Aucun modèle installé.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {models.map((m) => (
                <div key={m.name} style={cardStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        color: "var(--text-primary)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {m.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                        display: "flex",
                        gap: 10,
                      }}
                    >
                      <span>{fmtSize(m.size)}</span>
                      {m.details?.parameter_size && (
                        <span>{m.details.parameter_size}</span>
                      )}
                      {m.details?.quantization_level && (
                        <span>{m.details.quantization_level}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(m.name)}
                    disabled={deleting === m.name}
                    title="Supprimer"
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 6,
                      padding: "5px 8px",
                      cursor: "pointer",
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {deleting === m.name ? (
                      <Loader2
                        size={13}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pull */}
      {status?.running && (
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 10,
            }}
          >
            <Download
              size={11}
              style={{ marginRight: 5, verticalAlign: "middle" }}
            />
            Télécharger un modèle
          </div>

          {/* Raccourcis populaires groupés */}
          {(() => {
            const cats = [...new Set(POPULAR_MODELS.map((p) => p.cat))];
            return cats.map((cat) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    marginBottom: 5,
                  }}
                >
                  {cat}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {POPULAR_MODELS.filter((p) => p.cat === cat).map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setPullName(p.name)}
                      title={`${p.name} — ${p.size}`}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        background:
                          pullName === p.name
                            ? "rgba(139,92,246,0.18)"
                            : "var(--bg-glass)",
                        border: `1px solid ${pullName === p.name ? "rgba(139,92,246,0.45)" : "var(--border-subtle)"}`,
                        color:
                          pullName === p.name
                            ? "var(--brand-accent)"
                            : "var(--text-muted)",
                        transition: "all 0.15s",
                      }}
                    >
                      {p.label} <span style={{ opacity: 0.55 }}>{p.size}</span>
                    </button>
                  ))}
                </div>
              </div>
            ));
          })()}

          {/* Input + bouton */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pulling && handlePull()}
              placeholder="ex: llama3.2:latest"
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                fontFamily: "var(--mono)",
              }}
            />
            <button
              onClick={handlePull}
              disabled={pulling || !pullName.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 16px",
                borderRadius: 8,
                background: "var(--brand-primary)",
                border: "none",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: pulling ? "wait" : "pointer",
                opacity: !pullName.trim() ? 0.5 : 1,
              }}
            >
              {pulling ? (
                <Loader2
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Download size={14} />
              )}
              Pull
            </button>
          </div>

          {/* Progression */}
          {pulling && pullProg && (
            <div
              style={{
                marginTop: 12,
                background: "rgba(139,92,246,0.06)",
                border: "1px solid rgba(139,92,246,0.2)",
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                <span>{pullProg.status}</span>
                {pullPct !== null && <span>{pullPct}%</span>}
              </div>
              {pullPct !== null && (
                <div
                  style={{
                    height: 6,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pullPct}%`,
                      background: "var(--brand-accent)",
                      borderRadius: 3,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              )}
              {pullProg.completed != null && pullProg.total != null && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 6,
                  }}
                >
                  {fmtSize(pullProg.completed)} / {fmtSize(pullProg.total)}
                </div>
              )}
            </div>
          )}

          {/* Succès */}
          {pullDone && !pulling && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#10b981",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={15} /> {pullDone} installé avec succès !
              <button
                onClick={() => setPullDone(null)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Routage intelligent — détection automatique ──────────── */}
      {status?.running && models.length > 0 && <SmartRouting models={models} />}

      {/* Modèles personnalisés hint */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingTop: 4,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <ChevronRight size={12} />
        Tous les modèles installés sont automatiquement disponibles dans le
        créateur de tâches sous{" "}
        <code
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          ollama/&lt;nom&gt;
        </code>
      </div>
    </div>
  );
};

// ─── Section: Server ─────────────────────────────────────────────────────────

const ServerSection = () => {
  const [pingResult, setPingResult] = useState<"idle" | "ok" | "error">("idle");
  const [pinging, setPinging] = useState(false);

  const ping = async () => {
    setPinging(true);
    setPingResult("idle");
    try {
      const r = await apiFetch("http://localhost:4000/api/ping", {
        signal: AbortSignal.timeout(3000),
      });
      setPingResult(r.ok ? "ok" : "error");
    } catch {
      setPingResult("error");
    } finally {
      setPinging(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          ClawBoard Backend URL
        </label>
        <input
          type="text"
          defaultValue="http://localhost:4000"
          style={{
            width: "100%",
            padding: 14,
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            color: "#fff",
            fontSize: 15,
            outline: "none",
          }}
        />
      </div>
      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          Ollama Local Host
        </label>
        <input
          type="text"
          defaultValue="http://127.0.0.1:11434"
          style={{
            width: "100%",
            padding: 14,
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            color: "#fff",
            fontSize: 15,
            outline: "none",
          }}
        />
      </div>
      <div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: "0.85rem",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          <input
            type="checkbox"
            defaultChecked
            style={{
              width: 18,
              height: 18,
              cursor: "pointer",
              accentColor: "var(--brand-primary)",
            }}
          />
          Activer WebHooks entrants (Port 5050)
        </label>
        <div
          className="text-muted"
          style={{ fontSize: 13, marginLeft: 28, marginTop: 6 }}
        >
          Déclenche ClawBoard depuis Telegram, Discord, n8n, etc.
        </div>
      </div>

      <div
        style={{
          background: "rgba(139,92,246,0.05)",
          border: "1px solid rgba(139,92,246,0.2)",
          padding: 20,
          borderRadius: 12,
        }}
      >
        <h4
          style={{
            margin: "0 0 8px",
            color: "var(--brand-accent)",
            fontSize: "1rem",
          }}
        >
          Test de Connexion Backend
        </h4>
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 14,
            color: "var(--text-secondary)",
          }}
        >
          Vérifiez la connectivité avec le cœur NemoClaw.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={ping}
            disabled={pinging}
            style={{
              padding: "10px 20px",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            {pinging ? (
              <Loader2
                size={15}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Wifi size={15} />
            )}
            Lancer le Ping
          </button>
          {pingResult === "ok" && (
            <span
              style={{
                color: "#10b981",
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              <CheckCircle size={16} /> Connecté
            </span>
          )}
          {pingResult === "error" && (
            <span
              style={{
                color: "#ef4444",
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              <WifiOff size={16} /> Hors ligne
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Section: Profile ────────────────────────────────────────────────────────

interface ClawUser {
  username: string;
  displayName: string;
  role: string;
  avatar: string | null;
  demo?: boolean;
}

const ProfileSection = () => {
  const readUser = (): ClawUser => {
    try {
      const raw = localStorage.getItem("clawboard-user");
      return raw
        ? JSON.parse(raw)
        : {
            username: "admin",
            displayName: "Admin",
            role: "admin",
            avatar: null,
          };
    } catch {
      return {
        username: "admin",
        displayName: "Admin",
        role: "admin",
        avatar: null,
      };
    }
  };

  const [form, setForm] = useState(() => readUser());
  const [saved, setSaved] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const avatarSrc =
    form.avatar ??
    `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(form.username)}&backgroundColor=8b5cf6`;

  const handleSave = () => {
    const current = readUser();
    localStorage.setItem(
      "clawboard-user",
      JSON.stringify({
        ...current,
        displayName: form.displayName,
        username: form.username,
      }),
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.next.length < 6) {
      setPwError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError("Les mots de passe ne correspondent pas.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await apiFetch("http://localhost:4000/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: pwForm.current, next: pwForm.next }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setPwError(b.message ?? "Erreur serveur.");
        setPwLoading(false);
        return;
      }
      setPwSaved(true);
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwSaved(false), 3000);
    } catch {
      // mock fallback: accept silently in demo mode
      setPwSaved(true);
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwSaved(false), 3000);
    }
    setPwLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-glass)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    fontSize: "0.9rem",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Avatar + identity */}
      <div
        className="glass-panel p-6"
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <img
            src={avatarSrc}
            alt="Avatar"
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "2px solid var(--brand-primary)",
              boxShadow: "0 0 20px rgba(139,92,246,0.3)",
            }}
          />
          {form.demo && (
            <div
              style={{
                padding: "3px 10px",
                borderRadius: 20,
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.25)",
                color: "#f59e0b",
                fontSize: "0.72rem",
                fontWeight: 700,
              }}
            >
              Mode Démo
            </div>
          )}
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Avatar généré via DiceBear
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <label style={labelStyle}>Identifiant</label>
            <input
              style={inputStyle}
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
              placeholder="admin"
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--brand-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Nom d'affichage</label>
            <input
              style={inputStyle}
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
              placeholder="Admin"
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--brand-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Rôle</label>
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.2)",
                color: "var(--brand-accent)",
                fontSize: "0.85rem",
                display: "inline-block",
                fontWeight: 600,
              }}
            >
              {form.role}
            </div>
          </div>
          <button
            onClick={handleSave}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: saved
                ? "var(--status-success)"
                : "var(--brand-primary)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "background 0.3s",
            }}
          >
            {saved ? (
              <>
                <Check size={15} /> Sauvegardé !
              </>
            ) : (
              <>
                <Save size={15} /> Enregistrer
              </>
            )}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="glass-panel p-6">
        <h3 style={{ margin: "0 0 18px", fontSize: "1rem", fontWeight: 700 }}>
          Changer le mot de passe
        </h3>
        <form
          onSubmit={handlePasswordChange}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div>
            <label style={labelStyle}>Mot de passe actuel</label>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.current}
              onChange={(e) =>
                setPwForm((f) => ({ ...f, current: e.target.value }))
              }
              placeholder="••••••••"
              autoComplete="current-password"
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--brand-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Nouveau mot de passe</label>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.next}
              onChange={(e) =>
                setPwForm((f) => ({ ...f, next: e.target.value }))
              }
              placeholder="Au moins 6 caractères"
              autoComplete="new-password"
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--brand-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Confirmer</label>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.confirm}
              onChange={(e) => {
                setPwForm((f) => ({ ...f, confirm: e.target.value }));
                setPwError("");
              }}
              placeholder="••••••••"
              autoComplete="new-password"
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--brand-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>
          {pwError && (
            <div
              style={{
                display: "flex",
                gap: 6,
                color: "#ef4444",
                fontSize: "0.82rem",
                alignItems: "center",
              }}
            >
              <AlertTriangle size={13} /> {pwError}
            </div>
          )}
          {pwSaved && (
            <div
              style={{
                display: "flex",
                gap: 6,
                color: "#10b981",
                fontSize: "0.82rem",
                alignItems: "center",
              }}
            >
              <CheckCircle size={13} /> Mot de passe mis à jour.
            </div>
          )}
          <button
            type="submit"
            disabled={pwLoading || !pwForm.current || !pwForm.next}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: "var(--brand-primary)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: pwLoading ? "not-allowed" : "pointer",
              opacity: !pwForm.current || !pwForm.next ? 0.5 : 1,
            }}
          >
            {pwLoading ? (
              <>
                <Loader2
                  size={15}
                  style={{ animation: "spin 1s linear infinite" }}
                />{" "}
                Mise à jour…
              </>
            ) : (
              "Mettre à jour"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Section: Security (guardrails) ──────────────────────────────────────────

interface Guardrail {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
}

const SecuritySection = () => {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  useEffect(() => {
    apiFetch("http://localhost:4000/api/security/guardrails")
      .then((r) => r.json())
      .then((data) => {
        setGuardrails(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        // Mock fallback
        setGuardrails([
          {
            id: 1,
            name: "Blocage injections SQL",
            description:
              "Détecte et bloque les tentatives d'injection SQL dans les prompts.",
            enabled: true,
            category: "Inputs",
          },
          {
            id: 2,
            name: "Filtre prompt injection",
            description:
              "Empêche les instructions malveillantes cachées dans le contenu utilisateur.",
            enabled: true,
            category: "Inputs",
          },
          {
            id: 3,
            name: "Rate limiting par agent",
            description:
              "Limite à 60 requêtes/min par agent. Protège contre les boucles infinies.",
            enabled: true,
            category: "Rate Limiting",
          },
          {
            id: 4,
            name: "Rate limiting global",
            description:
              "Plafond global de 500 req/min sur l'ensemble du gateway.",
            enabled: false,
            category: "Rate Limiting",
          },
          {
            id: 5,
            name: "Whitelist IP",
            description: "N'autorise que les IP définies dans ALLOWED_ORIGINS.",
            enabled: false,
            category: "Réseau",
          },
          {
            id: 6,
            name: "Validation sorties PII",
            description:
              "Détecte les données personnelles (email, téléphone, IBAN) dans les réponses agents.",
            enabled: true,
            category: "Outputs",
          },
          {
            id: 7,
            name: "Blocage contenus nuisibles",
            description:
              "Refuse les tâches dont le prompt contient des demandes offensantes ou illégales.",
            enabled: true,
            category: "Inputs",
          },
          {
            id: 8,
            name: "Audit log complet",
            description:
              "Enregistre chaque appel API avec IP, agent, tokens et coût dans audit_logs.",
            enabled: true,
            category: "Audit",
          },
        ]);
        setLoading(false);
      });
  }, []);

  const toggle = async (g: Guardrail) => {
    setToggling((prev) => new Set([...prev, g.id]));
    try {
      const res = await apiFetch(
        "http://localhost:4000/api/security/guardrails",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: g.id, enabled: !g.enabled }),
        },
      );
      if (res.ok) {
        const updated: Guardrail[] = await res.json();
        setGuardrails(
          Array.isArray(updated)
            ? updated
            : guardrails.map((x) =>
                x.id === g.id ? { ...x, enabled: !x.enabled } : x,
              ),
        );
      } else throw new Error();
    } catch {
      setGuardrails((prev) =>
        prev.map((x) => (x.id === g.id ? { ...x, enabled: !x.enabled } : x)),
      );
    } finally {
      setToggling((prev) => {
        const s = new Set(prev);
        s.delete(g.id);
        return s;
      });
    }
  };

  const categories = [...new Set(guardrails.map((g) => g.category))];
  const enabledCount = guardrails.filter((g) => g.enabled).length;

  if (loading)
    return (
      <div
        style={{
          padding: "40px 0",
          textAlign: "center",
          color: "var(--text-muted)",
          display: "flex",
          gap: 10,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />{" "}
        Chargement…
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <div
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)",
            color: "#10b981",
            fontSize: "0.82rem",
            fontWeight: 700,
          }}
        >
          {enabledCount} actif{enabledCount > 1 ? "s" : ""}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "rgba(161,161,170,0.1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
            fontSize: "0.82rem",
            fontWeight: 700,
          }}
        >
          {guardrails.length - enabledCount} désactivé
          {guardrails.length - enabledCount > 1 ? "s" : ""}
        </div>
      </div>

      {categories.map((cat) => (
        <div key={cat}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            {cat}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {guardrails
              .filter((g) => g.category === cat)
              .map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 18px",
                    borderRadius: 12,
                    background: "var(--bg-surface-elevated)",
                    border: `1px solid ${g.enabled ? "rgba(16,185,129,0.2)" : "var(--border-subtle)"}`,
                    transition: "border-color 0.2s",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        marginBottom: 2,
                      }}
                    >
                      {g.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {g.description}
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(g)}
                    disabled={toggling.has(g.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: toggling.has(g.id) ? "not-allowed" : "pointer",
                      padding: 0,
                      opacity: toggling.has(g.id) ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title={g.enabled ? "Désactiver" : "Activer"}
                  >
                    {toggling.has(g.id) ? (
                      <Loader2
                        size={22}
                        style={{
                          animation: "spin 1s linear infinite",
                          color: "var(--text-muted)",
                        }}
                      />
                    ) : g.enabled ? (
                      <ToggleRight size={28} color="#10b981" />
                    ) : (
                      <ToggleLeft size={28} color="var(--text-muted)" />
                    )}
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─── Section: Notifications ───────────────────────────────────────────────────

interface NotifConfig {
  telegram_token: string;
  telegram_chat_id: string;
  discord_webhook: string;
  email_smtp: string;
  email_from: string;
  email_to: string;
  webhook_url: string;
  notify_on_task_done: boolean;
  notify_on_task_failed: boolean;
  notify_on_approval: boolean;
}

const NOTIF_DEFAULTS: NotifConfig = {
  telegram_token: "",
  telegram_chat_id: "",
  discord_webhook: "",
  email_smtp: "",
  email_from: "",
  email_to: "",
  webhook_url: "",
  notify_on_task_done: true,
  notify_on_task_failed: true,
  notify_on_approval: true,
};

const NotificationsSection = () => {
  const [config, setConfig] = useState<NotifConfig>(NOTIF_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{
    ch: string;
    ok: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    apiFetch("http://localhost:4000/api/settings/notifications")
      .then((r) => r.json())
      .then((d) => {
        setConfig({ ...NOTIF_DEFAULTS, ...d });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("http://localhost:4000/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (ch: string) => {
    setTesting(ch);
    setTestMsg(null);
    try {
      const res = await apiFetch(
        "http://localhost:4000/api/settings/notifications/test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: ch }),
        },
      );
      const d = await res.json();
      setTestMsg({
        ch,
        ok: res.ok,
        msg: d.message ?? (res.ok ? "Envoyé !" : "Erreur."),
      });
    } catch {
      setTestMsg({ ch, ok: false, msg: "Serveur inaccessible." });
    } finally {
      setTesting(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    background: "var(--bg-glass)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    fontSize: "0.88rem",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };
  const fieldFocus = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.target.style.borderColor = "var(--brand-accent)");
  const fieldBlur = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.target.style.borderColor = "var(--border-subtle)");

  const ChannelCard = ({
    icon,
    title,
    ch,
    children,
  }: {
    icon: React.ReactNode;
    title: string;
    ch: string;
    children: React.ReactNode;
  }) => (
    <div
      className="glass-panel p-5"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 700,
          }}
        >
          <div style={{ color: "var(--brand-accent)" }}>{icon}</div>
          {title}
        </div>
        <button
          onClick={() => testChannel(ch)}
          disabled={testing === ch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: "rgba(139,92,246,0.1)",
            color: "var(--brand-accent)",
            fontSize: "0.8rem",
            cursor: testing === ch ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {testing === ch ? (
            <Loader2
              size={13}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Send size={13} />
          )}
          Tester
        </button>
      </div>
      {children}
      {testMsg?.ch === ch && (
        <div
          style={{
            fontSize: "0.78rem",
            display: "flex",
            gap: 6,
            alignItems: "center",
            color: testMsg.ok ? "#10b981" : "#ef4444",
          }}
        >
          {testMsg.ok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}{" "}
          {testMsg.msg}
        </div>
      )}
    </div>
  );

  if (loading)
    return (
      <div
        style={{
          padding: "40px 0",
          textAlign: "center",
          color: "var(--text-muted)",
          display: "flex",
          gap: 10,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />{" "}
        Chargement…
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Événements déclencheurs */}
      <div className="glass-panel p-5">
        <div style={{ fontWeight: 700, marginBottom: 14 }}>
          Déclencher les alertes sur
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(
            [
              ["notify_on_task_done", "Tâche terminée avec succès"],
              ["notify_on_task_failed", "Tâche en échec"],
              ["notify_on_approval", "Demande d'approbation reçue"],
            ] as [keyof NotifConfig, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              <button
                onClick={() => setConfig((c) => ({ ...c, [key]: !c[key] }))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                }}
              >
                {config[key] ? (
                  <ToggleRight size={26} color="#10b981" />
                ) : (
                  <ToggleLeft size={26} color="var(--text-muted)" />
                )}
              </button>
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Telegram */}
      <ChannelCard
        icon={<MessageSquare size={18} />}
        title="Telegram"
        ch="telegram"
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <label style={labelStyle}>Bot Token</label>
            <input
              style={inputStyle}
              value={config.telegram_token}
              placeholder="1234567890:AAF..."
              onChange={(e) =>
                setConfig((c) => ({ ...c, telegram_token: e.target.value }))
              }
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>
          <div>
            <label style={labelStyle}>Chat ID</label>
            <input
              style={inputStyle}
              value={config.telegram_chat_id}
              placeholder="-100123456789"
              onChange={(e) =>
                setConfig((c) => ({ ...c, telegram_chat_id: e.target.value }))
              }
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>
        </div>
      </ChannelCard>

      {/* Discord */}
      <ChannelCard
        icon={<MessageSquare size={18} />}
        title="Discord"
        ch="discord"
      >
        <div>
          <label style={labelStyle}>Webhook URL</label>
          <input
            style={inputStyle}
            value={config.discord_webhook}
            placeholder="https://discord.com/api/webhooks/..."
            onChange={(e) =>
              setConfig((c) => ({ ...c, discord_webhook: e.target.value }))
            }
            onFocus={fieldFocus}
            onBlur={fieldBlur}
          />
        </div>
      </ChannelCard>

      {/* Email */}
      <ChannelCard icon={<Mail size={18} />} title="Email (SMTP)" ch="email">
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <label style={labelStyle}>Serveur SMTP</label>
            <input
              style={inputStyle}
              value={config.email_smtp}
              placeholder="smtp.gmail.com:587"
              onChange={(e) =>
                setConfig((c) => ({ ...c, email_smtp: e.target.value }))
              }
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>
          <div>
            <label style={labelStyle}>Expéditeur</label>
            <input
              style={inputStyle}
              value={config.email_from}
              placeholder="noreply@mondomaine.com"
              onChange={(e) =>
                setConfig((c) => ({ ...c, email_from: e.target.value }))
              }
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Destinataire(s)</label>
            <input
              style={inputStyle}
              value={config.email_to}
              placeholder="admin@mondomaine.com"
              onChange={(e) =>
                setConfig((c) => ({ ...c, email_to: e.target.value }))
              }
              onFocus={fieldFocus}
              onBlur={fieldBlur}
            />
          </div>
        </div>
      </ChannelCard>

      {/* Generic webhook */}
      <ChannelCard
        icon={<Webhook size={18} />}
        title="Webhook générique"
        ch="webhook"
      >
        <div>
          <label style={labelStyle}>URL</label>
          <input
            style={inputStyle}
            value={config.webhook_url}
            placeholder="https://hooks.slack.com/..."
            onChange={(e) =>
              setConfig((c) => ({ ...c, webhook_url: e.target.value }))
            }
            onFocus={fieldFocus}
            onBlur={fieldBlur}
          />
        </div>
      </ChannelCard>

      {/* Save */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: saved
              ? "var(--status-success)"
              : "var(--brand-primary)",
            color: "#fff",
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background 0.3s",
          }}
        >
          {saving ? (
            <Loader2
              size={16}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {saving ? "Enregistrement…" : saved ? "Sauvegardé !" : "Enregistrer"}
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─── Section: Plugins ────────────────────────────────────────────────────────

type PluginType = "channel" | "tool" | "diagnostics" | "other";

interface PluginDef {
  id: string;
  name: string;
  pkg: string;
  description: string;
  type: PluginType;
  author: string;
  official: boolean;
  version?: string;
  docsUrl?: string;
}

const PLUGIN_CATALOGUE: PluginDef[] = [
  {
    id: "twitch",
    name: "Twitch",
    pkg: "@openclaw/plugin-twitch",
    description: "Canal Twitch — réponses live chat",
    type: "channel",
    author: "openclaw",
    official: true,
    version: "2026.3.22",
  },
  {
    id: "matrix",
    name: "Matrix",
    pkg: "@openclaw/plugin-matrix",
    description: "Canal Matrix — DMs et salons chiffrés",
    type: "channel",
    author: "openclaw",
    official: true,
    version: "2026.3.22",
  },
  {
    id: "msteams",
    name: "Microsoft Teams",
    pkg: "@openclaw/plugin-msteams",
    description: "Canal Teams — bot intégré Microsoft 365",
    type: "channel",
    author: "openclaw",
    official: true,
    version: "2026.3.22",
  },
  {
    id: "nostr",
    name: "Nostr",
    pkg: "@openclaw/plugin-nostr",
    description: "Canal Nostr — DMs NIP-04 chiffrés",
    type: "channel",
    author: "openclaw",
    official: true,
    version: "2026.3.22",
  },
  {
    id: "zalouser",
    name: "Zalo",
    pkg: "@openclaw/plugin-zalouser",
    description: "Canal Zalo — compte personnel via zca-js",
    type: "channel",
    author: "openclaw",
    official: true,
    version: "2026.3.22",
  },
  {
    id: "otel",
    name: "Diagnostics OTel",
    pkg: "@openclaw/plugin-otel",
    description: "Export traces OpenTelemetry — Grafana, Jaeger, Datadog",
    type: "diagnostics",
    author: "openclaw",
    official: true,
    version: "2026.3.22",
    docsUrl: "https://opentelemetry.io",
  },
  {
    id: "opik",
    name: "Opik",
    pkg: "@opik/opik-openclaw",
    description: "Monitoring agents — traces, coûts, comportements",
    type: "diagnostics",
    author: "opik",
    official: false,
    version: "1.x",
    docsUrl: "https://opik.ai",
  },
  {
    id: "lossless",
    name: "Lossless Claw",
    pkg: "@martian-engineering/lossless-claw",
    description: "Résumé DAG des conversations avec fidélité du contexte",
    type: "tool",
    author: "martian-engineering",
    official: false,
    version: "1.x",
  },
  {
    id: "linkmind",
    name: "LinkMind Context",
    pkg: "linkmind-openclaw",
    description: "Moteur de contexte enrichi pour agents",
    type: "tool",
    author: "zhujunxian3",
    official: false,
    version: "1.0.0",
  },
  {
    id: "kpainter",
    name: "KPainter",
    pkg: "kpainter-openclaw",
    description: "APIs création, catalogue et status KPainter",
    type: "tool",
    author: "bbgasj",
    official: false,
    version: "0.1.0",
  },
];

const TYPE_LABELS: Record<
  PluginType,
  { label: string; color: string; icon: React.FC<{ size?: number }> }
> = {
  channel: { label: "Canal", color: "#3b82f6", icon: Radio },
  tool: { label: "Outil", color: "#10b981", icon: Wrench },
  diagnostics: { label: "Diagnostics", color: "#f59e0b", icon: BarChart2 },
  other: { label: "Autre", color: "#94a3b8", icon: Package },
};

const PLUGINS_KEY = "clawboard-plugins-enabled";

const PluginsSection = () => {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(PLUGINS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [installing, setInstalling] = useState<string | null>(null);
  const [filter, setFilter] = useState<PluginType | "all">("all");

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(PLUGINS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const install = async (plugin: PluginDef) => {
    setInstalling(plugin.id);
    try {
      await apiFetch("http://localhost:4000/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pkg: plugin.pkg }),
      });
      toggle(plugin.id);
    } catch {
      // graceful — marque quand même comme activé localement
      setEnabled((prev) => {
        const next = { ...prev, [plugin.id]: true };
        localStorage.setItem(PLUGINS_KEY, JSON.stringify(next));
        return next;
      });
    } finally {
      setInstalling(null);
    }
  };

  const filtered =
    filter === "all"
      ? PLUGIN_CATALOGUE
      : PLUGIN_CATALOGUE.filter((p) => p.type === filter);
  const enabledCount = Object.values(enabled).filter(Boolean).length;

  const card: React.CSSProperties = {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 12,
    padding: "16px 18px",
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header stats */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            padding: "8px 16px",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: "var(--brand-accent)",
              marginRight: 6,
            }}
          >
            {enabledCount}
          </span>
          plugin{enabledCount !== 1 ? "s" : ""} actif
          {enabledCount !== 1 ? "s" : ""}
        </div>
        <div
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            padding: "8px 16px",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: "var(--text-primary)",
              marginRight: 6,
            }}
          >
            {PLUGIN_CATALOGUE.length}
          </span>
          disponibles
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["all", "channel", "tool", "diagnostics"] as const).map((f) => {
          const active = filter === f;
          const cfg = f !== "all" ? TYPE_LABELS[f] : null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background: active
                  ? cfg
                    ? `${cfg.color}22`
                    : "rgba(139,92,246,0.15)"
                  : "var(--bg-glass)",
                border: `1px solid ${active ? (cfg?.color ?? "var(--brand-primary)") + "66" : "var(--border-subtle)"}`,
                color: active
                  ? (cfg?.color ?? "var(--brand-accent)")
                  : "var(--text-muted)",
              }}
            >
              {f === "all" ? "Tous" : cfg!.label}
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((plugin) => {
          const isOn = !!enabled[plugin.id];
          const busy = installing === plugin.id;
          const cfg = TYPE_LABELS[plugin.type];
          const Icon = cfg.icon;

          return (
            <div
              key={plugin.id}
              style={{
                ...card,
                opacity: busy ? 0.7 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {/* Icône type */}
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: `${cfg.color}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                  color: cfg.color,
                }}
              >
                <Icon size={18} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: "var(--text-primary)",
                    }}
                  >
                    {plugin.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: `${cfg.color}20`,
                      color: cfg.color,
                    }}
                  >
                    {cfg.label}
                  </span>
                  {plugin.official && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(139,92,246,0.15)",
                        color: "var(--brand-accent)",
                      }}
                    >
                      Official
                    </span>
                  )}
                  {plugin.version && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      v{plugin.version}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginTop: 3,
                  }}
                >
                  {plugin.description}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                    fontFamily: "var(--mono)",
                  }}
                >
                  {plugin.pkg}
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {plugin.docsUrl && (
                  <a
                    href={plugin.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                {isOn ? (
                  <button
                    onClick={() => toggle(plugin.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: 8,
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.3)",
                      color: "#10b981",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <ToggleRight size={15} /> Activé
                  </button>
                ) : (
                  <button
                    onClick={() => install(plugin)}
                    disabled={busy}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: 8,
                      background: "var(--brand-primary)",
                      border: "none",
                      color: "#fff",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {busy ? (
                      <Loader2
                        size={13}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : (
                      <Download size={13} />
                    )}
                    {busy ? "Install…" : "Installer"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
        Les plugins sont gérés via{" "}
        <code
          style={{
            background: "var(--bg-glass)",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          openclaw plugins install
        </code>
        . L'état activé/désactivé est sauvegardé localement.
      </div>
    </div>
  );
};

// ─── ExtensionHint — clarifies MCP vs Skills vs Plugins vs Outils ─────────────

const ExtensionHint = ({ text }: { text: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "12px 16px",
      marginBottom: 18,
      borderRadius: "var(--radius-md, 12px)",
      background: "rgba(139,92,246,0.08)",
      border: "1px solid rgba(139,92,246,0.2)",
      fontSize: "0.82rem",
      color: "var(--text-secondary)",
      lineHeight: 1.5,
    }}
  >
    <Info
      size={16}
      color="var(--brand-accent)"
      style={{ flexShrink: 0, marginTop: 1 }}
    />
    <span>{text}</span>
  </div>
);

// ─── SettingsModule ───────────────────────────────────────────────────────────

export const SettingsModule = () => {
  const [searchParams] = useSearchParams();
  const initSection = (searchParams.get("tab") as Section) ?? "server";
  const [section, setSection] = useState<Section>(
    NAV.some((n) => n.id === initSection) ? initSection : "server",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { syncToBackend, configuredCount } = useApiKeys();

  // sync section when ?tab= changes (e.g. navigating from topbar menu)
  useEffect(() => {
    const tab = searchParams.get("tab") as Section;
    if (tab && NAV.some((n) => n.id === tab)) setSection(tab);
  }, [searchParams]);

  const handleGlobalSave = async () => {
    setIsSaving(true);
    if (section === "apikeys") await syncToBackend();
    else await new Promise((r) => setTimeout(r, 600));
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const renderContent = () => {
    switch (section) {
      case "mcp":
        return <McpModule embedded />;
      case "skills":
        return <SkillsModule />;
      case "tools":
        return <ToolsModule />;
      case "server":
        return <ServerSection />;
      case "apikeys":
        return <ApiKeysSection />;
      case "ollama":
        return <OllamaSection />;
      case "plugins":
        return <PluginsSection />;
      case "security":
        return <SecuritySection />;
      case "notifications":
        return <NotificationsSection />;
      case "profile":
        return <ProfileSection />;
    }
  };

  const isApp = APP_SECTIONS.has(section);
  const hint = EXTENSION_HINTS[section];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        paddingBottom: 32,
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              background: "var(--brand-primary)",
              padding: 12,
              borderRadius: 14,
              color: "#fff",
            }}
          >
            <Settings size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.5rem", margin: 0 }}>
              Paramètres Systèmes
            </h2>
            <div className="text-muted" style={{ marginTop: 4 }}>
              Configuration globale, clés API BYOK, sécurité.
              {configuredCount > 0 && (
                <span
                  style={{ marginLeft: 10, color: "#10b981", fontWeight: 600 }}
                >
                  {configuredCount} clé{configuredCount > 1 ? "s" : ""}{" "}
                  configurée{configuredCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isApp && (
          <button
            onClick={handleGlobalSave}
            disabled={isSaving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: saved
                ? "var(--status-success)"
                : "var(--brand-primary)",
              color: "#fff",
              cursor: isSaving ? "not-allowed" : "pointer",
              fontWeight: 600,
              transition: "all 0.3s",
              boxShadow: saved ? "0 0 15px rgba(16,185,129,0.4)" : "none",
            }}
          >
            {isSaving ? (
              <Loader2
                size={18}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : saved ? (
              <Check size={18} />
            ) : (
              <Save size={18} />
            )}
            {isSaving
              ? "Enregistrement…"
              : saved
                ? "Sauvegardé !"
                : "Enregistrer"}
          </button>
        )}
      </div>

      {/* 2-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 260px) 1fr",
          gap: 32,
          alignItems: "start",
        }}
      >
        {/* Nav — grouped */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_GROUPS.map((grp) => (
            <div key={grp.group} style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.7px",
                  color: "var(--text-muted)",
                  padding: "8px 16px 6px",
                }}
              >
                {grp.group}
              </div>
              {grp.items.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: active
                        ? "rgba(139,92,246,0.12)"
                        : "transparent",
                      border: active
                        ? "1px solid rgba(139,92,246,0.25)"
                        : "1px solid transparent",
                      color: active
                        ? "var(--brand-accent)"
                        : "var(--text-secondary)",
                      textAlign: "left",
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      fontSize: "0.9rem",
                    }}
                    onMouseOver={(e) => {
                      if (!active)
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.04)";
                    }}
                    onMouseOut={(e) => {
                      if (!active)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Icon size={18} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.id === "apikeys" && configuredCount > 0 && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: "rgba(16,185,129,0.15)",
                          color: "#10b981",
                        }}
                      >
                        {configuredCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Content panel */}
        {isApp ? (
          // App-like sections (MCP / Skills / Outils) render full-bleed —
          // they own their layout, header and persistence.
          <div style={{ minWidth: 0 }}>
            {hint && <ExtensionHint text={hint} />}
            <Suspense
              fallback={
                <div
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  <Loader2
                    size={22}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                </div>
              }
            >
              {renderContent()}
            </Suspense>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 32, minWidth: 0 }}>
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: "1.1rem",
                paddingBottom: 16,
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {(() => {
                const n = NAV.find((n) => n.id === section);
                const Icon = n?.icon;
                return Icon ? (
                  <Icon size={18} color="var(--brand-accent)" />
                ) : null;
              })()}
              {NAV.find((n) => n.id === section)?.label}
            </h3>
            {hint && <ExtensionHint text={hint} />}
            {renderContent()}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
