// ─── Health & System Routes ─────────────────────────────────────────────────
import os from "os";
import { execSync } from "child_process";
import fs from "fs";

export function register(router, ctx) {
  const { json: _json } = ctx; // ctx helpers not used here — per-request json/sse come from helpers

  // Restore saved OLLAMA_MODELS path on startup
  try {
    const settingsPath = decodeURIComponent(
      new URL("../settings.local.json", import.meta.url).pathname.replace(
        /^\/([A-Z]:)/,
        "$1",
      ),
    );
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (settings.ollamaModelsPath) {
      process.env.OLLAMA_MODELS = settings.ollamaModelsPath;
    }
  } catch {
    /* no saved setting */
  }

  // GET /api/ping
  router.get("/api/ping", ({ json }) =>
    json(200, { ok: true, ts: Date.now() }),
  );

  // GET /api/health
  router.get("/api/health", ({ json }) =>
    json(200, {
      status: "ok",
      ts: Date.now(),
      db: "postgres",
      version: "1.0.0",
    }),
  );

  // POST /api/proxy-ping
  router.post("/api/proxy-ping", ({ json, body }) => {
    body(async ({ url, apiKey }) => {
      if (!url) return json(400, { error: "url required" });
      try {
        const headers = {};
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
        const start = Date.now();
        const r = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        json(200, { ok: r.ok, status: r.status, latency: Date.now() - start });
      } catch (e) {
        json(200, { ok: false, status: 0, error: e.message });
      }
    });
  });

  // GET /api/vitals (SSE)
  router.get("/api/vitals", ({ sse, res }) => {
    sse(ctx.sseClients.vitals);
    res.write(`data: ${JSON.stringify(ctx.getVitals())}\n\n`);
  });

  // GET /api/quota (SSE)
  router.get("/api/quota", ({ sse, res }) => {
    sse(ctx.sseClients.quota);
    res.write(
      `data: ${JSON.stringify({ quotas: ctx.state.quotas, totalCost24h: ctx.state.totalCost24h })}\n\n`,
    );
  });

  // GET /api/health/probes
  router.get("/api/health/probes", async ({ json }) => {
    const { state, decryptKey } = ctx;
    const providers = [
      {
        id: "anthropic",
        label: "Anthropic Claude",
        url: "https://api.anthropic.com",
        authHeader: () =>
          state.apiKeys.anthropic
            ? `x-api-key: ${decryptKey(state.apiKeys.anthropic)}`
            : null,
      },
      {
        id: "openai",
        label: "OpenAI",
        url: "https://api.openai.com",
        authHeader: () =>
          state.apiKeys.openai
            ? `Bearer ${decryptKey(state.apiKeys.openai)}`
            : null,
      },
      {
        id: "nvidia",
        label: "NVIDIA NIM",
        url: "https://integrate.api.nvidia.com",
        authHeader: () =>
          state.apiKeys.nvidia
            ? `Bearer ${decryptKey(state.apiKeys.nvidia)}`
            : null,
      },
      {
        id: "nemoclaw",
        label: "NemoClaw (local)",
        url: `http://localhost:${ctx.PORT}/api/ping`,
        authHeader: () => null,
      },
      {
        id: "ollama",
        label: "Ollama (local)",
        url: "http://localhost:11434/api/version",
        authHeader: () => null,
      },
    ];
    const results = await Promise.all(
      providers.map(async (p) => {
        const start = Date.now();
        try {
          const headers = { "Content-Type": "application/json" };
          const auth = p.authHeader();
          if (auth) {
            const [k, v] = auth.split(": ");
            headers[k] = v;
          }
          const r = await fetch(p.url, {
            headers,
            signal: AbortSignal.timeout(4000),
            method: "GET",
          });
          return {
            id: p.id,
            label: p.label,
            status: r.ok || r.status < 500 ? "up" : "degraded",
            latency: Date.now() - start,
            httpStatus: r.status,
          };
        } catch (e) {
          return {
            id: p.id,
            label: p.label,
            status: "down",
            latency: Date.now() - start,
            error: e.message,
          };
        }
      }),
    );
    json(200, results);
  });

  // ── Disk detection ───────────────────────────────────────────────────────────

  router.get("/api/system/disks", async ({ json }) => {
    try {
      const platform = os.platform();
      const disks = [];

      if (platform === "win32") {
        // Use wmic to list drives on Windows
        const raw = execSync(
          "wmic logicaldisk get DeviceID,FreeSpace,Size,VolumeName,DriveType /format:csv",
          { encoding: "utf-8", timeout: 5000 },
        );
        for (const line of raw.split("\n")) {
          const parts = line.trim().split(",");
          // CSV: Node,DeviceID,DriveType,FreeSpace,Size,VolumeName
          if (parts.length < 6 || parts[1] === "DeviceID") continue;
          const deviceId = parts[1];
          const driveType = parseInt(parts[2], 10);
          const freeSpace = parseInt(parts[3], 10) || 0;
          const totalSize = parseInt(parts[4], 10) || 0;
          const volumeName = parts[5] || "";
          // DriveType 3 = Local Disk, 2 = Removable, 4 = Network, 5 = CD-ROM
          if (driveType !== 3 && driveType !== 2) continue;
          if (totalSize === 0) continue;
          disks.push({
            mount: deviceId,
            label: volumeName || deviceId,
            total: totalSize,
            free: freeSpace,
            used: totalSize - freeSpace,
            type: driveType === 2 ? "removable" : "local",
          });
        }
      } else {
        // Linux / macOS — parse df output
        const raw = execSync(
          "df -B1 --output=target,size,avail,fstype 2>/dev/null || df -k",
          {
            encoding: "utf-8",
            timeout: 5000,
          },
        );
        const lines = raw.trim().split("\n").slice(1);
        const seen = new Set();
        for (const line of lines) {
          const cols = line.trim().split(/\s+/);
          if (cols.length < 3) continue;
          const mount = cols[0];
          // Skip pseudo filesystems
          if (
            mount.startsWith("/dev/loop") ||
            mount === "tmpfs" ||
            mount === "devtmpfs"
          )
            continue;
          if (!mount.startsWith("/") && mount !== "none") continue;
          // Skip duplicates and system mounts
          if (seen.has(mount)) continue;
          if (
            [
              "/boot",
              "/boot/efi",
              "/snap",
              "/proc",
              "/sys",
              "/run",
              "/dev",
            ].some((p) => mount.startsWith(p) && mount !== "/")
          )
            continue;
          seen.add(mount);
          const total = parseInt(cols[1], 10) || 0;
          const avail = parseInt(cols[2], 10) || 0;
          if (total < 1e9) continue; // Skip tiny partitions < 1GB
          disks.push({
            mount,
            label: mount === "/" ? "Système" : mount.split("/").pop() || mount,
            total,
            free: avail,
            used: total - avail,
            type: "local",
          });
        }
      }

      // Read current OLLAMA_MODELS path
      const currentPath =
        process.env.OLLAMA_MODELS ||
        (platform === "win32"
          ? `${os.homedir()}\\.ollama\\models`
          : `${os.homedir()}/.ollama/models`);

      json(200, { disks, currentModelsPath: currentPath, platform });
    } catch (e) {
      json(500, { error: e.message, disks: [] });
    }
  });

  // ── Set Ollama models path ──────────────────────────────────────────────────

  router.post("/api/ollama/models-path", ({ json, body }) => {
    body(async (b) => {
      const path = (b.path || "").trim();
      if (!path) return json(400, { error: "path required" });

      // Validate path doesn't contain traversal
      if (path.includes("..")) return json(400, { error: "Invalid path" });

      // Create directory if it doesn't exist
      try {
        fs.mkdirSync(path, { recursive: true });
      } catch (e) {
        return json(500, { error: `Cannot create directory: ${e.message}` });
      }

      // Set environment variable for current process
      process.env.OLLAMA_MODELS = path;

      // Save to settings file for persistence
      const settingsPath = decodeURIComponent(
        new URL("../settings.local.json", import.meta.url).pathname.replace(
          /^\/([A-Z]:)/,
          "$1",
        ),
      );
      try {
        let settings = {};
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        } catch {
          /* new file */
        }
        settings.ollamaModelsPath = path;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      } catch {
        /* non-critical */
      }

      json(200, { ok: true, path });
    });
  });

  // ── Ollama local proxy ──────────────────────────────────────────────────────

  router.get("/api/ollama/status", async ({ json }) => {
    try {
      const r = await fetch("http://localhost:11434/api/version", {
        signal: AbortSignal.timeout(3000),
      });
      const data = await r.json();
      json(200, { running: true, version: data.version });
    } catch {
      json(200, { running: false });
    }
  });

  router.get("/api/ollama/models", async ({ json }) => {
    try {
      const r = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(5000),
      });
      const data = await r.json();
      json(200, data.models || []);
    } catch {
      json(200, []);
    }
  });

  router.post("/api/ollama/pull", ({ json, body, res }) => {
    body(async (b) => {
      const model = (b.model || b.name || "").trim();
      if (!model) return json(400, { error: "model required" });

      try {
        // Use streaming to relay Ollama pull progress as SSE
        const r = await fetch("http://localhost:11434/api/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: model, stream: true }),
          signal: AbortSignal.timeout(600000), // 10 min for large models
        });

        if (!r.ok) {
          const err = await r.text();
          return json(500, { error: err || `Ollama HTTP ${r.status}` });
        }

        // Stream SSE to frontend
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              res.write(`data: ${JSON.stringify(parsed)}\n\n`);
            } catch {
              // Not JSON, skip
            }
          }
        }
        // Process remaining buffer
        if (buf.trim()) {
          try {
            const parsed = JSON.parse(buf.trim());
            res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          } catch {}
        }
        res.write(`data: {"status":"done"}\n\n`);
        res.end();
      } catch (e) {
        // If headers not sent yet, reply JSON
        if (!res.headersSent) {
          json(500, { error: e.message });
        } else {
          res.write(`data: {"status":"error","error":"${e.message}"}\n\n`);
          res.end();
        }
      }
    });
  });

  router.post("/api/ollama/start", ({ json, body }) => {
    body(async (b) => {
      try {
        const r = await fetch("http://localhost:11434/api/version", {
          signal: AbortSignal.timeout(3000),
        });
        if (r.ok)
          return json(200, {
            ok: true,
            message: "Ollama déjà en cours d'exécution.",
          });
      } catch {
        /* not running, start it */
      }
      try {
        const { exec: execFn } = await import("child_process");
        const env = { ...process.env };
        if (process.env.OLLAMA_MODELS)
          env.OLLAMA_MODELS = process.env.OLLAMA_MODELS;
        execFn("ollama serve", { detached: true, stdio: "ignore", env });
        json(200, { ok: true, message: "Ollama démarrage lancé." });
      } catch (e) {
        json(500, { error: e.message });
      }
    });
  });

  // ── DELETE /api/ollama/models/:name — delete a local model ─────────────────

  router.delete(/^\/api\/ollama\/models\/(.+)$/, ({ json, params }) => {
    const name = decodeURIComponent(params[1]);
    (async () => {
      try {
        const r = await fetch("http://localhost:11434/api/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) json(200, { ok: true });
        else json(r.status, { error: `Ollama: ${r.statusText}` });
      } catch (e) {
        json(500, { error: e.message });
      }
    })();
  });

  // ── GET /api/ollama/recommend — smart model recommendation based on task ───

  const MODEL_CAPABILITIES = {
    // Text / Reasoning
    "qwen3.5:4b": {
      cats: ["text", "reasoning"],
      speed: 9,
      quality: 6,
      vram: 3.4,
    },
    "qwen3.5:9b": {
      cats: ["text", "reasoning"],
      speed: 7,
      quality: 8,
      vram: 6.6,
    },
    "llama3.2": { cats: ["text", "reasoning"], speed: 9, quality: 7, vram: 2 },
    mistral: { cats: ["text", "reasoning"], speed: 8, quality: 7, vram: 4 },
    phi4: { cats: ["text", "reasoning"], speed: 6, quality: 8, vram: 9 },
    "deepseek-r1": {
      cats: ["text", "reasoning", "math"],
      speed: 8,
      quality: 8,
      vram: 4,
    },
    // Vision
    "qwen3-vl:8b": { cats: ["vision", "image"], speed: 6, quality: 8, vram: 7 },
    "qwen3.5:latest": {
      cats: ["vision", "text"],
      speed: 7,
      quality: 8,
      vram: 6.6,
    },
    // Code
    "qwen2.5-coder": { cats: ["code", "text"], speed: 8, quality: 8, vram: 4 },
    "deepseek-coder-v2": {
      cats: ["code", "text"],
      speed: 6,
      quality: 9,
      vram: 8,
    },
    // Audio
    "dimavz/whisper-tiny": {
      cats: ["audio", "transcription"],
      speed: 10,
      quality: 5,
      vram: 0.15,
    },
  };

  router.get("/api/ollama/recommend", async ({ json, url }) => {
    const task = (
      url.searchParams?.get("task") ||
      new URL(
        `http://x${url.pathname || ""}?${url.search || ""}`,
      ).searchParams.get("task") ||
      ""
    ).toLowerCase();
    const prefer = (
      url.searchParams?.get("prefer") ||
      new URL(
        `http://x${url.pathname || ""}?${url.search || ""}`,
      ).searchParams.get("prefer") ||
      "quality"
    ).toLowerCase();

    // Get installed models
    let installed = [];
    try {
      const r = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(3000),
      });
      const d = await r.json();
      installed = (d.models || []).map((m) => m.name);
    } catch {
      /* ollama not running */
    }

    // Detect task category
    const taskCats = [];
    if (/code|program|debug|fix|develop|refactor|function|class|api/.test(task))
      taskCats.push("code");
    if (
      /image|photo|picture|visual|screenshot|ocr|vision|voir|regarder/.test(
        task,
      )
    )
      taskCats.push("vision");
    if (/audio|voice|transcri|speech|whisper|écouter/.test(task))
      taskCats.push("audio");
    if (/math|calcul|equation|formul/.test(task)) taskCats.push("math");
    if (taskCats.length === 0) taskCats.push("text");

    // Score models
    const scored = [];
    for (const [name, caps] of Object.entries(MODEL_CAPABILITIES)) {
      const catMatch = taskCats.some((c) => caps.cats.includes(c));
      if (!catMatch) continue;
      const isInstalled = installed.some(
        (m) => m === name || m.startsWith(name.split(":")[0]),
      );
      let score = catMatch ? 50 : 0;
      if (isInstalled) score += 30; // Prefer installed
      score += prefer === "speed" ? caps.speed * 2 : caps.quality * 2;
      scored.push({ name, ...caps, installed: isInstalled, score });
    }
    scored.sort((a, b) => b.score - a.score);

    // Recommend: best installed, best to install, auto-suggestion
    const bestInstalled = scored.find((s) => s.installed) || null;
    const bestToInstall = scored.find((s) => !s.installed) || null;

    json(200, {
      task,
      categories: taskCats,
      installed,
      recommendation: bestInstalled ? `ollama/${bestInstalled.name}` : null,
      suggestInstall:
        !bestInstalled && bestToInstall ? bestToInstall.name : null,
      rankings: scored.slice(0, 5),
    });
  });

  // ── GET /api/models/available — all models from configured providers + local ─

  const CLOUD_MODELS = {
    anthropic: [
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        provider: "anthropic",
      },
      {
        id: "claude-sonnet-4-20250514",
        label: "Claude Sonnet 4",
        provider: "anthropic",
      },
      {
        id: "claude-opus-4-20250514",
        label: "Claude Opus 4",
        provider: "anthropic",
      },
      {
        id: "claude-haiku-3-5-20241022",
        label: "Claude Haiku 3.5",
        provider: "anthropic",
      },
    ],
    openai: [
      { id: "gpt-4.1", label: "GPT-4.1", provider: "openai" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "openai" },
      { id: "o3", label: "o3", provider: "openai" },
      { id: "o4-mini", label: "o4-mini", provider: "openai" },
      { id: "codex-mini-latest", label: "Codex Mini", provider: "openai" },
    ],
    nvidia: [
      {
        id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
        label: "⚡ Nemotron Ultra 253B",
        provider: "nvidia",
      },
      {
        id: "nvidia/llama-3.3-nemotron-super-49b-v1",
        label: "Nemotron Super 49B",
        provider: "nvidia",
      },
      {
        id: "meta/llama-3.1-405b-instruct",
        label: "⚡ Llama 3.1 405B",
        provider: "nvidia",
      },
      {
        id: "deepseek-ai/deepseek-v3.2",
        label: "DeepSeek V3.2 (NIM)",
        provider: "nvidia",
      },
      { id: "qwen/qwq-32b", label: "QwQ 32B", provider: "nvidia" },
      {
        id: "moonshotai/kimi-k2.5",
        label: "Kimi K2.5 (NIM)",
        provider: "nvidia",
      },
      { id: "google/gemma-3-27b-it", label: "Gemma 3 27B", provider: "nvidia" },
    ],
    gemini: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" },
      {
        id: "gemini-2.0-flash-lite",
        label: "Gemini 2.0 Flash Lite",
        provider: "gemini",
      },
    ],
    deepseek: [
      {
        id: "deepseek-chat",
        label: "DeepSeek Chat (V3)",
        provider: "deepseek",
      },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek Reasoner (R1)",
        provider: "deepseek",
      },
      { id: "deepseek-coder", label: "DeepSeek Coder", provider: "deepseek" },
    ],
    minimax: [
      { id: "MiniMax-M2.7", label: "MiniMax M2.7", provider: "minimax" },
      { id: "MiniMax-M2.5", label: "MiniMax M2.5", provider: "minimax" },
      { id: "MiniMax-M1", label: "MiniMax M1", provider: "minimax" },
      { id: "MiniMax-Text-01", label: "MiniMax Text 01", provider: "minimax" },
      { id: "abab6.5s-chat", label: "ABAB 6.5s Chat", provider: "minimax" },
      { id: "abab7-chat-preview", label: "ABAB 7 Chat", provider: "minimax" },
    ],
    moonshot: [
      {
        id: "moonshot-v1-128k",
        label: "Moonshot V1 128K",
        provider: "moonshot",
      },
      { id: "moonshot-v1-32k", label: "Moonshot V1 32K", provider: "moonshot" },
      { id: "moonshot-v1-8k", label: "Moonshot V1 8K", provider: "moonshot" },
      { id: "kimi-latest", label: "Kimi Latest", provider: "moonshot" },
    ],
    zhipu: [
      { id: "glm-4-plus", label: "GLM-4 Plus", provider: "zhipu" },
      { id: "glm-4-long", label: "GLM-4 Long", provider: "zhipu" },
      { id: "glm-4-flash", label: "GLM-4 Flash", provider: "zhipu" },
      { id: "glm-4-flashx", label: "GLM-4 FlashX", provider: "zhipu" },
      { id: "glm-4-air", label: "GLM-4 Air", provider: "zhipu" },
      { id: "glm-z1-air", label: "GLM-Z1 Air (reasoning)", provider: "zhipu" },
    ],
  };

  router.get("/api/models/available", async ({ json }) => {
    const { state, decryptKey } = ctx;
    const models = [];

    // 1. Cloud models from providers with configured API keys
    for (const [provider, modelList] of Object.entries(CLOUD_MODELS)) {
      const hasKey =
        state.apiKeys[provider] && decryptKey(state.apiKeys[provider]);
      if (hasKey) {
        models.push(...modelList);
      }
    }

    // 2. Gemini models — available via .env GOOGLE_API_KEY if no key stored
    if (!state.apiKeys.gemini && process.env.GOOGLE_API_KEY) {
      models.push(...CLOUD_MODELS.gemini);
    }

    // 3. Ollama local models
    try {
      const r = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(3000),
      });
      const data = await r.json();
      if (data.models && data.models.length > 0) {
        for (const m of data.models) {
          const name = m.name || m.model;
          models.push({
            id: `ollama/${name}`,
            label: `${name} (local)`,
            provider: "ollama",
            size: m.size,
          });
        }
      }
    } catch {
      /* ollama not running */
    }

    // 4. Always include NVIDIA free-tier models (no key needed for playground)
    if (!state.apiKeys.nvidia) {
      models.push(
        {
          id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
          label: "⚡ Nemotron Ultra 253B (free)",
          provider: "nvidia-free",
        },
        {
          id: "nvidia/llama-3.3-nemotron-super-49b-v1",
          label: "Nemotron Super 49B (free)",
          provider: "nvidia-free",
        },
      );
    }

    json(200, models);
  });

  // ─── LLM Health Check: test all configured providers ────────────────────────
  router.get("/api/llm/health", async ({ json }) => {
    const { state, decryptKey } = ctx;
    const results = [];

    // Helper: test a provider with a simple completion request
    async function testProvider(name, url, headers, body, timeout = 10000) {
      const start = Date.now();
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        const latency = Date.now() - start;
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return {
            provider: name,
            status: "error",
            latency,
            error: err.error?.message || `HTTP ${resp.status}`,
          };
        }
        const data = await resp.json();
        const content =
          data.choices?.[0]?.message?.content ||
          data.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";
        return {
          provider: name,
          status: "ok",
          latency,
          model: data.model || body.model,
          preview: content.slice(0, 80),
        };
      } catch (e) {
        return {
          provider: name,
          status: "error",
          latency: Date.now() - start,
          error: e.message,
        };
      }
    }

    const testMsg = [
      { role: "system", content: "Reply with exactly: OK" },
      { role: "user", content: "ping" },
    ];
    const promises = [];

    // 1. NVIDIA NIM
    const nvidiaKey =
      (state.apiKeys.nvidia && decryptKey(state.apiKeys.nvidia)) ||
      process.env.NVIDIA_API_KEY;
    if (nvidiaKey) {
      promises.push(
        testProvider(
          "nvidia",
          "https://integrate.api.nvidia.com/v1/chat/completions",
          { Authorization: `Bearer ${nvidiaKey}` },
          {
            model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
            messages: testMsg,
            max_tokens: 10,
            temperature: 0,
            stream: false,
          },
        ),
      );
    } else {
      results.push({ provider: "nvidia", status: "no-key" });
    }

    // 2. Anthropic
    const anthropicKey =
      (state.apiKeys.anthropic && decryptKey(state.apiKeys.anthropic)) ||
      process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      promises.push(
        (async () => {
          const start = Date.now();
          try {
            const resp = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 10,
                messages: [{ role: "user", content: "ping" }],
              }),
              signal: AbortSignal.timeout(10000),
            });
            const latency = Date.now() - start;
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              return {
                provider: "anthropic",
                status: "error",
                latency,
                error: err.error?.message || `HTTP ${resp.status}`,
              };
            }
            const data = await resp.json();
            return {
              provider: "anthropic",
              status: "ok",
              latency,
              model: data.model,
              preview: (data.content?.[0]?.text || "").slice(0, 80),
            };
          } catch (e) {
            return {
              provider: "anthropic",
              status: "error",
              latency: Date.now() - start,
              error: e.message,
            };
          }
        })(),
      );
    } else {
      results.push({ provider: "anthropic", status: "no-key" });
    }

    // 3. Gemini
    const geminiKey =
      (state.apiKeys.gemini && decryptKey(state.apiKeys.gemini)) ||
      process.env.GOOGLE_API_KEY;
    if (geminiKey) {
      promises.push(
        (async () => {
          const start = Date.now();
          try {
            const resp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: "Reply OK" }] }],
                  generationConfig: { maxOutputTokens: 10 },
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            const latency = Date.now() - start;
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              return {
                provider: "gemini",
                status: "error",
                latency,
                error: err.error?.message || `HTTP ${resp.status}`,
              };
            }
            const data = await resp.json();
            return {
              provider: "gemini",
              status: "ok",
              latency,
              model: "gemini-2.0-flash",
              preview: (
                data.candidates?.[0]?.content?.parts?.[0]?.text || ""
              ).slice(0, 80),
            };
          } catch (e) {
            return {
              provider: "gemini",
              status: "error",
              latency: Date.now() - start,
              error: e.message,
            };
          }
        })(),
      );
    } else {
      results.push({ provider: "gemini", status: "no-key" });
    }

    // 4. OpenRouter
    const orKey =
      (state.apiKeys.openrouter && decryptKey(state.apiKeys.openrouter)) ||
      process.env.OPENROUTER_API_KEY;
    if (orKey) {
      promises.push(
        testProvider(
          "openrouter",
          "https://openrouter.ai/api/v1/chat/completions",
          { Authorization: `Bearer ${orKey}` },
          {
            model: "openai/gpt-4o-mini",
            messages: testMsg,
            max_tokens: 10,
            temperature: 0,
          },
        ),
      );
    } else {
      results.push({ provider: "openrouter", status: "no-key" });
    }

    // 5. DeepSeek
    const dsKey = state.apiKeys.deepseek && decryptKey(state.apiKeys.deepseek);
    if (dsKey) {
      promises.push(
        testProvider(
          "deepseek",
          "https://api.deepseek.com/chat/completions",
          { Authorization: `Bearer ${dsKey}` },
          {
            model: "deepseek-chat",
            messages: testMsg,
            max_tokens: 10,
            temperature: 0,
          },
        ),
      );
    } else {
      results.push({ provider: "deepseek", status: "no-key" });
    }

    // 6. MiniMax
    const mmKey = state.apiKeys.minimax && decryptKey(state.apiKeys.minimax);
    if (mmKey) {
      promises.push(
        testProvider(
          "minimax",
          "https://api.minimaxi.chat/v1/text/chatcompletion_v2",
          { Authorization: `Bearer ${mmKey}` },
          {
            model: "MiniMax-Text-01",
            messages: testMsg,
            max_tokens: 10,
            temperature: 0,
          },
        ),
      );
    } else {
      results.push({ provider: "minimax", status: "no-key" });
    }

    // 7. Moonshot/Kimi
    const kimiKey =
      (state.apiKeys.moonshot && decryptKey(state.apiKeys.moonshot)) ||
      (state.apiKeys.kimi && decryptKey(state.apiKeys.kimi));
    if (kimiKey) {
      promises.push(
        testProvider(
          "moonshot",
          "https://api.moonshot.cn/v1/chat/completions",
          { Authorization: `Bearer ${kimiKey}` },
          {
            model: "moonshot-v1-8k",
            messages: testMsg,
            max_tokens: 10,
            temperature: 0,
          },
        ),
      );
    } else {
      results.push({ provider: "moonshot", status: "no-key" });
    }

    // 8. Zhipu
    const zhipuKey = state.apiKeys.zhipu && decryptKey(state.apiKeys.zhipu);
    if (zhipuKey) {
      promises.push(
        testProvider(
          "zhipu",
          "https://open.bigmodel.cn/api/paas/v4/chat/completions",
          { Authorization: `Bearer ${zhipuKey}` },
          {
            model: "glm-4-flash",
            messages: testMsg,
            max_tokens: 10,
            temperature: 0,
          },
        ),
      );
    } else {
      results.push({ provider: "zhipu", status: "no-key" });
    }

    // 9. Ollama (local)
    promises.push(
      (async () => {
        const start = Date.now();
        try {
          const tagResp = await fetch("http://localhost:11434/api/tags", {
            signal: AbortSignal.timeout(3000),
          });
          const latency = Date.now() - start;
          if (!tagResp.ok)
            return {
              provider: "ollama",
              status: "error",
              latency,
              error: `HTTP ${tagResp.status}`,
            };
          const tagData = await tagResp.json();
          const localModels = (tagData.models || []).map(
            (m) => m.name || m.model,
          );
          return {
            provider: "ollama",
            status: localModels.length > 0 ? "ok" : "empty",
            latency,
            models: localModels,
            modelsPath: process.env.OLLAMA_MODELS || "(default)",
          };
        } catch (e) {
          return {
            provider: "ollama",
            status: "offline",
            latency: Date.now() - start,
            error: e.message,
          };
        }
      })(),
    );

    // Run all checks in parallel
    const parallel = await Promise.allSettled(promises);
    for (const p of parallel) {
      results.push(
        p.status === "fulfilled"
          ? p.value
          : { provider: "unknown", status: "error", error: p.reason?.message },
      );
    }

    json(200, { ts: Date.now(), providers: results });
  });
}
