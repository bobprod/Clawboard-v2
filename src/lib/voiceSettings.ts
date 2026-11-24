import { useCallback, useEffect, useState } from "react";

/**
 * Reglages voix/micro partages entre l'assistant flottant et la page Parametres.
 * Persists dans localStorage + evenement pour synchroniser les composants.
 */

export type VoiceSettings = {
  micId: string;
  lang: string;
  voiceName: string;
  rate: number;
  volume: number;
  channel: "stereo" | "left" | "right";
  sttMode: "browser" | "local" | "cloud" | "auto";
};

export const VOICE_SETTINGS_KEY = "clawboard-voice-settings";
const EVENT = "clawboard-voice-settings-changed";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  micId: "",
  lang: "fr-FR",
  voiceName: "",
  rate: 1.05,
  volume: 1,
  channel: "stereo",
  sttMode: "browser",
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    return { ...DEFAULT_VOICE_SETTINGS, ...(JSON.parse(raw) as Partial<VoiceSettings>) };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

function persist(next: VoiceSettings) {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
}

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(() => loadVoiceSettings());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<VoiceSettings>).detail;
      setSettings(detail || loadVoiceSettings());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  return [settings, update] as const;
}
