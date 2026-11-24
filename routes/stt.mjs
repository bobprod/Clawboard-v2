// ─── STT Routes ──────────────────────────────────────────────────────────────
// Transcription audio : moteur local (faster-whisper CPU) ou cloud (Deepgram).
//
// GET  /api/stt/status  -> disponibilite des moteurs
// POST /api/stt         -> { audio: base64, mimeType, provider, lang } -> { text }

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MAX_BYTES = 8 * 1024 * 1024;
const LOCAL_MODEL = process.env.STT_LOCAL_MODEL || "base";
const STT_PROMPT =
  process.env.STT_PROMPT ||
  "Commandes: liste les taches, cree une tache, ouvre les taches, ou en est le projet. " +
    "Projets: BobProd, BobEvent, BobCam, Ambiancia, Glow Logic, ClawBoard, Soundwave, toolsforge, Immo Saas.";

let statusCache = { ts: 0, value: null };
const STATUS_TTL = 20000;

function pythonPath() {
  return process.platform === "win32"
    ? join(ROOT, ".venv-stt", "Scripts", "python.exe")
    : join(ROOT, ".venv-stt", "bin", "python");
}

async function checkLocal() {
  const now = Date.now();
  if (statusCache.value && now - statusCache.ts < STATUS_TTL) return statusCache.value;

  const python = pythonPath();
  let value;
  try {
    await execFileAsync(python, ["-c", "import faster_whisper"], { timeout: 20000, windowsHide: true });
    value = { available: true, model: LOCAL_MODEL };
  } catch (err) {
    value = { available: false, model: LOCAL_MODEL, error: "faster-whisper non installe (.venv-stt absent)" };
  }
  statusCache = { ts: now, value };
  return value;
}

function parseLastJson(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("{")) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* continue */
      }
    }
  }
  throw new Error("sortie STT invalide");
}

async function transcribeLocal(file, lang) {
  const python = pythonPath();
  const script = join(ROOT, "scripts", "stt_local.py");
  const args = [script, file, "--model", LOCAL_MODEL];
  if (lang) args.push("--lang", String(lang).slice(0, 2));
  if (STT_PROMPT) args.push("--prompt", STT_PROMPT);

  const { stdout } = await execFileAsync(python, args, {
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const parsed = parseLastJson(stdout);
  if (parsed.error) throw new Error(parsed.error);
  return { text: parsed.text || "", language: parsed.language || null };
}

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

export function register(router) {
  router.get("/api/stt/status", async ({ json }) => {
    const local = await checkLocal();
    json(200, {
      local,
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
            const result = await transcribeLocal(tmp, lang);
            return json(200, { ...result, provider: "local" });
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
