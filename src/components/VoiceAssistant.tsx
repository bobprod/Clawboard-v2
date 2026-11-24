import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Volume2, VolumeX, Sparkles, X, Settings2, Play, Square } from "lucide-react";
import { apiFetchJson } from "../lib/apiFetch";

/**
 * Assistant vocal ClawBoard (niveau 1) + configuration micro/voix.
 *  - reconnaissance vocale native du navigateur (Chrome/Edge), gratuite
 *  - lecture des reponses via speechSynthesis (voix systeme, gratuite)
 *  - commandes : creer une tache, lister les taches, ouvrir les taches, etat d'un projet
 *  - mode texte de secours (quand le micro est bloque)
 *  - reglages : micro d'entree, test de niveau, permission, langue, voix, vitesse
 *
 * Aucun service externe, aucun cout. Necessite localhost ou HTTPS.
 */

type Task = {
  id: string;
  titre?: string | null;
  name?: string | null;
  statut?: string | null;
  status?: string | null;
};

type VoiceSettings = {
  micId: string;
  lang: string;
  voiceName: string;
  rate: number;
  channel: "stereo" | "left" | "right";
};

type SystemAudio = {
  supported: boolean;
  inputs: string[];
  outputs: string[];
  cards: string[];
  error?: string;
};

const DIACRITICS = /[\u0300-\u036f]/g;
const normalize = (s: string) => s.normalize("NFD").replace(DIACRITICS, "").toLowerCase();

// Meme convention que src/hooks/useApi.ts : le backend n'est pas proxifie par Vite.
const API_BASE = "http://localhost:4000";

