// ─── MCP Client ─────────────────────────────────────────────────────────────
// Connects to external MCP servers via stdio, SSE, or streamable-http transports.
// Uses @modelcontextprotocol/sdk for protocol compliance.
//
// Usage:
//   import { McpClientManager } from './mcp/client.mjs';
//   const mgr = new McpClientManager();
//   const server = await mgr.connect({ id, transport, command, args, url, env });
//   const tools = await server.listTools();
//   const result = await server.callTool('tool_name', { arg: 'value' });
//   await mgr.disconnect(id);

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLogger } from "./logger.mjs";

const log = createLogger("mcp-client");

// ─── Connection wrapper ──────────────────────────────────────────────────────

export class McpServerConnection {
  constructor(id, config, client, transport) {
    this.id = id;
    this.config = config;
    this.client = client;
    this.transport = transport;
    this.tools = [];
    this.resources = [];
    this.status = "connected";
    this.error = null;
    this.lastSync = null;
  }

  async listTools() {
    try {
      const result = await this.client.listTools();
      this.tools = (result.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
      }));
      this.lastSync = new Date().toISOString();
      return this.tools;
    } catch (err) {
      log.error("listTools failed", { serverId: this.id, error: err.message });
      throw err;
    }
  }

  async listResources() {
    try {
      const result = await this.client.listResources();
      this.resources = (result.resources || []).map((r) => ({
        uri: r.uri,
        name: r.name || r.uri,
        mimeType: r.mimeType,
      }));
      return this.resources;
    } catch (err) {
      log.warn("listResources failed (may not be supported)", {
        serverId: this.id,
        error: err.message,
      });
      return [];
    }
  }

  async callTool(name, args = {}) {
    try {
      const result = await this.client.callTool({ name, arguments: args });
      return result;
    } catch (err) {
      log.error("callTool failed", {
        serverId: this.id,
        tool: name,
        error: err.message,
      });
      throw err;
    }
  }

  async ping() {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  getSnapshot() {
    return {
      id: this.id,
      status: this.status,
      tools: this.tools,
      resources: this.resources,
      lastSync: this.lastSync,
      error: this.error,
      transport: this.config.transport,
    };
  }

  async close() {
    try {
      await this.client.close();
    } catch (err) {
      log.warn("close failed", { serverId: this.id, error: err.message });
    }
    this.status = "disconnected";
  }
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class McpClientManager {
  constructor() {
    this.connections = new Map();
  }

  async connect(config) {
    const { id, transport = "stdio", command, args = [], url, env = {}, headers = {} } = config;

    if (this.connections.has(id)) {
      await this.disconnect(id);
    }

    log.info("Connecting MCP server", { id, transport });

    let clientTransport;

    switch (transport) {
      case "stdio": {
        if (!command) throw new Error("stdio transport requires 'command'");
        const childEnv = { ...process.env };
        for (const [k, v] of Object.entries(env)) {
          if (typeof v === "string" && v.length > 0) childEnv[k] = v;
        }
        clientTransport = new StdioClientTransport({
          command,
          args: Array.isArray(args) ? args : [],
          env: childEnv,
        });
        break;
      }
      case "sse": {
        if (!url) throw new Error("sse transport requires 'url'");
        const sseHeaders = { ...headers };
        clientTransport = new SSEClientTransport(new URL(url), {
          requestInit: { headers: sseHeaders },
        });
        break;
      }
      case "streamable-http": {
        if (!url) throw new Error("streamable-http transport requires 'url'");
        const httpHeaders = { ...headers };
        clientTransport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: httpHeaders },
        });
        break;
      }
      default:
        throw new Error(`Unsupported transport: ${transport}`);
    }

    const client = new Client(
      { name: "clawboard", version: "1.0.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(clientTransport);
    } catch (err) {
      log.error("MCP connect failed", { id, error: err.message });
      throw err;
    }

    const conn = new McpServerConnection(id, config, client, clientTransport);
    conn.status = "connected";
    this.connections.set(id, conn);

    try {
      await conn.listTools();
      await conn.listResources().catch(() => {});
    } catch (err) {
      log.warn("Tool discovery failed after connect", {
        id,
        error: err.message,
      });
    }

    log.info("MCP server connected", {
      id,
      tools: conn.tools.length,
      resources: conn.resources.length,
    });

    return conn;
  }

  async disconnect(id) {
    const conn = this.connections.get(id);
    if (!conn) return;
    await conn.close();
    this.connections.delete(id);
    log.info("MCP server disconnected", { id });
  }

  get(id) {
    return this.connections.get(id) || null;
  }

  getAll() {
    const result = {};
    for (const [id, conn] of this.connections.entries()) {
      result[id] = conn.getSnapshot();
    }
    return result;
  }

  async disconnectAll() {
    const ids = [...this.connections.keys()];
    for (const id of ids) {
      await this.disconnect(id);
    }
  }
}

export default McpClientManager;
