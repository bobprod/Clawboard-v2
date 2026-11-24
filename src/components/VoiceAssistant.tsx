import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Volume2, VolumeX, Sparkles, X } from "lucide-react";
import { apiFetchJson } from "../lib/apiFetch";

/**
 * Assistant vocal ClawBoard (niveau 1) :
 *  - reconnaissance vocale native du navigateur (Chrome/Edge), gratuite
 *  - lecture des reponses via speechSynthesis (voix systeme, gratuite)
 *  - commandes : creer une tache, lister les taches, ouvrir les taches, etat d'un projet
 *
 * Aucun service externe, aucun cout. Necessite localhost ou HTTPS (regle navigateur).
 */

type Task = {
  id: string;
  titre?: string | null;
  name?: string | null;
  statut?: string | null;
  status?: string | null;
};

const DIACRITICS = /[\u0300-\u036f]/g;
const normalize = (s: string) => s.normalize("NFD").replace(DIACRITICS, "").toLowerCase();

// Meme convention que src/hooks/useApi.ts : le backend n'est pas proxifie par Vite.
const API_BASE = "http://localhost:4000";

const HELP =
  "Je peux creer une tache, lister les taches, ouvrir la page des taches, ou donner l'etat d'un projet. " +
  "Par exemple : cree une tache pour verifier le moteur DMX.";

const EXAMPLE_COMMANDS = [
  "Crée une tâche pour vérifier le moteur DMX",
  "Liste les tâches",
  "Où en est Glow Logic ?",
  "Ouvre les tâches",
];

