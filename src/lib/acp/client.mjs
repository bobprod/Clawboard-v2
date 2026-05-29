// ─── ACP Client — Spawn & control external CLI agents via Agent Client Protocol ─
// Spawns CLI agent processes (claude, codex, openclaw, opencode, gemini, etc.)
// Communicates via stdin/stdout using JSON messages.
// Supports Leader/Teammate pattern for Team Mode.

import { spawn } from "child_process";
import { EventEmitter } from "events";
import { createLogger } from "../logger.mjs";

const log = createLogger("acp:client");

/** @typedef {"idle"|"busy"|"error"|"disconnected"|"stopped"} AgentStatus */
/** @typedef {"leader"|"teammate"|"standalone"} AgentRole */

/**
 * @typedef {Object} AcpAgentConfig
 * @property {string} id
 * @property {string} name
 * @property {string} command
 * @property {string[]} args
 * @property {AgentRole} role
 * @property {AgentStatus} status
 * @property {Record<string,string>} [env]
 * @property {string} [workdir]
 * @property {boolean} [autoRestart]
 * @property {number} [maxRetries]
 */

export class AcpClient extends EventEmitter {
  /** @type {Map<string, ManagedAgent>} */
  agents = new Map();

  /**
   * Start a managed agent process.
   * @param {AcpAgentConfig} config
   * @returns {ManagedAgent}
   */
  start(config) {
    if (this.agents.has(config.id)) {
      const existing = this.agents.get(config.id);
      if (existing.status !== "stopped" && existing.status !== "error") {
        log.warn(`Agent ${config.id} already running`, { status: existing.status });
        return existing;
      }
      this.stop(config.id);
    }

    const agent = new ManagedAgent(config);
    this.agents.set(config.id, agent);

    agent.on("status", (status) => this.emit("agent:status", { id: config.id, status }));
    agent.on("message", (msg) => this.emit("agent:message", { id: config.id, ...msg }));
    agent.on("error", (err) => this.emit("agent:error", { id: config.id, error: err }));

    agent.spawn();
    return agent;
  }

  /**
   * Stop a running agent.
   * @param {string} agentId
   */
  stop(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.kill();
    this.agents.delete(agentId);
  }

  /**
   * Stop all agents.
   */
  stopAll() {
    for (const [id] of this.agents) this.stop(id);
  }

  /**
   * Send a task to a specific agent.
   * @param {string} agentId
   * @param {Object} task
   * @returns {Promise<Object>}
   */
  async sendTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.status !== "idle" && agent.status !== "busy") {
      throw new Error(`Agent ${agentId} is ${agent.status}, cannot send task`);
    }
    return agent.send({ type: "task", ...task });
  }

  /**
   * Get status of all agents.
   * @returns {Object[]}
   */
  getStatus() {
    const result = [];
    for (const [id, agent] of this.agents) {
      result.push({
        id,
        name: agent.config.name,
        status: agent.status,
        pid: agent.pid,
        role: agent.config.role,
        uptime: agent.startTime ? Date.now() - agent.startTime : 0,
        taskCount: agent.taskCount,
        lastError: agent.lastError,
        cpu: agent.cpu,
        memory: agent.memory,
      });
    }
    return result;
  }

  /**
   * Create a team session (leader delegates to teammates).
   * @param {string} leaderId
   * @param {string[]} teammateIds
   * @returns {TeamSession}
   */
  createTeam(leaderId, teammateIds) {
    const leader = this.agents.get(leaderId);
    if (!leader) throw new Error(`Leader agent ${leaderId} not found`);
    const teammates = teammateIds.map((id) => {
      const a = this.agents.get(id);
      if (!a) throw new Error(`Teammate agent ${id} not found`);
      return a;
    });
    const session = new TeamSession(leader, teammates);
    session.start();
    return session;
  }
}

/**
 * Manages a single CLI agent process.
 */
class ManagedAgent extends EventEmitter {
  /** @type {import("child_process").ChildProcess|null} */
  proc = null;
  /** @type {AgentStatus} */
  status = "stopped";
  pid = null;
  startTime = null;
  taskCount = 0;
  lastError = null;
  cpu = 0;
  memory = 0;
  /** @type {Buffer[]} */
  _stdoutBuf = [];
  /** @type {Buffer[]} */
  _stderrBuf = [];
  /** @type {Map<number, {resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout>}>} */
  _pending = new Map();
  _msgId = 0;
  _retries = 0;
  _jsonBuf = "";

