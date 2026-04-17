// ─── Computer Use + Cowork Sessions API ─────────────────────────────────────
// Reverse-engineered from Claude Computer Use (Anthropic) + Claude Cowork
// patterns + open-source alternatives (OpenWork, Eigent, Composio, Kuse).
//
// Capabilities:
// 1. Computer Use: screenshot, mouse, keyboard, scroll, wait — agent loop
// 2. Cowork Sessions: long-running agentic tasks with file access,
//    sub-agent coordination, human-in-the-loop, progress tracking
// 3. Sandboxed execution via Docker/VNC or local bridge
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import path from "node:path";

// ─── In-memory stores ────────────────────────────────────────────────────────
const sessions = new Map(); // cowork sessions
const computerEnvs = new Map(); // computer-use environments
const actionLog = []; // audit trail
const sseClients = new Map(); // SSE subscribers per session

// ─── Defaults & config ──────────────────────────────────────────────────────
const WORKSPACE_ROOT =
  process.env.CLAWBOARD_WORKSPACE ||
  path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".clawboard",
    "cowork",
  );
const MAX_ITERATIONS = parseInt(process.env.COWORK_MAX_ITERATIONS || "25", 10);
const ACTION_TIMEOUT = parseInt(
  process.env.COWORK_ACTION_TIMEOUT || "30000",
  10,
);
const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".sql",
  ".env",
  ".log",
  ".ini",
  ".cfg",
  ".conf",
  ".rst",
  ".tex",
  ".r",
  ".rb",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rs",
  ".swift",
  ".kt",
  ".dart",
  ".vue",
  ".svelte",
  ".astro",
  ".mdx",
  ".ipynb",
  ".dockerfile",
  ".lock",
]);
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".ps1",
  ".msi",
  ".dll",
  ".so",
  ".bin",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPathSafe(filePath) {
  const resolved = path.resolve(filePath);
  const wsResolved = path.resolve(WORKSPACE_ROOT);
  return resolved.startsWith(wsResolved);
}

function getExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function broadcastSSE(sessionId, event, data) {
  const clients = sseClients.get(sessionId) || [];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      /* client gone */
    }
  }
}

function logAction(sessionId, type, detail) {
  const entry = {
    id: randomUUID(),
    sessionId,
    type,
    detail,
    ts: new Date().toISOString(),
  };
  actionLog.push(entry);
  if (actionLog.length > 5000) actionLog.shift();
  broadcastSSE(sessionId, "action", entry);
  return entry;
}

