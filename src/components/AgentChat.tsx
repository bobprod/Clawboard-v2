import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  MessageSquare,
  ChevronDown,
  Wrench,
  X,
  Mic,
  Square,
  Paperclip,
  Map,
  Briefcase,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { useChatStream, type StreamMessage } from "../hooks/useChatStream";
import { useVoiceRecorder } from "./VoiceAssistant";
import { apiFetch, apiFetchJson } from "../lib/apiFetch";
import type { LiaPlan } from "./LiaPlanPreview";

const AGENTS = ["main", "assistant", "research", "coder"];
const API_BASE = "http://localhost:4000";

// ── Modes de Lia (C3) ─────────────────────────────────────────────────────────
// manager = propose des plans et crée des tâches, tuteur = explique et enseigne,
// expert = direct et technique. Choix persisté en localStorage et envoyé au
// backend dans le body de /api/chat et /api/chat/stream (champ `mode`).
const LIA_MODES = [
  {
    id: "manager",
    label: "Manager",
    icon: Briefcase,
    hint: "Propose des plans et crée des tâches",
  },
  {
    id: "tuteur",
    label: "Tuteur",
    icon: GraduationCap,
    hint: "Explique et enseigne",
  },
  {
    id: "expert",
    label: "Expert",
    icon: Wrench,
    hint: "Direct et technique",
  },
] as const;
type LiaMode = (typeof LIA_MODES)[number]["id"];
const LIA_MODE_STORAGE_KEY = "clawboard-lia-mode";

// ── Plans d'exécution (B5) ────────────────────────────────────────────────────
type PlanStatus = "pending" | "executing" | "executed" | "rejected";
/** Carte de plan affichée dans le fil, rattachée à un message assistant. */
type PlanCard = { id: string; msgId: string; plan: LiaPlan; status: PlanStatus };

interface PlanExecuteResult {
  stepId?: string;
  type?: string;
  resourceId?: string;
  name?: string;
  ok: boolean;
  error?: string;
}
interface PlanExecuteResponse {
  ok?: boolean;
  created?: number;
  failed?: number;
  results?: PlanExecuteResult[];
}

/** Badges d'étape : task=violet, modele=bleu, cron=orange, skill=vert, note=gris. */
const STEP_TYPE_META: Record<string, { color: string; label: string }> = {
  task: { color: "#8b5cf6", label: "Tâche" },
  modele: { color: "#3b82f6", label: "Modèle" },
  cron: { color: "#f59e0b", label: "Récurrence" },
  skill: { color: "#10b981", label: "Skill" },
  note: { color: "#9ca3af", label: "Note" },
};

const shortenLine = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max)}…` : s;

let localCounter = 0;
const localId = (prefix: string) => `${prefix}-${++localCounter}-${Date.now()}`;

// ── Pièces jointes ───────────────────────────────────────────────────────────
// Fichiers texte lus côté client (contenu injecté dans le message envoyé).
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "js",
  "ts",
  "tsx",
  "mjs",
  "py",
  "html",
  "css",
  "xml",
  "yml",
  "yaml",
  "sh",
  "log",
  "sql",
]);
const MAX_TEXT_BYTES = 20 * 1024; // 20 Ko max par fichier texte (tronqué au-delà)
const MAX_ATTACHED_FILES = 3; // 3 fichiers max par message
// Upload binaire : POST /api/workspace/upload, scope "lia"
// → enregistré sous <workspace>/uploads/lia/ (voir routes/workspace.mjs).
const UPLOAD_LIA_DIR = "uploads/lia";

/** Une pièce jointe prête à être injectée dans le message envoyé. */
type AttachedFile =
  | {
      id: string;
      name: string;
      size: number;
      kind: "text";
      content: string;
      truncated: boolean;
    }
  | {
      id: string;
      name: string;
      size: number;
      kind: "binary";
      status: "uploading" | "uploaded" | "error";
      uploadedPath?: string;
      error?: string;
    };

let attachCounter = 0;
const attachId = () => `file-${++attachCounter}-${Date.now()}`;
const fileExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const sizeKo = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} Ko`;