const SETTINGS_KEY = "clawboard-voice-settings";
const DEFAULT_SETTINGS: VoiceSettings = { micId: "", lang: "fr-FR", voiceName: "", rate: 1.05, channel: "stereo" };

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<VoiceSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const LANGS = [
  { value: "fr-FR", label: "Français" },
  { value: "en-US", label: "English (US)" },
  { value: "ar-SA", label: "العربية" },
];

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

  // ── Reglages micro/voix ────────────────────────────────────────────────
  const [settings, setSettings] = useState<VoiceSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [testError, setTestError] = useState<string | null>(null);
  const [systemAudio, setSystemAudio] = useState<SystemAudio | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [trackInfo, setTrackInfo] = useState<Record<string, unknown> | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef("");
  const mutedRef = useRef(false);
  const settingsRef = useRef(settings);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const recordUrlRef = useRef<string | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* stockage indisponible */
    }
    const recognition = recognitionRef.current;
    if (recognition) recognition.lang = settings.lang;
  }, [settings]);

  const updateSettings = (patch: Partial<VoiceSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  // ── Voix de lecture disponibles ────────────────────────────────────────
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => {
      const list = synth.getVoices();
      setVoices([...list].sort((a, b) => {
        const af = a.lang.toLowerCase().startsWith("fr") ? 0 : 1;
        const bf = b.lang.toLowerCase().startsWith("fr") ? 0 : 1;
        return af - bf || a.name.localeCompare(b.name);
      }));
    };
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, []);

  // ── Liste des micros ───────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const handler = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
  }, [refreshDevices]);

  // ── Etat de la permission micro ────────────────────────────────────────
  // ── Peripheriques audio systeme (lus par le backend, pas par le navigateur) ──
  const refreshSystemAudio = useCallback(async () => {
    const { data } = await apiFetchJson<SystemAudio>(`${API_BASE}/api/audio/devices`);
    if (data) setSystemAudio(data);
  }, []);

  useEffect(() => {
    if (settingsOpen) void refreshSystemAudio();
  }, [settingsOpen, refreshSystemAudio]);

  // ── Etat de la permission micro ────────────────────────────────────────
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

  // ── Lecture vocale ─────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (mutedRef.current || !text) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const current = settingsRef.current;
      utterance.lang = current.lang;
      utterance.rate = current.rate;
      const chosen = current.voiceName
        ? synth.getVoices().find((v) => v.name === current.voiceName)
        : synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(current.lang.slice(0, 2)));
      if (chosen) utterance.voice = chosen;
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

  // ── Test du micro : niveau + enregistrement/ecoute ──────────────────────
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
    setLevel(0);
    setTesting(false);
    setRecording(false);
  }, []);

  const buildGraph = useCallback((stream: MediaStream) => {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const dest = ctx.createMediaStreamDestination();
    const channel = settingsRef.current.channel;
    if (channel === "stereo") {
      source.connect(analyser);
      source.connect(dest);
    } else {
      const splitter = ctx.createChannelSplitter(2);
      source.connect(splitter);
      const index = channel === "left" ? 0 : 1;
      splitter.connect(analyser, index);
      splitter.connect(dest, index, 0);
    }
    return { ctx, analyser, dest };
  }, []);

  const openStream = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      audio: settingsRef.current.micId
        ? { deviceId: { exact: settingsRef.current.micId } }
        : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;
    const track = stream.getAudioTracks()[0];
    const s: any = track?.getSettings ? track.getSettings() : {};
    setTrackInfo({
      appareil: track?.label || "(sans nom)",
      canaux: s.channelCount ?? "-",
      frequence: s.sampleRate ? `${s.sampleRate} Hz` : "-",
      echo: s.echoCancellation === undefined ? "-" : s.echoCancellation ? "oui" : "non",
      bruit: s.noiseSuppression === undefined ? "-" : s.noiseSuppression ? "oui" : "non",
      gain: s.autoGainControl === undefined ? "-" : s.autoGainControl ? "oui" : "non",
    });
    const graph = buildGraph(stream);
    audioCtxRef.current = graph.ctx;
    setMicState("granted");
    void refreshDevices();
    const data = new Uint8Array(graph.analyser.frequencyBinCount);
    const tick = () => {
      graph.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return graph;
  }, [buildGraph, refreshDevices]);

  const startTest = useCallback(async () => {
    stopAll();
    setTestError(null);
    try {
      await openStream();
      setTesting(true);
    } catch (err: any) {
      setTestError(`${err?.name || "Erreur"} : ${err?.message || "acces refuse"}`);
      if (err?.name === "NotAllowedError") setMicState("denied");
      stopAll();
    }
  }, [openStream, stopAll]);

  const startRecording = useCallback(
    async (seconds = 5) => {
      stopAll();
      setTestError(null);
      if (recordUrlRef.current) {
        URL.revokeObjectURL(recordUrlRef.current);
        recordUrlRef.current = null;
        setRecordUrl(null);
      }
      try {
        const graph = await openStream();
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : undefined;
        const recorder = new MediaRecorder(graph.dest.stream, mime ? { mimeType: mime } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          chunksRef.current = [];
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            recordUrlRef.current = url;
            setRecordUrl(url);
          }
          stopAll();
        };
        recorderRef.current = recorder;
        recorder.start(250);
        setRecording(true);
        setTesting(true);
        stopTimerRef.current = window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, Math.max(1, seconds) * 1000);
      } catch (err: any) {
        setTestError(`${err?.name || "Erreur"} : ${err?.message || "acces refuse"}`);
        if (err?.name === "NotAllowedError") setMicState("denied");
        stopAll();
      }
    },
    [openStream, stopAll],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else stopAll();
  }, [stopAll]);

  useEffect(
    () => () => {
      stopAll();
      if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current);
    },
    [stopAll],
  );

  // ── Commandes ──────────────────────────────────────────────────────────
  const readProjectState = useCallback(async (rawName: string) => {
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
  }, []);

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

  // ── Initialisation de la reconnaissance vocale ─────────────────────────
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
      settings: () => settingsRef.current,
      updateSettings,
    };
    return () => {
      delete (window as any).__clawVoice;
    };
  }, [handleCommand, speak]);

  const toggleListening = () => {
    setOpen(true);
    const recognition = recognitionRef.current;
    if (!recognition) {
      setReply(
        "Reconnaissance vocale indisponible dans ce navigateur. Utilise Chrome ou Edge, ou tape ta commande ci-dessous.",
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
      const name = err?.name || "erreur";
      answer(
        `Impossible de demarrer le micro (${name}). Ouvre cette page dans Chrome ou Edge, autorise le micro, ou tape ta commande ci-dessous.`,
      );
    }
  };

  const listenSample = () => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance("Bonjour, je suis votre assistant vocal ClawBoard.");
      u.lang = settings.lang;
      u.rate = settings.rate;
      const chosen = settings.voiceName
        ? voices.find((v) => v.name === settings.voiceName)
        : voices.find((v) => v.lang.toLowerCase().startsWith(settings.lang.slice(0, 2)));
      if (chosen) u.voice = chosen;
      synth.speak(u);
    } catch {
      /* ignore */
    }
  };

  const permissionLabel =
    micState === "granted"
      ? { text: "Autorisé", color: "#22c55e" }
      : micState === "denied"
        ? { text: "Bloqué", color: "#ef4444" }
        : micState === "prompt"
          ? { text: "À demander", color: "#f59e0b" }
          : { text: "Inconnu", color: "#9ca3af" };

  const color = listening ? "#ef4444" : "#8b5cf6";

  const smallBtn: CSSProperties = {
    border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))",
    background: "rgba(255,255,255,0.06)",
    color: "var(--text-primary, #fff)",
    borderRadius: "8px",
    padding: "6px 8px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.75rem",
  };

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
            maxHeight: "70vh",
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
              {settingsOpen ? "Réglages micro & voix" : "Assistant vocal"}
            </strong>
            <button
              onClick={() => setSettingsOpen((s) => !s)}
              aria-label="Réglages du micro et de la voix"
              title="Réglages du micro et de la voix"
              style={{ marginLeft: "auto", background: "none", border: "none", color: settingsOpen ? "#a78bfa" : "var(--text-secondary, #9ca3af)", cursor: "pointer", padding: 0 }}
            >
              <Settings2 size={15} />
            </button>
            <button
              onClick={() => { setOpen(false); setSettingsOpen(false); }}
              aria-label="Fermer l'assistant vocal"
              style={{ background: "none", border: "none", color: "var(--text-secondary, #9ca3af)", cursor: "pointer", padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>

          {settingsOpen ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem" }}>
              {/* Permission */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Accès au micro</span>
                  <span style={{ color: permissionLabel.color, fontWeight: 700 }}>{permissionLabel.text}</span>
                </div>
                <button
                  style={smallBtn}
                  onClick={() => { setOpen(true); void startTest(); }}
                >
                  <Mic size={13} /> Autoriser / tester
                </button>
                {testError && (
                  <p style={{ margin: "6px 0 0", color: "#f59e0b", fontSize: "0.72rem" }}>
                    {testError} — le navigateur intégré d'OpenCode bloque le micro : utilise Chrome ou Edge.
                  </p>
                )}
              </div>

              {/* Peripheriques systeme (lus par le backend) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Périphériques système</span>
                  <button style={smallBtn} onClick={() => void refreshSystemAudio()}>
                    Actualiser
                  </button>
                </div>
                {systemAudio?.supported ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxHeight: "130px", overflowY: "auto" }}>
                    {systemAudio.inputs.length === 0 && (
                      <span style={{ color: "#6b7280", fontSize: "0.72rem" }}>Aucune entrée détectée par le système.</span>
                    )}
                    {systemAudio.inputs.map((name) => (
                      <span key={name} style={{ fontSize: "0.74rem", color: "var(--text-primary, #fff)" }}>
                        🎙 {name}
                      </span>
                    ))}
                    {systemAudio.cards.length > 0 && (
                      <span style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: "4px" }}>
                        Cartes : {systemAudio.cards.join(", ")}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ color: "#6b7280", fontSize: "0.72rem" }}>
                    {systemAudio?.error ? `Indisponible : ${systemAudio.error}` : "Lecture du système…"}
                  </span>
                )}
                <span style={{ display: "block", color: "#6b7280", fontSize: "0.68rem", marginTop: "4px", lineHeight: 1.4 }}>
                  Liste lue par le serveur, indépendante du navigateur. Le navigateur n'expose les micros qu'après autorisation.
                </span>
              </div>

              {/* Micro d'entree */}
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Micro d'entrée</span>
                <select
                  value={settings.micId}
                  onChange={(e) => updateSettings({ micId: e.target.value })}
                  aria-label="Micro d'entrée"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary, #fff)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 8px", fontSize: "0.78rem" }}
                >
                  <option value="">Micro par défaut du système</option>
                  {devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Micro ${i + 1}`}
                    </option>
                  ))}
                </select>
                <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>
                  La reconnaissance vocale utilise le micro par défaut du système ; ce choix sert au test de niveau.
                </span>
              </label>

              {/* Canal + test */}
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Canal testé</span>
                <select
                  value={settings.channel}
                  onChange={(e) => updateSettings({ channel: e.target.value as VoiceSettings["channel"] })}
                  aria-label="Canal testé"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary, #fff)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 8px", fontSize: "0.78rem" }}
                >
                  <option value="stereo">Stéréo (gauche + droite)</option>
                  <option value="left">Gauche (L)</option>
                  <option value="right">Droite (R)</option>
                </select>
                <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>
                  Sur une interface multi-canaux, Windows expose souvent chaque paire comme un périphérique (IN 1-2, IN 3-4…).
                </span>
              </label>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", gap: "6px" }}>
                  <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Niveau du signal</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button style={smallBtn} onClick={() => (testing ? stopAll() : void startTest())}>
                      {testing ? <><Square size={12} /> Stop</> : <><Play size={12} /> Tester</>}
                    </button>
                    <button style={smallBtn} onClick={() => (recording ? stopRecording() : void startRecording(5))}>
                      {recording ? <><Square size={12} /> Arrêter</> : <><Mic size={12} /> Enregistrer 5 s</>}
                    </button>
                  </div>
                </div>
                <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(level * 100)}%`,
                      background: level > 0.7 ? "linear-gradient(90deg,#22c55e,#ef4444)" : "linear-gradient(90deg,#6366f1,#22c55e)",
                      transition: "width 80ms linear",
                    }}
                  />
                </div>
                {recordUrl && (
                  <audio controls src={recordUrl} style={{ width: "100%", height: "32px", marginTop: "6px" }} />
                )}
                {trackInfo && (
                  <div style={{ marginTop: "6px", fontSize: "0.68rem", color: "#6b7280", lineHeight: 1.5 }}>
                    <div>Appareil : {String(trackInfo.appareil)}</div>
                    <div>Canaux : {String(trackInfo.canaux)} · {String(trackInfo.frequence)}</div>
                    <div>Écho : {String(trackInfo.echo)} · Bruit : {String(trackInfo.bruit)} · Gain auto : {String(trackInfo.gain)}</div>
                  </div>
                )}
              </div>

              {/* Langue */}
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Langue de reconnaissance</span>
                <select
                  value={settings.lang}
                  onChange={(e) => updateSettings({ lang: e.target.value })}
                  aria-label="Langue de reconnaissance"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary, #fff)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 8px", fontSize: "0.78rem" }}
                >
                  {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </label>

              {/* Voix de lecture */}
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Voix de lecture ({voices.length} disponibles)</span>
                <select
                  value={settings.voiceName}
                  onChange={(e) => updateSettings({ voiceName: e.target.value })}
                  aria-label="Voix de lecture"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary, #fff)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 8px", fontSize: "0.78rem" }}
                >
                  <option value="">Voix par défaut ({settings.lang.slice(0, 2)})</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>
                  ))}
                </select>
                <button style={smallBtn} onClick={listenSample}>
                  <Volume2 size={13} /> Écouter un exemple
                </button>
              </label>

              {/* Vitesse */}
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-secondary, #9ca3af)" }}>Vitesse de lecture : {settings.rate.toFixed(2)}×</span>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={settings.rate}
                  onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
                  aria-label="Vitesse de lecture"
                />
              </label>
            </div>
          ) : (
            <>
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
            </>
          )}
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
          onClick={() => { setOpen(true); setSettingsOpen(true); }}
          aria-label="Ouvrir les réglages micro et voix"
          title="Réglages micro et voix"
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))",
            background: "rgba(255,255,255,0.06)",
            color: "#a78bfa",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <Settings2 size={18} />
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