export function VoiceAssistant() {
  const navigate = useNavigate();
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [micState, setMicState] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef("");
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const speak = useCallback((text: string) => {
    if (mutedRef.current || !text) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      utterance.rate = 1.05;
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("fr"));
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
    } catch {
      /* lecture indisponible : on garde le texte a l'ecran */
    }
  }, []);

  const answer = useCallback(
    (text: string) => {
      setReply(text);
      setOpen(true);
      speak(text);
    },
    [speak],
  );

  const readProjectState = useCallback(
    async (rawName: string) => {
      const slug = normalize(rawName)
        .replace(/^(le |la |les |projet |de |du |des )+/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const candidates = [slug, slug.replace(/-/g, "")];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const { data, error } = await apiFetchJson<{ content: string }>(
          `${API_BASE}/api/files/registre-projets/${candidate}.md`,
        );
        if (error || !data?.content) continue;

        const content = data.content;
        const etatLine = content.match(/^etat:\s*(.+)$/m);
        if (etatLine) return `${candidate} : ${etatLine[1].trim()}`;

        const section = content.match(/##\s*[EÉ]tat\s*\n+([^\n]+)/i);
        if (section) return `${candidate} : ${section[1].trim()}`;

        return `${candidate} : fiche trouvee, mais aucun etat renseigne.`;
      }
      return `Je n'ai pas trouve de fiche pour "${rawName}" dans le registre.`;
    },
    [],
  );

  const handleCommand = useCallback(
    async (raw: string) => {
      const text = normalize(raw).trim();
      if (!text) return;
      setBusy(true);
      try {
        // 1. Creer une tache
        const create = text.match(
          /(?:cree|creer|ajoute|ajouter|nouvelle)\s+(?:une\s+|la\s+)?tache\s+(?:pour\s+)?(.+)/,
        );
        if (create) {
          const titre = create[1].trim();
          const { data, error } = await apiFetchJson<Task>(`${API_BASE}/api/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titre, status: "planifie", agent: "main" }),
          });
          if (error) return answer(`La creation a echoue : ${error}`);
          const nom = data?.titre || data?.name || titre;
          return answer(`Tache creee : ${nom}.`);
        }

        // 2. Ouvrir la page des taches
        if (/(ouvre|va sur|affiche|montre).*(tache)/.test(text) && !/(liste|combien)/.test(text)) {
          navigate("/tasks");
          return answer("J'ouvre la page des taches.");
        }

        // 3. Lister les taches
        if (/(liste|combien|quelles|etat des|point sur).*(tache)/.test(text) || /taches en cours/.test(text)) {
          const { data, error } = await apiFetchJson<{ data: Task[]; total?: number }>(
            `${API_BASE}/api/tasks?limit=100`,
          );
          if (error || !data) return answer(`Je n'ai pas pu lire les taches : ${error}`);
          const all = data.data || [];
          const total = typeof data.total === "number" ? data.total : all.length;
          const enCours = all.filter((t) => {
            const s = t.statut || t.status || "";
            return s === "running" || s === "en-cours";
          });
          const planifiees = all.filter((t) => {
            const s = t.statut || t.status || "";
            return s === "planifie" || s === "planned";
          });
          const noms = all
            .slice(0, 4)
            .map((t) => t.titre || t.name || "sans titre")
            .join(" ; ");
          return answer(
            `${total} taches au total, ${enCours.length} en cours, ${planifiees.length} planifiees. ` +
              (noms ? `Dont : ${noms}.` : ""),
          );
        }

        // 4. Etat d'un projet
        const project = text.match(
          /(?:ou en est|statut de|etat de|ca donne quoi).*?(?:le |la |projet )?(.+)/,
        );
        if (project) {
          const state = await readProjectState(project[1]);
          return answer(state);
        }

        // 5. Aide
        if (/(aide|que peux|commandes|au secours)/.test(text)) {
          return answer(HELP);
        }

        return answer("Commande non reconnue. " + HELP);
      } finally {
        setBusy(false);
      }
    },
    [answer, navigate, readProjectState],
  );

  // Initialisation de la reconnaissance vocale
  useEffect(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "fr-FR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      finalTextRef.current = "";
      setTranscript("");
      setReply("");
      setListening(true);
      setOpen(true);
    };
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTextRef.current += result[0].transcript + " ";
        else interim += result[0].transcript;
      }
      setTranscript((finalTextRef.current + interim).trim());
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      const code = event?.error || "inconnu";
      if (code === "not-allowed" || code === "service-not-allowed") {
        answer("Le micro est bloque. Autorise l'acces au microphone dans le navigateur.");
      } else if (code === "no-speech") {
        setOpen(false);
      } else {
        answer(`Micro indisponible (${code}).`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      const text = finalTextRef.current.trim();
      if (text) void handleCommand(text);
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, [answer, handleCommand]);

  // Hook de test / debug : window.__clawVoice
  useEffect(() => {
    (window as any).__clawVoice = {
      handleCommand,
      speak,
      setMuted,
      stop: () => recognitionRef.current?.stop?.(),
    };
    return () => {
      delete (window as any).__clawVoice;
    };
  }, [handleCommand, speak]);

  // Etat de la permission micro (pour afficher une aide claire)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const perms = (navigator as any).permissions;
        if (!perms?.query) return;
        const status = await perms.query({ name: "microphone" });
        if (!cancelled) setMicState(status.state);
        status.onchange = () => setMicState(status.state);
      } catch {
        /* permission API indisponible */
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleListening = () => {
    setOpen(true);
    const recognition = recognitionRef.current;
    if (!recognition) {
      setReply(
        "Reconnaissance vocale indisponible dans ce navigateur. Utilise Chrome ou Edge, ou tape ta commande ci-dessous.",
      );
      setOpen(true);
      return;
    }
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      recognition.start();
    } catch (err: any) {
      try {
        recognition.stop();
        recognition.start();
        return;
      } catch {
        /* ignore */
      }
      const name = err?.name || "erreur";
      answer(
        `Impossible de demarrer le micro (${name}). Ouvre cette page dans Chrome ou Edge, autorise le micro, ou tape ta commande ci-dessous.`,
      );
    }
  };

  const color = listening ? "#ef4444" : "#8b5cf6";

  return (
    <div
      style={{
        position: "fixed",
        right: "24px",
        bottom: "96px",
        zIndex: 1200,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "10px",
        maxWidth: "360px",
      }}
    >
      {open && (
        <div
          style={{
            width: "340px",
            background: "rgba(18,18,24,0.96)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <Sparkles size={14} color="#8b5cf6" />
            <strong style={{ fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary, #9ca3af)" }}>
              Assistant vocal
            </strong>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer l'assistant vocal"
              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-secondary, #9ca3af)", cursor: "pointer", padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>

          {transcript && (
            <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--text-primary, #fff)" }}>
              🎤 {transcript}
            </p>
          )}

          {reply && (
            <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#c4b5fd" }}>{reply}</p>
          )}

          {busy && <p style={{ margin: "0 0 6px", fontSize: "0.8rem", color: "#9ca3af" }}>Traitement…</p>}

          {!transcript && !reply && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #9ca3af)", lineHeight: 1.6 }}>
              {EXAMPLE_COMMANDS.map((c) => (
                <div key={c}>• « {c} »</div>
              ))}
            </div>
          )}

          {(micState === "denied" || !supported) && (
            <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "#f59e0b", lineHeight: 1.5 }}>
              {supported
                ? "Le micro est bloqué dans ce navigateur. Ouvre la page dans Chrome ou Edge, ou tape ta commande ci-dessous."
                : "Reconnaissance vocale indisponible dans ce navigateur. Tape ta commande ci-dessous."}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = draft.trim();
              if (!value) return;
              setDraft("");
              setTranscript(value);
              void handleCommand(value);
            }}
            style={{ display: "flex", gap: "6px", marginTop: "10px" }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Écris une commande…"
              aria-label="Commande écrite"
              style={{
                flex: 1,
                minWidth: 0,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))",
                borderRadius: "10px",
                padding: "8px 10px",
                color: "var(--text-primary, #fff)",
                fontSize: "0.82rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              aria-label="Envoyer la commande"
              style={{
                border: "none",
                borderRadius: "10px",
                padding: "8px 12px",
                background: "linear-gradient(135deg,#8b5cf6,#6366f1)",
                color: "#fff",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Envoyer
            </button>
          </form>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Activer la lecture vocale" : "Couper la lecture vocale"}
          title={muted ? "Activer la lecture vocale" : "Couper la lecture vocale"}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))",
            background: "rgba(255,255,255,0.06)",
            color: muted ? "#9ca3af" : "#a78bfa",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        <button
          onClick={toggleListening}
          aria-label={listening ? "Arreter l'ecoute" : "Parler a ClawBoard"}
          title={listening ? "Arreter l'ecoute" : "Parler a ClawBoard"}
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: `linear-gradient(135deg, ${color}, ${listening ? "#b91c1c" : "#6366f1"})`,
            boxShadow: listening ? `0 0 0 10px rgba(239,68,68,0.18), 0 10px 30px rgba(239,68,68,0.35)` : "0 10px 30px rgba(99,102,241,0.35)",
            transition: "box-shadow 0.2s, background 0.2s",
          }}
        >
          {listening ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
      </div>
    </div>
  );
}
