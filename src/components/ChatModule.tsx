import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Settings2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  Plus,
  Play,
  Trash,
  List,
  FileText,
  Clock,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Cpu,
  Copy,
  Download,
  History,
  PlusCircle,
  Eye,
  ShieldCheck,
  Archive,
  LayoutTemplate,
  Repeat2,
} from "lucide-react";
import { useApiKeys } from "../hooks/useApiKeys";
import { useSSE } from "../hooks/useSSE";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch";
import { useAgentRoster } from "../hooks/useAgentRoster";
import { LiaPlanPreview, type LiaPlan } from "./LiaPlanPreview";
import { renderMarkdown } from "./MarkdownRenderer";

const BASE = "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  plan?: LiaPlan;
  ts: Date;
  isLoading?: boolean;
}

interface PermissionConfig {
  key: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
  danger?: boolean;
  default: boolean;
}

type ExecutionMode = "plan" | "auto" | "confirm";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
    color: "#8b5cf6",
  },
  {
    id: "openrouter/anthropic/claude-sonnet-4.6",
    label: "Claude via OpenRouter",
    provider: "OpenRouter",
    color: "#6366f1",
  },
  // ── NVIDIA NIM — Nemotron ───────────────────────────────────────────────────
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "⚡ Nemotron Ultra 253B",
    provider: "NVIDIA NIM",
    color: "#76b900",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1",
    label: "Nemotron Super 49B",
    provider: "NVIDIA NIM",
    color: "#76b900",
  },
  {
    id: "mistralai/mistral-nemotron",
    label: "Mistral Nemotron",
    provider: "NVIDIA NIM",
    color: "#ff7000",
  },
  // ── NVIDIA NIM — Llama (Meta) ──────────────────────────────────────────────
  {
    id: "meta/llama-3.1-405b-instruct",
    label: "⚡ Llama 3.1 405B",
    provider: "NVIDIA NIM",
    color: "#0064c8",
  },
  {
    id: "meta/llama-4-maverick-17b-128e-instruct",
    label: "Llama 4 Maverick (128E)",
    provider: "NVIDIA NIM",
    color: "#0064c8",
  },
  {
    id: "meta/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout (16E)",
    provider: "NVIDIA NIM",
    color: "#0064c8",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    provider: "NVIDIA NIM",
    color: "#0064c8",
  },
  {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision",
    provider: "NVIDIA NIM",
    color: "#0064c8",
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B",
    provider: "NVIDIA NIM",
    color: "#0064c8",
  },
  // ── MiniMax (Direct API) ─────────────────────────────────────────────────
  {
    id: "minimax/MiniMax-M2.7",
    label: "🔥 MiniMax M2.7",
    provider: "MiniMax",
    color: "#6366f1",
  },
  {
    id: "minimax/MiniMax-M2.5",
    label: "⚡ MiniMax M2.5",
    provider: "MiniMax",
    color: "#6366f1",
  },
  {
    id: "minimax/MiniMax-M1",
    label: "MiniMax M1",
    provider: "MiniMax",
    color: "#6366f1",
  },
  // ── NVIDIA NIM — MiniMax ───────────────────────────────────────────────────
  {
    id: "minimaxai/minimax-m2.5",
    label: "MiniMax M2.5 (NIM)",
    provider: "NVIDIA NIM",
    color: "#7c3aed",
  },
  {
    id: "minimaxai/minimax-m2.1",
    label: "MiniMax M2.1 (NIM)",
    provider: "NVIDIA NIM",
    color: "#7c3aed",
  },
  {
    id: "minimaxai/minimax-m2",
    label: "MiniMax M2 (NIM)",
    provider: "NVIDIA NIM",
    color: "#7c3aed",
  },
  // ── NVIDIA NIM — GLM (Z-AI / Zhipu) ───────────────────────────────────────
  {
    id: "z-ai/glm5",
    label: "⚡ GLM-5 (744B MoE)",
    provider: "NVIDIA NIM",
    color: "#0066ff",
  },
  {
    id: "z-ai/glm4.7",
    label: "GLM-4.7 (358B)",
    provider: "NVIDIA NIM",
    color: "#0066ff",
  },
  // ── NVIDIA NIM — Kimi (Moonshot) ──────────────────────────────────────────
  {
    id: "moonshotai/kimi-k2.5",
    label: "⚡ Kimi K2.5 (Vision)",
    provider: "NVIDIA NIM",
    color: "#3b82f6",
  },
  {
    id: "moonshotai/kimi-k2-instruct",
    label: "Kimi K2",
    provider: "NVIDIA NIM",
    color: "#3b82f6",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    provider: "NVIDIA NIM",
    color: "#3b82f6",
  },
  // ── NVIDIA NIM — DeepSeek ─────────────────────────────────────────────────
  {
    id: "deepseek-ai/deepseek-v3.2",
    label: "⚡ DeepSeek V3.2",
    provider: "NVIDIA NIM",
    color: "#1a73e8",
  },
  {
    id: "deepseek-ai/deepseek-v3.1",
    label: "DeepSeek V3.1",
    provider: "NVIDIA NIM",
    color: "#1a73e8",
  },
  {
    id: "deepseek-ai/deepseek-r1",
    label: "⚡ DeepSeek R1 (Raisonnement)",
    provider: "NVIDIA NIM",
    color: "#1a73e8",
  },
  {
    id: "deepseek-ai/deepseek-r1-distill-qwen-32b",
    label: "DeepSeek R1 Distill 32B",
    provider: "NVIDIA NIM",
    color: "#1a73e8",
  },
  // ── NVIDIA NIM — Qwen (Alibaba) ───────────────────────────────────────────
  {
    id: "qwen/qwq-32b",
    label: "QwQ 32B (Raisonnement)",
    provider: "NVIDIA NIM",
    color: "#ff6a00",
  },
  {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    label: "⚡ Qwen3 Coder 480B",
    provider: "NVIDIA NIM",
    color: "#ff6a00",
  },
  {
    id: "qwen/qwen3-5-122b-a10b",
    label: "Qwen3.5 122B MoE",
    provider: "NVIDIA NIM",
    color: "#ff6a00",
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B",
    provider: "NVIDIA NIM",
    color: "#ff6a00",
  },
  // ── NVIDIA NIM — Mistral ──────────────────────────────────────────────────
  {
    id: "mistralai/mistral-large-2-instruct",
    label: "Mistral Large 2",
    provider: "NVIDIA NIM",
    color: "#ff7000",
  },
  {
    id: "mistralai/mixtral-8x22b-instruct",
    label: "Mixtral 8x22B",
    provider: "NVIDIA NIM",
    color: "#ff7000",
  },
  {
    id: "mistralai/codestral-22b-instruct-v0.1",
    label: "Codestral 22B",
    provider: "NVIDIA NIM",
    color: "#ff7000",
  },
  // ── NVIDIA NIM — Microsoft Phi ────────────────────────────────────────────
  {
    id: "microsoft/phi-4-mini-instruct",
    label: "Phi-4 Mini",
    provider: "NVIDIA NIM",
    color: "#00a4ef",
  },
  {
    id: "microsoft/phi-4-mini-flash-reasoning",
    label: "Phi-4 Mini Flash Reasoning",
    provider: "NVIDIA NIM",
    color: "#00a4ef",
  },
  // ── NVIDIA NIM — OpenAI OSS ───────────────────────────────────────────────
  {
    id: "openai/gpt-oss-120b",
    label: "GPT OSS 120B",
    provider: "NVIDIA NIM",
    color: "#10a37f",
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT OSS 20B",
    provider: "NVIDIA NIM",
    color: "#10a37f",
  },
  // ── Google Gemini ──────────────────────────────────────────────────────────
  {
    id: "gemini/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    color: "#4285f4",
  },
  // ── Cloudflare Workers AI ──────────────────────────────────────────────────
  {
    id: "cloudflare/@cf/meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B (Cloudflare)",
    provider: "Cloudflare",
    color: "#f38020",
  },
  {
    id: "cloudflare/@cf/meta/llama-3.1-70b-instruct",
    label: "Llama 3.1 70B (Cloudflare)",
    provider: "Cloudflare",
    color: "#f38020",
  },
  {
    id: "cloudflare/@cf/meta/llama-3.2-3b-instruct",
    label: "Llama 3.2 3B (Cloudflare)",
    provider: "Cloudflare",
    color: "#f38020",
  },
  {
    id: "cloudflare/@cf/deepseek/deepseek-r1-distill-qwen-32b",
    label: "DeepSeek R1 32B (Cloudflare)",
    provider: "Cloudflare",
    color: "#f38020",
  },
  {
    id: "cloudflare/@cf/qwen/qwq-32b",
    label: "QwQ 32B (Cloudflare)",
    provider: "Cloudflare",
    color: "#f38020",
  },
  {
    id: "cloudflare/@cf/mistral/mistral-small-3.1-24b-instruct",
    label: "Mistral Small 3.1 (Cloudflare)",
    provider: "Cloudflare",
    color: "#f38020",
  },
  // ── Local ──────────────────────────────────────────────────────────────────
  {
    id: "ollama/qwen2.5",
    label: "Qwen 2.5 (local)",
    provider: "Ollama",
    color: "#10b981",
  },
];

