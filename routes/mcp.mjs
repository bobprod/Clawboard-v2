// ─── MCP Routes (UNIFIED) ───────────────────────────────────────────────────
// Single source of truth for Model Context Protocol server management.
// Uses the official @modelcontextprotocol/sdk client (McpClientManager).
//
// Resilience: every DB operation has an in-memory fallback so the module stays
// fully functional even when the `mcp_servers` table is missing or Postgres is
// unavailable (demo / first-launch). The in-memory store mirrors the DB rows.
//
// Standardized API:
//   GET    /api/mcp/servers              → { servers: [...] }
//   POST   /api/mcp/servers              → { ok, id, status, tools, resources, error }
//   DELETE /api/mcp/servers/:id          → { ok, removed }
//   PATCH  /api/mcp/servers/:id          → { ok, enabled }            (toggle / rename)
//   POST   /api/mcp/servers/:id/test     → { ok, status, tools, resources, error }
//   GET    /api/mcp/servers/:id/tools    → { ok, tools, resources }
//   POST   /api/mcp/servers/:id/tools/call → { ok, result }
//   POST   /api/mcp/servers/:id/call     → { ok, result }            (alias)

import { McpClientManager } from "../src/lib/mcp/client.mjs";
import { createLogger } from "../src/lib/logger.mjs";

const log = createLogger("mcp-routes");

// In-memory mirror of mcp_servers rows (id → row). Used as a graceful fallback
// whenever the database is unreachable or the table doesn't exist yet.
const memStore = new Map();

function rowToServer(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    transport: r.transport || "stdio",
    command: r.command || null,
    args: r.args || [],
    url: r.url || null,
    env: r.env || {},
    headers: r.headers || {},
    status: r.status || "disconnected",
    tools: r.tools_snapshot || r.tools || [],
    resources: r.resources_snapshot || r.resources || [],
    autoSyncCli: r.auto_sync_cli ?? r.autoSyncCli ?? false,
    enabled: r.enabled ?? true,
    error: r.error || null,
    lastSync: r.last_sync || r.lastSync || null,
    createdAt: r.created_at || r.createdAt || null,
    updatedAt: r.updated_at || r.updatedAt || null,
  };
}