export function AgentChat({ pageContext }: { pageContext?: string }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("main");
  // Mode de Lia (C3) — persisté en localStorage (clé clawboard-lia-mode).
  const [mode, setMode] = useState<LiaMode>(() => {
    try {
      const saved = localStorage.getItem(LIA_MODE_STORAGE_KEY);
      if (saved === "tuteur" || saved === "expert") return saved;
    } catch {
      /* localStorage indisponible → manager par défaut */
    }
    return "manager";
  });
  const [input, setInput] = useState("");
  const voice = useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const { messages, loading, send, clearMessages, setMessages } =
    useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  // ── Plans (B5) : bouton Map armé, cartes de plan, erreurs discrètes ──
  const [planArmed, setPlanArmed] = useState(false);
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Efface le petit message d'erreur vocale après quelques secondes.
  useEffect(() => {
    if (!voiceNote) return;
    const t = window.setTimeout(() => setVoiceNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [voiceNote]);

  // Idem pour les messages liés aux pièces jointes (upload, limites…).
  useEffect(() => {
    if (!fileNote) return;
    const t = window.setTimeout(() => setFileNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [fileNote]);

  // Persistance du mode de Lia (C3) dans localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(LIA_MODE_STORAGE_KEY, mode);
    } catch {
      /* silencieux */
    }
  }, [mode]);

  // Idem pour les messages discrets liés aux plans (exécution, réseau…).
  useEffect(() => {
    if (!planNote) return;
    const t = window.setTimeout(() => setPlanNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [planNote]);

  // Refermer le panneau coupe tout enregistrement micro en cours.
  useEffect(() => {
    if (!open && voice.recording) void voice.stop();
  }, [open, voice.recording, voice.stop]);

  // Un upload binaire est-il encore en vol ? (on attend avant d'envoyer)
  const uploadPending = attachedFiles.some(
    (f) => f.kind === "binary" && f.status === "uploading",
  );
  // Envoi en cours = stream normal (hook) OU génération de plan (B5, local).
  const busy = loading || planLoading;
  // Envoi possible dès qu'il y a du texte OU au moins une pièce jointe valide.
  const canSend =
    (input.trim().length > 0 || attachedFiles.length > 0) &&
    !busy &&
    !uploadPending;

  /**
   * Envoi en mode plan (B5) : POST /api/chat/stream avec executionMode:"plan".
   * Le SSE émet des {token}, un événement spécial {"plan":{…}} puis {done:true}.
   * Le plan reçu est affiché en carte rattachée au message assistant en cours.
   */
  const sendPlanMessage = async (text: string) => {
    const assistantId = localId("ac-msg");
    setMessages((prev) => [
      ...prev,
      {
        id: localId("ac-msg"),
        role: "user",
        content: text,
        done: true,
        ts: new Date(),
      } satisfies StreamMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        done: false,
        ts: new Date(),
        toolCalls: [],
      } satisfies StreamMessage,
    ]);
    setPlanLoading(true);

    // Historique identique à celui du hook : messages non-tool + ce message.
    const history = [
      ...messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    try {
      const res = await apiFetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          mode, // C3 — mode de Lia : manager | tuteur | expert
          executionMode: "plan", // B5 — le backend répond par un plan SSE
          permissions: {},
          agent,
          preInstructions: pageContext,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accum = "";
      let gotPlan = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue; // ignore ":ok", commentaires
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const evt = JSON.parse(raw) as {
              token?: string;
              plan?: LiaPlan;
              done?: boolean;
            };
            if (typeof evt.token === "string") {
              accum += evt.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accum } : m,
                ),
              );
            }
            if (evt.plan && Array.isArray(evt.plan.steps)) {
              gotPlan = true;
              const received: LiaPlan = evt.plan;
              setPlans((prev) => [
                ...prev,
                {
                  id: localId("plan"),
                  msgId: assistantId,
                  plan: received,
                  status: "pending",
                },
              ]);
            }
            // {done:true, toolCalls:[]} en mode plan : rien à extraire.
          } catch {
            /* ligne SSE malformée — on ignore */
          }
        }
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, done: true } : m)),
      );
      if (!gotPlan) {
        setPlanNote(
          "Aucun plan reçu du serveur — réessaie ou envoie un message normal.",
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `⚠️ Erreur : ${err instanceof Error ? err.message : "impossible de joindre l'agent"}`,
                done: true,
              }
            : m,
        ),
      );
    } finally {
      setPlanLoading(false);
    }
  };

  /** « ✅ Approuver et exécuter » : POST /api/chat/plan/execute avec {steps}. */
  const approvePlan = async (cardId: string) => {
    const card = plans.find((p) => p.id === cardId);
    if (!card || card.status !== "pending") return;
    setPlans((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, status: "executing" } : c)),
    );
    const { data, error } = await apiFetchJson<PlanExecuteResponse>(
      `${API_BASE}/api/chat/plan/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: card.plan.steps }),
      },
    );
    if (error || !data) {
      // Erreur réseau/serveur → message discret, la carte reste actionnable.
      setPlans((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: "pending" } : c)),
      );
      setPlanNote(
        `Exécution du plan impossible : ${error ?? "réponse invalide"}`,
      );
      return;
    }
    // Récapitulatif construit à partir de results (succès ET échecs).
    const results = data.results ?? [];
    const okResults = results.filter((r) => r.ok);
    const failedResults = results.filter((r) => !r.ok);
    const lines: string[] = [];
    if (okResults.length > 0) {
      lines.push(
        `✅ ${data.created ?? okResults.length} élément(s) créé(s) :`,
      );
      for (const r of okResults) {
        const label =
          STEP_TYPE_META[r.type ?? "task"]?.label.toLowerCase() ?? "élément";
        lines.push(
          `• ${label} « ${r.name ?? r.stepId ?? "?"} » → ${r.resourceId ?? "?"}`,
        );
      }
    } else {
      lines.push("⚠️ Aucun élément n'a pu être créé.");
    }
    for (const r of failedResults) {
      const label =
        STEP_TYPE_META[r.type ?? "task"]?.label.toLowerCase() ?? "étape";
      lines.push(
        `❌ ${label} « ${r.name ?? r.stepId ?? "?"} » : ${r.error ?? "erreur inconnue"}`,
      );
    }
    setMessages((prev) => [
      ...prev,
      {
        id: localId("ac-msg"),
        role: "assistant",
        content: lines.join("\n"),
        done: true,
        ts: new Date(),
      } satisfies StreamMessage,
    ]);
    setPlans((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, status: "executed" } : c)),
    );
  };

  /** « Rejeter » : la carte passe en état rejetée (grisée, désactivée). */
  const rejectPlan = (cardId: string) => {
    setPlans((prev) =>
      prev.map((c) =>
        c.id === cardId && c.status === "pending"
          ? { ...c, status: "rejected" }
          : c,
      ),
    );
  };

  const sendMessage = async () => {
    const typed = input.trim();
    if (busy) return;
    if (uploadPending) {
      setFileNote(
        "Enregistrement des fichiers en cours, réessaie dans un instant.",
      );
      return;
    }
    if (!typed && attachedFiles.length === 0) return;

    // Blocs pièces jointes, AVANT le texte tapé par l'utilisateur.
    const blocks: string[] = [];
    for (const f of attachedFiles) {
      if (f.kind === "text") {
        blocks.push(
          `📎 Fichier joint : ${f.name}\n\`\`\`\n${f.content}${f.truncated ? "\n…tronqué" : ""}\n\`\`\``,
        );
      } else if (
        f.kind === "binary" &&
        f.status === "uploaded" &&
        f.uploadedPath
      ) {
        blocks.push(
          `📎 Fichier joint : ${f.name} (binaire, ${sizeKo(f.size)} Ko, enregistré dans le workspace : ${f.uploadedPath})`,
        );
      }
    }
    if (typed) blocks.push(typed);
    const text = blocks.join("\n\n");
    if (!text.trim()) {
      // Par ex. un seul binaire dont l'upload a échoué et aucun texte tapé.
      setFileNote("Aucune pièce jointe utilisable — réessaie de l'ajouter.");
      return;
    }

    setInput("");
    setAttachedFiles([]);
    if (planArmed) {
      // Bouton Plan (B5) : on consomme l'état armé — ce message part en mode plan.
      setPlanArmed(false);
      await sendPlanMessage(text);
    } else {
      // Mode de Lia (C3) : transite dans le body du /api/chat (champ `mode`).
      await send({ text, agent, mode, preInstructions: pageContext });
    }
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Micro intégré : 1er clic = enregistrement, 2e clic = stop + transcription.
  const handleMic = async () => {
    if (voice.recording) {
      setVoiceNote(null);
      setTranscribing(true);
      try {
        const audio = await voice.stop();
        if (!audio) {
          setVoiceNote("Aucun son capturé. Réessaie.");
          return;
        }
        const { data, error } = await apiFetchJson<{ text?: string }>(
          `${API_BASE}/api/stt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio: audio.base64,
              mimeType: audio.mimeType,
              provider: "local",
              lang: "fr",
            }),
          },
        );
        if (error || !data) {
          setVoiceNote(
            `Transcription impossible : ${error ?? "réponse invalide"}`,
          );
          return;
        }
        const text = (data.text || "").trim();
        if (!text) {
          setVoiceNote(
            "Transcription vide. Réessaie en parlant un peu plus fort.",
          );
          return;
        }
        // Champ déjà rempli → on ajoute à la suite avec un espace.
        setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
        inputRef.current?.focus();
      } catch {
        setVoiceNote("Transcription échouée. Réessaie.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    setVoiceNote(null);
    await voice.start();
  };

  // ── Pièces jointes ──────────────────────────────────────────────────────────

  /** Retire une pièce jointe (bouton ✕ du chip). */
  const removeAttachedFile = (id: string) =>
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));

  /**
   * Fichier binaire (pdf, image…) → upload immédiat vers le workspace de Lia
   * via POST /api/workspace/upload (multipart, scope "lia").
   */
  const uploadBinary = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("scope", "lia");
    formData.append("file", file, file.name);
    const { data, error } = await apiFetchJson<{
      ok?: boolean;
      uploaded?: { name?: string; size?: number; ok?: boolean; error?: string }[];
    }>(`${API_BASE}/api/workspace/upload`, { method: "POST", body: formData });

    const entry = data?.uploaded?.[0];
    if (error || !data?.ok || !entry?.ok || !entry.name) {
      const reason = entry?.error ?? error ?? "réponse invalide";
      setAttachedFiles((prev) =>
        prev.map((f): AttachedFile =>
          f.id === id && f.kind === "binary"
            ? { ...f, status: "error", error: reason }
            : f,
        ),
      );
      setFileNote(`« ${file.name} » non enregistré : ${reason}`);
      return;
    }
    // Le serveur renvoie le nom sanitisé ; le répertoire cible est uploads/lia/.
    setAttachedFiles((prev) =>
      prev.map((f): AttachedFile =>
        f.id === id && f.kind === "binary"
          ? {
              ...f,
              status: "uploaded",
              uploadedPath: `${UPLOAD_LIA_DIR}/${entry.name}`,
            }
          : f,
      ),
    );
  };

  /** Sélection ou dépôt de fichiers : texte lu ici, binaire uploadé vers Lia. */
  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    setFileNote(null);

    const slots = MAX_ATTACHED_FILES - attachedFiles.length;
    if (slots <= 0) {
      setFileNote(`Maximum ${MAX_ATTACHED_FILES} pièces jointes par message.`);
      return;
    }
    if (files.length > slots) {
      setFileNote(
        `Seuls les ${slots} premier(s) fichier(s) sont retenus (max ${MAX_ATTACHED_FILES}).`,
      );
    }

    for (const file of files.slice(0, slots)) {
      if (TEXT_EXTENSIONS.has(fileExt(file.name))) {
        // Fichier texte : lecture côté client, tronquée à 20 Ko.
        try {
          const truncated = file.size > MAX_TEXT_BYTES;
          const raw = await (
            truncated ? file.slice(0, MAX_TEXT_BYTES) : file
          ).text();
          setAttachedFiles((prev) => [
            ...prev,
            {
              id: attachId(),
              name: file.name,
              size: file.size,
              kind: "text",
              content: raw,
              truncated,
            },
          ]);
        } catch {
          setFileNote(`Impossible de lire « ${file.name} ».`);
        }
      } else {
        // Fichier binaire : upload immédiat ; le message final
        // mentionnera le chemin enregistré dans le workspace.
        const id = attachId();
        setAttachedFiles((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            size: file.size,
            kind: "binary",
            status: "uploading",
          },
        ]);
        void uploadBinary(id, file);
      }
    }
  };

  return (
    <>
      {/* ── Floating bubble ────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Fermer le chat agent" : "Ouvrir le chat agent"}
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 1000,
          width: 54,
          height: 54,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))",
          border: "none",
          cursor: "pointer",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 24px rgba(139,92,246,0.45)",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform =
            "scale(1.08)";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        {open ? <ChevronDown size={22} /> : <MessageSquare size={22} />}
        {!open && messages.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#ef4444",
              color: "#fff",
              fontSize: "9px",
              fontWeight: 700,
              borderRadius: "50%",
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {messages.filter((m) => m.role === "assistant" && m.done).length}
          </span>
        )}
      </button>

      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            // Ne désurligne que si on quitte réellement le panneau
            // (et pas juste un de ses enfants).
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(e.dataTransfer.files);
          }}
          style={{
            position: "fixed",
            bottom: 92,
            right: 28,
            zIndex: 1000,
            width: 400,
            height: 560,
            background: dragOver ? "var(--bg-card)" : "var(--bg-surface)",
            border: dragOver
              ? "1px dashed var(--brand-accent)"
              : "1px solid var(--border-subtle)",
            borderRadius: 18,
            display: "flex",
            flexDirection: "column",
            boxShadow: dragOver
              ? "0 12px 48px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(139,92,246,0.2)"
              : "0 12px 48px rgba(0,0,0,0.45)",
            animation: "chatSlideUp 0.2s ease",
            overflow: "hidden",
          }}
        >
          {/* Overlay pendant le survol d'un dépôt de fichiers */}
          {dragOver && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: "rgba(139,92,246,0.1)",
                borderRadius: 18,
                pointerEvents: "none",
                color: "var(--brand-accent)",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              <Paperclip size={16} />
              Dépose tes fichiers ici
            </div>
          )}
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              background:
                "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Bot size={18} color="var(--brand-accent)" />
            <span style={{ fontWeight: 700, fontSize: "14px", flex: 1 }}>
              Chat Agent
            </span>
            {/* Sélecteur de mode de Lia (C3) : Manager / Tuteur / Expert */}
            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 2,
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {LIA_MODES.map((m) => {
                const active = mode === m.id;
                const ModeIcon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    title={`${m.label} — ${m.hint}`}
                    aria-label={`Mode ${m.label} : ${m.hint}`}
                    style={{
                      width: 26,
                      height: 24,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: active
                        ? "var(--brand-accent)"
                        : "transparent",
                      color: active ? "#fff" : "var(--text-muted)",
                      transition: "all 0.2s",
                    }}
                  >
                    <ModeIcon size={13} />
                  </button>
                );
              })}
            </div>
            {/* Agent selector */}
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 7,
                fontSize: "12px",
                fontWeight: 600,
                background: "var(--bg-glass)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  clearMessages();
                  setPlans([]); // les cartes de plan suivent la conversation
                }}
                title="Effacer la conversation"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex",
                  padding: 4,
                  borderRadius: 5,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  color: "var(--text-muted)",
                  opacity: 0.5,
                }}
              >
                <Bot size={36} />
                <div
                  style={{
                    fontSize: "13px",
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  Posez une question à l'agent{" "}
                  <strong style={{ color: "var(--brand-accent)" }}>
                    {agent}
                  </strong>
                  <br />
                  ou demandez-lui d'exécuter une tâche
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      msg.role === "user"
                        ? "rgba(139,92,246,0.2)"
                        : msg.role === "tool"
                          ? "rgba(245,158,11,0.15)"
                          : "rgba(59,130,246,0.2)",
                    color:
                      msg.role === "user"
                        ? "var(--brand-accent)"
                        : msg.role === "tool"
                          ? "#f59e0b"
                          : "var(--brand-primary)",
                  }}
                >
                  {msg.role === "user" ? (
                    <User size={14} />
                  ) : msg.role === "tool" ? (
                    <Wrench size={12} />
                  ) : (
                    <Bot size={14} />
                  )}
                </div>

                <div
                  style={{
                    maxWidth: "80%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  {/* Thinking trace */}
                  {msg.thinking && (
                    <div
                      style={{
                        fontSize: "10px",
                        fontStyle: "italic",
                        color: "var(--text-muted)",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        maxHeight: 60,
                        overflow: "hidden",
                      }}
                    >
                      💭 {msg.thinking.slice(0, 120)}
                      {msg.thinking.length > 120 ? "…" : ""}
                    </div>
                  )}
                  {/* Tool call */}
                  {msg.role === "tool" && (
                    <div
                      style={{
                        fontSize: "11px",
                        fontFamily: "var(--mono)",
                        background: "rgba(245,158,11,0.07)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        color: "#f59e0b",
                      }}
                    >
                      ⚙️ <strong>{msg.tool}</strong>({msg.content.slice(0, 60)}
                      {msg.content.length > 60 ? "…" : ""})
                    </div>
                  )}
                  {/* Bubble */}
                  {msg.role !== "tool" && (
                    <div
                      style={{
                        padding: "9px 13px",
                        borderRadius:
                          msg.role === "user"
                            ? "14px 14px 4px 14px"
                            : "14px 14px 14px 4px",
                        background:
                          msg.role === "user"
                            ? "rgba(139,92,246,0.18)"
                            : "var(--bg-glass)",
                        border: `1px solid ${msg.role === "user" ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
                        fontSize: "13px",
                        lineHeight: 1.55,
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.content ||
                        (!msg.done ? (
                          <Loader2
                            size={13}
                            style={{
                              animation: "spin 1s linear infinite",
                              opacity: 0.6,
                            }}
                          />
                        ) : (
                          ""
                        ))}
                    </div>
                  )}
                  {/* Carte de plan (B5) rattachée à ce message assistant */}
                  {plans
                    .filter((p) => p.msgId === msg.id)
                    .map((card) => (
                      <PlanCardView
                        key={card.id}
                        card={card}
                        onApprove={(id) => void approvePlan(id)}
                        onReject={rejectPlan}
                      />
                    ))}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Indicateur micro : enregistrement / transcription / erreur discrète */}
            {(voice.recording || transcribing || (voiceNote ?? voice.error)) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "12px",
                  lineHeight: 1.4,
                  color:
                    transcribing && !voice.recording
                      ? "var(--text-muted)"
                      : "var(--status-error)",
                }}
              >
                {voice.recording ? (
                  <>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--status-error)",
                        animation: "pulseDot 1.2s ease-in-out infinite",
                        flexShrink: 0,
                      }}
                    />
                    Enregistrement…
                  </>
                ) : transcribing ? (
                  <>
                    <Loader2
                      size={12}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    Transcription…
                  </>
                ) : (
                  <>{voiceNote ?? voice.error}</>
                )}
              </div>
            )}
            {/* Message discret lié aux pièces jointes (même style que le micro) */}
            {fileNote && (
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: 1.4,
                  color: "var(--status-error)",
                }}
              >
                {fileNote}
              </div>
            )}
            {/* Indicateur mode Plan armé (B5) : le prochain envoi génèrera un plan */}
            {planArmed && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "12px",
                  lineHeight: 1.4,
                  fontWeight: 600,
                  color: "var(--brand-accent)",
                }}
              >
                <Map size={12} />
                Mode Plan armé — le prochain message générera un plan
                d'exécution
              </div>
            )}
            {/* Message discret lié aux plans (exécution impossible, réseau…) */}
            {planNote && (
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: 1.4,
                  color: "var(--status-error)",
                }}
              >
                {planNote}
              </div>
            )}
            {/* Chips des pièces jointes : nom + taille + ✕ pour retirer */}
            {attachedFiles.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {attachedFiles.map((f) => (
                  <div
                    key={f.id}
                    title={
                      f.kind === "binary" && f.status === "error"
                        ? `Erreur : ${f.error}`
                        : f.name
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 8,
                      fontSize: "12px",
                      background: "var(--bg-glass)",
                      border: `1px solid ${
                        f.kind === "binary" && f.status === "error"
                          ? "var(--status-error)"
                          : "var(--border-subtle)"
                      }`,
                      color:
                        f.kind === "binary" && f.status === "error"
                          ? "var(--status-error)"
                          : "var(--text-primary)",
                      maxWidth: "100%",
                    }}
                  >
                    {f.kind === "binary" && f.status === "uploading" && (
                      <Loader2
                        size={11}
                        style={{
                          animation: "spin 1s linear infinite",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 170,
                      }}
                    >
                      {f.name}
                    </span>
                    <span
                      style={{ color: "var(--text-muted)", flexShrink: 0 }}
                    >
                      {sizeKo(f.size)}
                    </span>
                    <button
                      onClick={() => removeAttachedFile(f.id)}
                      title="Retirer cette pièce jointe"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              {/* Sélecteur de fichiers (ouvert par le bouton 📎) */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(e.target.files ?? []);
                  e.target.value = ""; // permet de rechoisir le même fichier
                }}
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                placeholder={`Message à ${agent}… (Entrée pour envoyer)`}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: 10,
                  resize: "none",
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "inherit",
                  lineHeight: 1.45,
                  maxHeight: 120,
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--brand-accent)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-subtle)")
                }
              />
              {/* Bouton pièce jointe (📎) — à côté du micro */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Joindre des fichiers (texte ou binaire) — ou glisse-les sur le chat"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s",
                }}
              >
                <Paperclip size={15} />
              </button>
              {/* Bouton Plan (B5) : arme le prochain envoi en mode plan */}
              <button
                onClick={() => setPlanArmed((v) => !v)}
                title={
                  planArmed
                    ? "Mode Plan armé : le prochain message générera un plan (cliquer pour annuler)"
                    : "Générer un plan d'exécution au prochain envoi"
                }
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: planArmed ? "1px solid var(--brand-accent)" : "none",
                  cursor: "pointer",
                  background: planArmed
                    ? "rgba(139,92,246,0.22)"
                    : "rgba(255,255,255,0.06)",
                  color: planArmed
                    ? "var(--brand-accent)"
                    : "var(--text-secondary)",
                  boxShadow: planArmed
                    ? "0 0 12px rgba(139,92,246,0.35)"
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s",
                }}
              >
                <Map size={15} />
              </button>
              <button
                onClick={handleMic}
                disabled={voice.starting || transcribing}
                title={
                  voice.recording
                    ? "Arrêter l'enregistrement et transcrire"
                    : "Dicter un message au micro"
                }
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "none",
                  cursor:
                    voice.starting || transcribing ? "not-allowed" : "pointer",
                  background: voice.recording
                    ? "var(--status-error)"
                    : "rgba(255,255,255,0.06)",
                  color: voice.recording ? "#fff" : "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: voice.recording
                    ? "0 0 14px rgba(239,68,68,0.4)"
                    : "none",
                  transition: "all 0.2s",
                }}
              >
                {voice.starting ? (
                  <Loader2
                    size={15}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : voice.recording ? (
                  <Square size={12} fill="currentColor" />
                ) : (
                  <Mic size={15} />
                )}
              </button>
              <button
                onClick={sendMessage}
                disabled={!canSend}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "none",
                  cursor: canSend ? "pointer" : "not-allowed",
                  background: canSend
                    ? "var(--brand-accent)"
                    : "rgba(255,255,255,0.06)",
                  color: canSend ? "#fff" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s",
                }}
              >
                {busy ? (
                  <Loader2
                    size={15}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chatSlideUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </>
  );
}