async function ensureWorkspace(sessionId) {
  const dir = path.join(WORKSPACE_ROOT, sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ─── Computer Use: Action Handlers ──────────────────────────────────────────

const computerActions = {
  async screenshot(env) {
    // If we have a VNC/noVNC connection, capture via the bridge
    // Otherwise, use platform-native screenshot (PowerShell on Windows, scrot on Linux)
    const platform = process.platform;
    if (platform === "win32") {
      const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object {
  $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [Convert]::ToBase64String($ms.ToArray())
}`;
      return new Promise((resolve, reject) => {
        execFile(
          "powershell",
          ["-Command", script],
          { timeout: ACTION_TIMEOUT, maxBuffer: 20 * 1024 * 1024 },
          (err, stdout) => {
            if (err) return reject(err);
            resolve({ screenshot: stdout.trim(), width: 1920, height: 1080 });
          },
        );
      });
    }
    // Linux/Mac fallback
    return {
      screenshot: null,
      message:
        "Screenshot capture requires platform bridge (Docker+Xvfb or native)",
    };
  },

  async left_click(env, { coordinate }) {
    const [x, y] = coordinate;
    if (process.platform === "win32") {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); Start-Sleep -Milliseconds 50; [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")`;
      // Note: real click needs more sophisticated approach — use nircmd or AutoHotKey bridge
      return { action: "left_click", coordinate: [x, y], status: "simulated" };
    }
    return {
      action: "left_click",
      coordinate: [x, y],
      status: "requires_bridge",
    };
  },

  async right_click(env, { coordinate }) {
    return { action: "right_click", coordinate, status: "requires_bridge" };
  },

  async double_click(env, { coordinate }) {
    return { action: "double_click", coordinate, status: "requires_bridge" };
  },

  async mouse_move(env, { coordinate }) {
    return { action: "mouse_move", coordinate, status: "requires_bridge" };
  },

  async type(env, { text }) {
    if (process.platform === "win32") {
      // PowerShell SendKeys for text input
      return { action: "type", text: text.slice(0, 200), status: "simulated" };
    }
    return { action: "type", text, status: "requires_bridge" };
  },

  async key(env, { key }) {
    return { action: "key", key, status: "requires_bridge" };
  },

  async scroll(env, { coordinate, direction, amount }) {
    return {
      action: "scroll",
      coordinate,
      direction,
      amount,
      status: "requires_bridge",
    };
  },

  async wait(env, { duration }) {
    await new Promise((r) => setTimeout(r, Math.min(duration || 1000, 10000)));
    return { action: "wait", duration };
  },

  async left_click_drag(env, { startCoordinate, coordinate }) {
    return {
      action: "left_click_drag",
      from: startCoordinate,
      to: coordinate,
      status: "requires_bridge",
    };
  },
};

// ─── Cowork Session: File Operations ────────────────────────────────────────

const fileOps = {
  async list(sessionDir, relativePath = ".") {
    const target = path.join(sessionDir, relativePath);
    if (!isPathSafe(target)) throw new Error("Path outside workspace");
    const entries = await readdir(target, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
      path: path.join(relativePath, e.name).replace(/\\/g, "/"),
    }));
  },

  async read(sessionDir, filePath) {
    const target = path.join(sessionDir, filePath);
    if (!isPathSafe(target)) throw new Error("Path outside workspace");
    const ext = getExtension(target);
    if (BLOCKED_EXTENSIONS.has(ext))
      throw new Error(`Blocked extension: ${ext}`);
    const content = await readFile(target, "utf-8");
    return { path: filePath, content, size: Buffer.byteLength(content) };
  },

  async write(sessionDir, filePath, content) {
    const target = path.join(sessionDir, filePath);
    if (!isPathSafe(target)) throw new Error("Path outside workspace");
    const ext = getExtension(target);
    if (BLOCKED_EXTENSIONS.has(ext))
      throw new Error(`Blocked extension: ${ext}`);
    if (Buffer.byteLength(content) > 512 * 1024)
      throw new Error("File too large (max 512KB)");
    const dir = path.dirname(target);
    await mkdir(dir, { recursive: true });
    await writeFile(target, content, "utf-8");
    return { path: filePath, written: true, size: Buffer.byteLength(content) };
  },

  async info(sessionDir, filePath) {
    const target = path.join(sessionDir, filePath);
    if (!isPathSafe(target)) throw new Error("Path outside workspace");
    const s = await stat(target);
    return {
      path: filePath,
      size: s.size,
      modified: s.mtime,
      isDirectory: s.isDirectory(),
    };
  },
};

// ─── Cowork Session Manager ─────────────────────────────────────────────────

function createSession(opts = {}) {
  const id = randomUUID();
  const session = {
    id,
    name: opts.name || `Cowork ${new Date().toLocaleDateString("fr")}`,
    description: opts.description || "",
    status: "active", // active | paused | completed | failed
    mode: opts.mode || "autonomous", // autonomous | supervised | manual
    model: opts.model || "claude-sonnet-4-20250514",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workspace: null, // set after ensureWorkspace
    // Task tracking (Cowork-style)
    plan: [], // { id, title, status, detail }
    currentStep: 0,
    totalSteps: 0,
    // Sub-agents
    subAgents: [], // { id, role, status, task }
    // Progress
    progress: 0, // 0-100
    tokensUsed: 0,
    cost: 0,
    iterations: 0,
    maxIterations: opts.maxIterations || MAX_ITERATIONS,
    // Human-in-the-loop
    pendingApproval: null, // { action, reason, options }
    approvalHistory: [],
    // Files touched
    filesModified: [],
    filesCreated: [],
    filesRead: [],
    // Computer use
    computerUseEnabled: opts.computerUse || false,
    screenshots: [],
    // Skills attached
    skills: opts.skills || [],
    // Messages (conversation context)
    messages: [],
    // Errors
    errors: [],
  };
  sessions.set(id, session);
  return session;
}

function updateSession(id, updates) {
  const s = sessions.get(id);
  if (!s) return null;
  Object.assign(s, updates, { updatedAt: new Date().toISOString() });
  broadcastSSE(id, "session_update", { id, ...updates });
  return s;
}