export function register(router, ctx) {
  const { pool } = ctx;
  const manager = new McpClientManager();

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function dbAvailable() {
    if (!pool) return false;
    try {
      await pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  // Persist a full server record to DB (best-effort) AND to the memory mirror.
  async function upsertServer(rec) {
    memStore.set(rec.id, { ...memStore.get(rec.id), ...rec });
    try {
      await pool.query(
        `INSERT INTO mcp_servers (id, name, description, transport, command, args, url, env, headers, status, tools_snapshot, auto_sync_cli, enabled, error, last_sync, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW(),NOW())
         ON CONFLICT (id) DO UPDATE SET
           name=$2, description=$3, transport=$4, command=$5, args=$6, url=$7,
           env=$8, headers=$9, status=$10, tools_snapshot=$11, auto_sync_cli=$12,
           enabled=$13, error=$14, last_sync=NOW(), updated_at=NOW()`,
        [
          rec.id,
          rec.name,
          rec.description || "",
          rec.transport,
          rec.command || null,
          JSON.stringify(rec.args || []),
          rec.url || null,
          JSON.stringify(rec.env || {}),
          JSON.stringify(rec.headers || {}),
          rec.status || "disconnected",
          JSON.stringify(rec.tools || []),
          rec.autoSyncCli || false,
          rec.enabled ?? true,
          rec.error || null,
        ],
      );
    } catch (dbErr) {
      log.warn("DB upsert failed — using in-memory store", {
        id: rec.id,
        error: dbErr.message,
      });
    }
  }

  async function loadServer(id) {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM mcp_servers WHERE id = $1",
        [id],
      );
      if (rows[0]) {
        const s = rowToServer(rows[0]);
        memStore.set(id, s);
        return s;
      }
    } catch {
      /* fall through to memory */
    }
    return memStore.get(id) || null;
  }

  // ── List all configured MCP servers ─────────────────────────────────────

  router.get("/api/mcp/servers", async ({ json }) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM mcp_servers ORDER BY created_at DESC",
      );
      const servers = rows.map((r) => {
        const s = rowToServer(r);
        // Reflect live connection status when we have an active client
        const live = manager.get(s.id);
        if (live) {
          s.status = live.status;
          if (live.tools?.length) s.tools = live.tools;
          if (live.resources?.length) s.resources = live.resources;
        }
        memStore.set(s.id, s);
        return s;
      });
      json(200, { servers });
    } catch (err) {
      // Graceful fallback: serve from in-memory mirror
      log.warn("list servers DB failed — serving memory mirror", {
        error: err.message,
      });
      const servers = [...memStore.values()].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      );
      json(200, { servers });
    }
  });

  // ── Add / register a new MCP server ─────────────────────────────────────

  router.post("/api/mcp/servers", async ({ json, body }) => {
    body(async (b) => {
      const {
        id,
        name,
        description = "",
        transport = "stdio",
        command,
        args = [],
        url,
        env = {},
        headers = {},
        autoSyncCli = false,
      } = b;

      const serverId =
        id ||
        `mcp_${(name || "server")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")}_${Date.now()}`;
      const serverName = name || serverId;

      if (!["stdio", "sse", "streamable-http"].includes(transport)) {
        return json(400, { error: `Invalid transport: ${transport}` });
      }
      if (transport === "stdio" && !command) {
        return json(400, { error: "stdio transport requires 'command'" });
      }
      if (["sse", "streamable-http"].includes(transport) && !url) {
        return json(400, { error: `${transport} transport requires 'url'` });
      }

      let status = "disconnected";
      let toolsSnapshot = [];
      let resourcesSnapshot = [];
      let error = null;

      try {
        const conn = await manager.connect({
          id: serverId,
          transport,
          command,
          args,
          url,
          env,
          headers,
        });
        status = "connected";
        toolsSnapshot = conn.tools || [];
        resourcesSnapshot = conn.resources || [];
      } catch (err) {
        status = "error";
        error = err.message;
        log.warn("MCP connect failed during registration", {
          id: serverId,
          error: err.message,
        });
      }

      const rec = {
        id: serverId,
        name: serverName,
        description,
        transport,
        command: command || null,
        args: Array.isArray(args) ? args : [],
        url: url || null,
        env: env || {},
        headers: headers || {},
        status,
        tools: toolsSnapshot,
        resources: resourcesSnapshot,
        autoSyncCli,
        enabled: true,
        error,
        lastSync: new Date().toISOString(),
        createdAt: memStore.get(serverId)?.createdAt || new Date().toISOString(),
      };
      await upsertServer(rec);

      json(200, {
        ok: status !== "error" || !error,
        id: serverId,
        status,
        tools: toolsSnapshot,
        resources: resourcesSnapshot,
        error,
      });
    });
  });

  // ── Update (toggle enabled / rename) ─────────────────────────────────────

  router.patch(
    /^\/api\/mcp\/servers\/([a-zA-Z0-9_-]+)$/,
    async ({ json, body, params }) => {
      const id = params[1];
      body(async (b) => {
        const existing = await loadServer(id);
        if (!existing) return json(404, { error: "Server not found" });

        const next = { ...existing };
        if (typeof b.enabled === "boolean") next.enabled = b.enabled;
        if (typeof b.name === "string" && b.name.trim()) next.name = b.name.trim();
        if (typeof b.description === "string") next.description = b.description;

        // Disabling a server also stops its live connection
        if (b.enabled === false) {
          await manager.disconnect(id).catch(() => {});
          next.status = "disconnected";
        }

        await upsertServer(next);
        json(200, { ok: true, enabled: next.enabled, server: next });
      });
    },
  );

  // ── Delete / remove MCP server ──────────────────────────────────────────

  router.delete(
    /^\/api\/mcp\/servers\/([a-zA-Z0-9_-]+)$/,
    async ({ json, params }) => {
      const id = params[1];
      await manager.disconnect(id).catch(() => {});
      memStore.delete(id);
      try {
        await pool.query("DELETE FROM mcp_servers WHERE id = $1", [id]);
      } catch (err) {
        log.warn("DB delete failed — removed from memory only", {
          id,
          error: err.message,
        });
      }
      json(200, { ok: true, removed: id });
    },
  );

  // ── Test connection ─────────────────────────────────────────────────────

  router.post(
    /^\/api\/mcp\/servers\/([a-zA-Z0-9_-]+)\/test$/,
    async ({ json, params }) => {
      const id = params[1];
      const server = await loadServer(id);
      if (!server) return json(404, { error: "Server not found" });

      try {
        await manager.disconnect(id).catch(() => {});
        const conn = await manager.connect({
          id,
          transport: server.transport,
          command: server.command,
          args: server.args || [],
          url: server.url,
          env: server.env || {},
          headers: server.headers || {},
        });
        const alive = await conn.ping();

        const next = {
          ...server,
          status: "connected",
          tools: conn.tools || [],
          resources: conn.resources || [],
          error: null,
          lastSync: new Date().toISOString(),
        };
        await upsertServer(next);

        json(200, {
          ok: true,
          status: "connected",
          ping: alive,
          tools: conn.tools || [],
          resources: conn.resources || [],
        });
      } catch (err) {
        const next = { ...server, status: "error", error: err.message };
        await upsertServer(next);
        json(200, { ok: false, status: "error", error: err.message });
      }
    },
  );

  // ── List tools from a server ────────────────────────────────────────────

  router.get(
    /^\/api\/mcp\/servers\/([a-zA-Z0-9_-]+)\/tools$/,
    async ({ json, params }) => {
      const id = params[1];
      const conn = manager.get(id);

      if (conn && conn.status === "connected") {
        try {
          const tools = await conn.listTools();
          await conn.listResources().catch(() => {});
          const server = await loadServer(id);
          if (server) {
            await upsertServer({
              ...server,
              tools,
              resources: conn.resources || [],
              lastSync: new Date().toISOString(),
            });
          }
          return json(200, { ok: true, tools, resources: conn.resources || [] });
        } catch (err) {
          return json(500, { error: err.message });
        }
      }

      // Fallback to stored snapshot
      const server = await loadServer(id);
      json(200, {
        ok: true,
        tools: server?.tools || [],
        resources: server?.resources || [],
        cached: true,
      });
    },
  );

  // ── Call a tool on a server (two aliases) ───────────────────────────────

  const callHandler = async ({ json, body, params }) => {
    const id = params[1];
    body(async (b) => {
      const { tool, arguments: toolArgs } = b;
      if (!tool || typeof tool !== "string") {
        return json(400, { error: "Missing tool name" });
      }

      let conn = manager.get(id);
      if (!conn || conn.status !== "connected") {
        const server = await loadServer(id);
        if (!server) return json(404, { error: "Server not found" });
        try {
          conn = await manager.connect({
            id,
            transport: server.transport,
            command: server.command,
            args: server.args || [],
            url: server.url,
            env: server.env || {},
            headers: server.headers || {},
          });
        } catch (err) {
          return json(502, { error: `Reconnect failed: ${err.message}` });
        }
      }

      try {
        const result = await conn.callTool(tool, toolArgs || {});
        json(200, { ok: true, result });
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  };

  router.post(
    /^\/api\/mcp\/servers\/([a-zA-Z0-9_-]+)\/tools\/call$/,
    callHandler,
  );
  router.post(/^\/api\/mcp\/servers\/([a-zA-Z0-9_-]+)\/call$/, callHandler);

  log.info("MCP routes registered (unified)");
}

export default register;
