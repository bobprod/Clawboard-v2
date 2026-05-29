import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch";
import { useAgentRoster } from "../hooks/useAgentRoster";
import { SkillsPicker } from "./SkillsPicker";
import {
  ArrowLeft,
  Save,
  Play,
  Plus,
  Minus,
  ToggleLeft,
  ToggleRight,
  PenLine,
  Loader2,
  HelpCircle,
  BookmarkPlus,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  RotateCcw,
  QrCode,
  RefreshCw,
  Copy,
  CheckCircle2,
  Link2,
  Send,
  Zap,
} from "lucide-react";
import { TaskCreatorTour, resetTaskCreatorTour } from "./TaskCreatorTour";

const BASE = "http://localhost:4000";
const DRAFT_KEY = "clawboard-task-creator-draft";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", color: "#8b5cf6" },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "⚡ Nemotron Ultra 253B",
    color: "#76b900",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1",
    label: "Nemotron Super 49B",
    color: "#76b900",
  },
  {
    id: "meta/llama-3.1-405b-instruct",
    label: "⚡ Llama 3.1 405B",
    color: "#0064c8",
  },
  { id: "deepseek-ai/deepseek-v3.2", label: "DeepSeek V3.2", color: "#1a73e8" },
  { id: "qwen/qwq-32b", label: "QwQ 32B", color: "#9333ea" },
  { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5", color: "#3b82f6" },
  {
    id: "gemini/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    color: "#4285f4",
  },
  { id: "ollama/qwen2.5", label: "Qwen 2.5 (local)", color: "#10b981" },
];

// ── Smart LLM Router ─────────────────────────────────────────────────────────
const MODEL_ROUTER: { keywords: string[]; model: string; reason: string }[] = [
  {
    keywords: [
      "code",
      "script",
      "fonction",
      "function",
      "bug",
      "debug",
      "python",
      "javascript",
      "typescript",
      "api",
      "programme",
      "coder",
      "développe",
      "implement",
      "refactor",
      "test unitaire",
      "unit test",
      "class",
      "module",
      "endpoint",
      "sql",
      "regex",
      "algorithme",
    ],
    model: "meta/llama-3.1-405b-instruct",
    reason: "code détecté",
  },
  {
    keywords: [
      "analyse",
      "analyze",
      "research",
      "rapport",
      "résumé",
      "summarize",
      "insight",
      "données",
      "data",
      "compare",
      "évalue",
      "audit",
      "étudie",
      "revue",
      "review",
      "benchmark",
      "rapport de",
      "synthèse",
    ],
    model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    reason: "analyse détectée",
  },
  {
    keywords: [
      "rédige",
      "écris",
      "traduit",
      "email",
      "article",
      "blog",
      "contenu",
      "rédaction",
      "write",
      "letter",
      "creative",
      "présentation",
      "doc",
      "documentation",
      "readme",
      "copywriting",
    ],
    model: "claude-sonnet-4-6",
    reason: "rédaction détectée",
  },
  {
    keywords: [
      "math",
      "calcul",
      "equation",
      "statistique",
      "formula",
      "calcule",
      "résoudre",
      "solve",
      "theorem",
      "probability",
      "intégrale",
      "dérivée",
      "optimisation",
      "modèle mathématique",
    ],
    model: "deepseek-ai/deepseek-v3.2",
    reason: "maths/raisonnement détecté",
  },
];

function suggestModel(
  text: string,
): { model: string; label: string; reason: string } | null {
  const lower = text.toLowerCase();
  for (const { keywords, model, reason } of MODEL_ROUTER) {
    if (keywords.some((k) => lower.includes(k))) {
      const found = MODELS.find((m) => m.id === model);
      return { model, label: found?.label ?? model, reason };
    }
  }
  return null;
}

const CHANNELS = ["telegram", "discord", "whatsapp", "webhook"] as const;

// ── QR Pairing Modal ────────────────────────────────────────────────────────
interface PairingData {
  token: string;
  pairingUrl: string;
  expiresIn: number; // seconds
  instructions: string[];
}