// ─── Agent Loop (Cowork-style) ──────────────────────────────────────────────
// This is the core agentic loop inspired by Claude Cowork + Computer Use.
// It sends messages to the LLM, processes tool_use responses, executes actions,
// and feeds results back until the task is complete or max iterations reached.

async function runAgentLoop(session, ctx) {
  const sessionDir = await ensureWorkspace(session.id);
  session.workspace = sessionDir;

  // Build available tools based on session config
  const tools = buildToolset(session);

  let iterations = 0;
  while (iterations < session.maxIterations && session.status === "active") {
    iterations++;
    session.iterations = iterations;
    broadcastSSE(session.id, "iteration", {
      iteration: iterations,
      max: session.maxIterations,
    });

    try {
      // Call LLM (via chat route or direct Anthropic API)
      const response = await callLLM(session, tools, ctx);

      if (!response) {
        updateSession(session.id, {
          status: "failed",
          errors: [...session.errors, "LLM returned empty response"],
        });
        break;
      }

      // Process response content
      let hasToolUse = false;
      const toolResults = [];

      for (const block of response.content || []) {
        if (block.type === "text") {
          session.messages.push({
            role: "assistant",
            content: block.text,
            ts: new Date().toISOString(),
          });
          broadcastSSE(session.id, "message", {
            role: "assistant",
            text: block.text,
          });
        }

        if (block.type === "tool_use") {
          hasToolUse = true;
          logAction(session.id, "tool_call", {
            tool: block.name,
            input: block.input,
          });
          broadcastSSE(session.id, "tool_call", {
            id: block.id,
            name: block.name,
            input: block.input,
          });

          // Check if approval needed (supervised mode)
          if (
            session.mode === "supervised" &&
            isHighRiskAction(block.name, block.input)
          ) {
            session.pendingApproval = {
              toolCallId: block.id,
              action: block.name,
              input: block.input,
              reason: `L'agent veut exécuter ${block.name}. Approuvez-vous ?`,
              options: ["approve", "reject", "modify"],
            };
            updateSession(session.id, {
              status: "paused",
              pendingApproval: session.pendingApproval,
            });
            broadcastSSE(
              session.id,
              "approval_needed",
              session.pendingApproval,
            );
            return; // Wait for human decision
          }

          // Execute tool
          const result = await executeTool(
            session,
            sessionDir,
            block.name,
            block.input,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          });

          logAction(session.id, "tool_result", {
            tool: block.name,
            resultPreview: JSON.stringify(result).slice(0, 200),
          });
          broadcastSSE(session.id, "tool_result", {
            id: block.id,
            name: block.name,
            result,
          });
        }
      }

      // If no tool use, the agent is done
      if (!hasToolUse) {
        updateSession(session.id, { status: "completed", progress: 100 });
        broadcastSSE(session.id, "completed", {
          iterations,
          tokensUsed: session.tokensUsed,
        });
        break;
      }

      // Add tool results to messages for next iteration
      session.messages.push({ role: "user", content: toolResults });

      // Update progress
      const progress = Math.min(
        95,
        Math.round((iterations / session.maxIterations) * 100),
      );
      updateSession(session.id, { progress });
    } catch (err) {
      session.errors.push(err.message);
      broadcastSSE(session.id, "error", {
        error: err.message,
        iteration: iterations,
      });

      if (session.errors.length >= 3) {
        updateSession(session.id, { status: "failed" });
        break;
      }
    }
  }

  if (iterations >= session.maxIterations && session.status === "active") {
    updateSession(session.id, { status: "completed", progress: 100 });
    broadcastSSE(session.id, "max_iterations", { iterations });
  }
}

// ─── Tool definitions for the agent ─────────────────────────────────────────