const PERMISSION_CONFIGS: PermissionConfig[] = [
  {
    key: "list_tasks",
    label: "Lister les tâches",
    desc: "Voir toutes les tâches du système",
    icon: List,
    default: true,
  },
  {
    key: "get_task",
    label: "Consulter une tâche",
    desc: "Lire les détails d'une tâche",
    icon: FileText,
    default: true,
  },
  {
    key: "create_task",
    label: "Créer des tâches",
    desc: "Ajouter de nouvelles tâches",
    icon: Plus,
    default: true,
  },
  {
    key: "start_task",
    label: "Démarrer des tâches",
    desc: "Lancer des exécutions",
    icon: Play,
    default: true,
  },
  {
    key: "patch_task",
    label: "Modifier des tâches",
    desc: "Changer le statut, le nom…",
    icon: RefreshCw,
    default: true,
  },
  {
    key: "list_modeles",
    label: "Voir les modèles",
    desc: "Consulter les templates",
    icon: Cpu,
    default: true,
  },
  {
    key: "list_recurrences",
    label: "Voir les récurrences",
    desc: "Consulter les CRONs",
    icon: Clock,
    default: true,
  },
  {
    key: "delete_task",
    label: "Supprimer des tâches",
    desc: "Action irréversible !",
    icon: Trash,
    danger: true,
    default: false,
  },
  {
    key: "list_archives",
    label: "Voir les archives",
    desc: "Consulter les exécutions passées",
    icon: Archive,
    default: true,
  },
  {
    key: "patch_modele",
    label: "Modifier des modèles",
    desc: "Éditer les templates de tâches",
    icon: LayoutTemplate,
    default: false,
  },
  {
    key: "run_recurrence",
    label: "Déclencher récurrences",
    desc: "Lancer un CRON manuellement",
    icon: Repeat2,
    default: false,
  },
];

