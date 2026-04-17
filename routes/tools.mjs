// ─── Tools Routes (shell, git, traces, pairing, channels, tools config) ─────
import crypto from "crypto";
import { exec, spawn } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync } from "fs";

export function register(router, ctx) {
  const { pool, schemas, sanitizeObject, checkRateLimit, SECRET } = ctx;
  const repoDir = dirname(fileURLToPath(import.meta.url)).replace(
    /[\\/]routes$/,
    "",
  );

  // ── Shell ─────────────────────────────────────────────────────────────────

  router.post("/api/shell", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "shell")) return;
    validatedBody(schemas.shell, async (b) => {
      const cmd = (b.command || "").trim();
      if (!cmd) return json(400, { error: "command required" });
      const ALLOWED_CMDS = [
        /^ls(\s|$)/,
        /^pwd$/,
        /^echo\s/,
        /^cat\s[\w./-]+$/,
        /^node\s-e\s/,
        /^npm\s(list|run|test|start)\b/,
        /^git\s(log|status|branch|diff|show)\b/,
        /^ps\s/,
        /^top\s/,
        /^df\s/,
        /^du\s/,
        /^env$/,
        /^date$/,
        /^curl\s/,
        /^ping\s-c\s\d+\s/,
      ];
      if (!ALLOWED_CMDS.some((re) => re.test(cmd))) {
        return json(403, {
          error: `Commande non autorisée : "${cmd.slice(0, 60)}"`,
          hint: "Seules les commandes de lecture/diagnostic sont permises.",
        });
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(":ok\n\n");
      const child = spawn("bash", ["-c", cmd], {
        cwd: repoDir,
        timeout: 30000,
      });
      child.stdout.on("data", (d) =>
        res.write(`data: ${JSON.stringify({ stdout: d.toString() })}\n\n`),
      );
      child.stderr.on("data", (d) =>
        res.write(`data: ${JSON.stringify({ stderr: d.toString() })}\n\n`),
      );
      child.on("close", (code) => {
        res.write(`data: ${JSON.stringify({ exit: code })}\n\n`);
        res.end();
      });
      req.on("close", () => {
        try {
          child.kill();
        } catch (_) {}
      });
    });
  });

  // ── Git ───────────────────────────────────────────────────────────────────

  router.get("/api/git/branches", ({ json }) => {
    exec(
      `git -C "${repoDir}" branch -a --format="%(refname:short)"`,
      { timeout: 8000 },
      (err, stdout) => {
        if (err)
          return json(200, {
            branches: ["main"],
            current: "main",
            error: err.message,
          });
        const branches = stdout
          .trim()
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean);
        exec(
          `git -C "${repoDir}" rev-parse --abbrev-ref HEAD`,
          { timeout: 3000 },
          (e2, cur) => {
            json(200, { branches, current: (cur || "main").trim() });
          },
        );
      },
    );
  });

  router.get("/api/git/log", ({ url, json }) => {
    const branch = (url.searchParams.get("branch") || "HEAD").replace(
      /[^a-zA-Z0-9/_.-]/g,
      "",
    );
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "30", 10),
      100,
    );
    const fmt =
      '--pretty=format:{"hash":"%H","short":"%h","subject":"%s","author":"%an","email":"%ae","date":"%aI","refs":"%D"}';
    exec(
      `git -C "${repoDir}" log ${branch} ${fmt} -n ${limit}`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err) return json(200, []);
        const lines = stdout.trim().split("\n").filter(Boolean);
        json(
          200,
          lines
            .map((l) => {
              try {
                return JSON.parse(l);
              } catch {
                return null;
              }
            })
            .filter(Boolean),
        );
      },
    );
  });

  router.get(
    /^\/api\/git\/diff\/([a-f0-9]{6,40})$/,
    ({ url, json, params }) => {
      const hash = params[1];
      const filePath = (url.searchParams.get("file") || "").replace(
        /[^a-zA-Z0-9/_. -]/g,
        "",
      );
      const cmd = filePath
        ? `git -C "${repoDir}" diff ${hash}~1 ${hash} -- "${filePath}"`
        : `git -C "${repoDir}" diff ${hash}~1 ${hash} --stat && echo "---FULL_DIFF---" && git -C "${repoDir}" diff ${hash}~1 ${hash}`;
      exec(cmd, { timeout: 15000, maxBuffer: 1024 * 512 }, (err, stdout) => {
        if (err) {
          const rootCmd = filePath
            ? `git -C "${repoDir}" diff --root ${hash} -- "${filePath}"`
            : `git -C "${repoDir}" diff --root ${hash}`;
          exec(
            rootCmd,
            { timeout: 15000, maxBuffer: 1024 * 512 },
            (e2, out2) => {
              json(200, { hash, diff: out2 || "", error: e2?.message || null });
            },
          );
          return;
        }
        json(200, { hash, diff: stdout || "" });
      });
    },
  );

  router.get(/^\/api\/git\/show\/([a-f0-9]{6,40})$/, ({ json, params }) => {
    const hash = params[1];
    exec(
      `git -C "${repoDir}" diff-tree --no-commit-id -r --numstat ${hash}`,
      { timeout: 8000 },
      (err, stdout) => {
        if (err) return json(200, { files: [] });
        const files = stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [add, del, ...rest] = line.split("\t");
            return {
              path: rest.join("\t"),
              additions: parseInt(add) || 0,
              deletions: parseInt(del) || 0,
            };
          });
        json(200, { hash, files });
      },
    );
  });

  // ── Traces (OTel-like) ────────────────────────────────────────────────────

  router.get("/api/traces", ({ url, json }) => {
    const limitT = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10),
      200,
    );
    pool
      .query(
        `
      SELECT ta.id, ta.type, ta.label, ta.message, ta.created_at,
             t.id AS task_id, t.titre AS task_name, t.agent, t.cout, t.tokens_in, t.tokens_out, t.llm_model
      FROM task_activities ta JOIN tasks t ON t.id = ta.task_id
      ORDER BY ta.created_at DESC LIMIT $1
    `,
        [limitT],
      )
      .then(({ rows }) => {
        json(200, {
          spans: rows.map((r) => ({
            traceId: `tr_${r.id}`,
            spanId: r.id,
            operation: r.label || r.type,
            status: r.type === "failed" ? "error" : "ok",
            durationMs: null,
            model: r.llm_model || null,
            agent: r.agent,
            taskId: r.task_id,
            taskName: r.task_name,
            cost: r.cout,
            tokensIn: r.tokens_in,
            tokensOut: r.tokens_out,
            ts: r.created_at,
          })),
          total: rows.length,
        });
      })
      .catch((err) => json(500, { error: err.message }));
  });

  // ── QR Pairing ────────────────────────────────────────────────────────────

  router.get("/api/pairing/qr", ({ url, json }) => {
    if (!SECRET)
      return json(503, {
        error: "CLAWBOARD_SECRET requis pour le pairing sécurisé",
      });
    const canal = url.searchParams.get("canal") || "telegram";
    const dest = url.searchParams.get("destinataire") || "";
    const ttlSec = 300;
    const expiresAt = Date.now() + ttlSec * 1000;
    const payload = JSON.stringify({
      canal,
      dest,
      expiresAt,
      iss: "clawboard",
      iat: Date.now(),
    });
    const payloadB64 = Buffer.from(payload).toString("base64url");
    const sig = crypto
      .createHmac("sha256", SECRET)
      .update(payloadB64)
      .digest("base64url");
    const token = `${payloadB64}.${sig}`;
    let pairingUrl;
    if (canal === "telegram")
      pairingUrl = `https://t.me/nemoclaw_bot?start=${token}`;
    else if (canal === "discord")
      pairingUrl = `https://discord.com/oauth2/authorize?token=${token}`;
    else if (canal === "whatsapp")
      pairingUrl = `https://wa.me/?text=nemoclaw:${token}`;
    else pairingUrl = `${token}`;
    json(200, {
      token,
      pairingUrl,
      canal,
      dest,
      expiresIn: ttlSec,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  });

  // ── Channel test ──────────────────────────────────────────────────────────

  router.post(/^\/api\/channels\/([^/]+)\/test$/, ({ json, body, params }) => {
    body(async (b) => {
      const channelId = params[1];
      const cfg = sanitizeObject(b) || {};
      try {
        if (channelId === "telegram") {
          if (!cfg.token)
            return json(400, { ok: false, error: "token manquant" });
          const r = await fetch(
            `https://api.telegram.org/bot${cfg.token}/getMe`,
            { signal: AbortSignal.timeout(5000) },
          );
          const data = await r.json();
          if (!data.ok)
            return json(200, {
              ok: false,
              error: data.description || "Token invalide",
            });
          json(200, {
            ok: true,
            name: data.result?.first_name,
            username: data.result?.username,
          });
        } else if (channelId === "discord") {
          if (!cfg.webhookUrl)
            return json(400, { ok: false, error: "webhookUrl manquant" });
          const r = await fetch(cfg.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: "✅ Test Clawboard — connexion OK",
            }),
            signal: AbortSignal.timeout(5000),
          });
          json(200, { ok: r.ok, httpStatus: r.status });
        } else if (channelId === "slack") {
          if (!cfg.webhookUrl)
            return json(400, { ok: false, error: "webhookUrl manquant" });
          const r = await fetch(cfg.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "✅ Test Clawboard — connexion OK" }),
            signal: AbortSignal.timeout(5000),
          });
          json(200, { ok: r.ok, httpStatus: r.status });
        } else {
          const targetUrl = cfg.webhookUrl || cfg.serverUrl || cfg.url;
          if (!targetUrl)
            return json(400, { ok: false, error: "URL du canal manquante" });
          const r = await fetch(targetUrl, {
            signal: AbortSignal.timeout(5000),
          });
          json(200, { ok: r.ok || r.status < 500, httpStatus: r.status });
        }
      } catch (e) {
        json(200, { ok: false, error: e.message });
      }
    });
  });

  // ── Tools Config (OpenClaw tool profiles adapted for NemoClaw) ─────────────

  const TOOL_GROUPS = {
    "group:runtime": ["exec_command"],
    "group:fs": ["read_file", "write_file", "list_directory"],
    "group:sessions": [
      "list_tasks",
      "get_task",
      "start_task",
      "patch_task",
      "delete_task",
    ],
    "group:memory": ["search_memory", "save_note"],
    "group:web": ["web_search", "web_fetch"],
    "group:automation": [
      "list_recurrences",
      "create_cron",
      "batch_create_tasks",
    ],
    "group:messaging": ["send_message"],
    "group:modeles": ["list_modeles", "create_modele"],
    "group:nemoclaw": [
      "list_tasks",
      "get_task",
      "create_task",
      "start_task",
      "delete_task",
      "patch_task",
      "list_modeles",
      "create_modele",
      "list_recurrences",
      "create_cron",
      "batch_create_tasks",
      "save_note",
      "list_directory",
      "read_file",
      "write_file",
      "exec_command",
      "web_search",
      "web_fetch",
      "search_memory",
      "send_message",
    ],
  };

  const TOOL_PROFILES = {
    full: [...new Set(Object.values(TOOL_GROUPS).flat())],
    coding: [
      "list_directory",
      "read_file",
      "write_file",
      "exec_command",
      "list_tasks",
      "get_task",
      "search_memory",
      "save_note",
      "web_search",
      "web_fetch",
    ],
    messaging: ["send_message", "list_tasks", "get_task", "search_memory"],
    minimal: ["list_tasks", "get_task"],
  };

  const TOOLS_STORAGE_KEY = "clawboard-tools-config";

  // Default tool configuration
  function getDefaultToolsConfig() {
    return {
      profile: "full",
      allow: [],
      deny: [],
      security: {
        exec: { allowlist: true, timeout: 30, maxBuffer: 256 },
        fs: {
          readOnly: false,
          blockedExtensions: [
            ".exe",
            ".bat",
            ".cmd",
            ".ps1",
            ".sh",
            ".dll",
            ".so",
            ".msi",
          ],
        },
        web: {
          ssrfProtection: true,
          blockedHosts: [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "::1",
            "169.254.169.254",
          ],
        },
        messaging: { requireRecipient: true },
      },
      byProvider: {},
    };
  }

  // GET /api/tools — list all tools with their status
  router.get("/api/tools", ({ json }) => {
    const allTools = [
      // ── group:sessions ─────────────────────────────────────────────────
      {
        name: "list_tasks",
        group: "sessions",
        description: "Lister toutes les tâches",
        category: "builtin",
        security: "safe",
      },
      {
        name: "get_task",
        group: "sessions",
        description: "Détails d'une tâche",
        category: "builtin",
        security: "safe",
      },
      {
        name: "create_task",
        group: "sessions",
        description: "Créer une tâche",
        category: "builtin",
        security: "write",
      },
      {
        name: "start_task",
        group: "sessions",
        description: "Démarrer une tâche",
        category: "builtin",
        security: "write",
      },
      {
        name: "delete_task",
        group: "sessions",
        description: "Supprimer une tâche",
        category: "builtin",
        security: "destructive",
      },
      {
        name: "patch_task",
        group: "sessions",
        description: "Modifier une tâche",
        category: "builtin",
        security: "write",
      },
      {
        name: "batch_create_tasks",
        group: "automation",
        description: "Créer plusieurs tâches",
        category: "builtin",
        security: "write",
      },
      // ── group:modeles ──────────────────────────────────────────────────
      {
        name: "list_modeles",
        group: "modeles",
        description: "Lister les modèles/templates",
        category: "builtin",
        security: "safe",
      },
      {
        name: "create_modele",
        group: "modeles",
        description: "Créer un modèle",
        category: "builtin",
        security: "write",
      },
      // ── group:automation ───────────────────────────────────────────────
      {
        name: "list_recurrences",
        group: "automation",
        description: "Lister les récurrences CRON",
        category: "builtin",
        security: "safe",
      },
      {
        name: "create_cron",
        group: "automation",
        description: "Créer une récurrence CRON",
        category: "builtin",
        security: "write",
      },
      // ── group:memory ───────────────────────────────────────────────────
      {
        name: "save_note",
        group: "memory",
        description: "Sauvegarder une note en mémoire",
        category: "builtin",
        security: "write",
      },
      {
        name: "search_memory",
        group: "memory",
        description: "Chercher dans la mémoire agent",
        category: "builtin",
        security: "safe",
      },
      // ── group:fs ───────────────────────────────────────────────────────
      {
        name: "list_directory",
        group: "fs",
        description: "Lister un dossier (sandbox)",
        category: "builtin",
        security: "safe",
      },
      {
        name: "read_file",
        group: "fs",
        description: "Lire un fichier (sandbox)",
        category: "builtin",
        security: "safe",
      },
      {
        name: "write_file",
        group: "fs",
        description: "Écrire un fichier (sandbox NemoClaw)",
        category: "openclaw",
        security: "write",
      },
      // ── group:runtime ──────────────────────────────────────────────────
      {
        name: "exec_command",
        group: "runtime",
        description: "Exécuter une commande shell (allowlist NemoClaw)",
        category: "openclaw",
        security: "elevated",
      },
      // ── group:web ──────────────────────────────────────────────────────
      {
        name: "web_search",
        group: "web",
        description: "Recherche web via proxy NemoClaw",
        category: "openclaw",
        security: "network",
      },
      {
        name: "web_fetch",
        group: "web",
        description: "Récupérer une page web (SSRF-protected)",
        category: "openclaw",
        security: "network",
      },
      // ── group:messaging ────────────────────────────────────────────────
      {
        name: "send_message",
        group: "messaging",
        description: "Envoyer un message (telegram/discord/slack)",
        category: "openclaw",
        security: "network",
      },
    ];

    // Load config to determine enabled/disabled status
    let config;
    try {
      const settingsPath = repoDir + "/settings.local.json";
      const saved = existsSync(settingsPath)
        ? JSON.parse(readFileSync(settingsPath, "utf8"))
        : {};
      config = saved.toolsConfig || getDefaultToolsConfig();
    } catch {
      config = getDefaultToolsConfig();
    }

    const profileTools = new Set(
      TOOL_PROFILES[config.profile] || TOOL_PROFILES.full,
    );
    const allowSet = new Set(config.allow || []);
    const denySet = new Set(config.deny || []);

    // Expand group references
    for (const item of [...allowSet]) {
      if (TOOL_GROUPS[item]) TOOL_GROUPS[item].forEach((t) => allowSet.add(t));
    }
    for (const item of [...denySet]) {
      if (TOOL_GROUPS[item]) TOOL_GROUPS[item].forEach((t) => denySet.add(t));
    }

    const result = allTools.map((tool) => {
      let enabled = profileTools.has(tool.name);
      if (allowSet.size > 0 && allowSet.has(tool.name)) enabled = true;
      if (denySet.has(tool.name)) enabled = false; // deny always wins
      return { ...tool, enabled };
    });

    json(200, {
      tools: result,
      groups: Object.entries(TOOL_GROUPS).map(([name, tools]) => ({
        name,
        tools,
      })),
      profiles: Object.entries(TOOL_PROFILES).map(([name, tools]) => ({
        name,
        tools,
        active: config.profile === name,
      })),
      config,
    });
  });

  // GET /api/tools/config — get current tool configuration
  router.get("/api/tools/config", ({ json }) => {
    try {
      const settingsPath = repoDir + "/settings.local.json";
      let config = getDefaultToolsConfig();
      try {
        const saved = JSON.parse(readFileSync(settingsPath, "utf8"));
        if (saved.toolsConfig) config = { ...config, ...saved.toolsConfig };
      } catch {
        /* use defaults */
      }
      json(200, config);
    } catch {
      json(200, getDefaultToolsConfig());
    }
  });

  // PUT /api/tools/config — update tool configuration
  router.put("/api/tools/config", ({ req, body, json }) => {
    body(async (b) => {
      try {
        const safeConfig = sanitizeObject(b);
        // Validate profile
        if (safeConfig.profile && !TOOL_PROFILES[safeConfig.profile]) {
          return json(400, {
            error: `Profile invalide. Disponibles: ${Object.keys(TOOL_PROFILES).join(", ")}`,
          });
        }
        // Validate allow/deny are arrays of strings
        if (safeConfig.allow && !Array.isArray(safeConfig.allow)) {
          return json(400, { error: "allow doit être un tableau" });
        }
        if (safeConfig.deny && !Array.isArray(safeConfig.deny)) {
          return json(400, { error: "deny doit être un tableau" });
        }

        const settingsPath = repoDir + "/settings.local.json";
        let settings = {};
        try {
          if (existsSync(settingsPath))
            settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        } catch {
          /* fresh settings */
        }

        const current = settings.toolsConfig || getDefaultToolsConfig();
        const merged = {
          ...current,
          ...safeConfig,
          security: { ...current.security, ...(safeConfig.security || {}) },
        };
        settings.toolsConfig = merged;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        json(200, { ok: true, config: merged });
      } catch (e) {
        json(500, { error: e.message });
      }
    });
  });

  // GET /api/tools/groups — list tool groups (OpenClaw compatible)
  router.get("/api/tools/groups", ({ json }) => {
    json(200, {
      groups: Object.entries(TOOL_GROUPS).map(([name, tools]) => ({
        name,
        tools,
        count: tools.length,
      })),
    });
  });

  // GET /api/tools/security — NemoClaw security posture for tools
  router.get("/api/tools/security", ({ json }) => {
    json(200, {
      layers: [
        {
          name: "network",
          description: "Contrôle les connexions sortantes de l'agent",
          status: "active",
          hotReloadable: true,
          controls: [
            "Deny-by-default egress (proxy NemoClaw)",
            "SSRF protection (IPs privées bloquées)",
            "Timeout sur toutes les requêtes (15s)",
          ],
        },
        {
          name: "filesystem",
          description: "Contrôle les accès lecture/écriture fichiers",
          status: "active",
          hotReloadable: false,
          controls: [
            "Chemins autorisés uniquement (isPathAllowed)",
            "Extensions exécutables bloquées (.exe, .bat, .sh, etc.)",
            "Taille max 512KB par écriture",
          ],
        },
        {
          name: "process",
          description: "Contrôle l'exécution de commandes",
          status: "active",
          hotReloadable: false,
          controls: [
            "Allowlist de commandes (ls, git, npm, node, curl, etc.)",
            "Patterns dangereux bloqués (rm -rf, sudo, pipe to shell)",
            "Timeout 30s par défaut, max 120s",
            "Buffer max 256KB stdout",
          ],
        },
        {
          name: "inference",
          description: "Contrôle le routage des appels LLM",
          status: "active",
          hotReloadable: true,
          controls: [
            "Credentials isolés (env vars, jamais exposés à l'agent)",
            "Timeout 60s sur les appels NVIDIA API",
            "Circuit breaker (2 erreurs consécutives max)",
          ],
        },
      ],
      posture: "locked-down",
      note: "NemoClaw security: deny-by-default sur les 4 couches (network, filesystem, process, inference)",
    });
  });
}