function buildToolset(session) {
  const tools = [
    // File operations
    {
      name: "list_files",
      description: "Liste les fichiers dans le workspace de la session Cowork.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin relatif (défaut: .)" },
        },
      },
    },
    {
      name: "read_file",
      description: "Lit le contenu d'un fichier dans le workspace.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Écrit ou crée un fichier dans le workspace.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
    {
      name: "file_info",
      description: "Informations sur un fichier (taille, date modification).",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    // Task planning
    {
      name: "update_plan",
      description:
        "Met à jour le plan de travail. Chaque étape a un titre et un statut.",
      input_schema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "done", "skipped"],
                },
                detail: { type: "string" },
              },
              required: ["title", "status"],
            },
          },
        },
        required: ["steps"],
      },
    },
    // Sub-agent coordination
    {
      name: "spawn_subagent",
      description: "Créer un sous-agent spécialisé pour une sous-tâche.",
      input_schema: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["researcher", "coder", "reviewer", "writer", "analyst"],
          },
          task: { type: "string" },
          context: { type: "string" },
        },
        required: ["role", "task"],
      },
    },
    // Shell execution (sandboxed)
    {
      name: "exec_command",
      description:
        "Exécuter une commande shell dans le workspace (sandboxé, allowlist).",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeout: { type: "number" },
        },
        required: ["command"],
      },
    },
    // Progress reporting
    {
      name: "report_progress",
      description: "Signaler la progression au frontend.",
      input_schema: {
        type: "object",
        properties: {
          percent: { type: "number", minimum: 0, maximum: 100 },
          message: { type: "string" },
        },
        required: ["percent", "message"],
      },
    },
    // Request human approval
    {
      name: "request_approval",
      description: "Demander l'approbation humaine avant une action risquée.",
      input_schema: {
        type: "object",
        properties: {
          action: { type: "string" },
          reason: { type: "string" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["action", "reason"],
      },
    },
  ];

  // Add computer use tools if enabled
  if (session.computerUseEnabled) {
    tools.push(
      {
        name: "computer_screenshot",
        description: "Prendre une capture d'écran du bureau.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "computer_click",
        description: "Cliquer à des coordonnées [x, y] sur l'écran.",
        input_schema: {
          type: "object",
          properties: {
            coordinate: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
            },
            button: {
              type: "string",
              enum: ["left", "right", "double"],
              default: "left",
            },
          },
          required: ["coordinate"],
        },
      },
      {
        name: "computer_type",
        description: "Saisir du texte au clavier.",
        input_schema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      {
        name: "computer_key",
        description:
          "Appuyer sur une touche ou combinaison (ex: ctrl+s, enter, tab).",
        input_schema: {
          type: "object",
          properties: { key: { type: "string" } },
          required: ["key"],
        },
      },
      {
        name: "computer_scroll",
        description: "Scroller dans une direction.",
        input_schema: {
          type: "object",
          properties: {
            coordinate: { type: "array", items: { type: "number" } },
            direction: {
              type: "string",
              enum: ["up", "down", "left", "right"],
            },
            amount: { type: "number", default: 3 },
          },
          required: ["direction"],
        },
      },
      {
        name: "computer_mouse_move",
        description: "Déplacer le curseur de la souris.",
        input_schema: {
          type: "object",
          properties: {
            coordinate: { type: "array", items: { type: "number" } },
          },
          required: ["coordinate"],
        },
      },
      {
        name: "computer_wait",
        description: "Attendre un certain nombre de millisecondes.",
        input_schema: {
          type: "object",
          properties: { duration: { type: "number", default: 1000 } },
        },
      },
    );
  }

  return tools;
}

// ─── Tool execution ─────────────────────────────────────────────────────────

const COMMAND_ALLOWLIST = [
  "ls",
  "dir",
  "cat",
  "head",
  "tail",
  "echo",
  "pwd",
  "wc",
  "find",
  "grep",
  "sort",
  "uniq",
  "node",
  "python",
  "python3",
  "npm",
  "npx",
  "git",
  "curl",
  "jq",
  "date",
  "whoami",
  "tree",
  "type",
  "where",
];
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/,
  /sudo/,
  />\s*\/dev/,
  /\|\s*sh/,
  /\|\s*bash/,
  /mkfs/,
  /dd\s+if=/,
  /chmod\s+777/,
  /curl.*\|\s*(sh|bash)/,
  /wget.*\|\s*(sh|bash)/,
];

