import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { apiFetchJson } from "../lib/apiFetch";
import { useVoiceSettings } from "../lib/voiceSettings";

/**
 * Assistant vocal flottant (bouton micro uniquement).
 * Les reglages (volume, micro, canal, moteur STT, voix) sont dans
 * Parametres → Voix & micro (VoiceSettingsPanel).
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

const PROJECT_ALIASES: Array<[RegExp, string]> = [
  [/glow|glot|glologique|glow\s*logic/, "glow-logic"],
  [/bob\s*prod|bobprod/, "bobprod"],
  [/bob\s*event|bobevent/, "bobevent"],
  [/bob\s*cam|bobcam/, "bobcam"],
  [/ambianc|ambiance/, "ambiancia"],
  [/claw\s*board|clawboard/, "clawboard"],
  [/sound\s*wave|soundwave/, "soundwave"],
  [/tools\s*forge|toolsforge/, "toolsforge"],
];

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function VoiceAssistant() {
  const navigate = useNavigate();
  const [settings] = useVoiceSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [micState, setMicState] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  // ── Permission micro ───────────────────────────────────────────────────
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
        /* ignore */
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Lecture vocale (volume/vitesse/voix viennent des reglages) ─────────
  const speak = useCallback((text: string) => {
    if (!text) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const current = settingsRef.current;
      utterance.lang = current.lang;
      utterance.rate = current.rate;
      utterance.volume = current.volume;
      const chosen = current.voiceName
        ? synth.getVoices().find((v) => v.name === current.voiceName)
        : synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(current.lang.slice(0, 2)));
      if (chosen) utterance.voice = chosen;
      synth.speak(utterance);
    } catch {
      /* ignore */
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

  // ── Capture audio (micro/canal choisis) ────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setListening(false);
  }, []);

  const openStream = useCallback(async () => {
    const current = settingsRef.current;
    const constraints: MediaStreamConstraints = {
      audio: current.micId ? { deviceId: { exact: current.micId } } : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;

    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const dest = ctx.createMediaStreamDestination();

    if (current.channel === "stereo") {
      source.connect(analyser);
      source.connect(dest);
    } else {
      const splitter = ctx.createChannelSplitter(2);
      source.connect(splitter);
      const index = current.channel === "left" ? 0 : 1;
      splitter.connect(analyser, index);
      splitter.connect(dest, index, 0);
    }

    setMicState("granted");
    return { analyser, dest };
  }, []);

  // ── Dictee via STT serveur (local ou cloud) ────────────────────────────
  const listenWithServer = useCallback(async () => {
    setOpen(true);
    setReply("");
    setTranscript("");
    stopAll();
    try {
      const graph = await openStream();
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const recorder = new MediaRecorder(graph.dest.stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const finished = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      });
      recorderRef.current = recorder;
      recorder.start(200);
      setListening(true);

      const data = new Uint8Array(graph.analyser.frequencyBinCount);
      const startedAt = Date.now();
      let heardSpeech = false;
      let lastVoiceAt = Date.now();

      const loop = () => {
        graph.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        if (rms > 0.02) {
          heardSpeech = true;
          lastVoiceAt = now;
        }
        const tooLong = now - startedAt > 10000;
        const silence = heardSpeech && now - lastVoiceAt > 900;
        const nothing = !heardSpeech && now - startedAt > 4000;
        if (tooLong || silence || nothing) {
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();

      const blob = await finished;
      setListening(false);
      stopAll();
      if (blob.size < 800) return answer("Je n'ai rien entendu. Reessaie en parlant un peu plus fort.");

      const base64 = await blobToBase64(blob);
      const mode = settingsRef.current.sttMode;
      const { data: result, error } = await apiFetchJson<{ text: string; provider: string }>(
        `${API_BASE}/api/stt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: base64,
            mimeType: blob.type || "audio/webm",
            provider: mode === "browser" ? "auto" : mode,
            lang: settingsRef.current.lang,
          }),
        },
      );
      if (error || !result) return answer(`Transcription impossible : ${error}`);
      const text = (result.text || "").trim();
      if (!text) return answer("Je n'ai pas compris. Reessaie.");
      setTranscript(text);
      await handleCommandRef.current?.(text);
    } catch (err: any) {
      setListening(false);
      stopAll();
      if (err?.name === "NotAllowedError") {
        setMicState("denied");
        answer("Micro refusé. Autorise le micro dans le navigateur puis réessaie.");
      } else {
        answer(`Erreur micro : ${err?.name || err?.message || "inconnue"}`);
      }
    }
  }, [answer, openStream, stopAll]);

  // ── Commandes ──────────────────────────────────────────────────────────
  const readProjectState = useCallback(async (rawName: string) => {
    const normalizedName = normalize(rawName);
    const alias = PROJECT_ALIASES.find(([pattern]) => pattern.test(normalizedName));
    const slug = alias
      ? alias[1]
      : normalizedName
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
  }, []);

  const handleCommand = useCallback(
    async (raw: string) => {
      const text = normalize(raw).trim();
      if (!text) return;
      setBusy(true);
      try {
        const create = text.match(
          /(?:cree|creer|crie|crier|creez|ajoute|ajouter|ajoutez|nouvelle)\s+(?:une\s+|la\s+)?tache\s+(?:pour\s+)?(.+)/,
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

        if (/(ouvre|ouvrez|va sur|affiche|montre).*(tache)/.test(text) && !/(liste|combien)/.test(text)) {
          navigate("/tasks");
          return answer("J'ouvre la page des taches.");
        }

        if (/(liste|listez|lisez|lis|combien|quelles|etat des|point sur).*(tache)/.test(text) || /taches en cours/.test(text)) {
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

        const project = text.match(
          /(?:ou en est|statut de|etat de|ca donne quoi).*?(?:le |la |projet )?(.+)/,
        );
        if (project) {
          const state = await readProjectState(project[1]);
          return answer(state);
        }

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

  const handleCommandRef = useRef(handleCommand);
  useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  // ── Init reconnaissance navigateur ─────────────────────────────────────
  useEffect(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = settingsRef.current.lang;
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
        setMicState("denied");
        answer("Le micro est bloque. Autorise-le dans le navigateur, ou choisis Whisper local dans Parametres.");
      } else if (code === "no-speech") {
        setOpen(false);
      } else {
        answer(`Micro indisponible (${code}).`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      const text = finalTextRef.current.trim();
      if (text) void handleCommandRef.current?.(text);
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, [answer]);

  // Hook de test / debug
  useEffect(() => {
    (window as any).__clawVoice = {
      handleCommand,
      speak,
      stop: () => recognitionRef.current?.stop?.(),
      settings: () => settingsRef.current,
    };
    return () => {
      delete (window as any).__clawVoice;
    };
  }, [handleCommand, speak]);

  const toggleListening = () => {
    setOpen(true);
    if (settingsRef.current.sttMode !== "browser") {
      if (listening) {
        stopAll();
        return;
      }
      void listenWithServer();
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      setReply(
        "Reconnaissance vocale indisponible dans ce navigateur. Choisis Whisper local dans Parametres, ou tape ta commande ci-dessous.",
      );
      return;
    }
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      recognition.lang = settingsRef.current.lang;
      recognition.start();
    } catch (err: any) {
      try {
        recognition.stop();
        recognition.start();
        return;
      } catch {
        /* ignore */
      }
      answer(
        `Impossible de demarrer le micro (${err?.name || "erreur"}). Autorise le micro dans le navigateur, ou tape ta commande ci-dessous.`,
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
        maxWidth: "380px",
      }}
    >
      {open && (
        <div
          style={{
            width: "360px",
            maxHeight: "60vh",
            overflowY: "auto",
            background: "rgba(18,18,24,0.97)",
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
            <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--text-primary, #fff)" }}>🎤 {transcript}</p>
          )}
          {reply && <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#c4b5fd" }}>{reply}</p>}
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
                ? "Micro refusé. Autorise-le via le cadenas du navigateur, ou tape ta commande ci-dessous."
                : "Reconnaissance vocale indisponible. Tape ta commande ci-dessous."}
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
          boxShadow: listening
            ? "0 0 0 10px rgba(239,68,68,0.18), 0 10px 30px rgba(239,68,68,0.35)"
            : "0 10px 30px rgba(99,102,241,0.35)",
          transition: "box-shadow 0.2s, background 0.2s",
        }}
      >
        {listening ? <MicOff size={22} /> : <Mic size={22} />}
      </button>
    </div>
  );
}