function QrPairingModal({
  canal,
  destinataire,
  onClose,
}: {
  canal: string;
  destinataire: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PairingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [ttl, setTtl] = useState(0);

  const fetchPairing = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        platform: canal,
        targetId: destinataire,
      });
      const res = await apiFetch(`${BASE}/api/pairing/qr?${params}`);
      const json = await res.json();
      setData(json);
      setTtl(json.expiresIn ?? 300);
    } catch {
      // Mock graceful fallback
      const token = Math.random().toString(36).slice(2, 10).toUpperCase();
      const pairingUrl =
        canal === "telegram"
          ? `https://t.me/nemoclaw_bot?start=${token}`
          : canal === "discord"
            ? `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_DISCORD_CLIENT_ID ?? "DISCORD_CLIENT_ID_NON_CONFIGURE"}&scope=bot&state=${token}`
            : `https://clawboard.local/pair/${token}`;
      setData({
        token,
        pairingUrl,
        expiresIn: 300,
        instructions:
          canal === "telegram"
            ? [
                "Ouvrez Telegram sur votre téléphone",
                "Scannez le QR code ou cliquez sur le lien",
                "Envoyez /start au bot Nemoclaw",
                "Le Chat ID sera lié automatiquement",
              ]
            : canal === "discord"
              ? [
                  "Scannez le QR code ou ouvrez le lien",
                  "Autorisez le bot Nemoclaw dans votre serveur",
                  "Choisissez le salon de destination",
                  "L'ID du salon sera enregistré automatiquement",
                ]
              : [
                  "Scannez le QR code pour initier le pairing",
                  "Suivez les instructions dans votre navigateur",
                ],
      });
      setTtl(300);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPairing();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (ttl <= 0) return;
    const t = setInterval(() => setTtl((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [ttl]);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.pairingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const qrImgUrl = data
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=12&data=${encodeURIComponent(data.pairingUrl)}`
    : "";

  const ttlMin = Math.floor(ttl / 60);
  const ttlSec = ttl % 60;
  const expired = ttl <= 0;

  const PLATFORM_COLOR: Record<string, string> = {
    telegram: "#2CA5E0",
    discord: "#5865F2",
  };
  const accent = PLATFORM_COLOR[canal] ?? "var(--brand-accent)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 18,
          padding: 32,
          width: "100%",
          maxWidth: 480,
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
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
                background: `${accent}22`,
                border: `1px solid ${accent}44`,
                borderRadius: 10,
                padding: 8,
                color: accent,
              }}
            >
              <QrCode size={20} />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  color: "var(--text-primary)",
                  textTransform: "capitalize",
                }}
              >
                Pairing {canal}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                Liez votre compte en quelques secondes
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 6,
              borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "var(--text-muted)",
            }}
          >
            <Loader2
              size={28}
              style={{
                animation: "spin 1s linear infinite",
                margin: "0 auto 10px",
                display: "block",
              }}
            />
            Génération du code de pairing…
          </div>
        ) : expired ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ color: "#ef4444", marginBottom: 12, fontSize: 14 }}>
              QR code expiré
            </div>
            <button
              onClick={fetchPairing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                margin: "0 auto",
                padding: "8px 18px",
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: 8,
                color: "var(--brand-accent)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <RefreshCw size={14} /> Regénérer
            </button>
          </div>
        ) : data ? (
          <>
            {/* QR Code */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 8,
                  border: `2px solid ${accent}44`,
                  boxShadow: `0 0 24px ${accent}22`,
                }}
              >
                <img
                  src={qrImgUrl}
                  alt="QR Code de pairing"
                  width={200}
                  height={200}
                  style={{ display: "block", borderRadius: 8 }}
                />
              </div>
              {/* Timer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: ttl < 60 ? "#ef4444" : "var(--text-muted)",
                }}
              >
                <RefreshCw size={11} />
                Expire dans {ttlMin}:{ttlSec.toString().padStart(2, "0")}
              </div>
            </div>

            {/* Token + Copy */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-glass)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 9,
                padding: "10px 14px",
              }}
            >
              <Link2
                size={13}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 11.5,
                  fontFamily: "var(--mono)",
                  color: "var(--text-secondary)",
                  wordBreak: "break-all",
                }}
              >
                {data.pairingUrl}
              </span>
              <button
                onClick={handleCopy}
                title="Copier"
                style={{
                  flexShrink: 0,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copied ? "#10b981" : "var(--text-muted)",
                  padding: 4,
                }}
              >
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {/* Token code */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Code de vérification
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.3em",
                  color: accent,
                  textShadow: `0 0 20px ${accent}66`,
                }}
              >
                {data.token}
              </div>
            </div>

            {/* Instructions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.instructions.map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: `${accent}22`,
                      border: `1px solid ${accent}44`,
                      color: accent,
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>

            <button
              onClick={fetchPairing}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "7px 16px",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <RefreshCw size={12} /> Regénérer un nouveau code
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Webhook Test Button ──────────────────────────────────────────────────────
function WebhookTestButton({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle",
  );

  const handleTest = async () => {
    if (!url.startsWith("https://")) {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
      return;
    }
    setStatus("sending");
    try {
      const isDiscord = url.includes("discord.com/api/webhooks");
      const body = isDiscord
        ? JSON.stringify({
            content: "✅ **Clawboard** — connexion webhook OK !",
          })
        : JSON.stringify({ text: "✅ Clawboard — connexion webhook OK !" });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 3000);
  };

  const cfg = {
    idle: {
      label: "Tester",
      color: "#5865F2",
      bg: "rgba(88,101,242,0.12)",
      border: "rgba(88,101,242,0.3)",
    },
    sending: {
      label: "…",
      color: "#94a3b8",
      bg: "var(--bg-glass)",
      border: "var(--border-subtle)",
    },
    ok: {
      label: "Envoyé !",
      color: "#10b981",
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.3)",
    },
    error: {
      label: "Erreur",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.3)",
    },
  }[status];

  return (
    <button
      type="button"
      onClick={handleTest}
      disabled={status === "sending"}
      title="Envoyer un message test"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "9px 13px",
        borderRadius: 8,
        cursor: status === "sending" ? "wait" : "pointer",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        transition: "all 0.2s",
      }}
    >
      {status === "sending" ? (
        <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
      ) : status === "ok" ? (
        <CheckCircle2 size={13} />
      ) : (
        <Send size={13} />
      )}
      {cfg.label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  background: "var(--bg-glass)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {label}
        {hint && (
          <span title={hint} style={{ cursor: "help", opacity: 0.6 }}>
            <Info size={11} />
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

type WarnItem = {
  key: string;
  msg: string;
  severity: "error" | "warn" | "info";
};

function ValidationBanner({ items }: { items: WarnItem[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((w) => (
        <div
          key={w.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: "12.5px",
            background:
              w.severity === "error"
                ? "rgba(239,68,68,0.08)"
                : w.severity === "warn"
                  ? "rgba(245,158,11,0.08)"
                  : "rgba(59,130,246,0.08)",
            border: `1px solid ${w.severity === "error" ? "rgba(239,68,68,0.25)" : w.severity === "warn" ? "rgba(245,158,11,0.25)" : "rgba(59,130,246,0.25)"}`,
            color:
              w.severity === "error"
                ? "#ef4444"
                : w.severity === "warn"
                  ? "#f59e0b"
                  : "var(--brand-primary)",
          }}
        >
          {w.severity === "error" ? (
            <AlertCircle size={14} />
          ) : w.severity === "warn" ? (
            <AlertTriangle size={14} />
          ) : (
            <Info size={14} />
          )}
          {w.msg}
        </div>
      ))}
    </div>
  );
}

interface PrefillData {
  name?: string;
  instructions?: string;
  skillName?: string;
  llmModel?: string;
  agent?: string;
  canal?: string;
  destinataire?: string;
  timeoutMin?: number;
  objectives?: string[];
  disablePreInstructions?: boolean;
}

export const TaskCreator = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: PrefillData } | null)?.prefill;

  const initialized = useRef(false);

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [skillName, setSkillName] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [agent, setAgent] = useState("main");
  const [canal, setCanal] = useState("telegram");
  const { agents: rosterAgents } = useAgentRoster();
  const [destinataire, setDestinataire] = useState("");
  const [timeoutMin, setTimeoutMin] = useState(30);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [disablePreInstructions, setDisablePreInstructions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [tourForceRun, setTourForceRun] = useState(false);
  const [saveAsModel, setSaveAsModel] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PrefillData | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [connMode, setConnMode] = useState<"qr" | "webhook">("qr");
  const [destError, setDestError] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [availableModels, setAvailableModels] = useState(MODELS);

  // ── Fetch available LLM models from backend
  useEffect(() => {
    apiFetch(`${BASE}/api/models/available`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const map = new Map<string, typeof MODELS[0]>();
          for (const m of MODELS) map.set(m.id, m);
          for (const m of data) map.set(m.id, { id: m.id, label: m.label, color: m.color || '#8b5cf6' });
          setAvailableModels(Array.from(map.values()));
        }
      })
      .catch(() => {});
  }, []);

  // ── Restore draft or prefill on mount ─────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (prefill) {
      // Clone / Rejouer flow — prefill takes priority over draft
      if (prefill.name) setName(prefill.name);
      if (prefill.instructions) setInstructions(prefill.instructions);
      if (prefill.skillName) setSkillName(prefill.skillName);
      if (prefill.llmModel) setLlmModel(prefill.llmModel);
      if (prefill.agent) setAgent(prefill.agent);
      if (prefill.canal) setCanal(prefill.canal);
      if (prefill.destinataire) setDestinataire(prefill.destinataire);
      if (prefill.timeoutMin) setTimeoutMin(prefill.timeoutMin);
      if (prefill.objectives?.length) setObjectives(prefill.objectives);
      if (prefill.disablePreInstructions !== undefined)
        setDisablePreInstructions(prefill.disablePreInstructions);
      return;
    }

    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft: PrefillData = JSON.parse(raw);
      if (draft.name || draft.instructions) {
        // Don't restore silently — ask user first
        setPendingDraft(draft);
        setShowDraftBanner(true);
      }
    } catch {
      /* draft parse error — ignore */
    }
  }, [prefill]); // prefill is stable (from location.state) — initialized guard prevents re-runs

  // ── Auto-save draft ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized.current) return;
    if (!name.trim() && !instructions.trim()) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const draft: PrefillData = {
      name,
      instructions,
      skillName,
      llmModel,
      agent,
      canal,
      destinataire,
      timeoutMin,
      objectives,
      disablePreInstructions,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [
    name,
    instructions,
    skillName,
    llmModel,
    agent,
    canal,
    destinataire,
    timeoutMin,
    objectives,
    disablePreInstructions,
  ]);

  // ── Computed helpers ───────────────────────────────────────────────────────
  const wordCount = instructions.trim()
    ? instructions.trim().split(/\s+/).length
    : 0;
  const charCount = instructions.length;
  const filledObjectives = objectives.filter((o) => o.trim()).length;
  const hasContent = name.trim().length > 0 || instructions.trim().length > 0;

  const showTimeoutHint = wordCount > 150 || filledObjectives >= 3;
  const suggestedTimeout = Math.max(
    45,
    Math.ceil(filledObjectives * 15 + wordCount / 10),
  );

  // ── Validation warnings ────────────────────────────────────────────────────
  const warnings: WarnItem[] = [];
  if (name.trim() && !llmModel) {
    warnings.push({
      key: "no-model",
      msg: "Aucun modèle LLM sélectionné — l'agent ne pourra pas démarrer.",
      severity: "error",
    });
  }
  if (destinataire.trim() === "" && canal && name.trim()) {
    warnings.push({
      key: "no-dest",
      msg: `Canal "${canal}" configuré mais aucun destinataire renseigné — les résultats ne seront pas livrés.`,
      severity: "warn",
    });
  }
  if (instructions.trim() && wordCount < 20) {
    warnings.push({
      key: "short-prompt",
      msg: `Instructions courtes (${wordCount} mots) — un prompt plus détaillé améliore la qualité des résultats.`,
      severity: "warn",
    });
  }

  const canSave = name.trim().length > 0;

  // ── Auto LLM suggestion — client-side + serveur ────────────────────────────
  const [serverSuggestion, setServerSuggestion] = useState<{
    model: string;
    label: string;
    reason: string;
  } | null>(null);

  useEffect(() => {
    if (llmModel) {
      setServerSuggestion(null);
      return;
    }
    const text = (instructions + " " + name).trim();
    if (text.length < 10) {
      setServerSuggestion(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch(`${BASE}/api/suggest-model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instructions, name }),
        });
        const d = await r.json();
        if (d.model) {
          const found = MODELS.find((m) => m.id === d.model);
          setServerSuggestion({
            model: d.model,
            label: found?.label ?? d.model,
            reason: d.reason ?? "Suggestion serveur",
          });
        } else {
          setServerSuggestion(null);
        }
      } catch {
        setServerSuggestion(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [instructions, name, llmModel]);

  const autoSuggestion = useMemo(() => {
    if (llmModel) return null; // already selected — don't override
    return serverSuggestion ?? suggestModel(instructions + " " + name); // préférer la suggestion serveur
  }, [instructions, name, llmModel, serverSuggestion]);

  // ── Enhance instructions ───────────────────────────────────────────────────
  const handleEnhance = async () => {
    if (!instructions.trim() || enhancing) return;
    setEnhancing(true);
    try {
      const res = await apiFetch(`${BASE}/api/enhance-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const data = await res.json();
      if (data.enhanced) setInstructions(data.enhanced);
    } catch {
      /* enhance failed — ignore */
    }
    setEnhancing(false);
  };

  // ── Create task ────────────────────────────────────────────────────────────
  const handleCreate = async (andRun = false) => {
    if (!canSave) return;

    // ── Inline validations (block submit) ────────────────────────────────────
    let blocked = false;
    if (!llmModel) {
      setModelError(true);
      blocked = true;
    } else setModelError(false);

    if (canal && !destinataire.trim()) {
      setDestError(true);
      blocked = true;
    } else setDestError(false);

    if (blocked) return;

    setSaving(true);
    setSaveError(null);
    try {
      const cleanObjectives = objectives.filter((o) => o.trim());
      const payload = {
        name,
        title: name,
        instructions,
        description: instructions,
        skillName,
        llmModel,
        agent,
        agentId: agent,
        canal,
        destinataire,
        channelTarget: { platform: canal, targetId: destinataire },
        timeoutMin,
        objectives: cleanObjectives,
        disablePreInstructions,
      };
      const res = await apiFetch(`${BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const created = await res.json();

      // Optionally save as model
      if (saveAsModel) {
        try {
          await apiFetch(`${BASE}/api/modeles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              instructions,
              skillName,
              llmModel,
              agent,
              canal,
              destinataire,
              timeoutMin,
              objectives: cleanObjectives,
              disablePreInstructions,
            }),
          });
        } catch {
          /* save-as-model non-blocking */
        }
      }

      if (andRun && created?.id) {
        await apiFetch(`${BASE}/api/tasks/${created.id}/run`, {
          method: "POST",
        });
      }

      // Clear draft on success
      localStorage.removeItem(DRAFT_KEY);
      navigate(created?.id ? `/tasks/${created.id}` : "/tasks");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  };

  // ── Cancel handler ─────────────────────────────────────────────────────────
  const handleCancel = () => {
    if (hasContent) {
      setConfirmCancel(true);
    } else {
      localStorage.removeItem(DRAFT_KEY);
      navigate("/tasks");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 820,
        margin: "0 auto",
        width: "100%",
        paddingBottom: 40,
      }}
    >
      {/* QR Pairing Modal */}
      {showQrModal && (
        <QrPairingModal
          canal={canal}
          destinataire={destinataire}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Guided Tour */}
      <TaskCreatorTour
        forceRun={tourForceRun}
        onClose={() => setTourForceRun(false)}
      />

      {/* ── Draft ask-first banner ─────────────────────────────────────────── */}
      {showDraftBanner && pendingDraft && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(59,130,246,0.07)",
            border: "1px solid rgba(59,130,246,0.28)",
            color: "var(--text-primary)",
            fontSize: "13px",
          }}
        >
          <RotateCcw
            size={15}
            style={{ color: "var(--brand-primary)", flexShrink: 0 }}
          />
          <span style={{ flex: 1, color: "var(--text-secondary)" }}>
            📝 Tu avais une tâche en cours —{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {pendingDraft.name || "brouillon sans titre"}
            </strong>
            . Restaurer le brouillon ?
          </span>
          <button
            onClick={() => {
              // Apply pending draft to form
              const d = pendingDraft;
              if (d.name) setName(d.name);
              if (d.instructions) setInstructions(d.instructions);
              if (d.skillName) setSkillName(d.skillName ?? "");
              if (d.llmModel) setLlmModel(d.llmModel ?? "");
              if (d.agent) setAgent(d.agent ?? "main");
              if (d.canal) setCanal(d.canal ?? "telegram");
              if (d.destinataire) setDestinataire(d.destinataire ?? "");
              if (d.timeoutMin) setTimeoutMin(d.timeoutMin ?? 30);
              if (d.objectives?.length) setObjectives(d.objectives);
              if (d.disablePreInstructions !== undefined)
                setDisablePreInstructions(d.disablePreInstructions);
              setPendingDraft(null);
              setShowDraftBanner(false);
            }}
            style={{
              padding: "5px 14px",
              borderRadius: 7,
              fontWeight: 700,
              fontSize: "12px",
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.4)",
              color: "var(--brand-primary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Restaurer
          </button>
          <button
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY);
              setPendingDraft(null);
              setShowDraftBanner(false);
            }}
            style={{
              padding: "5px 14px",
              borderRadius: 7,
              fontWeight: 600,
              fontSize: "12px",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Ignorer
          </button>
        </div>
      )}

      {/* ── Pre-fill banner (clone/rejouer) ───────────────────────────────── */}
      {prefill && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.25)",
            color: "var(--brand-accent)",
            fontSize: "13px",
          }}
        >
          <Info size={14} />
          <span>
            Formulaire pré-rempli depuis une tâche existante. Modifiez les
            champs souhaités avant de créer.
          </span>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        data-tour="creator-header"
        style={{ display: "flex", alignItems: "center", gap: 16 }}
      >
        <button
          onClick={handleCancel}
          style={{
            display: "flex",
            padding: 10,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h2
            style={{
              fontSize: "1.5rem",
              margin: 0,
              marginBottom: 4,
              color: "var(--text-primary)",
            }}
          >
            Nouvelle Mission
          </h2>
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Configurez les paramètres de routage et d'intelligence.
          </div>
        </div>
        <button
          onClick={() => {
            resetTaskCreatorTour();
            setTourForceRun(true);
          }}
          title="Relancer le guide interactif"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 10,
            cursor: "pointer",
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.25)",
            color: "var(--brand-accent)",
            fontSize: "0.8rem",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          <HelpCircle size={15} />
          Guide
        </button>
      </div>

      {/* ── Cancel confirmation inline ─────────────────────────────────────── */}
      {confirmCancel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 14,
              padding: 28,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  padding: 10,
                  background: "rgba(239,68,68,0.1)",
                  borderRadius: 10,
                }}
              >
                <AlertTriangle size={20} color="#ef4444" />
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Contenu non sauvegardé
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  Tu as du contenu non sauvegardé. Quitter quand même ?
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 20,
              }}
            >
              <button
                onClick={() => setConfirmCancel(false)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: "13px",
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Rester
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem(DRAFT_KEY);
                  navigate("/tasks");
                }}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: "13px",
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  color: "#ef4444",
                  cursor: "pointer",
                }}
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 16,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {/* Name */}
        <div data-tour="creator-name">
          <Field
            label="Nom de la tâche"
            hint="Donnez un nom court et mémorable à cette mission"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, fontSize: "1rem", fontWeight: 600 }}
              placeholder="Ex : Analyser les logs système…"
              autoFocus
            />
          </Field>
        </div>

        {/* Instructions */}
        <div data-tour="creator-instructions">
          <Field
            label="Prompt / Instructions"
            hint="Structure recommandée : Rôle → Contexte → Tâche → Format → Contraintes"
          >
            <div style={{ position: "relative" }}>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={6}
                style={{
                  ...inputStyle,
                  fontFamily: "var(--mono)",
                  resize: "vertical",
                  lineHeight: 1.6,
                  paddingRight: 44,
                }}
                placeholder="Instructions système pour cet agent…"
              />
              <button
                data-tour="creator-enhance"
                onClick={handleEnhance}
                disabled={!instructions.trim() || enhancing}
                title="Améliorer avec l'IA"
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 10,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: enhancing
                    ? "rgba(139,92,246,0.15)"
                    : "rgba(139,92,246,0.1)",
                  border: "1px solid rgba(139,92,246,0.3)",
                  color:
                    instructions.trim() && !enhancing
                      ? "var(--brand-accent)"
                      : "var(--text-muted)",
                  cursor:
                    instructions.trim() && !enhancing
                      ? "pointer"
                      : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                {enhancing ? (
                  <Loader2
                    size={14}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <PenLine size={14} />
                )}
              </button>
            </div>
            {/* Word / char counter */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color:
                    wordCount < 20 && instructions.trim()
                      ? "#f59e0b"
                      : "var(--text-muted)",
                }}
              >
                {wordCount} mot{wordCount !== 1 ? "s" : ""}
                {wordCount < 20 &&
                  instructions.trim() &&
                  " — prompt court, précisez davantage"}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {charCount} car.
              </span>
            </div>
          </Field>
        </div>

        {/* Skill + LLM */}
        <div
          data-tour="creator-skill-model"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          <Field
            label="Skill"
            hint="Nom du skill ou module spécialisé (optionnel)"
          >
            <SkillsPicker value={skillName} onChange={setSkillName} />
          </Field>
          <Field
            label="Stratégie de Routage (BYOK) *"
            hint="Le modèle sera alloué intelligemment selon la configuration de vos clés"
          >
            <select
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value);
                if (e.target.value) setModelError(false);
              }}
              style={{
                ...inputStyle,
                cursor: "pointer",
                borderColor: modelError
                  ? "rgba(239,68,68,0.7)"
                  : name.trim() && !llmModel
                    ? "rgba(239,68,68,0.5)"
                    : undefined,
                boxShadow: modelError
                  ? "0 0 0 2px rgba(239,68,68,0.15)"
                  : undefined,
              }}
            >
              <option value="">— Sélectionner une stratégie —</option>
              <optgroup label="⚡ Stratégies Intelligentes (Auto-Routing)">
                <option value="strategy_auto">🤖 Auto-Pilote (Laisse NemoClaw décider)</option>
                <option value="strategy_eco">🟢 Économique (Local Ollama / Llama 3) - 0.00$</option>
                <option value="strategy_brain">🧠 Cerveau (Deep Logic - Sonnet / o1) - $$$</option>
                <option value="strategy_code">💻 Code & Shell (DeepSeek Coder / Mistral)</option>
              </optgroup>
              <optgroup label="🔑 Vos modèles BYOK configurés">
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            </select>
            {modelError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 5,
                  fontSize: "12px",
                  color: "#ef4444",
                }}
              >
                <AlertCircle size={12} />
                ⚠️ Aucun modèle sélectionné — l'agent ne saura pas quel LLM
                utiliser
              </div>
            )}
            {autoSuggestion && !modelError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  padding: "7px 11px",
                  borderRadius: 8,
                  fontSize: "12px",
                  background: "rgba(118,185,0,0.08)",
                  border: "1px solid rgba(118,185,0,0.25)",
                  color: "#76b900",
                }}
              >
                <Zap size={12} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  <strong>Auto</strong> · {autoSuggestion.label}
                  <span style={{ opacity: 0.75, marginLeft: 4 }}>
                    · {autoSuggestion.reason}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setLlmModel(autoSuggestion.model)}
                  style={{
                    flexShrink: 0,
                    padding: "3px 10px",
                    borderRadius: 5,
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#76b900",
                    background: "rgba(118,185,0,0.15)",
                    border: "1px solid rgba(118,185,0,0.35)",
                  }}
                >
                  Appliquer
                </button>
              </div>
            )}
          </Field>
        </div>

        {/* Agent + Timeout */}
        <div
          data-tour="creator-agent-timeout"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          <Field label="Agent" hint="Agent qui exécutera cette tâche">
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="main">Lia / NemoClaw (auto)</option>
              {rosterAgents.filter(a => a.source === "nemoclaw" && a.id !== "nemo-router").map(a => (
                <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
              ))}
              {rosterAgents.some(a => a.source === "acp") && (
                <optgroup label="── Agents CLI ──">
                  {rosterAgents.filter(a => a.source === "acp").map(a => (
                    <option key={a.id} value={a.id} disabled={a.status === "stopped"}>
                      {a.name}{a.status === "stopped" ? " (offline)" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <div>
            <Field
              label="Timeout (min)"
              hint="Durée max avant arrêt forcé de la boucle agentique"
            >
              <input
                type="number"
                min={1}
                max={1440}
                value={timeoutMin}
                onChange={(e) => setTimeoutMin(Number(e.target.value))}
                style={{ ...inputStyle, fontFamily: "var(--mono)" }}
              />
            </Field>
            {/* Timeout hint */}
            {showTimeoutHint && timeoutMin < suggestedTimeout && (
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "11.5px",
                  color: "#f59e0b",
                  padding: "6px 10px",
                  background: "rgba(245,158,11,0.07)",
                  borderRadius: 6,
                  border: "1px solid rgba(245,158,11,0.2)",
                }}
              >
                <AlertTriangle size={12} />
                Tâche complexe — {suggestedTimeout} min recommandé
                <button
                  onClick={() => setTimeoutMin(suggestedTimeout)}
                  style={{
                    marginLeft: "auto",
                    background: "rgba(245,158,11,0.15)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: "11px",
                    color: "#f59e0b",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Appliquer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canal de livraison */}
        <div
          data-tour="creator-canal"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 20,
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 12,
            }}
          >
            Canal de livraison target
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {CHANNELS.map((c) => (
              <button
                key={c}
                onClick={() => setCanal(c)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 20,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "13px",
                  textTransform: "capitalize",
                  background:
                    canal === c ? "var(--brand-accent)" : "var(--bg-glass)",
                  color: canal === c ? "#fff" : "var(--text-secondary)",
                  border: `1px solid ${canal === c ? "var(--brand-accent)" : "var(--border-subtle)"}`,
                  transition: "all 0.2s",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}
          >
            <Field label="Canal">
              <input
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                style={inputStyle}
                placeholder="discord, telegram…"
              />
            </Field>
            <Field
              label={
                canal === "telegram"
                  ? "Chat ID Telegram"
                  : canal === "discord"
                    ? connMode === "webhook"
                      ? "Webhook Discord"
                      : "ID Salon Discord"
                    : canal === "whatsapp"
                      ? "Numéro WhatsApp"
                      : "URL Webhook"
              }
              hint="Requis pour que l'agent puisse envoyer ses résultats"
            >
              {/* Mode selector pour Discord */}
              {canal === "discord" && (
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  {(["qr", "webhook"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setConnMode(m);
                        setDestinataire("");
                      }}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        background:
                          connMode === m
                            ? "rgba(88,101,242,0.18)"
                            : "var(--bg-glass)",
                        border: `1px solid ${connMode === m ? "rgba(88,101,242,0.45)" : "var(--border-subtle)"}`,
                        color: connMode === m ? "#5865F2" : "var(--text-muted)",
                        transition: "all 0.15s",
                      }}
                    >
                      {m === "qr" ? "🔗 QR / Bot" : "🪝 Webhook"}
                    </button>
                  ))}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  flex: 1,
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={destinataire}
                    onChange={(e) => {
                      setDestinataire(e.target.value);
                      if (e.target.value.trim()) setDestError(false);
                    }}
                    style={{
                      ...inputStyle,
                      fontFamily: "var(--mono)",
                      flex: 1,
                      borderColor: destError
                        ? "rgba(239,68,68,0.7)"
                        : name.trim() && !destinataire.trim()
                          ? "rgba(245,158,11,0.5)"
                          : undefined,
                      boxShadow: destError
                        ? "0 0 0 2px rgba(239,68,68,0.15)"
                        : undefined,
                    }}
                    placeholder={
                      canal === "telegram"
                        ? "@username ou -100xxxxx"
                        : canal === "discord"
                          ? connMode === "webhook"
                            ? "https://discord.com/api/webhooks/ID/TOKEN"
                            : "1234567890…"
                          : canal === "whatsapp"
                            ? "+336XXXXXXXX"
                            : "https://votre-serveur.com/webhook"
                    }
                  />
                  {/* QR Coupler — Telegram ou Discord mode qr */}
                  {(canal === "telegram" ||
                    (canal === "discord" && connMode === "qr")) && (
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      title={`Coupler via QR code ${canal}`}
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "9px 13px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background:
                          canal === "telegram"
                            ? "rgba(44,165,224,0.12)"
                            : "rgba(88,101,242,0.12)",
                        border: `1px solid ${canal === "telegram" ? "rgba(44,165,224,0.3)" : "rgba(88,101,242,0.3)"}`,
                        color: canal === "telegram" ? "#2CA5E0" : "#5865F2",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        transition: "all 0.2s",
                      }}
                    >
                      <QrCode size={14} /> Coupler
                    </button>
                  )}
                  {/* Test Webhook — Discord mode webhook ou canal webhook */}
                  {((canal === "discord" && connMode === "webhook") ||
                    canal === "webhook") && (
                    <WebhookTestButton url={destinataire} />
                  )}
                </div>
                {destError && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "12px",
                      color: "#ef4444",
                    }}
                  >
                    <AlertCircle size={12} />
                    ⚠️ Canal sélectionné mais destinataire vide — le résultat ne
                    sera pas livré
                  </div>
                )}
              </div>
            </Field>
          </div>
        </div>

        {/* Objectifs */}
        <div
          data-tour="creator-objectives"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 20,
          }}
        >
          <Field
            label="Objectifs"
            hint="Ce que doit accomplir concrètement cette tâche (mesurable, précis)"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {objectives.map((obj, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input
                    value={obj}
                    onChange={(e) => {
                      const next = [...objectives];
                      next[i] = e.target.value;
                      setObjectives(next);
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={`Objectif ${i + 1}…`}
                  />
                  <button
                    onClick={() =>
                      setObjectives(objectives.filter((_, j) => j !== i))
                    }
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 6,
                      color: "#ef4444",
                      cursor: "pointer",
                      padding: "0 10px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setObjectives([...objectives, ""])}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  background: "rgba(139,92,246,0.08)",
                  border: "1px dashed rgba(139,92,246,0.3)",
                  borderRadius: 8,
                  color: "var(--brand-accent)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "12px",
                }}
              >
                <Plus size={13} />
                Ajouter un objectif
              </button>
            </div>
          </Field>
        </div>

        {/* Options */}
        <div
          data-tour="creator-preinstructions"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Disable pre-instructions toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: "var(--bg-glass)",
              borderRadius: 8,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--text-primary)",
                }}
              >
                Désactiver pré-instructions
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                N'injecte pas le system prompt global dans cet agent
              </div>
            </div>
            <button
              onClick={() => setDisablePreInstructions((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: disablePreInstructions
                  ? "var(--brand-accent)"
                  : "var(--text-muted)",
              }}
            >
              {disablePreInstructions ? (
                <ToggleRight size={28} />
              ) : (
                <ToggleLeft size={28} />
              )}
            </button>
          </div>
        </div>

        {/* Validation warnings */}
        <ValidationBanner items={warnings} />

        {/* API error */}
        {saveError && (
          <div
            style={{
              fontSize: "13px",
              color: "#ef4444",
              padding: "8px 12px",
              background: "rgba(239,68,68,0.08)",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            ⚠️ {saveError}
          </div>
        )}

        {/* Actions */}
        <div
          data-tour="creator-actions"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingTop: 4,
          }}
        >
          {/* Checkbox save as model */}
          <label
            data-tour="creator-save-model"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
              padding: "9px 14px",
              background: saveAsModel
                ? "rgba(139,92,246,0.06)"
                : "var(--bg-glass)",
              border: `1px solid ${saveAsModel ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
              borderRadius: 9,
              transition: "all 0.15s",
            }}
          >
            <input
              type="checkbox"
              checked={saveAsModel}
              onChange={(e) => setSaveAsModel(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                cursor: "pointer",
                accentColor: "var(--brand-accent)",
                flexShrink: 0,
              }}
            />
            <BookmarkPlus
              size={15}
              style={{
                color: saveAsModel
                  ? "var(--brand-accent)"
                  : "var(--text-muted)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: saveAsModel
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              }}
            >
              💾 Sauvegarder aussi comme modèle réutilisable
            </span>
            {saveAsModel && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                → POST /api/modeles
              </span>
            )}
          </label>

          {/* Buttons row */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={handleCancel}
              style={{
                padding: "10px 20px",
                background: "var(--bg-glass)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
              }}
            >
              Annuler
            </button>
            <button
              onClick={() => handleCreate(false)}
              disabled={!canSave || saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                background: "var(--bg-glass)",
                color: "var(--brand-accent)",
                border: "1px solid rgba(139,92,246,0.4)",
                borderRadius: 10,
                cursor: !canSave || saving ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
                opacity: !canSave || saving ? 0.5 : 1,
              }}
            >
              <Save size={16} />
              {saveAsModel ? "Créer + Modèle" : "Créer"}
            </button>
            <button
              onClick={() => handleCreate(true)}
              disabled={!canSave || saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                background: "var(--brand-accent)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                cursor: !canSave || saving ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
                opacity: !canSave || saving ? 0.6 : 1,
                boxShadow: "0 4px 14px rgba(139,92,246,0.35)",
              }}
            >
              <Play size={16} />
              {saving ? "Création…" : "Créer & Lancer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