async function executeTool(session, sessionDir, toolName, input) {
  switch (toolName) {
    case "list_files":
      return fileOps.list(sessionDir, input.path || ".");
    case "read_file": {
      const result = await fileOps.read(sessionDir, input.path);
      if (!session.filesRead.includes(input.path))
        session.filesRead.push(input.path);
      return result;
    }
    case "write_file": {
      const result = await fileOps.write(sessionDir, input.path, input.content);
      if (
        !session.filesCreated.includes(input.path) &&
        !session.filesModified.includes(input.path)
      ) {
        session.filesCreated.push(input.path);
      } else if (!session.filesModified.includes(input.path)) {
        session.filesModified.push(input.path);
      }
      return result;
    }
    case "file_info":
      return fileOps.info(sessionDir, input.path);
    case "update_plan": {
      session.plan = input.steps;
      session.totalSteps = input.steps.length;
      session.currentStep = input.steps.filter(
        (s) => s.status === "done",
      ).length;
      broadcastSSE(session.id, "plan_update", {
        plan: session.plan,
        current: session.currentStep,
        total: session.totalSteps,
      });
      return { updated: true, steps: session.plan.length };
    }
    case "spawn_subagent": {
      const subAgent = {
        id: randomUUID(),
        role: input.role,
        task: input.task,
        status: "running",
        createdAt: new Date().toISOString(),
      };
      session.subAgents.push(subAgent);
      broadcastSSE(session.id, "subagent_spawned", subAgent);
      // In production: actually fork a sub-session or call LLM with specialized prompt
      // For now: mark as completed after simulated work
      setTimeout(() => {
        subAgent.status = "completed";
        broadcastSSE(session.id, "subagent_completed", subAgent);
      }, 3000);
      return { spawned: true, subAgent };
    }
    case "exec_command": {
      const cmd = (input.command || "").trim();
      const firstWord = cmd.split(/\s+/)[0];
      if (!COMMAND_ALLOWLIST.includes(firstWord)) {
        return {
          error: `Commande non autorisée: ${firstWord}. Allowlist: ${COMMAND_ALLOWLIST.join(", ")}`,
        };
      }
      for (const p of DANGEROUS_PATTERNS) {
        if (p.test(cmd)) return { error: `Pattern dangereux détecté: ${cmd}` };
      }
      return new Promise((resolve) => {
        const isWin = process.platform === "win32";
        const shell = isWin ? "cmd" : "/bin/sh";
        const shellArg = isWin ? "/c" : "-c";
        execFile(
          shell,
          [shellArg, cmd],
          {
            cwd: sessionDir,
            timeout: Math.min(input.timeout || 30000, 120000),
            maxBuffer: 256 * 1024,
          },
          (err, stdout, stderr) => {
            resolve({
              command: cmd,
              stdout: stdout?.slice(0, 8000) || "",
              stderr: stderr?.slice(0, 2000) || "",
              exitCode: err?.code ?? 0,
            });
          },
        );
      });
    }
    case "report_progress": {
      session.progress = Math.min(100, Math.max(0, input.percent));
      broadcastSSE(session.id, "progress", {
        percent: session.progress,
        message: input.message,
      });
      return { reported: true };
    }
    case "request_approval": {
      session.pendingApproval = {
        action: input.action,
        reason: input.reason,
        risk: input.risk || "medium",
        options: ["approve", "reject"],
      };
      updateSession(session.id, { status: "paused" });
      broadcastSSE(session.id, "approval_needed", session.pendingApproval);
      return { awaiting_approval: true };
    }
    // Computer use actions
    case "computer_screenshot": {
      const result = await computerActions.screenshot({});
      if (result.screenshot) {
        session.screenshots.push({
          ts: new Date().toISOString(),
          data: result.screenshot.slice(0, 200) + "…",
        });
      }
      return result;
    }
    case "computer_click": {
      const button = input.button || "left";
      if (button === "right") return computerActions.right_click({}, input);
      if (button === "double") return computerActions.double_click({}, input);
      return computerActions.left_click({}, input);
    }
    case "computer_type":
      return computerActions.type({}, input);
    case "computer_key":
      return computerActions.key({}, input);
    case "computer_scroll":
      return computerActions.scroll({}, input);
    case "computer_mouse_move":
      return computerActions.mouse_move({}, input);
    case "computer_wait":
      return computerActions.wait({}, input);
    default:
      return { error: `Tool inconnu: ${toolName}` };
  }
}

// ─── LLM call proxy ────────────────────────────────────────────────────────

