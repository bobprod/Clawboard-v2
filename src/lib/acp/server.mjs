// ─── ACP Server — Exposes ClawBoard as an agent to external leaders ──────────
// Accepts incoming ACP connections, receives tasks, executes via built-in tools,
// and returns results. Uses stdin/stdout or TCP socket.

import { EventEmitter } from "events";
import { createServer } from "net";
import { createLogger } from "../logger.mjs";

const log = createLogger("acp:server");

/**
 * ACP Server — makes ClawBoard available as a teammate agent.
 *
 * External leaders can connect and send tasks in ACP JSON format:
 *   { id: 1, type: "task", action: "list_tasks", params: {} }
 *
 * ClawBoard responds:
 *   { id: 1, type: "result", data: [...] }
 */
export class AcpServer extends EventEmitter {
  /** @type {import("net").Server|null} */
  _tcpServer = null;
  /** @type {import("net").Socket[]} */
  _clients = [];
  /** @type {Map<string, Function>} */
  _tools = new Map();
  _running = false;
  _port = 0;

  /**
   * @param {Object} options
   * @param {number} [options.port=0] TCP port (0 = stdin/stdout mode)
   * @param {Object} [options.pool] PostgreSQL pool
   * @param {Object} [options.ctx] Route context for tool execution
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 0;
    this.pool = options.pool;
    this.ctx = options.ctx;
    this._registerBuiltinTools();
  }

  /**
   * Register a tool that this agent can execute.
   * @param {string} name
   * @param {(params: Object) => Promise<Object>} handler
   */
  registerTool(name, handler) {
    this._tools.set(name, handler);
  }

  /**
   * Start the ACP server.
   */
  async start() {
    if (this._running) return;
    this._running = true;

    if (this.port > 0) {
      await this._startTcp();
    } else {
      this._startStdio();
    }

    log.info("ACP Server started", { mode: this.port > 0 ? "tcp" : "stdio", port: this.port });
    this.emit("started");
  }

  /**
   * Stop the server.
   */
  stop() {
    this._running = false;
    for (const client of this._clients) {
      try { client.destroy(); } catch {}
    }
    this._clients = [];
    if (this._tcpServer) {
      this._tcpServer.close();
      this._tcpServer = null;
    }
    log.info("ACP Server stopped");
    this.emit("stopped");
  }

  /**
   * Get server status.
   */
  getStatus() {
    return {
      running: this._running,
      mode: this.port > 0 ? "tcp" : "stdio",
      port: this.port,
      clients: this._clients.length,
      tools: [...this._tools.keys()],
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  async _startTcp() {
    this._tcpServer = createServer((socket) => this._handleConnection(socket));
    return new Promise((resolve, reject) => {
      this._tcpServer.listen(this.port, () => {
        this.port = this._tcpServer.address().port;
        resolve();
      });
      this._tcpServer.on("error", reject);
    });
  }

  _startStdio() {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this._processMessage(trimmed, {
          send: (msg) => process.stdout.write(JSON.stringify(msg) + "\n"),
        });
      }
    });
  }

  _handleConnection(socket) {
    this._clients.push(socket);
    log.info("ACP client connected", { remote: socket.remoteAddress });

    let buf = "";
    const sender = {
      send: (msg) => {
        try { socket.write(JSON.stringify(msg) + "\n"); } catch {}
      },
    };

    // Send handshake
    sender.send({
      type: "handshake",
      agent_id: "clawboard",
      protocol: "acp/1.0",
      version: "1.0.0",
      tools: [...this._tools.keys()],
      timestamp: new Date().toISOString(),
    });

    socket.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this._processMessage(trimmed, sender);
      }
    });

    socket.on("close", () => {
      this._clients = this._clients.filter((c) => c !== socket);
      log.info("ACP client disconnected");
    });

    socket.on("error", (err) => {
      log.error("ACP client error", { error: err.message });
    });
  }

  async _processMessage(raw, sender) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      sender.send({ type: "error", message: "Invalid JSON" });
      return;
    }

    const { id, type, action, params } = msg;

    if (type === "ping") {
      sender.send({ id, type: "pong", timestamp: new Date().toISOString() });
      return;
    }

    if (type === "handshake") {
      sender.send({
        id,
        type: "handshake_ack",
        agent_id: "clawboard",
        protocol: "acp/1.0",
        tools: [...this._tools.keys()],
      });
      return;
    }

    if (type === "task" || type === "tool_call") {
      const toolName = action || msg.tool;
      if (!toolName || !this._tools.has(toolName)) {
        sender.send({
          id,
          type: "error",
          message: `Unknown tool: ${toolName}`,
          available: [...this._tools.keys()],
        });
        return;
      }

      try {
        this.emit("task:received", { id, tool: toolName, params });
        const result = await this._tools.get(toolName)(params || {});
        sender.send({ id, type: "result", data: result });
        this.emit("task:completed", { id, tool: toolName });
      } catch (err) {
        sender.send({ id, type: "error", message: err.message });
        this.emit("task:failed", { id, tool: toolName, error: err.message });
      }
      return;
    }

    sender.send({ id, type: "error", message: `Unknown message type: ${type}` });
  }

  /**
   * Register built-in tools that map to ClawBoard's existing capabilities.
   */
  _registerBuiltinTools() {
    this.registerTool("list_tasks", async () => {
      if (!this.pool) return { error: "Database not available" };
      const { rows } = await this.pool.query("SELECT id, titre, statut, agent, created_at FROM tasks ORDER BY created_at DESC LIMIT 50");
      return { tasks: rows };
    });

    this.registerTool("get_task", async (params) => {
      if (!this.pool) return { error: "Database not available" };
      const { rows } = await this.pool.query("SELECT * FROM tasks WHERE id = $1", [params.id]);
      return rows[0] || { error: "Task not found" };
    });

    this.registerTool("create_task", async (params) => {
      if (!this.pool) return { error: "Database not available" };
      const id = `tsk_${Date.now()}`;
      const now = new Date().toISOString();
      await this.pool.query(
        `INSERT INTO tasks (id, titre, statut, agent, scheduled_at, created_at, updated_at, cout, tokens_in, tokens_out)
         VALUES ($1,$2,'planned',$3,$4,$4,$4,0,0,0)`,
        [id, params.name, params.agent || "acp-agent", params.scheduledAt || now],
      );
      return { created: { id, name: params.name, status: "planned" } };
    });

    this.registerTool("list_skills", async () => {
      if (!this.pool) return { error: "Database not available" };
      const { rows } = await this.pool.query("SELECT id, name, description, category FROM skills ORDER BY created_at ASC");
      return { skills: rows };
    });

    this.registerTool("read_file", async (params) => {
      const { readFileSync, existsSync, statSync } = await import("fs");
      const path = params.path;
      if (!existsSync(path)) return { error: `File not found: ${path}` };
      const stat = statSync(path);
      if (stat.isDirectory()) return { error: "Path is a directory" };
      if (stat.size > 512 * 1024) return { error: "File too large (max 512KB)" };
      return { path, content: readFileSync(path, "utf8") };
    });

    this.registerTool("health", async () => {
      return {
        status: "ok",
        agent: "clawboard",
        version: "1.0.0",
        uptime: process.uptime(),
        tools: [...this._tools.keys()],
      };
    });
  }
}

export default AcpServer;
