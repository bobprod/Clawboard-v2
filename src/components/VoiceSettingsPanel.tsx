import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Mic, Play, Square, Volume2, RefreshCw } from "lucide-react";
import { apiFetchJson } from "../lib/apiFetch";
import { useVoiceSettings } from "../lib/voiceSettings";
import type { VoiceSettings } from "../lib/voiceSettings";

const API_BASE = "http://localhost:4000";

type SystemAudio = {
  supported: boolean;
  inputs: string[];
  outputs: string[];
  cards: string[];
  error?: string;
};

type SttStatus = {
  local: { available: boolean; model?: string; error?: string };
  cloud: { available: boolean; provider?: string };
  browser: boolean;
};

const LANGS = [
  { value: "fr-FR", label: "Français" },
  { value: "en-US", label: "English (US)" },
  { value: "ar-SA", label: "العربية" },
];

const fieldLabel: CSSProperties = { color: "var(--text-secondary, #9ca3af)", fontSize: "0.82rem" };
const fieldStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "var(--text-primary, #fff)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "0.85rem",
  width: "100%",
};
const smallBtn: CSSProperties = {
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))",
  background: "rgba(255,255,255,0.06)",
  color: "var(--text-primary, #fff)",
  borderRadius: "8px",
  padding: "6px 10px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "0.78rem",
};