// ── Carte de plan (B5) ─────────────────────────────────────────────────────────

/**
 * Carte de plan affichée dans le fil de conversation (bord accent brand).
 * États : pending (boutons) → executing (spinner) → executed | rejected
 * (grisée, désactivée).
 */
function PlanCardView({
  card,
  onApprove,
  onReject,
}: {
  card: PlanCard;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { plan, status } = card;
  const rejected = status === "rejected";
  const steps = plan.steps ?? [];
  return (
    <div
      style={{
        alignSelf: "stretch",
        marginTop: 4,
        padding: "10px 12px",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
        border: `1px solid ${rejected ? "var(--border-subtle)" : "var(--brand-accent)"}`,
        boxShadow: "var(--shadow-sm)",
        opacity: rejected ? 0.55 : 1,
        filter: rejected ? "grayscale(0.7)" : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: rejected ? "none" : undefined,
        transition: "opacity 0.3s",
      }}
    >
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Map
          size={13}
          color={rejected ? "var(--text-muted)" : "var(--brand-accent)"}
        />
        <span
          style={{
            fontWeight: 700,
            fontSize: "10.5px",
            letterSpacing: "0.5px",
            color: rejected ? "var(--text-muted)" : "var(--brand-accent)",
          }}
        >
          PLAN D'EXÉCUTION
        </span>
        {typeof plan.estimated_tokens === "number" &&
          plan.estimated_tokens > 0 && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: "10px",
                color: "var(--text-muted)",
              }}
            >
              ≈ {Math.max(1, Math.round(plan.estimated_tokens / 1000))}k tokens
            </span>
          )}
      </div>

      {/* Résumé */}
      {plan.summary && (
        <div
          style={{
            fontSize: "12px",
            lineHeight: 1.5,
            fontStyle: "italic",
            color: "var(--text-secondary)",
          }}
        >
          {plan.summary}
        </div>
      )}

      {/* Étapes : badge de type coloré + nom + description courte */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((step) => {
          const meta =
            STEP_TYPE_META[step.type ?? "task"] ?? STEP_TYPE_META.task;
          return (
            <div
              key={step.id}
              style={{ display: "flex", gap: 7, alignItems: "flex-start" }}
            >
              <span
                style={{
                  flexShrink: 0,
                  marginTop: 1,
                  fontSize: "9.5px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 99,
                  background: `${meta.color}1a`,
                  color: meta.color,
                  border: `1px solid ${meta.color}45`,
                  whiteSpace: "nowrap",
                }}
              >
                {meta.label}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "12px",
                    color: "var(--text-primary)",
                  }}
                >
                  {step.name}
                </div>
                {step.description && (
                  <div
                    title={step.description}
                    style={{
                      fontSize: "11px",
                      lineHeight: 1.4,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {shortenLine(step.description, 90)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Risques éventuels */}
      {plan.risks && plan.risks.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            padding: "6px 8px",
            borderRadius: "var(--radius-md)",
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.22)",
          }}
        >
          <AlertTriangle
            size={11}
            color="var(--status-warning)"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div
            style={{
              fontSize: "11px",
              lineHeight: 1.45,
              color: "var(--status-warning)",
            }}
          >
            {plan.risks.join(" · ")}
          </div>
        </div>
      )}

      {/* Actions selon l'état de la carte */}
      {status === "pending" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onApprove(card.id)}
            style={{
              flex: 1,
              padding: "7px 8px",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: "pointer",
              background: "var(--status-success)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "11.5px",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            ✅ Approuver et exécuter
          </button>
          <button
            onClick={() => onReject(card.id)}
            style={{
              padding: "7px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              background: "transparent",
              color: "var(--status-error)",
              fontWeight: 600,
              fontSize: "11.5px",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            Rejeter
          </button>
        </div>
      )}
      {status === "executing" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "11.5px",
            color: "var(--text-muted)",
            padding: "6px 2px",
          }}
        >
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
          Exécution du plan…
        </div>
      )}
      {status === "executed" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "11.5px",
            fontWeight: 600,
            color: "var(--status-success)",
            padding: "6px 2px",
          }}
        >
          <CheckCircle2 size={12} />
          Plan exécuté — voir le récapitulatif ci-dessous
        </div>
      )}
      {status === "rejected" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "11.5px",
            fontWeight: 600,
            color: "var(--text-muted)",
            padding: "6px 2px",
          }}
        >
          <Ban size={12} />
          Plan rejeté
        </div>
      )}
    </div>
  );
}