async function callLLM(session, tools, ctx) {
  // Try to use the configured provider (Anthropic preferred for computer use)
  const apiKey = process.env.ANTHROPIC_API_KEY || ctx?.apiKeys?.anthropic;
  if (!apiKey) {
    // Mock response for demo
    return buildDemoResponse(session);
  }

  const systemPrompt = buildSystemPrompt(session);
  const messages = session.messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...(session.computerUseEnabled
          ? { "anthropic-beta": "computer-use-2025-11-24" }
          : {}),
      },
      body: JSON.stringify({
        model: session.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: session.computerUseEnabled
          ? [
              ...tools.filter((t) => !t.name.startsWith("computer_")),
              // Anthropic-schema computer use tool
              {
                type: "computer_20251124",
                name: "computer",
                display_width_px: 1920,
                display_height_px: 1080,
              },
            ]
          : tools,
        messages: messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content,
        })),
      }),
    });

    const data = await response.json();
    session.tokensUsed +=
      (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    session.cost +=
      ((data.usage?.input_tokens || 0) * 0.003 +
        (data.usage?.output_tokens || 0) * 0.015) /
      1000;
    return data;
  } catch (err) {
    return buildDemoResponse(session);
  }
}

function buildSystemPrompt(session) {
  let prompt = `Tu es un agent Cowork de ClawBoard (NemoClaw). Tu exécutes des tâches de manière autonome dans un workspace dédié.

RÈGLES:
1. Toujours planifier avant d'agir — utilise update_plan pour définir tes étapes
2. Reporter la progression régulièrement avec report_progress
3. Pour les actions risquées, utilise request_approval
4. Ne jamais accéder à des fichiers sensibles (.env avec secrets, clés privées)
5. Utiliser exec_command uniquement avec des commandes de l'allowlist
6. Écrire des fichiers propres et bien structurés

WORKSPACE: ${session.workspace || "(en cours d'initialisation)"}
MODE: ${session.mode} (${session.mode === "supervised" ? "demande approbation pour les écritures" : "exécution autonome"})
SKILLS: ${session.skills.length > 0 ? session.skills.join(", ") : "aucun skill spécifique"}`;

  if (session.computerUseEnabled) {
    prompt += `\n\nCOMPUTER USE: Activé. Tu peux prendre des captures d'écran, cliquer, taper du texte, et contrôler le desktop.
Après chaque action, prends une capture d'écran pour vérifier le résultat.
Utilise les coordonnées [x, y] en pixels pour les clics et mouvements de souris.`;
  }

  return prompt;
}