export function VoiceSettingsPanel() {
  const [settings, updateSettings] = useVoiceSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [micState, setMicState] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [systemAudio, setSystemAudio] = useState<SystemAudio | null>(null);
  const [sttStatus, setSttStatus] = useState<SttStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [testError, setTestError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [trackInfo, setTrackInfo] = useState<Record<string, unknown> | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const recordUrlRef = useRef<string | null>(null);

  // ── Voix disponibles ───────────────────────────────────────────────────
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => {
      const list = synth.getVoices();
      setVoices(
        [...list].sort((a, b) => {
          const af = a.lang.toLowerCase().startsWith("fr") ? 0 : 1;
          const bf = b.lang.toLowerCase().startsWith("fr") ? 0 : 1;
          return af - bf || a.name.localeCompare(b.name);
        }),
      );
    };
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, []);

  // ── Micros navigateur ──────────────────────────────────────────────────
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

  // ── Autorisation micro ─────────────────────────────────────────────────
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

  // ── Donnees backend ────────────────────────────────────────────────────
  const refreshSystemAudio = useCallback(async () => {
    const { data } = await apiFetchJson<SystemAudio>(`${API_BASE}/api/audio/devices`);
    if (data) setSystemAudio(data);
  }, []);

  const refreshSttStatus = useCallback(async () => {
    const { data } = await apiFetchJson<SttStatus>(`${API_BASE}/api/stt/status`);
    if (data) setSttStatus(data);
  }, []);

  useEffect(() => {
    void refreshSystemAudio();
    void refreshSttStatus();
  }, [refreshSystemAudio, refreshSttStatus]);

  // ── Graphe audio + niveau + enregistrement ─────────────────────────────
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
      audio: settingsRef.current.micId ? { deviceId: { exact: settingsRef.current.micId } } : true,
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

  const listenSample = () => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance("Bonjour, je suis votre assistant vocal ClawBoard.");
      u.lang = settings.lang;
      u.rate = settings.rate;
      u.volume = settings.volume;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Permission */}
      <div className="glass-panel p-5" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <Mic size={16} color="var(--brand-accent)" /> Accès au microphone
          </div>
          <span style={{ color: permissionLabel.color, fontWeight: 700, fontSize: "0.85rem" }}>
            {permissionLabel.text}
          </span>
        </div>
        <button style={smallBtn} onClick={() => void startTest()}>
          <Mic size={13} /> Autoriser / tester
        </button>
        {testError && <p style={{ margin: 0, color: "#f59e0b", fontSize: "0.8rem" }}>{testError}</p>}
        {micState === "denied" && (
          <div style={{ padding: "10px", borderRadius: "8px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", fontSize: "0.8rem", color: "#fbbf24", lineHeight: 1.5 }}>
            Micro refusé pour ce site. Dans <strong>Chrome</strong> : clique sur le <strong>cadenas</strong> à
            gauche de l'adresse → <strong>Microphone</strong> → <strong>Autoriser</strong> → recharge la page.
            <br />
            (Le navigateur intégré d'OpenCode refuse toujours le micro.)
          </div>
        )}
      </div>

      {/* Moteur STT */}
      <div className="glass-panel p-5" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Moteur de reconnaissance</div>
        <select
          value={settings.sttMode}
          onChange={(e) => updateSettings({ sttMode: e.target.value as VoiceSettings["sttMode"] })}
          aria-label="Moteur de reconnaissance"
          style={fieldStyle}
        >
          <option value="browser">Navigateur (gratuit)</option>
          <option value="local">Whisper local{sttStatus && !sttStatus.local.available ? " — non installé" : ""}</option>
          <option value="cloud">Cloud Deepgram{sttStatus && !sttStatus.cloud.available ? " — clé requise" : ""}</option>
          <option value="auto">Auto (local puis cloud)</option>
        </select>
        <div style={{ color: "#6b7280", fontSize: "0.78rem", lineHeight: 1.5 }}>
          {settings.sttMode === "browser"
            ? "Le navigateur utilise le micro par défaut du système."
            : "Utilise le micro et le canal choisis ci-dessous (enregistrement puis transcription serveur)."}
          {sttStatus && (
            <>
              {" "}Local : {sttStatus.local.available ? `OK (${sttStatus.local.model})` : "indisponible"} · Cloud :{" "}
              {sttStatus.cloud.available ? "OK" : "non configuré"}
            </>
          )}
        </div>
      </div>

      {/* Entree + canal */}
      <div className="glass-panel p-5" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Entrée audio</div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>Micro d'entrée</span>
          <select
            value={settings.micId}
            onChange={(e) => updateSettings({ micId: e.target.value })}
            aria-label="Micro d'entrée"
            style={fieldStyle}
          >
            <option value="">Micro par défaut du système</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Micro ${i + 1}`}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>Canal testé</span>
          <select
            value={settings.channel}
            onChange={(e) => updateSettings({ channel: e.target.value as VoiceSettings["channel"] })}
            aria-label="Canal testé"
            style={fieldStyle}
          >
            <option value="stereo">Stéréo (gauche + droite)</option>
            <option value="left">Gauche (L)</option>
            <option value="right">Droite (R)</option>
          </select>
          <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>
            Sur une interface multi-canaux, Windows expose souvent chaque paire comme un périphérique
            (IN 1-2, IN 3-4…).
          </span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button style={smallBtn} onClick={() => (testing ? stopAll() : void startTest())}>
            {testing ? <><Square size={12} /> Stop</> : <><Play size={12} /> Tester le niveau</>}
          </button>
          <button style={smallBtn} onClick={() => (recording ? stopRecording() : void startRecording(5))}>
            {recording ? <><Square size={12} /> Arrêter</> : <><Mic size={12} /> Enregistrer 5 s</>}
          </button>
          <button style={smallBtn} onClick={() => void refreshDevices()}>
            <RefreshCw size={12} /> Périphériques
          </button>
        </div>

        <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(level * 100)}%`,
              background:
                level > 0.7
                  ? "linear-gradient(90deg,#22c55e,#ef4444)"
                  : "linear-gradient(90deg,var(--brand-accent),#22c55e)",
              transition: "width 80ms linear",
            }}
          />
        </div>

        {recordUrl && <audio controls src={recordUrl} style={{ width: "100%", height: "34px" }} />}

        {trackInfo && (
          <div style={{ fontSize: "0.78rem", color: "#6b7280", lineHeight: 1.6 }}>
            <div>Appareil : {String(trackInfo.appareil)}</div>
            <div>Canaux : {String(trackInfo.canaux)} · {String(trackInfo.frequence)}</div>
            <div>
              Écho : {String(trackInfo.echo)} · Bruit : {String(trackInfo.bruit)} · Gain auto :{" "}
              {String(trackInfo.gain)}
            </div>
          </div>
        )}
      </div>

      {/* Peripheriques systeme */}
      <div className="glass-panel p-5" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Périphériques système</div>
          <button style={smallBtn} onClick={() => void refreshSystemAudio()}>
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>
        {systemAudio?.supported ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {systemAudio.inputs.length === 0 && (
              <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>Aucune entrée détectée.</span>
            )}
            {systemAudio.inputs.map((name) => (
              <span key={name} style={{ fontSize: "0.82rem" }}>🎙 {name}</span>
            ))}
            {systemAudio.cards.length > 0 && (
              <span style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: 4 }}>
                Cartes : {systemAudio.cards.join(", ")}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>
            {systemAudio?.error ? `Indisponible : ${systemAudio.error}` : "Lecture du système…"}
          </span>
        )}
        <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>
          Liste lue par le serveur, indépendante du navigateur.
        </span>
      </div>

      {/* Lecture */}
      <div className="glass-panel p-5" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Voix de lecture</div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>Langue</span>
          <select
            value={settings.lang}
            onChange={(e) => updateSettings({ lang: e.target.value })}
            aria-label="Langue de reconnaissance"
            style={fieldStyle}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>Voix ({voices.length} disponibles)</span>
          <select
            value={settings.voiceName}
            onChange={(e) => updateSettings({ voiceName: e.target.value })}
            aria-label="Voix de lecture"
            style={fieldStyle}
          >
            <option value="">Voix par défaut ({settings.lang.slice(0, 2)})</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>Vitesse : {settings.rate.toFixed(2)}×</span>
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

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>Volume : {Math.round(settings.volume * 100)} %</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
            aria-label="Volume de lecture"
          />
        </label>

        <button style={smallBtn} onClick={listenSample}>
          <Volume2 size={13} /> Écouter un exemple
        </button>
      </div>
    </div>
  );
}
