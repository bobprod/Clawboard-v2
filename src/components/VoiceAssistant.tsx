import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useVoiceRecorder — logique d'enregistrement micro réutilisable.
 *
 * Ce fichier n'expose plus de widget flottant : uniquement ce hook, consommé
 * par le chat flottant Lia (AgentChat) pour dicter un message au micro.
 *
 *   const voice = useVoiceRecorder();
 *   await voice.start();              // 1er clic : démarre MediaRecorder
 *   const audio = await voice.stop();  // 2e clic : { base64, mimeType }
 *
 * `stop()` résout `null` si aucun enregistrement n'est en cours (ou si rien
 * n'a été capturé). Les tracks micro sont toujours coupées au démontage.
 */

export interface VoiceRecording {
  /** Audio encodé en base64 (sans préfixe data:), prêt pour POST /api/stt */
  base64: string;
  /** mimeType réel de l'enregistrement (ex. "audio/webm") */
  mimeType: string;
}

/** Convertit un Blob en base64, par morceaux pour éviter les débordements de pile. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const pendingStartRef = useRef(false);

  /** Coupe les tracks micro et remet les refs à zéro (sans toucher au state). */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    activeRef.current = false;
  }, []);

  // Nettoyage au démontage : stop du recorder + des tracks micro.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      activeRef.current = false;
      pendingStartRef.current = false;
    };
  }, []);

  /** Démarre l'enregistrement (noop si déjà en cours). */
  const start = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setStarting(true);
    pendingStartRef.current = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("getUserMedia indisponible"), {
          name: "NotSupportedError",
        });
      }
      if (typeof MediaRecorder === "undefined") {
        throw Object.assign(new Error("MediaRecorder indisponible"), {
          name: "NotSupportedError",
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // stop() a été demandé pendant la demande de permission → on annule tout.
      if (!pendingStartRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      pendingStartRef.current = false;

      streamRef.current = stream;
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(200);
      recorderRef.current = recorder;
      activeRef.current = true;
      setRecording(true);
    } catch (err: any) {
      releaseStream();
      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        setError(
          "Micro refusé. Autorise le micro dans le navigateur puis réessaie.",
        );
      } else {
        setError(
          `Micro indisponible (${err?.name || err?.message || "erreur inconnue"}).`,
        );
      }
    } finally {
      pendingStartRef.current = false;
      setStarting(false);
    }
  }, [releaseStream]);

  /**
   * Arrête l'enregistrement et résout vers { base64, mimeType }.
   * Résout null si aucun enregistrement n'était en cours ou si rien n'a été
   * capturé (blob vide).
   */
  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    // Annule aussi un start() encore en attente de permission.
    pendingStartRef.current = false;

    const recorder = recorderRef.current;
    if (!recorder || !activeRef.current) {
      releaseStream();
      return null;
    }
    activeRef.current = false;

    let blob: Blob;
    if (recorder.state === "inactive") {
      // Le recorder s'est déjà arrêté tout seul (micro coupé, etc.)
      blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
    } else {
      const finished = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(
            new Blob(chunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            }),
          );
        };
      });
      try {
        recorder.stop();
      } catch {
        /* ignore — résoudra via onstop */
      }
      blob = await finished;
    }

    releaseStream();
    setRecording(false);
    if (blob.size === 0) return null;

    return {
      base64: await blobToBase64(blob),
      mimeType: blob.type || "audio/webm",
    };
  }, [releaseStream]);

  return { recording, starting, start, stop, error };
}