  /** @param {AcpAgentConfig} config */
  constructor(config) {
    super();
    this.config = {
      autoRestart: true,
      maxRetries: 3,
      ...config,
    };
  }

  spawn() {
    const { command, args, env, workdir } = this.config;
    const mergedEnv = { ...process.env, ...env };

    log.info(`Spawning agent: ${command} ${(args || []).join(" ")}`, { id: this.config.id });

    try {
      this.proc = spawn(command, args || [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: mergedEnv,
        cwd: workdir || process.cwd(),
        shell: process.platform === "win32",
      });

      this.pid = this.proc.pid;
      this.startTime = Date.now();
      this._setStatus("idle");

      this.proc.stdout.on("data", (chunk) => this._onStdout(chunk));
      this.proc.stderr.on("data", (chunk) => this._onStderr(chunk));

      this.proc.on("close", (code) => this._onClose(code));
      this.proc.on("error", (err) => this._onError(err));

      // Send handshake
      this._sendRaw({
        id: this._nextId(),
        type: "handshake",
        agent_id: this.config.id,
        protocol: "acp/1.0",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this._onError(err);
    }
  }

  kill() {
    if (this.proc) {
      try {
        this.proc.kill("SIGTERM");
        setTimeout(() => {
          if (this.proc && !this.proc.killed) this.proc.kill("SIGKILL");
        }, 3000);
      } catch {}
    }
    this._setStatus("stopped");
    this._rejectAll("Agent stopped");
  }

  /**
   * Send a JSON message and wait for a response with matching id.
   * @param {Object} msg
   * @param {number} [timeout=60000]
   * @returns {Promise<Object>}
   */
  send(msg, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const id = this._nextId();
      const envelope = { id, ...msg };
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Timeout waiting for response (id=${id})`));
      }, timeout);

      this._pending.set(id, { resolve, reject, timer });
      this._sendRaw(envelope);
      this._setStatus("busy");
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  _nextId() {
    return ++this._msgId;
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit("status", s);
  }

  _sendRaw(obj) {
    if (!this.proc || !this.proc.stdin.writable) return;
    try {
      const line = JSON.stringify(obj) + "\n";
      this.proc.stdin.write(line);
    } catch (err) {
      log.error("Failed to write to agent stdin", { id: this.config.id, error: err.message });
    }
  }

  _onStdout(chunk) {
    this._jsonBuf += chunk.toString();
    const lines = this._jsonBuf.split("\n");
    this._jsonBuf = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this._handleMessage(msg);
      } catch {
        // Non-JSON output — log as agent stdout
        log.debug(`[${this.config.id}] stdout: ${trimmed.slice(0, 200)}`);
      }
    }
  }

  _onStderr(chunk) {
    const text = chunk.toString().trim();
    if (text) log.warn(`[${this.config.id}] stderr: ${text.slice(0, 300)}`);
  }

  _handleMessage(msg) {
    // Check if this is a response to a pending request
    if (msg.id && this._pending.has(msg.id)) {
      const { resolve, timer } = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      clearTimeout(timer);
      this.taskCount++;
      this._setStatus("idle");
      resolve(msg);
      return;
    }

    // Unsolicited message from agent
    if (msg.type === "permission_request") {
      this.emit("message", { type: "permission_request", ...msg });
    } else if (msg.type === "status_update") {
      this._setStatus(msg.status || "idle");
    } else if (msg.type === "error") {
      this.lastError = msg.message || "Unknown error";
      this._setStatus("error");
      this.emit("error", this.lastError);
    } else {
      this.emit("message", msg);
    }
  }

  _onClose(code) {
    log.info(`Agent ${this.config.id} exited`, { code });
    this.proc = null;
    this.pid = null;

    if (this.status !== "stopped") {
      this._setStatus("disconnected");
      this._rejectAll(`Process exited with code ${code}`);

      // Auto-restart if configured
      if (this.config.autoRestart && this._retries < (this.config.maxRetries || 3)) {
        this._retries++;
        log.info(`Auto-restarting agent ${this.config.id} (attempt ${this._retries})`);
        setTimeout(() => this.spawn(), 2000);
      }
    }
  }

  _onError(err) {
    log.error(`Agent ${this.config.id} error`, { error: err.message });
    this.lastError = err.message;
    this._setStatus("error");
    this.emit("error", err.message);
  }

  _rejectAll(reason) {
    for (const [id, { reject, timer }] of this._pending) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    this._pending.clear();
  }
}

/**
 * Team Session — Leader agent delegates tasks to teammate agents.
 */
export class TeamSession extends EventEmitter {
  /** @type {string} */
  id = `team_${Date.now()}`;
  status = "created";
  mailbox = [];
  taskQueue = [];

  /**
   * @param {ManagedAgent} leader
   * @param {ManagedAgent[]} teammates
   */
  constructor(leader, teammates) {
    super();
    this.leader = leader;
    this.teammates = teammates;
  }

  start() {
    this.status = "running";
    log.info("Team session started", {
      id: this.id,
      leader: this.leader.config.id,
      teammates: this.teammates.map((t) => t.config.id),
    });

    // Wire up message forwarding between leader and teammates
    this.leader.on("message", (msg) => this._onLeaderMessage(msg));
    for (const t of this.teammates) {
      t.on("message", (msg) => this._onTeammateMessage(t.config.id, msg));
    }

    this.emit("started", { sessionId: this.id });
  }

  /**
   * Delegate a task from the leader to a specific teammate.
   * @param {string} teammateId
   * @param {Object} task
   * @returns {Promise<Object>}
   */
  async delegateTask(teammateId, task) {
    const teammate = this.teammates.find((t) => t.config.id === teammateId);
    if (!teammate) throw new Error(`Teammate ${teammateId} not in this session`);

    this.mailbox.push({
      from: this.leader.config.id,
      to: teammateId,
      type: "task",
      payload: task,
      ts: new Date().toISOString(),
    });

    const result = await teammate.send({ type: "task", session: this.id, ...task });

    this.mailbox.push({
      from: teammateId,
      to: this.leader.config.id,
      type: "result",
      payload: result,
      ts: new Date().toISOString(),
    });

    this.emit("result", { teammateId, result });
    return result;
  }

  /**
   * Broadcast a task to all teammates in parallel.
   * @param {Object} task
   * @returns {Promise<Object[]>}
   */
  async broadcastTask(task) {
    const promises = this.teammates.map((t) =>
      this.delegateTask(t.config.id, task).catch((err) => ({
        error: err.message,
        teammateId: t.config.id,
      })),
    );
    return Promise.all(promises);
  }

  getMailbox(filter = {}) {
    let msgs = [...this.mailbox];
    if (filter.from) msgs = msgs.filter((m) => m.from === filter.from);
    if (filter.to) msgs = msgs.filter((m) => m.to === filter.to);
    if (filter.type) msgs = msgs.filter((m) => m.type === filter.type);
    return msgs;
  }

  stop() {
    this.status = "completed";
    this.emit("completed", { sessionId: this.id, mailbox: this.mailbox });
  }

  _onLeaderMessage(msg) {
    if (msg.type === "delegate") {
      // Leader wants to delegate to a specific teammate
      const target = msg.target;
      const task = msg.task || msg;
      this.delegateTask(target, task).catch((err) => {
        log.error("Delegate failed", { target, error: err.message });
      });
    } else if (msg.type === "broadcast") {
      this.broadcastTask(msg.task || msg);
    }
  }

  _onTeammateMessage(teammateId, msg) {
    // Forward teammate responses back to leader
    this.mailbox.push({
      from: teammateId,
      to: this.leader.config.id,
      type: msg.type || "message",
      payload: msg,
      ts: new Date().toISOString(),
    });
  }
}

// ─── Extended agent catalogue ─────────────────────────────────────────────────
// Each entry lists:
//   commands  — ordered list of binary names to try (first match wins)
//   versionFlags — ordered list of flags to try; we accept ANY exit code as long
//                  as the process RUNS (ENOENT = not installed, anything else = installed)
//   name      — display name
//   provider  — provider key for colour-coding in the UI
//   category  — "coding" | "workflow" | "local" | "browser"

const AGENT_CATALOGUE = [
  // ── Anthropic ───────────────────────────────────────────────────────────────
  {
    id: "claude",
    commands: ["claude"],
    versionFlags: [["--version"], ["-v"], ["version"]],
    name: "Claude Code",
    provider: "anthropic",
    category: "coding",
    desc: "Anthropic — agent de codage autonome",
    startArgs: [],
  },

  // ── OpenAI ───────────────────────────────────────────────────────────────────
  {
    id: "codex",
    commands: ["codex"],
    versionFlags: [["--version"], ["-v"]],
    name: "Codex CLI",
    provider: "openai",
    category: "coding",
    desc: "OpenAI — agent de codage",
    startArgs: [],
  },

  // ── OpenCode ─────────────────────────────────────────────────────────────────
  // OpenCode peut se lancer via npx si pas installé globalement
  {
    id: "opencode",
    commands: ["opencode", "open-code"],
    versionFlags: [["--version"], ["-v"], ["version"], ["--help"]],
    name: "OpenCode",
    provider: "openrouter",
    category: "coding",
    desc: "OpenCode — agent IA open source",
    startArgs: [],
  },

  // ── Google Gemini CLI ─────────────────────────────────────────────────────────
  {
    id: "gemini",
    commands: ["gemini", "gemini-cli"],
    versionFlags: [["--version"], ["-v"], ["version"]],
    name: "Gemini CLI",
    provider: "google",
    category: "coding",
    desc: "Google — Gemini CLI agent",
    startArgs: [],
  },

  // ── Google AI Dev Kit / AntiGravity ───────────────────────────────────────────
  {
    id: "antigravity",
    commands: ["antigravity", "adk", "google-adk", "aistudio"],
    versionFlags: [["--version"], ["-v"], ["version"], ["--help"]],
    name: "Google AntiGravity",
    provider: "google",
    category: "coding",
    desc: "Google — AntiGravity / AI Dev Kit",
    startArgs: [],
  },

  // ── NVIDIA OpenClaw / NemoClaw ─────────────────────────────────────────────────
  {
    id: "openclaw",
    commands: ["openclaw", "nemoclaw", "nemo", "openclaw.exe"],
    versionFlags: [["--version"], ["-v"], ["version"], ["status"]],
    name: "OpenClaw",
    provider: "nvidia",
    category: "coding",
    desc: "NVIDIA NemoClaw — sandbox sécurisée",
    startArgs: [],
  },

  // ── Hermes Agent ──────────────────────────────────────────────────────────────
  {
    id: "hermes",
    commands: ["hermes", "hermes-agent"],
    versionFlags: [["--version"], ["-v"], ["--help"]],
    name: "Hermes Agent",
    provider: "hermes",
    category: "coding",
    desc: "Hermes — agent IA autonome",
    startArgs: [],
  },

  // ── n8n Workflow Automation ───────────────────────────────────────────────────
  {
    id: "n8n",
    commands: ["n8n"],
    versionFlags: [["--version"], ["-v"]],
    name: "n8n",
    provider: "n8n",
    category: "workflow",
    desc: "n8n — automatisation de workflows",
    startArgs: ["start"],
  },

  // ── Ollama (local LLMs) ────────────────────────────────────────────────────────
  {
    id: "ollama",
    commands: ["ollama"],
    versionFlags: [["--version"], ["-v"]],
    name: "Ollama",
    provider: "ollama",
    category: "local",
    desc: "Ollama — modèles LLM locaux",
    startArgs: ["serve"],
  },

  // ── Continue.dev ─────────────────────────────────────────────────────────────
  {
    id: "continue",
    commands: ["continue"],
    versionFlags: [["--version"], ["-v"]],
    name: "Continue",
    provider: "continue",
    category: "coding",
    desc: "Continue — assistant de codage IDE",
    startArgs: [],
  },

  // ── Aider ─────────────────────────────────────────────────────────────────────
  {
    id: "aider",
    commands: ["aider"],
    versionFlags: [["--version"], ["-v"]],
    name: "Aider",
    provider: "openai",
    category: "coding",
    desc: "Aider — pair-programming IA en CLI",
    startArgs: [],
  },
];

/**
 * Scan system PATH for well-known CLI agents.
 * Strategy: for each candidate, try each command alias with each version-flag
 * variant. Resolve as "detected" as soon as the process RUNS (no ENOENT) —
 * exit code is irrelevant because many tools exit 1 for --version.
 * @returns {Promise<Object[]>}
 */
export async function scanForAgents() {
  const isWin = process.platform === "win32";

  // Inject extra PATH directories where package managers install binaries
  const extraPaths = buildExtraPaths(isWin);
  const envWithPaths = {
    ...process.env,
    PATH: [process.env.PATH || "", ...extraPaths].filter(Boolean).join(isWin ? ";" : ":"),
  };

  const results = await Promise.allSettled(
    AGENT_CATALOGUE.map((c) => probeCandidate(c, isWin, envWithPaths)),
  );

  const found = [];
  for (let i = 0; i < AGENT_CATALOGUE.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.ok) {
      const cat = AGENT_CATALOGUE[i];
      found.push({
        id: cat.id,
        name: cat.name,
        command: r.value.command,
        args: cat.startArgs,
        provider: cat.provider,
        category: cat.category,
        desc: cat.desc,
        detected: true,
        version: r.value.version,
        path: r.value.resolvedPath,
      });
    }
  }

  log.info(`Scan complete: ${found.length}/${AGENT_CATALOGUE.length} agents found`, {
    found: found.map((f) => f.id),
  });

  return found;
}

/**
 * Build a list of extra PATH directories where CLI tools are commonly installed.
 * @param {boolean} isWin
 * @returns {string[]}
 */
function buildExtraPaths(isWin) {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (isWin) {
    const appdata = process.env.APPDATA || "";
    const localAppdata = process.env.LOCALAPPDATA || "";
    return [
      `${appdata}\\npm`,                          // npm global (Windows)
      `${localAppdata}\\npm`,
      `${localAppdata}\\Programs\\Python\\Python312\\Scripts`,
      `${localAppdata}\\Programs\\Python\\Python311\\Scripts`,
      `${home}\\AppData\\Roaming\\npm`,
      `${home}\\.cargo\\bin`,                     // Rust / cargo
      `${home}\\.local\\bin`,
      "C:\\ProgramData\\chocolatey\\bin",         // Chocolatey
      "C:\\tools\\scoop\\shims",                  // Scoop
    ];
  }
  return [
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,                         // Rust
    `${home}/.npm-global/bin`,                    // npm global (Unix)
    "/usr/local/bin",
    "/opt/homebrew/bin",                          // Homebrew (macOS ARM)
    "/usr/local/lib/node_modules/.bin",
    `${home}/.nvm/versions/node/current/bin`,     // nvm
    `${home}/go/bin`,                             // Go
    `${home}/.pyenv/shims`,                       // pyenv
  ];
}

/**
 * Try every command alias + every version-flag variant for one catalogue entry.
 * Resolves { ok: true, command, version, resolvedPath } as soon as one works.
 * "Works" = process spawned without ENOENT (not-found), regardless of exit code.
 * @param {Object} cat  — catalogue entry
 * @param {boolean} isWin
 * @param {Object} env  — augmented PATH environment
 * @returns {Promise<{ok: boolean, command?: string, version?: string, resolvedPath?: string}>}
 */
async function probeCandidate(cat, isWin, env) {
  for (const cmd of cat.commands) {
    for (const flags of cat.versionFlags) {
      const result = await probeOnce(cmd, flags, isWin, env);
      if (result.ok) {
        return { ...result, command: cmd };
      }
    }
  }
  return { ok: false };
}

/**
 * Spawn a single probe.  Resolves ok:true if the process starts (no ENOENT).
 * @param {string}   command
 * @param {string[]} args
 * @param {boolean}  isWin
 * @param {Object}   env
 * @returns {Promise<{ok: boolean, version?: string, resolvedPath?: string}>}
 */
function probeOnce(command, args, isWin, env) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let notFound = false;

    try {
      const probe = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: isWin,   // on Windows, shell:true lets cmd.exe find .cmd/.bat wrappers
        timeout: 6000,
        env,
      });

      probe.stdout.on("data", (d) => (stdout += d.toString()));
      probe.stderr.on("data", (d) => (stderr += d.toString()));

      probe.on("close", () => {
        if (notFound) return resolve({ ok: false });
        // Pick version from stdout, fall back to stderr first line
        const raw = (stdout || stderr).trim();
        const version = raw.split("\n")[0]?.trim() || undefined;
        resolve({ ok: true, version, resolvedPath: command });
      });

      probe.on("error", (err) => {
        // ENOENT = binary not found anywhere on PATH
        if (err.code === "ENOENT" || err.code === "ENOTDIR") {
          notFound = true;
        }
        resolve({ ok: false });
      });
    } catch {
      resolve({ ok: false });
    }
  });
}

export default AcpClient;