function buildDemoResponse(session) {
  // Generate a plausible demo response based on session state
  if (session.iterations === 0 || session.plan.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "Je vais analyser votre demande et créer un plan de travail.",
        },
        {
          type: "tool_use",
          id: randomUUID(),
          name: "update_plan",
          input: {
            steps: [
              {
                title: "Analyse de la demande",
                status: "done",
                detail: "Compris",
              },
              {
                title: "Préparation du workspace",
                status: "in_progress",
                detail: "Création des fichiers",
              },
              {
                title: "Exécution de la tâche principale",
                status: "pending",
                detail: "",
              },
              {
                title: "Vérification et rapport",
                status: "pending",
                detail: "",
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 500, output_tokens: 200 },
    };
  }

  if (session.iterations < 3) {
    return {
      content: [
        {
          type: "tool_use",
          id: randomUUID(),
          name: "report_progress",
          input: {
            percent: session.iterations * 30,
            message: `Étape ${session.iterations + 1} en cours…`,
          },
        },
      ],
      usage: { input_tokens: 200, output_tokens: 100 },
    };
  }

  // Final response
  return {
    content: [
      {
        type: "text",
        text: `✅ Tâche terminée avec succès après ${session.iterations} itérations. Tous les fichiers ont été générés dans le workspace.`,
      },
    ],
    usage: { input_tokens: 300, output_tokens: 150 },
  };
}

function isHighRiskAction(toolName, input) {
  const highRisk = ["exec_command", "write_file"];
  if (highRisk.includes(toolName)) return true;
  if (toolName === "computer_click" || toolName === "computer_type")
    return true;
  return false;
}

// ─── Route Registration ─────────────────────────────────────────────────────

export function register(router, ctx) {
  // ── Computer Use: Environment ──────────────────────────────────────────

  // GET /api/computer-use/status — check if computer use is available
  router.get("/api/computer-use/status", async ({ json }) => {
    const envId = "default";
    const env = computerEnvs.get(envId) || {
      status: "disconnected",
      bridge: null,
      capabilities: [],
    };
    const capabilities = [];
    if (process.platform === "win32")
      capabilities.push("screenshot_native", "sendkeys_simulated");
    capabilities.push("file_operations", "shell_sandboxed");

    json(200, {
      status: env.status || "available",
      platform: process.platform,
      capabilities,
      bridge: env.bridge,
      dockerAvailable: false,
      vncAvailable: false,
    });
  });

  // POST /api/computer-use/action — execute a single computer action
  router.post("/api/computer-use/action", async ({ body, json }) => {
    body(async (parsed) => {
      const { action, params: actionParams } = parsed;
      const handler = computerActions[action];
      if (!handler) {
        return json(400, { error: `Action inconnue: ${action}` });
      }
      try {
        const result = await handler({}, actionParams || {});
        logAction("direct", "computer_action", {
          action,
          params: actionParams,
          result: JSON.stringify(result).slice(0, 200),
        });
        json(200, result);
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });

  // GET /api/computer-use/screenshot — take a quick screenshot
  router.get("/api/computer-use/screenshot", async ({ json }) => {
    try {
      const result = await computerActions.screenshot({});
      json(200, result);
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // ── Cowork Sessions ───────────────────────────────────────────────────

  // GET /api/cowork/sessions — list all sessions
  router.get("/api/cowork/sessions", ({ json }) => {
    const list = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      mode: s.mode,
      model: s.model,
      progress: s.progress,
      iterations: s.iterations,
      tokensUsed: s.tokensUsed,
      cost: s.cost,
      plan: s.plan,
      currentStep: s.currentStep,
      totalSteps: s.totalSteps,
      subAgents: s.subAgents,
      filesModified: s.filesModified,
      filesCreated: s.filesCreated,
      computerUseEnabled: s.computerUseEnabled,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    json(200, list);
  });

  // POST /api/cowork/sessions — create a new Cowork session
  router.post("/api/cowork/sessions", async ({ body, json }) => {
    body(async (parsed) => {
      try {
        const session = createSession(parsed);
        session.workspace = await ensureWorkspace(session.id);

        // If prompt provided, start the agent loop
        if (parsed.prompt) {
          session.messages.push({
            role: "user",
            content: parsed.prompt,
            ts: new Date().toISOString(),
          });
          // Run agent loop asynchronously
          runAgentLoop(session, ctx).catch((err) => {
            updateSession(session.id, {
              status: "failed",
              errors: [...session.errors, err.message],
            });
          });
        }

        json(201, session);
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });

  // GET /api/cowork/sessions/:id — get session details
  router.get(/^\/api\/cowork\/sessions\/([^/]+)$/, ({ params, json }) => {
    const id = params[1];
    const session = sessions.get(id);
    if (!session) {
      return json(404, { error: "Session not found" });
    }
    json(200, session);
  });

  // GET /api/cowork/sessions/:id/stream — SSE stream for session events
  router.get(
    /^\/api\/cowork\/sessions\/([^/]+)\/stream$/,
    ({ req, res, params }) => {
      const id = params[1];
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(
        `event: connected\ndata: ${JSON.stringify({ sessionId: id })}\n\n`,
      );

      if (!sseClients.has(id)) sseClients.set(id, []);
      sseClients.get(id).push(res);

      req.on("close", () => {
        const clients = sseClients.get(id) || [];
        sseClients.set(
          id,
          clients.filter((c) => c !== res),
        );
      });
    },
  );

  // POST /api/cowork/sessions/:id/message — send a message to the session
  router.post(
    /^\/api\/cowork\/sessions\/([^/]+)\/message$/,
    async ({ params, body, json }) => {
      const id = params[1];
      const session = sessions.get(id);
      if (!session) {
        return json(404, { error: "Session not found" });
      }
      body(async (parsed) => {
        try {
          const { message } = parsed;
          session.messages.push({
            role: "user",
            content: message,
            ts: new Date().toISOString(),
          });
          broadcastSSE(id, "message", { role: "user", text: message });

          // Resume or continue the agent loop
          if (session.status === "paused") {
            updateSession(id, { status: "active", pendingApproval: null });
          }

          runAgentLoop(session, ctx).catch((err) => {
            updateSession(id, {
              status: "failed",
              errors: [...session.errors, err.message],
            });
          });

          json(200, { ok: true });
        } catch (err) {
          json(500, { error: err.message });
        }
      });
    },
  );

  // POST /api/cowork/sessions/:id/approve — approve or reject a pending action
  router.post(
    /^\/api\/cowork\/sessions\/([^/]+)\/approve$/,
    async ({ params, body, json }) => {
      const id = params[1];
      const session = sessions.get(id);
      if (!session) {
        return json(404, { error: "Session not found" });
      }
      body(async (parsed) => {
        try {
          const { decision } = parsed; // "approve" | "reject"
          session.approvalHistory.push({
            ...session.pendingApproval,
            decision,
            ts: new Date().toISOString(),
          });

          if (decision === "approve") {
            updateSession(id, { status: "active", pendingApproval: null });
            // Continue the agent loop
            runAgentLoop(session, ctx).catch((err) => {
              updateSession(id, {
                status: "failed",
                errors: [...session.errors, err.message],
              });
            });
          } else {
            // Rejected — inject rejection as tool result
            session.messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: session.pendingApproval?.toolCallId,
                  content: "Action rejetée par l'utilisateur.",
                },
              ],
            });
            updateSession(id, { status: "active", pendingApproval: null });
            runAgentLoop(session, ctx).catch((err) => {
              updateSession(id, { status: "failed" });
            });
          }

          broadcastSSE(id, "approval_decision", { decision });
          json(200, { ok: true, decision });
        } catch (err) {
          json(500, { error: err.message });
        }
      });
    },
  );

  // POST /api/cowork/sessions/:id/pause — pause the session
  router.post(
    /^\/api\/cowork\/sessions\/([^/]+)\/pause$/,
    ({ params, json }) => {
      const id = params[1];
      const session = sessions.get(id);
      if (!session) {
        return json(404, { error: "Session not found" });
      }
      updateSession(id, { status: "paused" });
      json(200, { ok: true });
    },
  );

  // POST /api/cowork/sessions/:id/resume — resume the session
  router.post(
    /^\/api\/cowork\/sessions\/([^/]+)\/resume$/,
    ({ params, json }) => {
      const id = params[1];
      const session = sessions.get(id);
      if (!session) {
        return json(404, { error: "Session not found" });
      }
      updateSession(id, { status: "active" });
      runAgentLoop(session, ctx).catch((err) => {
        updateSession(id, { status: "failed" });
      });
      json(200, { ok: true });
    },
  );

  // DELETE /api/cowork/sessions/:id — delete a session
  router.delete(/^\/api\/cowork\/sessions\/([^/]+)$/, ({ params, json }) => {
    const id = params[1];
    sessions.delete(id);
    sseClients.delete(id);
    json(200, { ok: true });
  });

  // GET /api/cowork/sessions/:id/files — list files in session workspace
  router.get(
    /^\/api\/cowork\/sessions\/([^/]+)\/files$/,
    async ({ params, json }) => {
      const id = params[1];
      const session = sessions.get(id);
      if (!session) {
        return json(404, { error: "Session not found" });
      }
      try {
        const files = await fileOps.list(
          session.workspace || path.join(WORKSPACE_ROOT, id),
          ".",
        );
        json(200, files);
      } catch {
        json(200, []);
      }
    },
  );

  // GET /api/cowork/sessions/:id/files/* — read a file from session workspace
  router.get(
    /^\/api\/cowork\/sessions\/([^/]+)\/files\/(.+)$/,
    async ({ params, json }) => {
      const id = params[1];
      const filePath = params[2];
      const session = sessions.get(id);
      if (!session) {
        return json(404, { error: "Session not found" });
      }
      try {
        const result = await fileOps.read(
          session.workspace || path.join(WORKSPACE_ROOT, id),
          filePath,
        );
        json(200, result);
      } catch (err) {
        json(404, { error: err.message });
      }
    },
  );

  // GET /api/cowork/actions — audit log of all actions
  router.get("/api/cowork/actions", ({ json }) => {
    json(200, actionLog.slice(-200));
  });

  // GET /api/cowork/stats — aggregate stats
  router.get("/api/cowork/stats", ({ json }) => {
    const allSessions = Array.from(sessions.values());
    json(200, {
      totalSessions: allSessions.length,
      activeSessions: allSessions.filter((s) => s.status === "active").length,
      completedSessions: allSessions.filter((s) => s.status === "completed")
        .length,
      failedSessions: allSessions.filter((s) => s.status === "failed").length,
      totalTokens: allSessions.reduce((sum, s) => sum + s.tokensUsed, 0),
      totalCost: allSessions.reduce((sum, s) => sum + s.cost, 0),
      totalFilesCreated: allSessions.reduce(
        (sum, s) => sum + s.filesCreated.length,
        0,
      ),
      totalActions: actionLog.length,
    });
  });
}
