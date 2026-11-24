// ─── Observe Screen ──────────────────────────────────────────────────────────
// Verification visuelle generique : capture de l'ecran + question a un modele vision.
//
// POST /api/computer-use/observe
//   { question, provider?: "auto"|"opencode"|"gemini", model? }
//   -> { ok, raison, details, model, provider, capture }
//
// Fournisseurs :
//  - opencode (API compatible OpenAI) : https://opencode.ai/inference/openai/v1
//    modeles gratuits avec vision : nemotron-3.5-super-vl-free, mimo-v2.6-flash-free,
//    deepseek-v4.1-flash-free, jev-1.13-free, hy4-flash-free
//  - gemini (API native Google)
//
// A utiliser uniquement quand l'utilisateur demande explicitement de verifier l'ecran.

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile, appendFile, readdir, unlink, stat } from "fs/promises";
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

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const OPENCODE_MODELS = [
  "hy4-flash-free",
  "hungerg-free",
  "gemini-4-argon",
];

const OPENCODE_BASE = process.env.OBSERVE_BASE_URL || "https://opencode.ai/inference/go/v1";

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
  if (!text.trim()) {
    const error = new Error("Reponse vide");
    error.status = 502;
    throw error;
  }
  return parseAnswer(text);
}

async function askOpenCode(key, model, imageBase64, question) {
  const url = `${OPENCODE_BASE.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "x-opencode-session": "clawboard-observe",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(question) },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`OpenCode HTTP ${res.status} ${detail.slice(0, 200)}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content || "");
  if (!text || !text.trim()) {
    const error = new Error("Reponse vide");
    error.status = 502;
    throw error;
  }
  return parseAnswer(text);
}

async function cleanupOldCaptures() {
  try {
    const files = await readdir(CAPTURE_DIR);
    const now = Date.now();
    for (const name of files) {
      if (!name.endsWith(".png")) continue;
      const path = join(CAPTURE_DIR, name);
      const info = await stat(path);
      if (now - info.mtimeMs > RETENTION_MS) await unlink(path);
    }
  } catch {
    /* dossier absent ou verrouille */
  }
}

async function resolveKeys(ctx) {
  let gemini = process.env.GEMINI_API_KEY || null;
  let opencode = process.env.OPENCODE_API_KEY || process.env.OBSERVE_API_KEY || null;

  try {
    const { rows } = await ctx.pool.query(
      "SELECT provider, encrypted_value FROM api_keys WHERE provider IN ('gemini','opencode','opencode-go','opencode-zen')",
    );
    for (const row of rows) {
      const value = ctx.decryptKey(row.encrypted_value);
      if (!value) continue;
      if (row.provider === "gemini" && !gemini) gemini = value;
      else if (!opencode) opencode = value;
    }
  } catch {
    /* base indisponible : on garde les variables d'environnement */
  }

  return { gemini, opencode };
}

async function tryProvider(name, keys, image, question, requestedModel) {
  if (name === "opencode") {
    if (!keys.opencode) throw Object.assign(new Error("Cle OpenCode absente"), { status: 401 });
    const models = requestedModel ? [requestedModel, ...OPENCODE_MODELS] : OPENCODE_MODELS;
    let lastError = null;
    for (const model of [...new Set(models)]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await askOpenCode(keys.opencode, model, image, question);
          return { ...result, provider: "opencode", model };
        } catch (err) {
          lastError = err;
          if (err.status === 401 || err.status === 403) break;
        }
      }
    }
    throw lastError || new Error("Echec OpenCode");
  }

  if (!keys.gemini) throw Object.assign(new Error("Cle Gemini absente"), { status: 401 });
  const models = requestedModel ? [requestedModel, ...GEMINI_MODELS] : GEMINI_MODELS;
  let lastError = null;
  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await askGemini(keys.gemini, model, image, question);
        return { ...result, provider: "gemini", model };
      } catch (err) {
        lastError = err;
        if (err.status === 400 || err.status === 401 || err.status === 403) break;
      }
    }
  }
  throw lastError || new Error("Echec Gemini");
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

        const keys = await resolveKeys(ctx);
        const wanted = String(b?.provider || process.env.OBSERVE_PROVIDER || "auto").toLowerCase();

        const attempts =
          wanted === "opencode"
            ? ["opencode"]
            : wanted === "gemini"
              ? ["gemini"]
              : [keys.opencode ? "opencode" : null, keys.gemini ? "gemini" : null].filter(Boolean);

        if (attempts.length === 0) {
          return json(503, {
            error:
              "Aucun fournisseur vision disponible. Ajoute une cle OpenCode (Go/Zen) ou Gemini " +
              "dans Parametres > Cles API, ou definis OPENCODE_API_KEY / GEMINI_API_KEY dans .env.",
            capture: capturePath,
          });
        }

        const errors = [];
        for (const name of attempts) {
          try {
            const result = await tryProvider(name, keys, image, question, b?.model);
            await appendFile(
              join(CAPTURE_DIR, "observe-audit.jsonl"),
              JSON.stringify({
                ts: new Date().toISOString(),
                question,
                provider: result.provider,
                model: result.model,
                ok: result.ok,
                capture: capturePath,
              }) + "\n",
              "utf8",
            );
            void cleanupOldCaptures();
            return json(200, { ...result, capture: capturePath });
          } catch (err) {
            errors.push(`${name}: ${err.message}`);
          }
        }

        return json(502, { error: "Echec de tous les fournisseurs vision", details: errors, capture: capturePath });
      } catch (err) {
        return json(500, { error: err.message, capture: capturePath });
      }
    });
  });

  router.get("/api/computer-use/observe/status", async ({ json }) => {
    try {
      const keys = await resolveKeys(ctx);
      json(200, {
        available: Boolean(keys.opencode || keys.gemini),
        providers: {
          opencode: { available: Boolean(keys.opencode), baseUrl: OPENCODE_BASE, models: OPENCODE_MODELS },
          gemini: { available: Boolean(keys.gemini), models: GEMINI_MODELS },
        },
        defaultOrder: [keys.opencode ? "opencode" : null, keys.gemini ? "gemini" : null].filter(Boolean),
        captureDir: CAPTURE_DIR,
        retentionDays: 7,
      });
    } catch (err) {
      json(500, { error: err.message });
    }
  });
}
