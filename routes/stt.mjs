// ─── STT Routes ──────────────────────────────────────────────────────────────
// Transcription audio : moteur local (faster-whisper CPU, worker persistant)
// ou cloud (Deepgram).
//
// GET  /api/stt/status  -> disponibilite des moteurs
// POST /api/stt         -> { audio: base64, mimeType, provider, lang } -> { text }

import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MAX_BYTES = 8 * 1024 * 1024;
const LOCAL_MODEL = process.env.STT_LOCAL_MODEL || "base";
const STT_PROMPT =
  process.env.STT_PROMPT ||
  "Commandes: liste les taches, cree une tache, ouvre les taches, ou en est le projet. " +
    "Projets: BobProd, BobEvent, BobCam, Ambiancia, Glow Logic, ClawBoard, Soundwave, toolsforge, Immo Saas.";

function pythonPath() {
  return process.platform === "win32"
    ? join(ROOT, ".venv-stt", "Scripts", "python.exe")
    : join(ROOT, ".venv-stt", "bin", "python");
}

// ─── Worker persistant ────────────────────────────────────────────────────────
// Charge le modèle une seule fois, puis transcrit en continu (latence ~0 au lieu
// de ~2-5 s par requête). Protocole JSON-lines : 1 ligne = 1 requête = 1 réponse.

const worker = {
  proc: null,
  model: null,
  ready: null, // Promise résolue au "ready"
  pending: [], // FIFO de { resolve, reject }
  buf: "", // accumulation stdout
  log: "", // accumulation stderr (debug)
};

function spawnWorker(model) {
  const python = pythonPath();
  const script = join(ROOT, "scripts", "stt_worker.py");
  const proc = spawn(
    python,
    [script, "--model", model, "--prompt", STT_PROMPT],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );

  worker.proc = proc;
  worker.model = model;
  worker.pending = [];
  worker.buf = "";
  worker.log = "";
  worker.ready = new Promise((resolve, reject) => {
    let warmTimer = setTimeout(() => {
      reject(new Error("worker STT : timeout de chargement"));
    }, 60000);

    proc.stdout.on("data", (chunk) => {
      worker.buf += chunk.toString("utf8");
      let idx;
      while ((idx = worker.buf.indexOf("\n")) >= 0) {
        const line = worker.buf.slice(0, idx).trim();
        worker.buf = worker.buf.slice(idx + 1);
        if (!line) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (parsed.ready) {
          clearTimeout(warmTimer);
          resolve(true);
          continue;
        }
        // réponse à une requête en attente
        const p = worker.pending.shift();
        if (p) {
          if (parsed.error) p.reject(new Error(parsed.error));
          else p.resolve(parsed);
        }
      }
    });

    proc.stderr.on("data", (chunk) => {
      worker.log = (worker.log + chunk.toString("utf8")).slice(-4000);
    });

    proc.on("error", (err) => {
      clearTimeout(warmTimer);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(warmTimer);
      // Rejette tout ce qui est en attente, forcera un respawn au prochain appel
      for (const p of worker.pending) {
        p.reject(new Error(`worker STT arrêté (code ${code})`));
      }
      worker.pending = [];
      if (worker.proc === proc) {
        worker.proc = null;
        worker.ready = null;
      }
    });
  });

  return worker.ready;
}

async function ensureWorker() {
  if (worker.proc && worker.ready) return worker.ready;
  return spawnWorker(LOCAL_MODEL);
}

function warmWorker() {
  ensureWorker().catch(() => {
    /* silencieux : sera relancé à la demande */
  });
}

// Nettoyage à l'arrêt du serveur (évite les workers orphelins)
function shutdownWorker() {
  if (worker.proc) {
    try {
      worker.proc.kill();
    } catch {
      /* ignore */
    }
    worker.proc = null;
  }
}
process.on("exit", shutdownWorker);
process.on("SIGINT", shutdownWorker);
process.on("SIGTERM", shutdownWorker);

async function transcribeLocal(file, lang) {
  await ensureWorker();
  return new Promise((resolve, reject) => {
    worker.pending.push({ resolve, reject });
    worker.proc.stdin.write(
      JSON.stringify({ file, lang: lang ? String(lang).slice(0, 2) : null }) + "\n",
    );
  });
}

function checkLocal() {
  // Présence du venv = moteur local potentiellement dispo ; on lance le warm
  let available = true;
  try {
    available = existsSync(pythonPath());
  } catch {
    available = false;
  }
  if (available) warmWorker();
  return { available, model: LOCAL_MODEL, persistent: true };
}

// ─── Cloud (Deepgram) ─────────────────────────────────────────────────────────

async function transcribeCloud(buffer, mimeType, lang) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY absent (.env)");

  const language = String(lang || "fr").slice(0, 2);
  const url =
    "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&language=" +
    encodeURIComponent(language);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": mimeType || "audio/webm" },
    body: buffer,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Deepgram HTTP ${res.status} ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  return { text, language };
}

function extensionFor(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
  if (mime.includes("mpeg")) return ".mp3";
  return ".webm";
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function register(router) {
  router.get("/api/stt/status", async ({ json }) => {
    const local = checkLocal();
    json(200, {
      local,
      worker: worker.proc ? { model: worker.model, ready: Boolean(worker.ready) } : null,
      cloud: { available: Boolean(process.env.DEEPGRAM_API_KEY), provider: "deepgram" },
      browser: true,
    });
  });

  router.post("/api/stt", ({ json, body }) => {
    body(async (b) => {
      const audio = b?.audio;
      if (!audio || typeof audio !== "string") {
        return json(400, { error: "audio (base64) requis" });
      }

      let buffer;
      try {
        buffer = Buffer.from(audio, "base64");
      } catch {
        return json(400, { error: "audio base64 invalide" });
      }
      if (buffer.length === 0) return json(400, { error: "audio vide" });
      if (buffer.length > MAX_BYTES) return json(413, { error: "audio trop volumineux (max 8 Mo)" });

      const provider = b.provider || process.env.STT_PROVIDER || "auto";
      const mimeType = b.mimeType || "audio/webm";
      const lang = b.lang || "fr";

      const tmp = join(
        tmpdir(),
        `clawboard-stt-${Date.now()}-${Math.random().toString(36).slice(2)}${extensionFor(mimeType)}`,
      );
      await writeFile(tmp, buffer);

      const errors = [];
      try {
        if (provider === "local" || provider === "auto") {
          try {
            const t0 = Date.now();
            const result = await transcribeLocal(tmp, lang);
            return json(200, {
              ...result,
              provider: "local",
              latencyMs: Date.now() - t0,
            });
          } catch (err) {
            errors.push(`local: ${err.message}`);
          }
        }

        if (provider === "cloud" || provider === "auto") {
          try {
            const result = await transcribeCloud(buffer, mimeType, lang);
            return json(200, { ...result, provider: "cloud" });
          } catch (err) {
            errors.push(`cloud: ${err.message}`);
          }
        }

        return json(503, { error: "Aucun moteur STT disponible", details: errors });
      } finally {
        unlink(tmp).catch(() => undefined);
      }
    });
  });
}
