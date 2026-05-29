// ─── MCP Server ─────────────────────────────────────────────────────────────
// Exposes ClawBoard tools externally via the Model Context Protocol.
// Supports SSE transport (HTTP endpoint) and stdio mode (CLI usage).
//
// Usage (SSE — mounted on the main HTTP server):
//   import { createMcpSseHandler, registerMcpTools } from './mcp/server.mjs';
//   const { handler, mcpServer } = createMcpSseHandler();
//   registerMcpTools(mcpServer, { pool, ... });
//   // In HTTP server: if (path === '/mcp/sse') return handler(req, res);
//
// Usage (stdio — CLI):
//   import { startMcpStdio } from './mcp/server.mjs';
//   await startMcpStdio({ pool, ... });

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "./logger.mjs";

const log = createLogger("mcp-server");

// ─── Tool definitions ────────────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: "task_create",
    description: "Create a new task in ClawBoard",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name" },
        modeleId: { type: "string", description: "Template/model ID" },
        agent: { type: "string", description: "Agent to assign" },
        skillName: { type: "string", description: "Skill to use" },
        instructions: { type: "string", description: "Task instructions" },
        scheduledAt: { type: "string", description: "ISO date for scheduling" },
      },
      required: ["name"],
    },
  },
  {
    name: "task_read",
    description: "Read task details by ID, or list all tasks",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID (tsk_xxx). Omit to list all." },
      },
    },
  },
  {
    name: "task_update",
    description: "Update fields on an existing task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
        updates: {
          type: "object",
          description: "Fields to update (name, status, instructions)",
        },
      },
      required: ["taskId", "updates"],
    },
  },
  {
    name: "file_read",
    description: "Read a file from the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path" },
        maxLines: { type: "number", description: "Max lines to return (default 150)" },
      },
      required: ["path"],
    },
  },
  {
    name: "file_write",
    description: "Write or append to a file in the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path" },
        content: { type: "string", description: "Content to write" },
        append: { type: "boolean", description: "Append instead of overwrite" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "shell_exec",
    description: "Execute a shell command (allowlist-protected)",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        workdir: { type: "string", description: "Working directory" },
        timeout: { type: "number", description: "Timeout in seconds (max 120)" },
      },
      required: ["command"],
    },
  },
  {
    name: "memory_search",
    description: "Search agent memory (MEMORY.md, NOTES.md, task activities)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description: "Fetch and extract text content from a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        maxChars: { type: "number", description: "Max characters (default 3000)" },
      },
      required: ["url"],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeMcpTool(name, args, ctx) {
  const { pool } = ctx;

  switch (name) {
    case "task_create": {
      const id = `tsk_${Date.now()}`;
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, instructions, scheduled_at, created_at, updated_at, cout, tokens_in, tokens_out)
         VALUES ($1,$2,$3,'planned',$4,$5,$6,$7,$8,$8,0,0,0)`,
        [
          id,
          args.name,
          args.modeleId || null,
          args.agent || "main",
          args.skillName || null,
          args.instructions || null,
          args.scheduledAt || now,
          now,
        ],
      );
      return { id, name: args.name, status: "planned" };
    }

    case "task_read": {
      if (args.taskId) {
        const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [
          args.taskId,
        ]);
        if (!rows[0]) return { error: `Task ${args.taskId} not found` };
        const r = rows[0];
        return {
          id: r.id,
          name: r.titre,
          status: r.statut,
          agent: r.agent,
          instructions: r.instructions,
          createdAt: r.created_at,
          cost: r.cout,
        };
      }
      const { rows } = await pool.query(
        "SELECT id, titre, statut, agent, created_at, cout FROM tasks ORDER BY created_at DESC LIMIT 50",
      );
      return {
        tasks: rows.map((r) => ({
          id: r.id,
          name: r.titre,
          status: r.statut,
          agent: r.agent,
          createdAt: r.created_at,
          cost: r.cout,
        })),
      };
    }

    case "task_update": {
      const { rows } = await pool.query("SELECT id FROM tasks WHERE id=$1", [
        args.taskId,
      ]);
      if (!rows[0]) return { error: `Task ${args.taskId} not found` };
      const safe = args.updates || {};
      const sets = [];
      const vals = [args.taskId];
      if (safe.name !== undefined) sets.push(`titre=$${vals.push(safe.name)}`);
      if (safe.status !== undefined) sets.push(`statut=$${vals.push(safe.status)}`);
      if (safe.instructions !== undefined)
        sets.push(`instructions=$${vals.push(safe.instructions)}`);
      if (sets.length > 0) {
        await pool.query(
          `UPDATE tasks SET ${sets.join(",")}, updated_at=NOW() WHERE id=$1`,
          vals,
        );
      }
      const { rows: updated } = await pool.query("SELECT * FROM tasks WHERE id=$1", [
        args.taskId,
      ]);
      const r = updated[0];
      return {
        id: r.id,
        name: r.titre,
        status: r.statut,
        updated: true,
      };
    }

    case "file_read": {
      const { readFileSync, existsSync, statSync } = await import("fs");
      const filePath = args.path;
      if (!existsSync(filePath)) return { error: `File not found: ${filePath}` };
      const stat = statSync(filePath);
      if (stat.isDirectory()) return { error: "Path is a directory, not a file" };
      if (stat.size > 500 * 1024) return { error: `File too large (${Math.round(stat.size / 1024)}KB). Max 500KB.` };
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const maxL = args.maxLines || 150;
      const truncated = lines.length > maxL;
      return {
        path: filePath,
        lines: lines.length,
        truncated,
        content:
          lines.slice(0, maxL).join("\n") +
          (truncated ? `\n\n... [${lines.length - maxL} more lines truncated]` : ""),
      };
    }

    case "file_write": {
      const { writeFileSync, existsSync, readFileSync, mkdirSync } = await import("fs");
      const { dirname, extname } = await import("path");
      const filePath = args.path;
      const dangerousExt = [".exe", ".bat", ".cmd", ".ps1", ".sh", ".dll", ".so", ".msi"];
      if (dangerousExt.includes(extname(filePath).toLowerCase())) {
        return { error: `Writing executable files blocked (${extname(filePath)})` };
      }
      const parentDir = dirname(filePath);
      if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
      const content = args.content || "";
      if (content.length > 512 * 1024) return { error: "Content too large (max 512KB)" };
      if (args.append && existsSync(filePath)) {
        const existing = readFileSync(filePath, "utf8");
        writeFileSync(filePath, existing + content, "utf8");
      } else {
        writeFileSync(filePath, content, "utf8");
      }
      return { written: true, path: filePath, bytes: Buffer.byteLength(content, "utf8") };
    }

    case "shell_exec": {
      const { exec } = await import("child_process");
      const cmd = (args.command || "").trim();
      if (!cmd) return { error: "Empty command" };
      const timeoutSec = Math.min(args.timeout || 30, 120);
      return new Promise((resolve) => {
        exec(
          cmd,
          { cwd: args.workdir || process.cwd(), timeout: timeoutSec * 1000, maxBuffer: 256 * 1024 },
          (err, stdout, stderr) => {
            resolve({
              command: cmd,
              exitCode: err ? err.code || 1 : 0,
              stdout: (stdout || "").slice(0, 4000),
              stderr: (stderr || "").slice(0, 1000),
              truncated: (stdout || "").length > 4000,
            });
          },
        );
      });
    }

    case "memory_search": {
      const query = (args.query || "").trim().toLowerCase();
      if (!query) return { error: "Empty query" };
      const results = [];
      const { rows } = await pool
        .query(
          `SELECT id, filename, content, type, updated_at FROM memory ORDER BY updated_at DESC LIMIT 20`,
        )
        .catch(() => ({ rows: [] }));
      for (const row of rows) {
        const content = (row.content || "").toLowerCase();
        if (content.includes(query)) {
          const idx = content.indexOf(query);
          const start = Math.max(0, idx - 100);
          const end = Math.min(content.length, idx + query.length + 100);
          results.push({
            file: row.filename,
            type: row.type,
            match: row.content.slice(start, end).trim(),
            updatedAt: row.updated_at,
          });
        }
      }
      const { rows: activities } = await pool
        .query(
          `SELECT ta.message, ta.label, ta.created_at, t.titre AS task_name
           FROM task_activities ta JOIN tasks t ON t.id = ta.task_id
           WHERE LOWER(ta.message) LIKE $1 OR LOWER(ta.label) LIKE $1
           ORDER BY ta.created_at DESC LIMIT 10`,
          [`%${query}%`],
        )
        .catch(() => ({ rows: [] }));
      for (const act of activities) {
        results.push({
          file: `task:${act.task_name}`,
          type: "activity",
          match: `${act.label}: ${act.message}`,
          updatedAt: act.created_at,
        });
      }
      return { query: args.query, results: results.slice(0, 15), total: results.length };
    }

    case "web_fetch": {
      const url = (args.url || "").trim();
      if (!url) return { error: "URL required" };
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"];
      if (
        blocked.some((h) => hostname === h) ||
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
      ) {
        return { error: "Internal/blocked host (SSRF protection)" };
      }
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return { error: "Only HTTP/HTTPS protocols allowed" };
      }
      const maxC = Math.min(args.maxChars || 3000, 8000);
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "ClawBoard-MCP/1.0" },
      });
      if (!resp.ok) return { error: `HTTP ${resp.status} ${resp.statusText}` };
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml")) {
        return { error: `Unsupported content type: ${contentType}` };
      }
      const text = await resp.text();
      const clean = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return {
        url,
        status: resp.status,
        contentType,
        content: clean.slice(0, maxC),
        truncated: clean.length > maxC,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Server factory ──────────────────────────────────────────────────────────

function createMcpServer() {
  const server = new Server(
    { name: "clawboard", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  return server;
}

function registerToolHandlers(server, ctx) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: MCP_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await executeMcpTool(name, args || {}, ctx);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      log.error("MCP tool execution error", { tool: name, error: err.message });
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }),
          },
        ],
      };
    }
  });
}

// ─── SSE handler (mount on HTTP server) ──────────────────────────────────────

export function createMcpSseHandler(ctx) {
  const server = createMcpServer();
  registerToolHandlers(server, ctx);

  let transport = null;

  const handler = async (req, res) => {
    const url = new URL(req.url, `http://localhost`);

    if (url.pathname === "/mcp/sse" && req.method === "GET") {
      transport = new SSEServerTransport("/mcp/messages", res);
      await server.connect(transport);
      req.on("close", () => {
        transport = null;
      });
      return;
    }

    if (url.pathname === "/mcp/messages" && req.method === "POST") {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active SSE connection" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };

  return { handler, server };
}

// ─── Stdio mode (CLI) ────────────────────────────────────────────────────────

export async function startMcpStdio(ctx) {
  const server = createMcpServer();
  registerToolHandlers(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server running in stdio mode");
}

export default createMcpSseHandler;
