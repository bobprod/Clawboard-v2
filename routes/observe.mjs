// ─── Observe Screen ──────────────────────────────────────────────────────────
// Verification visuelle generique : capture de l'ecran + question a un modele vision.
//
// POST /api/computer-use/observe
//   { question: "Le clip est-il sur la piste Bass ?", model?: "gemini-2.5-flash" }
//   -> { ok, raison, details, model, provider, capture }
//
// A utiliser uniquement quand l'utilisateur demande explicitement de verifier
// ou de regarder l'ecran. Ne remplace pas les actions MCP/API.

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile, appendFile, readdir, unlink } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);
const CAPTURE_DIR = join(homedir(), ".clawboard", "captures");
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const PS_CAPTURE = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type -AssemblyName System.Drawing",
  "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
  "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height",
  "$g = [System.Drawing.Graphics]::FromImage($bmp)",
  "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
  "$ms = New-Object System.IO.MemoryStream",
  "$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)",
  "[Convert]::ToBase64String($ms.ToArray())",
].join("; ");

const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

let lastCallAt = 0;

function buildPrompt(question) {
  return (
    "Tu es un verificateur visuel. Regarde la capture d'ecran et reponds a la question. " +
    "Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour : " +
    '{"ok": true|false, "raison": "explication courte en francais", "details": "ce que tu vois de pertinent"}. ' +
    "Si l'information n'est pas visible, mets ok=false et explique. " +
    `Question : ${question}`
  );
}

function parseAnswer(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        ok: Boolean(parsed.ok),
        raison: String(parsed.raison || ""),
        details: String(parsed.details || ""),
      };
    } catch {
      /* fallback */
    }
  }
  return { ok: false, raison: raw.slice(0, 400) || "Reponse vide", details: "" };
}

async function captureScreen() {
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", PS_CAPTURE], {
    timeout: 20000,
    maxBuffer: 30 * 1024 * 1024,
    windowsHide: true,
  });
  const base64 = String(stdout || "").trim();
  if (!base64 || base64.length < 1000) throw new Error("Capture d'ecran vide");
  return base64;
}

async function askGemini(key, model, imageBase64, question) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildPrompt(question) },
            { inline_data: { mime_type: "image/png", data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 400 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`Gemini HTTP ${res.status} ${detail.slice(0, 200)}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(" ") || "";
  return parseAnswer(text);
}

async function cleanupOldCaptures() {
  try {
    const files = await readdir(CAPTURE_DIR);
    const now = Date.now();
    for (const name of files) {
      if (!name.endsWith(".png")) continue;
      const path = join(CAPTURE_DIR, name);
      const { stat } = await import("fs/promises");
      const info = await stat(path);
      if (now - info.mtimeMs > RETENTION_MS) await unlink(path);
    }
  } catch {
    /* dossier absent ou verrouille */
  }
}

export function register(router, ctx) {
  router.post("/api/computer-use/observe", ({ json, body }) => {
    body(async (b) => {
      const question = String(b?.question || "").trim();
      if (!question) return json(400, { error: "question requise" });

      const now = Date.now();
      if (now - lastCallAt < 1500) {
        return json(429, { error: "Trop de requetes : attends 1,5 s entre deux verifications." });
      }
      lastCallAt = now;

      let capturePath = null;
      try {
        const image = await captureScreen();

        await mkdir(CAPTURE_DIR, { recursive: true });
        capturePath = join(
          CAPTURE_DIR,
          `observe-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
        );
        await writeFile(capturePath, Buffer.from(image, "base64"));

        const { rows } = await ctx.pool.query(
          "SELECT encrypted_value FROM api_keys WHERE provider = 'gemini' LIMIT 1",
        );
        let key = rows[0]?.encrypted_value ? ctx.decryptKey(rows[0].encrypted_value) : null;
        if (!key) key = process.env.GEMINI_API_KEY || process.env.OBSERVE_API_KEY || null;
        if (!key) {
          return json(503, {
            error:
              "Aucune cle Gemini utilisable. Soit la cle en base a ete chiffree avec une ancienne KEK, " +
              "soit elle est absente. Ressaisis-la dans Parametres > Cles API, ou definis GEMINI_API_KEY dans .env.",
            capture: capturePath,
          });
        }

        const requested = String(b?.model || process.env.OBSERVE_MODEL || "").trim();
        const candidates = requested
          ? [requested, ...DEFAULT_MODELS.filter((m) => m !== requested)]
          : DEFAULT_MODELS;

        let lastError = null;
        for (const model of candidates) {
          try {
            const result = await askGemini(key, model, image, question);
            await appendFile(
              join(CAPTURE_DIR, "observe-audit.jsonl"),
              JSON.stringify({
                ts: new Date().toISOString(),
                question,
                model,
                ok: result.ok,
                capture: capturePath,
              }) + "\n",
              "utf8",
            );
            void cleanupOldCaptures();
            return json(200, { ...result, model, provider: "gemini", capture: capturePath });
          } catch (err) {
            lastError = err;
            if (err.status === 400 || err.status === 401 || err.status === 403) break;
          }
        }

        return json(502, {
          error: lastError?.message || "Echec du modele vision",
          capture: capturePath,
        });
      } catch (err) {
        return json(500, { error: err.message, capture: capturePath });
      }
    });
  });

  // Etat : l'outil est-il disponible (cle presente) ?
  router.get("/api/computer-use/observe/status", async ({ json }) => {
    try {
      const { rows } = await ctx.pool.query(
        "SELECT encrypted_value FROM api_keys WHERE provider = 'gemini' LIMIT 1",
      );
      const dbKey = rows[0]?.encrypted_value ? ctx.decryptKey(rows[0].encrypted_value) : null;
      const envKey = process.env.GEMINI_API_KEY || process.env.OBSERVE_API_KEY || null;
      json(200, {
        available: Boolean(dbKey || envKey),
        source: dbKey ? "database" : envKey ? "env" : null,
        provider: "gemini",
        defaultModel: process.env.OBSERVE_MODEL || DEFAULT_MODELS[0],
        captureDir: CAPTURE_DIR,
        retentionDays: 7,
      });
    } catch (err) {
      json(500, { error: err.message });
    }
  });
}
