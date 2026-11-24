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
} from "lucide-react";
import { useChatStream } from "../hooks/useChatStream";
import { useVoiceRecorder } from "./VoiceAssistant";
import { apiFetchJson } from "../lib/apiFetch";

const AGENTS = ["main", "assistant", "research", "coder"];
const API_BASE = "http://localhost:4000";

export function AgentChat({ pageContext }: { pageContext?: string }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("main");
  const [input, setInput] = useState("");
  const voice = useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const { messages, loading, send, clearMessages } = useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Efface le petit message d'erreur vocale après quelques secondes.
  useEffect(() => {
    if (!voiceNote) return;
    const t = window.setTimeout(() => setVoiceNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [voiceNote]);

  // Refermer le panneau coupe tout enregistrement micro en cours.
  useEffect(() => {
    if (!open && voice.recording) void voice.stop();
  }, [open, voice.recording, voice.stop]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await send({ text, agent, preInstructions: pageContext });
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
          style={{
            position: "fixed",
            bottom: 92,
            right: 28,
            zIndex: 1000,
            width: 400,
            height: 560,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 18,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
            animation: "chatSlideUp 0.2s ease",
            overflow: "hidden",
          }}
        >
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
                onClick={() => clearMessages()}
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
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                placeholder={`Message à ${agent}… (Entrée pour envoyer)`}
                disabled={loading}
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
                disabled={!input.trim() || loading}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "none",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  background:
                    input.trim() && !loading
                      ? "var(--brand-accent)"
                      : "rgba(255,255,255,0.06)",
                  color: input.trim() && !loading ? "#fff" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s",
                }}
              >
                {loading ? (
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