const TOOL_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ size?: number }>; color: string }
> = {
  list_tasks: { label: "Tâches listées", icon: List, color: "#8b5cf6" },
  get_task: { label: "Tâche consultée", icon: FileText, color: "#6366f1" },
  create_task: { label: "Tâche créée", icon: Plus, color: "#10b981" },
  start_task: { label: "Tâche démarrée", icon: Play, color: "#3b82f6" },
  delete_task: { label: "Tâche supprimée", icon: Trash, color: "#ef4444" },
  patch_task: { label: "Tâche modifiée", icon: RefreshCw, color: "#f59e0b" },
  list_modeles: { label: "Modèles listés", icon: Cpu, color: "#a855f7" },
  list_recurrences: { label: "Récurrences", icon: Clock, color: "#06b6d4" },
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

const ToolCallCard = ({ tc }: { tc: ToolCall }) => {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[tc.tool] || {
    label: tc.tool,
    icon: Zap,
    color: "#6b7280",
  };
  const Icon = meta.icon;
  const isDenied = (tc.result as any).__denied;
  const hasError = (tc.result as any).error;

  return (
    <div
      style={{
        border: `1px solid ${isDenied || hasError ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 10,
        overflow: "hidden",
        marginTop: 6,
        fontSize: "0.78rem",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          background: "rgba(0,0,0,0.15)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: isDenied || hasError ? "#ef4444" : "var(--text-secondary)",
        }}
      >
        <span
          style={{
            color: isDenied || hasError ? "#ef4444" : meta.color,
            display: "flex",
          }}
        >
          <Icon size={13} />
        </span>
        <span style={{ flex: 1, fontWeight: 600 }}>
          {isDenied
            ? "⛔ Permission refusée"
            : hasError
              ? `❌ ${hasError}`
              : `✅ ${meta.label}`}
        </span>
        <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
          {tc.tool}
        </span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(0,0,0,0.1)",
            display: "flex",
            gap: 10,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
              Entrée
            </div>
            <pre
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(tc.input, null, 2)}
            </pre>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
              Résultat
            </div>
            <pre
              style={{
                margin: 0,
                color: isDenied || hasError ? "#ef4444" : "#10b981",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(tc.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

// MarkdownRenderer imported from ./MarkdownRenderer (react-markdown based)

// ─── MessageBubble ────────────────────────────────────────────────────────────

const MessageBubble = ({
  msg,
  onTaskClick,
}: {
  msg: ChatMessage;
  onTaskClick?: (id: string) => void;
}) => {
  const isUser = msg.role === "user";
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyContent = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 10,
        alignItems: "flex-start",
        marginBottom: 16,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isUser
            ? "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))"
            : "linear-gradient(135deg, #1e1e2e, #2d2d3e)",
          border: "2px solid rgba(255,255,255,0.1)",
        }}
      >
        {isUser ? (
          <User size={16} color="white" />
        ) : (
          <Bot size={16} color="var(--brand-accent)" />
        )}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "75%",
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {/* Header: name + time + copy button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: isUser ? "var(--brand-accent)" : "var(--text-muted)",
            }}
          >
            {isUser ? "Vous" : "Lia"}
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {msg.ts.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {/* Copy button — visible on hover, not on loading */}
          {!msg.isLoading && hovered && (
            <button
              onClick={copyContent}
              title="Copier le message"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                padding: "2px 7px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: copied ? "#10b981" : "var(--text-muted)",
                fontSize: "0.7rem",
                transition: "all 0.15s",
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copié !" : "Copier"}
            </button>
          )}
        </div>

        <div
          style={{
            padding: "10px 14px",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            background: isUser
              ? "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))"
              : "var(--bg-glass)",
            border: isUser ? "none" : "1px solid var(--border-subtle)",
            color: isUser ? "white" : "var(--text-primary)",
            fontSize: "0.9rem",
            lineHeight: 1.55,
            boxShadow: hovered ? "0 2px 12px rgba(0,0,0,0.15)" : "none",
            transition: "box-shadow 0.15s",
          }}
        >
          {msg.isLoading ? (
            <div
              style={{
                display: "flex",
                gap: 5,
                alignItems: "center",
                padding: "2px 0",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--brand-accent)",
                    animation: `pulse 1.2s ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : (
            renderMarkdown(msg.content, onTaskClick)
          )}
        </div>

        {/* Tool calls */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div style={{ width: "100%", maxWidth: 460, marginTop: 4 }}>
            {msg.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} tc={tc} />
            ))}
          </div>
        )}

        {/* Plan preview */}
        {msg.plan && msg.plan.steps?.length > 0 && (
          <div style={{ width: "100%", maxWidth: 520, marginTop: 6 }}>
            <LiaPlanPreview plan={msg.plan} />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── PermissionsPanel ────────────────────────────────────────────────────────

const PermissionsPanel = ({
  permissions,
  onChange,
  onClose,
}: {
  permissions: Record<string, boolean>;
  onChange: (key: string, val: boolean) => void;
  onClose: () => void;
}) => (
  <div
    style={{
      width: 300,
      background: "var(--bg-surface)",
      borderLeft: "1px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        padding: "16px 18px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Settings2 size={16} color="var(--brand-accent)" />
      <span style={{ fontWeight: 700, fontSize: "0.95rem", flex: 1 }}>
        Autorisations
      </span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: 4,
        }}
      >
        <X size={16} />
      </button>
    </div>

    <div
      style={{
        padding: "10px 12px",
        background: "rgba(251,191,36,0.08)",
        borderBottom: "1px solid rgba(251,191,36,0.15)",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <AlertTriangle
          size={13}
          color="#f59e0b"
          style={{ flexShrink: 0, marginTop: 2 }}
        />
        <span
          style={{ fontSize: "0.75rem", color: "#f59e0b", lineHeight: 1.4 }}
        >
          Ces permissions contrôlent ce que Lia peut faire sur le système. Les
          actions désactivées seront refusées.
        </span>
      </div>
    </div>

    <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
      {PERMISSION_CONFIGS.map((cfg) => {
        const Icon = cfg.icon;
        const enabled = permissions[cfg.key] ?? cfg.default;
        return (
          <div
            key={cfg.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: cfg.danger ? "rgba(239,68,68,0.04)" : "transparent",
            }}
          >
            <span
              style={{
                color: cfg.danger ? "#ef4444" : "var(--text-muted)",
                display: "flex",
              }}
            >
              <Icon size={16} />
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: cfg.danger ? "#ef4444" : "var(--text-primary)",
                }}
              >
                {cfg.label}
              </div>
              <div
                style={{
                  fontSize: "0.73rem",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {cfg.desc}
              </div>
            </div>
            {/* Toggle */}
            <button
              onClick={() => onChange(cfg.key, !enabled)}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                flexShrink: 0,
                background: enabled
                  ? cfg.danger
                    ? "#ef4444"
                    : "var(--brand-primary)"
                  : "rgba(255,255,255,0.1)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "white",
                  position: "absolute",
                  top: 3,
                  left: enabled ? 21 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          </div>
        );
      })}
    </div>

    <div
      style={{
        padding: "12px 18px",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <button
        onClick={() => {
          PERMISSION_CONFIGS.forEach((c) => onChange(c.key, c.default));
        }}
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
          cursor: "pointer",
          fontSize: "0.8rem",
        }}
      >
        Réinitialiser les permissions
      </button>
    </div>
  </div>
);

// ─── ModelSelector ────────────────────────────────────────────────────────────

const ModelSelector = ({
  model,
  onChange,
}: {
  model: string;
  onChange: (m: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === model) || MODELS[0];

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 20,
          padding: "6px 12px",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: "0.82rem",
          fontWeight: 600,
          transition: "background 0.2s",
        }}
        onMouseOver={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
        }
        onMouseOut={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
        }
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: current.color,
            flexShrink: 0,
            boxShadow: `0 0 6px ${current.color}88`,
          }}
        />
        <span>{current.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            padding: 6,
            minWidth: 240,
            boxShadow: "var(--shadow-md)",
          }}
        >
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 8,
                background:
                  model === m.id ? "rgba(139,92,246,0.12)" : "transparent",
                border: "1px solid transparent",
                cursor: "pointer",
                color:
                  model === m.id
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                textAlign: "left",
                fontSize: "0.83rem",
                transition: "background 0.15s",
              }}
              onMouseOver={(e) => {
                if (model !== m.id)
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseOut={(e) => {
                if (model !== m.id)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: m.color,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{m.label}</div>
                <div
                  style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}
                >
                  {m.provider}
                </div>
              </div>
              {model === m.id && (
                <Check size={14} style={{ marginLeft: "auto" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── ExecutionModeSelector ────────────────────────────────────────────────────

const EXEC_MODES: {
  id: ExecutionMode;
  label: string;
  icon: React.ReactNode;
  color: string;
  desc: string;
}[] = [
  {
    id: "plan",
    label: "Plan",
    icon: <Eye size={13} />,
    color: "#3b82f6",
    desc: "Planifie et attend votre validation",
  },
  {
    id: "auto",
    label: "Auto",
    icon: <Zap size={13} />,
    color: "#10b981",
    desc: "Exécute tout automatiquement",
  },
  {
    id: "confirm",
    label: "Confirmer",
    icon: <ShieldCheck size={13} />,
    color: "#f59e0b",
    desc: "Demande avant chaque action critique",
  },
];

const ExecutionModeSelector = ({
  mode,
  onChange,
}: {
  mode: ExecutionMode;
  onChange: (m: ExecutionMode) => void;
}) => {
  const active = EXEC_MODES.find((m) => m.id === mode)!;
  return (
    <div
      title={active.desc}
      style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 20,
        padding: "3px",
        gap: 2,
      }}
    >
      {EXEC_MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          title={m.desc}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            fontSize: "0.78rem",
            fontWeight: 600,
            transition: "all 0.2s",
            background: mode === m.id ? `${m.color}22` : "transparent",
            color: mode === m.id ? m.color : "var(--text-muted)",
            boxShadow: mode === m.id ? `0 0 0 1px ${m.color}55` : "none",
          }}
        >
          {m.icon}
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
};

// ─── ChatModule ───────────────────────────────────────────────────────────────

const DEFAULT_PERMISSIONS = Object.fromEntries(
  PERMISSION_CONFIGS.map((c) => [c.key, c.default]),
);

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: `Bonjour ! Je suis **Lia**, votre assistante IA ClawBoard. 👋

Décrivez-moi ce que vous voulez et je m'en occupe :
• 🗺️ *"Je veux un système de monitoring concurrentiel"* — je génère un plan complet
• ➕ *"Crée les tâches pour un blog SEO"* — tâches + modèles + CRONs
• 📊 *"Mets en place un briefing quotidien"* — templates + récurrences
• 📋 *"Liste mes tâches"* — consulter l'existant

**Modes d'exécution** (sélecteur en haut) :
• 🗺️ **Plan** — je propose un plan, vous validez, je crée tout d'un coup
• ⚡ **Auto** — j'exécute tout automatiquement
• ✋ **Confirmer** — je demande confirmation avant chaque action critique

Sélectionnez votre modèle IA et configurez les permissions avec ⚙️`,
  toolCalls: [],
  ts: new Date(),
};

// ─── Conversation persistence ─────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: string;
}

const STORAGE_KEY = "clawboard-chat-history";
const ACTIVE_CONV_KEY = "clawboard-chat-active";
const EXEC_MODE_KEY = "clawboard-exec-mode";
const MAX_CONVS = 30;

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((c: Conversation) => ({
      ...c,
      messages: c.messages.map((m) => ({ ...m, ts: new Date(m.ts) })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, MAX_CONVS)));
}

function convTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.id !== "welcome");
  return first ? first.content.slice(0, 50) : "Nouvelle conversation";
}

// ─── ConversationHistory ──────────────────────────────────────────────────────

const ConversationHistory = ({
  convs,
  currentId,
  onSelect,
  onDelete,
  onClose,
}: {
  convs: Conversation[];
  currentId: string;
  onSelect: (c: Conversation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) => (
  <div
    style={{
      width: 240,
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <History size={15} color="var(--brand-accent)" />
      <span style={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
        Historique
      </span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: 4,
        }}
      >
        <X size={15} />
      </button>
    </div>
    <div style={{ flex: 1, overflowY: "auto" }}>
      {convs.length === 0 ? (
        <div
          style={{
            padding: "24px 16px",
            color: "var(--text-muted)",
            fontSize: "0.82rem",
            textAlign: "center",
          }}
        >
          Aucune conversation sauvegardée
        </div>
      ) : (
        convs.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 12px",
              background:
                c.id === currentId ? "rgba(139,92,246,0.1)" : "transparent",
              borderLeft:
                c.id === currentId
                  ? "3px solid var(--brand-accent)"
                  : "3px solid transparent",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onClick={() => onSelect(c)}
            onMouseOver={(e) => {
              if (c.id !== currentId)
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseOut={(e) => {
              if (c.id !== currentId)
                e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.title}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {new Date(c.createdAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 4,
                opacity: 0.6,
                flexShrink: 0,
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.opacity = "0.6";
              }}
            >
              <Trash size={12} />
            </button>
          </div>
        ))
      )}
    </div>
  </div>
);

// ─── ChatModule ───────────────────────────────────────────────────────────────

export const ChatModule = () => {
  const [conversations, setConvs] = useState<Conversation[]>(loadConversations);
  const [convId, setConvId] = useState<string>(() => {
    const savedId = localStorage.getItem(ACTIVE_CONV_KEY);
    if (savedId) return savedId;
    return uid();
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const savedId = localStorage.getItem(ACTIVE_CONV_KEY);
    if (savedId) {
      try {
        const convs = loadConversations();
        const active = convs.find((c) => c.id === savedId);
        if (active) return active.messages;
      } catch {
        /* fall through */
      }
    }
    return [WELCOME];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState(
    () => localStorage.getItem("lia-model") || MODELS[0].id,
  );
  const [permissions, setPermissions] = useState<Record<string, boolean>>(
    () => {
      try {
        return JSON.parse(localStorage.getItem("lia-permissions") || "{}");
      } catch {
        return {};
      }
    },
  );
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    () => (localStorage.getItem(EXEC_MODE_KEY) as ExecutionMode) || "confirm",
  );
  const [showPerms, setShowPerms] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [keySynced, setKeySynced] = useState(false);
  const [taskNotif, setTaskNotif] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const prevTaskCountRef = useRef<number | null>(null);
  const { agents: rosterAgents } = useAgentRoster();

  // ── Live task sync via SSE ──────────────────────────────────────────────────
  const { data: liveTasks } = useSSE<
    { id: string; name?: string; status: string }[] | null
  >("/api/tasks?stream=1", null);

  useEffect(() => {
    if (!liveTasks) return;
    const count = liveTasks.length;
    if (prevTaskCountRef.current === null) {
      prevTaskCountRef.current = count;
      return;
    }
    if (count > prevTaskCountRef.current) {
      const newTask = liveTasks[liveTasks.length - 1];
      setTaskNotif(`✅ Tâche créée : ${newTask?.name || newTask?.id}`);
    } else if (count < prevTaskCountRef.current) {
      setTaskNotif(`🗑️ Tâche supprimée`);
    } else {
      // Status change on existing task
      setTaskNotif(`🔄 Tâche mise à jour`);
    }
    prevTaskCountRef.current = count;
    const t = setTimeout(() => setTaskNotif(null), 3500);
    return () => clearTimeout(t);
  }, [liveTasks]);

  const { syncToBackend, configuredCount } = useApiKeys();

  // ── Save conversation to localStorage when messages change ──────────────────
  useEffect(() => {
    const realMsgs = messages.filter((m) => m.id !== "welcome" && !m.isLoading);
    if (realMsgs.length === 0) return;
    const conv: Conversation = {
      id: convId,
      title: convTitle(messages),
      messages,
      model,
      createdAt: new Date().toISOString(),
    };
    setConvs((prev) => {
      const filtered = prev.filter((c) => c.id !== convId);
      const updated = [conv, ...filtered];
      saveConversations(updated);
      return updated;
    });
  }, [messages]);

  // ── Start a new conversation ────────────────────────────────────────────────
  const newChat = useCallback(() => {
    const newId = uid();
    setConvId(newId);
    localStorage.setItem(ACTIVE_CONV_KEY, newId);
    setMessages([WELCOME]);
    setInput("");
    setShowHistory(false);
    textareaRef.current?.focus();
  }, []);

  // ── Load a past conversation ────────────────────────────────────────────────
  const loadConversation = useCallback((c: Conversation) => {
    setConvId(c.id);
    setMessages(c.messages);
    setModel(c.model);
    setShowHistory(false);
  }, []);

  // ── Delete a conversation ───────────────────────────────────────────────────
  const deleteConversation = useCallback(
    (id: string) => {
      setConvs((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        saveConversations(updated);
        return updated;
      });
      if (id === convId) newChat();
    },
    [convId, newChat],
  );

  // ── Export current conversation as .md ─────────────────────────────────────
  const exportChat = useCallback(() => {
    const lines = [
      `# Conversation Lia — ${new Date().toLocaleDateString("fr-FR")}\n`,
    ];
    messages
      .filter((m) => m.id !== "welcome")
      .forEach((m) => {
        lines.push(
          `\n## ${m.role === "user" ? "Vous" : "Lia"} (${m.ts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})\n`,
        );
        lines.push(m.content + "\n");
      });
    const blob = new Blob([lines.join("")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lia-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const effectivePerms = { ...DEFAULT_PERMISSIONS, ...permissions };

  // Auto-sync API keys to backend on mount so Lia can use them immediately
  useEffect(() => {
    syncToBackend().then((ok) => setKeySynced(ok));
    // Read prefill from TaskDetailPanel "Ask Lia" button
    const prefill = localStorage.getItem("lia-prefill");
    if (prefill) {
      localStorage.removeItem("lia-prefill");
      setInput(prefill);
      textareaRef.current?.focus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist model choice
  useEffect(() => {
    localStorage.setItem("lia-model", model);
  }, [model]);

  // Persist permissions
  useEffect(() => {
    localStorage.setItem("lia-permissions", JSON.stringify(permissions));
  }, [permissions]);

  // Persist active conversation ID
  useEffect(() => {
    localStorage.setItem(ACTIVE_CONV_KEY, convId);
  }, [convId]);

  // Persist execution mode
  useEffect(() => {
    localStorage.setItem(EXEC_MODE_KEY, executionMode);
  }, [executionMode]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const togglePerm = (key: string, val: boolean) => {
    setPermissions((p) => ({ ...p, [key]: val }));
  };

  const clearChat = () => newChat();

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    textareaRef.current?.focus();

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      ts: new Date(),
    };
    const loadingMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      ts: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);
    setIsThinking(true);

    // Build conversation history for the API (exclude welcome + loading)
    const history = [
      ...messages.filter((m) => m.id !== "welcome"),
      userMsg,
    ].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantId = uid();

    // ── Plan mode: generate structured plan first ─────────────────────────
    if (executionMode === "plan") {
      try {
        const planRes = await apiFetch(`${BASE}/api/chat/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: text, model }),
        });
        if (planRes.ok) {
          const planData = await planRes.json().catch(() => null);
          if (planData && planData.steps && planData.steps.length > 0) {
            const plan: LiaPlan = {
              summary: planData.summary || "Plan d'exécution généré",
              steps: planData.steps,
              risks: planData.risks,
              estimated_tokens: planData.estimated_tokens,
            };
            setIsThinking(false);
            setMessages((prev) => [
              ...prev.filter((m) => !m.isLoading),
              {
                id: assistantId,
                role: "assistant",
                content: `🗺️ **Plan généré** : ${plan.summary}\n\nValidez les étapes ci-dessous puis cliquez sur **Exécuter le plan** pour tout créer d'un coup.`,
                plan,
                toolCalls: [],
                ts: new Date(),
              },
            ]);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Fall through to normal stream if plan endpoint fails
      }
    }

    // ── ACP agent routing : si un agent CLI est sélectionné, on lui envoie directement
    if (selectedAgentId) {
      try {
        const acpRes = await apiFetch(
          `${BASE}/api/acp/agents/${selectedAgentId}/message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, stream: true }),
          }
        ).catch(() => null);

        const agentName = rosterAgents.find(a => a.id === selectedAgentId)?.name ?? selectedAgentId;
        let reply = `⚡ **${agentName}** a reçu la tâche.`;

        if (acpRes?.ok) {
          try {
            const data = await acpRes.json();
            reply = data?.reply ?? data?.output ?? data?.message ?? reply;
          } catch { /* stream ou JSON vide */ }
        }

        setMessages(prev => [
          ...prev.filter(m => !m.isLoading),
          { id: uid(), role: "assistant", content: reply, ts: new Date() },
        ]);
        setIsLoading(false);
        setIsThinking(false);
        return;
      } catch {
        // fallback vers Lia si l'agent ACP est inaccessible
      }
    }

    try {
      const res = await apiFetch(`${BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          model,
          permissions: effectivePerms,
          executionMode,
          agentHint: selectedAgentId ?? undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      let toolCalls: ToolCall[] = [];
      let receivedPlan: LiaPlan | undefined;

      // Insert empty assistant message to stream into
      setIsThinking(false);
      setMessages((prev) => [
        ...prev.filter((m) => !m.isLoading),
        {
          id: assistantId,
          role: "assistant",
          content: "",
          ts: new Date(),
          toolCalls: [],
        },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          try {
            const evt = JSON.parse(raw);
            if (evt.token) {
              accumulated += evt.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m,
                ),
              );
            }
            // Handle plan event from backend
            if (evt.plan && evt.plan.steps) {
              receivedPlan = evt.plan as LiaPlan;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, plan: receivedPlan } : m,
                ),
              );
            }
            if (evt.done) {
              toolCalls = evt.toolCalls || [];
            }
          } catch {
            /* skip */
          }
        }
      }

      // Finalize message with tool calls and plan
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated, toolCalls, plan: receivedPlan }
            : m,
        ),
      );
    } catch (err) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.isLoading && m.id !== assistantId),
        {
          id: assistantId,
          role: "assistant",
          content: `❌ Erreur de connexion au serveur.\n\nVérifiez que le backend est démarré sur :4000.`,
          toolCalls: [],
          ts: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  }, [input, isLoading, messages, model, effectivePerms]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeModel = MODELS.find((m) => m.id === model) || MODELS[0];
  const enabledCount = Object.values(effectivePerms).filter(Boolean).length;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* ── History panel ── */}
      {showHistory && (
        <ConversationHistory
          convs={conversations}
          currentId={convId}
          onSelect={loadConversation}
          onDelete={deleteConversation}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* ── Chat area ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, #1e1e2e, var(--brand-accent))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid rgba(255,255,255,0.1)",
            }}
          >
            <Bot size={18} color="var(--brand-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>
              {selectedAgentId
                ? (rosterAgents.find(a => a.id === selectedAgentId)?.name ?? "Agent")
                : "Lia"}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: selectedAgentId ? (rosterAgents.find(a => a.id === selectedAgentId)?.color ?? "#10b981") : "#10b981",
                  display: "inline-block",
                }}
              />
              {selectedAgentId
                ? `Agent ${rosterAgents.find(a => a.id === selectedAgentId)?.source === "acp" ? "CLI" : "NemoClaw"} — ${rosterAgents.find(a => a.id === selectedAgentId)?.role ?? ""}`
                : `Assistante ClawBoard — ${activeModel.provider}`}
            </div>
          </div>

          {/* ── Agent Dispatcher ───────────────────────────────────────── */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowAgentPicker(o => !o)}
              title="Dispatcher vers un agent"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: selectedAgentId
                  ? `${rosterAgents.find(a => a.id === selectedAgentId)?.color ?? "var(--brand-accent)"}22`
                  : "rgba(255,255,255,0.06)",
                border: `1px solid ${selectedAgentId
                  ? (rosterAgents.find(a => a.id === selectedAgentId)?.color ?? "var(--brand-accent)") + "55"
                  : "var(--border-subtle)"}`,
                borderRadius: 20,
                padding: "6px 12px",
                cursor: "pointer",
                color: selectedAgentId
                  ? (rosterAgents.find(a => a.id === selectedAgentId)?.color ?? "var(--brand-accent)")
                  : "var(--text-secondary)",
                fontSize: "0.78rem",
                fontWeight: 600,
                transition: "all 0.2s",
              }}
            >
              <Cpu size={13} />
              {selectedAgentId
                ? rosterAgents.find(a => a.id === selectedAgentId)?.name ?? "Agent"
                : "Lia (auto)"}
              <ChevronDown size={11} style={{ opacity: 0.6 }} />
            </button>

            {showAgentPicker && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  zIndex: 50,
                  minWidth: 220,
                  overflow: "hidden",
                }}
              >
                {/* Option Lia */}
                <button
                  onClick={() => { setSelectedAgentId(null); setShowAgentPicker(false); }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: !selectedAgentId ? "rgba(139,92,246,0.1)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                    color: !selectedAgentId ? "var(--brand-accent)" : "var(--text-secondary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  Lia (NemoClaw — auto)
                </button>

                {/* Séparateur NemoClaw */}
                <div style={{ padding: "4px 14px 2px", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Agents NemoClaw
                </div>
                {rosterAgents.filter(a => a.source === "nemoclaw").map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => { setSelectedAgentId(agent.id); setShowAgentPicker(false); }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      background: selectedAgentId === agent.id ? `${agent.color}18` : "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: selectedAgentId === agent.id ? agent.color : "var(--text-secondary)",
                      fontSize: "0.82rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: agent.status === "active" ? "#10b981" : "#6b7280", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{agent.name}</span>
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{agent.role}</span>
                  </button>
                ))}

                {/* Séparateur CLI */}
                <div style={{ padding: "4px 14px 2px", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", borderTop: "1px solid var(--border-subtle)", marginTop: 2 }}>
                  Agents CLI
                </div>
                {rosterAgents.filter(a => a.source === "acp").map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => { setSelectedAgentId(agent.id); setShowAgentPicker(false); }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      background: selectedAgentId === agent.id ? `${agent.color}18` : "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: selectedAgentId === agent.id ? agent.color : "var(--text-secondary)",
                      fontSize: "0.82rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: agent.status === "active" || agent.status === "idle" ? agent.color : "#6b7280", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{agent.name}</span>
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{agent.command}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ModelSelector model={model} onChange={setModel} />

          <ExecutionModeSelector
            mode={executionMode}
            onChange={setExecutionMode}
          />

          {/* API key status badge */}
          {configuredCount > 0 && (
            <div
              title={`${configuredCount} clé(s) API configurée(s)`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: keySynced
                  ? "rgba(16,185,129,0.1)"
                  : "rgba(245,158,11,0.1)",
                border: `1px solid ${keySynced ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`,
                borderRadius: 20,
                padding: "5px 10px",
                fontSize: "0.75rem",
                color: keySynced ? "#10b981" : "#f59e0b",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "currentColor",
                  display: "inline-block",
                }}
              />
              {configuredCount} clé{configuredCount > 1 ? "s" : ""}
            </div>
          )}

          {/* Permissions button */}
          <button
            onClick={() => setShowPerms((o) => !o)}
            title="Gérer les autorisations"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: showPerms
                ? "rgba(139,92,246,0.15)"
                : "rgba(255,255,255,0.06)",
              border: `1px solid ${showPerms ? "rgba(139,92,246,0.35)" : "var(--border-subtle)"}`,
              borderRadius: 20,
              padding: "6px 12px",
              cursor: "pointer",
              color: showPerms
                ? "var(--brand-accent)"
                : "var(--text-secondary)",
              fontSize: "0.8rem",
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            <Settings2 size={14} />
            <span>
              {enabledCount}/{PERMISSION_CONFIGS.length}
            </span>
          </button>

          {/* History */}
          <button
            onClick={() => setShowHistory((o) => !o)}
            title="Historique des conversations"
            style={{
              background: showHistory
                ? "rgba(139,92,246,0.15)"
                : "rgba(255,255,255,0.05)",
              border: `1px solid ${showHistory ? "rgba(139,92,246,0.35)" : "var(--border-subtle)"}`,
              borderRadius: 8,
              padding: "7px",
              cursor: "pointer",
              color: showHistory ? "var(--brand-accent)" : "var(--text-muted)",
              display: "flex",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            <History size={15} />
            {conversations.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  background: "var(--brand-accent)",
                  color: "white",
                  borderRadius: "50%",
                  width: 14,
                  height: 14,
                  fontSize: "0.6rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                {conversations.length > 9 ? "9+" : conversations.length}
              </span>
            )}
          </button>

          {/* New chat */}
          <button
            onClick={newChat}
            title="Nouvelle conversation"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              padding: "7px",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(16,185,129,0.1)";
              e.currentTarget.style.color = "#10b981";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <PlusCircle size={15} />
          </button>

          {/* Export */}
          {messages.filter((m) => m.id !== "welcome").length > 0 && (
            <button
              onClick={exportChat}
              title="Exporter la conversation (.md)"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: "7px",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
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
              <Download size={15} />
            </button>
          )}

          {/* Clear */}
          <button
            onClick={clearChat}
            title="Effacer la conversation"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              padding: "7px",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
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
            <Trash2 size={15} />
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 20px 8px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Live task change notification */}
          {taskNotif && (
            <div
              style={{
                alignSelf: "center",
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.25)",
                borderRadius: 20,
                padding: "5px 14px",
                fontSize: "0.78rem",
                color: "var(--brand-accent)",
                marginBottom: 8,
                animation: "fadeIn 0.3s ease",
              }}
            >
              {taskNotif} —{" "}
              <span
                style={{ textDecoration: "underline", cursor: "pointer" }}
                onClick={() => navigate("/tasks")}
              >
                Voir les tâches
              </span>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onTaskClick={(id) => navigate(`/tasks/${id}`)}
            />
          ))}
          {/* Thinking indicator — shown before first token arrives */}
          {isThinking && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg, #1e1e2e, #2d2d3e)",
                  border: "2px solid rgba(255,255,255,0.1)",
                }}
              >
                <Bot size={16} color="var(--brand-accent)" />
              </div>
              <div
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "18px 18px 18px 4px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    marginRight: 4,
                  }}
                >
                  Lia réfléchit
                </span>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--brand-accent)",
                      animation: `pulse 1.2s ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick suggestions (shown only at start) */}
        {messages.length <= 1 && (
          <div
            style={{
              padding: "0 20px 12px",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {[
              "Mets en place un système de veille concurrentielle",
              "Crée un pipeline de contenu SEO",
              "Je veux un briefing quotidien automatique",
              "Liste mes tâches",
            ].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  textareaRef.current?.focus();
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: "0.78rem",
                  background: "rgba(139,92,246,0.1)",
                  border: "1px solid rgba(139,92,246,0.25)",
                  color: "var(--brand-accent)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "rgba(139,92,246,0.2)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "rgba(139,92,246,0.1)")
                }
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 14,
              padding: "8px 8px 8px 14px",
              transition: "border-color 0.2s",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Écrivez un message… (Entrée pour envoyer, Shift+Entrée pour saut de ligne)"
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                lineHeight: 1.55,
                fontFamily: "inherit",
                padding: 0,
                maxHeight: 120,
                overflowY: "auto",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                background:
                  input.trim() && !isLoading
                    ? "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))"
                    : "rgba(255,255,255,0.08)",
                border: "none",
                cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
                color: "white",
              }}
            >
              <Send size={15} />
            </button>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Modèle :{" "}
            <strong style={{ color: activeModel.color }}>
              {activeModel.label}
            </strong>
            {" · "}
            {enabledCount} permission{enabledCount > 1 ? "s" : ""} active
            {enabledCount > 1 ? "s" : ""}
            {" · "}
            Mode :{" "}
            <strong
              style={{
                color: EXEC_MODES.find((m) => m.id === executionMode)!.color,
              }}
            >
              {EXEC_MODES.find((m) => m.id === executionMode)!.label}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Permissions panel ── */}
      {showPerms && (
        <PermissionsPanel
          permissions={effectivePerms}
          onChange={togglePerm}
          onClose={() => setShowPerms(false)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};
