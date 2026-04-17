// ─── MCP Server Routes (Model Context Protocol) ─────────────────────────────
// Manages MCP server lifecycle: register, spawn (stdio), connect (SSE/HTTP),
// list tools/resources, and stop servers.

import { spawn } from "child_process";

// In-memory MCP server processes (pid → child process)
const mcpProcesses = new Map();
// In-memory config store (serverId → config)
const mcpConfigs = new Map();

export function register(router, ctx) {
  const { pool, encryptKey } = ctx;

  // ── List registered MCP servers ─────────────────────────────────────────

  router.get("/api/mcp/servers", async ({ json }) => {
    try {
      const { rows } = await pool.query(
        "SELECT connector_id, enabled, status, config, last_sync, error FROM connectors WHERE config->>'mcpTransport' IS NOT NULL ORDER BY updated_at DESC",
      );
      const result = {};
      for (const r of rows) {
        result[r.connector_id] = {
          id: r.connector_id,
          enabled: r.enabled,
          status: r.status || "stopped",
          config: r.config || {},
          tools: r.config?.tools || [],
          resources: r.config?.resources || [],
          lastPing: r.last_sync,
          error: r.error,
          pid: mcpProcesses.get(r.connector_id)?.pid || null,
        };
      }
      json(200, result);
    } catch {
      // Fallback: return in-memory configs
      const result = {};
      for (const [id, cfg] of mcpConfigs.entries()) {
        result[id] = {
          id,
          enabled: true,
          status: mcpProcesses.has(id) ? "running" : "stopped",
          config: cfg.env || {},
          tools: cfg.tools || [],
          resources: cfg.resources || [],
          pid: mcpProcesses.get(id)?.pid || null,
        };
      }
      json(200, result);
    }
  });

  // ── Start / register MCP server ─────────────────────────────────────────

  router.post("/api/mcp/servers", async ({ json, body }) => {
    body(async (b) => {
      const { id, name, transport, command, args, url, env } = b;

      if (!id || typeof id !== "string" || id.length > 128) {
        return json(400, { error: "Invalid server ID" });
      }

      const serverConfig = {
        id,
        name: name || id,
        mcpTransport: transport || "stdio",
        command,
        args: Array.isArray(args) ? args : [],
        url,
        env: env || {},
      };

      let tools = [];
      let resources = [];
      let pid = null;
      let status = "running";

      // ── stdio transport: spawn the process ──────────────────────────────
      if (transport === "stdio" && command) {
        try {
          // Build environment with user-provided vars
          const childEnv = { ...process.env };
          if (env && typeof env === "object") {
            for (const [k, v] of Object.entries(env)) {
              if (typeof v === "string" && v.length > 0) {
                childEnv[k] = v;
              }
            }
          }

          const child = spawn(command, Array.isArray(args) ? args : [], {
            env: childEnv,
            stdio: ["pipe", "pipe", "pipe"],
            shell: true,
          });

          pid = child.pid;

          // Attempt MCP initialize handshake (JSON-RPC over stdio)
          const initMsg = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "clawboard", version: "1.0.0" },
            },
          });

          child.stdin.write(initMsg + "\n");

          // Collect response with timeout
          const initResponse = await new Promise((resolve) => {
            let buf = "";
            const timeout = setTimeout(() => resolve(null), 8000);

            child.stdout.on("data", (chunk) => {
              buf += chunk.toString();
              // Try to parse JSON-RPC response
              try {
                const lines = buf.split("\n").filter(Boolean);
                for (const line of lines) {
                  const parsed = JSON.parse(line);
                  if (parsed.id === 1 && parsed.result) {
                    clearTimeout(timeout);
                    resolve(parsed.result);
                    return;
                  }
                }
              } catch {
                // incomplete, wait for more data
              }
            });

            child.on("error", () => {
              clearTimeout(timeout);
              resolve(null);
            });

            child.on("close", () => {
              clearTimeout(timeout);
              resolve(null);
            });
          });

          if (initResponse) {
            // Send initialized notification
            child.stdin.write(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "notifications/initialized",
              }) + "\n",
            );

            // Request tools/list
            child.stdin.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/list",
                params: {},
              }) + "\n",
            );

            const toolsResponse = await new Promise((resolve) => {
              let buf = "";
              const timeout = setTimeout(() => resolve(null), 5000);
              const handler = (chunk) => {
                buf += chunk.toString();
                try {
                  const lines = buf.split("\n").filter(Boolean);
                  for (const line of lines) {
                    const parsed = JSON.parse(line);
                    if (parsed.id === 2 && parsed.result) {
                      clearTimeout(timeout);
                      child.stdout.removeListener("data", handler);
                      resolve(parsed.result);
                      return;
                    }
                  }
                } catch {
                  // wait
                }
              };
              child.stdout.on("data", handler);
            });

            if (toolsResponse?.tools) {
              tools = toolsResponse.tools.map((t) => ({
                name: t.name,
                description: t.description || "",
                inputSchema: t.inputSchema,
              }));
            }

            // Request resources/list
            child.stdin.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "resources/list",
                params: {},
              }) + "\n",
            );

            const resResponse = await new Promise((resolve) => {
              let buf = "";
              const timeout = setTimeout(() => resolve(null), 3000);
              const handler = (chunk) => {
                buf += chunk.toString();
                try {
                  const lines = buf.split("\n").filter(Boolean);
                  for (const line of lines) {
                    const parsed = JSON.parse(line);
                    if (parsed.id === 3 && parsed.result) {
                      clearTimeout(timeout);
                      child.stdout.removeListener("data", handler);
                      resolve(parsed.result);
                      return;
                    }
                  }
                } catch {
                  // wait
                }
              };
              child.stdout.on("data", handler);
            });

            if (resResponse?.resources) {
              resources = resResponse.resources.map((r) => ({
                uri: r.uri,
                name: r.name || r.uri,
                mimeType: r.mimeType,
              }));
            }
          }

          // Store process reference
          mcpProcesses.set(id, child);
          mcpConfigs.set(id, { ...serverConfig, tools, resources });

          // Handle process exit
          child.on("close", (code) => {
            mcpProcesses.delete(id);
            const cfg = mcpConfigs.get(id);
            if (cfg) cfg.status = "stopped";
          });

          child.on("error", (err) => {
            mcpProcesses.delete(id);
            const cfg = mcpConfigs.get(id);
            if (cfg) {
              cfg.status = "error";
              cfg.error = err.message;
            }
          });
        } catch (err) {
          status = "error";
          tools = [];
        }
      }

      // ── SSE / streamable-http transport: test connectivity ──────────────
      if ((transport === "sse" || transport === "streamable-http") && url) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (res.ok) {
            status = "running";
          } else {
            status = "error";
          }
        } catch {
          status = "error";
        }
        mcpConfigs.set(id, { ...serverConfig, tools, resources, status });
      }

      // Persist to DB (graceful)
      const safeEnv = {};
      if (env && typeof env === "object") {
        for (const [k, v] of Object.entries(env)) {
          if (typeof v !== "string") continue;
          const isSecret =
            k.includes("KEY") ||
            k.includes("TOKEN") ||
            k.includes("SECRET") ||
            k.includes("key") ||
            k.includes("token") ||
            k.includes("secret");
          safeEnv[k] = isSecret ? encryptKey(v) : v;
        }
      }

      try {
        await pool.query(
          `INSERT INTO connectors (connector_id, enabled, status, config, last_sync, updated_at)
           VALUES ($1, true, $2, $3, NOW(), NOW())
           ON CONFLICT (connector_id)
           DO UPDATE SET config = $3, enabled = true, status = $2, last_sync = NOW(), updated_at = NOW()`,
          [
            id,
            status,
            JSON.stringify({ ...serverConfig, env: safeEnv, tools, resources }),
          ],
        );
      } catch {
        // graceful — in-memory only
      }

      json(200, { ok: true, status, tools, resources, pid });
    });
  });

  // ── Discover tools from running MCP server ──────────────────────────────

  router.get(
    /^\/api\/mcp\/servers\/([a-z0-9_-]+)\/tools$/,
    async ({ json, params }) => {
      const id = params[1];
      const child = mcpProcesses.get(id);

      if (child && child.stdin && child.stdout) {
        try {
          // Send tools/list
          child.stdin.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 99,
              method: "tools/list",
              params: {},
            }) + "\n",
          );

          const toolsResponse = await new Promise((resolve) => {
            let buf = "";
            const timeout = setTimeout(() => resolve(null), 5000);
            const handler = (chunk) => {
              buf += chunk.toString();
              try {
                const lines = buf.split("\n").filter(Boolean);
                for (const line of lines) {
                  const parsed = JSON.parse(line);
                  if (parsed.id === 99) {
                    clearTimeout(timeout);
                    child.stdout.removeListener("data", handler);
                    resolve(parsed.result);
                    return;
                  }
                }
              } catch {
                // wait
              }
            };
            child.stdout.on("data", handler);
          });

          const tools = (toolsResponse?.tools || []).map((t) => ({
            name: t.name,
            description: t.description || "",
            inputSchema: t.inputSchema,
          }));

          // Send resources/list
          child.stdin.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 100,
              method: "resources/list",
              params: {},
            }) + "\n",
          );

          const resResponse = await new Promise((resolve) => {
            let buf = "";
            const timeout = setTimeout(() => resolve(null), 3000);
            const handler = (chunk) => {
              buf += chunk.toString();
              try {
                const lines = buf.split("\n").filter(Boolean);
                for (const line of lines) {
                  const parsed = JSON.parse(line);
                  if (parsed.id === 100) {
                    clearTimeout(timeout);
                    child.stdout.removeListener("data", handler);
                    resolve(parsed.result);
                    return;
                  }
                }
              } catch {
                // wait
              }
            };
            child.stdout.on("data", handler);
          });

          const resources = (resResponse?.resources || []).map((r) => ({
            uri: r.uri,
            name: r.name || r.uri,
            mimeType: r.mimeType,
          }));

          return json(200, { ok: true, tools, resources });
        } catch {
          // fall through to config
        }
      }

      // Fallback: return stored config
      const cfg = mcpConfigs.get(id);
      json(200, {
        ok: true,
        tools: cfg?.tools || [],
        resources: cfg?.resources || [],
      });
    },
  );

  // ── Call an MCP tool ────────────────────────────────────────────────────

  router.post(
    /^\/api\/mcp\/servers\/([a-z0-9_-]+)\/call$/,
    async ({ json, body, params }) => {
      body(async (b) => {
        const id = params[1];
        const child = mcpProcesses.get(id);

        if (!child || !child.stdin || !child.stdout) {
          return json(404, { error: "MCP server not running" });
        }

        const { tool, arguments: toolArgs } = b;
        if (!tool || typeof tool !== "string") {
          return json(400, { error: "Missing tool name" });
        }

        const callId = Date.now();
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: callId,
            method: "tools/call",
            params: { name: tool, arguments: toolArgs || {} },
          }) + "\n",
        );

        const response = await new Promise((resolve) => {
          let buf = "";
          const timeout = setTimeout(
            () => resolve({ error: "Timeout after 30s" }),
            30000,
          );
          const handler = (chunk) => {
            buf += chunk.toString();
            try {
              const lines = buf.split("\n").filter(Boolean);
              for (const line of lines) {
                const parsed = JSON.parse(line);
                if (parsed.id === callId) {
                  clearTimeout(timeout);
                  child.stdout.removeListener("data", handler);
                  resolve(parsed.result || parsed.error || parsed);
                  return;
                }
              }
            } catch {
              // wait
            }
          };
          child.stdout.on("data", handler);
        });

        json(200, { ok: true, result: response });
      });
    },
  );

  // ── Stop / remove MCP server ────────────────────────────────────────────

  router.delete(
    /^\/api\/mcp\/servers\/([a-z0-9_-]+)$/,
    async ({ json, params }) => {
      const id = params[1];

      // Kill process if running
      const child = mcpProcesses.get(id);
      if (child) {
        try {
          child.kill("SIGTERM");
        } catch {
          /* already dead */
        }
        mcpProcesses.delete(id);
      }
      mcpConfigs.delete(id);

      // Remove from DB
      try {
        await pool.query("DELETE FROM connectors WHERE connector_id = $1", [
          id,
        ]);
      } catch {
        // graceful
      }

      json(200, { ok: true, stopped: id });
    },
  );
}
