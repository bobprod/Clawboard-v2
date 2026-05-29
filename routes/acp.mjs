// ─── ACP (Agent Client Protocol) Routes ──────────────────────────────────────
// REST API for managing CLI agents, team sessions, and async mailbox.

import { createLogger } from "../src/lib/logger.mjs";
import { AcpClient, scanForAgents } from "../src/lib/acp/client.mjs";
import { AcpServer } from "../src/lib/acp/server.mjs";

const log = createLogger("route:acp");

/** In-memory ACP client instance */
const acpClient = new AcpClient();
let acpServer = null;

export function register(router, ctx) {
  const { pool, sseClients, broadcast } = ctx;

  // ── SSE stream for ACP events ──────────────────────────────────────────────

  const acpSseClients = new Set();
  sseClients.acp = acpSseClients;

  acpClient.on("agent:status", (data) => {
    broadcast(acpSseClients, { event: "agent:status", ...data });
  });
  acpClient.on("agent:message", (data) => {
    broadcast(acpSseClients, { event: "agent:message", ...data });
  });
  acpClient.on("agent:error", (data) => {
    broadcast(acpSseClients, { event: "agent:error", ...data });
  });

  // ── GET /api/acp/agents — list all agents ──────────────────────────────────

  router.get("/api/acp/agents", async ({ json }) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM acp_agents ORDER BY detected DESC, name ASC",
      );
      const running = acpClient.getStatus();
      const runningMap = new Map(running.map((r) => [r.id, r]));

      const agents = rows.map((r) => ({
        id: r.id,
        name: r.name,
        command: r.command,
        args: r.args,
        role: r.role,
        status: runningMap.get(r.id)?.status || r.status,
        pid: runningMap.get(r.id)?.pid || r.pid,
        detected: r.detected,
        config: r.config,
        uptime: runningMap.get(r.id)?.uptime || 0,
        taskCount: runningMap.get(r.id)?.taskCount || 0,
        cpu: runningMap.get(r.id)?.cpu || 0,
        memory: runningMap.get(r.id)?.memory || 0,
        lastError: runningMap.get(r.id)?.lastError || null,
        createdAt: r.created_at,
      }));

      json(200, agents);
    } catch (err) {
      log.error("GET /api/acp/agents failed", { error: err.message });
      json(500, { error: err.message });
    }
  });

  // ── POST /api/acp/agents — add custom agent ────────────────────────────────

  router.post("/api/acp/agents", ({ json, body }) => {
    body(async (b) => {
      try {
        const id = b.id || `custom_${Date.now()}`;
        const name = b.name || id;
        const command = b.command;
        if (!command) return json(400, { error: "command is required" });

        await pool.query(
          `INSERT INTO acp_agents (id, name, command, args, role, status, config, detected)
           VALUES ($1,$2,$3,$4,$5,'stopped',$6,false)
           ON CONFLICT (id) DO UPDATE SET name=$2, command=$3, args=$4, role=$5, config=$6, updated_at=NOW()`,
          [
            id,
            name,
            command,
            b.args || [],
            b.role || "teammate",
            JSON.stringify(b.config || {}),
          ],
        );

        json(201, { id, name, command, role: b.role || "teammate" });
      } catch (err) {
        log.error("POST /api/acp/agents failed", { error: err.message });
        json(500, { error: err.message });
      }
    });
  });

  // ── DELETE /api/acp/agents/:id — remove agent ──────────────────────────────

  router.delete(/^\/api\/acp\/agents\/([^/]+)$/, ({ json, params }) => {
    (async () => {
      try {
        const id = params[1];
        acpClient.stop(id);
        const { rowCount } = await pool.query("DELETE FROM acp_agents WHERE id=$1", [id]);
        if (!rowCount) return json(404, { error: "Agent not found" });
        json(200, { ok: true, deleted: id });
      } catch (err) {
        json(500, { error: err.message });
      }
    })();
  });

  // ── POST /api/acp/agents/:id/start — start agent ───────────────────────────

  router.post(/^\/api\/acp\/agents\/([^/]+)\/start$/, ({ json, params }) => {
    (async () => {
      try {
        const id = params[1];
        const { rows } = await pool.query("SELECT * FROM acp_agents WHERE id=$1", [id]);
        if (!rows[0]) return json(404, { error: "Agent not found" });

        const agent = rows[0];
        const config = {
          id: agent.id,
          name: agent.name,
          command: agent.command,
          args: agent.args || [],
          role: agent.role,
          ...(agent.config || {}),
        };

        const managed = acpClient.start(config);
        await pool.query("UPDATE acp_agents SET status='idle', updated_at=NOW() WHERE id=$1", [id]);

        json(200, { ok: true, id, status: managed.status, pid: managed.pid });
      } catch (err) {
        log.error("POST /api/acp/agents/:id/start failed", { error: err.message });
        json(500, { error: err.message });
      }
    })();
  });

  // ── POST /api/acp/agents/:id/stop — stop agent ─────────────────────────────

  router.post(/^\/api\/acp\/agents\/([^/]+)\/stop$/, ({ json, params }) => {
    (async () => {
      try {
        const id = params[1];
        acpClient.stop(id);
        await pool.query("UPDATE acp_agents SET status='stopped', pid=NULL, updated_at=NOW() WHERE id=$1", [id]);
        json(200, { ok: true, id, status: "stopped" });
      } catch (err) {
        json(500, { error: err.message });
      }
    })();
  });

  // ── GET /api/acp/agents/:id/status — get agent status ──────────────────────

  router.get(/^\/api\/acp\/agents\/([^/]+)\/status$/, ({ json, params }) => {
    (async () => {
      try {
        const id = params[1];
        const running = acpClient.getStatus().find((a) => a.id === id);
        if (running) return json(200, running);

        const { rows } = await pool.query("SELECT * FROM acp_agents WHERE id=$1", [id]);
        if (!rows[0]) return json(404, { error: "Agent not found" });
        json(200, { id, status: rows[0].status, pid: rows[0].pid });
      } catch (err) {
        json(500, { error: err.message });
      }
    })();
  });

  // ── POST /api/acp/team/create — create team session ────────────────────────

  router.post("/api/acp/team/create", ({ json, body }) => {
    body(async (b) => {
      try {
        const { leaderId, teammateIds, name } = b;
        if (!leaderId) return json(400, { error: "leaderId is required" });
        if (!teammateIds || !teammateIds.length) return json(400, { error: "teammateIds is required" });

        // Verify leader and teammates exist
        const allIds = [leaderId, ...teammateIds];
        const { rows } = await pool.query("SELECT id FROM acp_agents WHERE id = ANY($1)", [allIds]);
        const found = new Set(rows.map((r) => r.id));
        const missing = allIds.filter((id) => !found.has(id));
        if (missing.length) return json(404, { error: `Agents not found: ${missing.join(", ")}` });

        // Create session in DB
        const sessionId = `team_${Date.now()}`;
        await pool.query(
          `INSERT INTO acp_sessions (id, name, leader_id, status, created_at, updated_at)
           VALUES ($1,$2,$3,'created',NOW(),NOW())`,
          [sessionId, name || `Team ${sessionId}`, leaderId],
        );

        // Add members
        for (const tid of teammateIds) {
          await pool.query(
            `INSERT INTO acp_session_members (session_id, agent_id, role) VALUES ($1,$2,'teammate')
             ON CONFLICT DO NOTHING`,
            [sessionId, tid],
          );
        }
        await pool.query(
          `INSERT INTO acp_session_members (session_id, agent_id, role) VALUES ($1,$2,'leader')
           ON CONFLICT DO NOTHING`,
          [sessionId, leaderId],
        );

        // Start agents if not running
        for (const aid of allIds) {
          const agentRow = await pool.query("SELECT * FROM acp_agents WHERE id=$1", [aid]);
          if (agentRow.rows[0] && !acpClient.agents.has(aid)) {
            const a = agentRow.rows[0];
            acpClient.start({
              id: a.id,
              name: a.name,
              command: a.command,
              args: a.args || [],
              role: a.role,
              ...(a.config || {}),
            });
          }
        }

        // Create team session in memory
        const session = acpClient.createTeam(leaderId, teammateIds);
        await pool.query("UPDATE acp_sessions SET status='running', updated_at=NOW() WHERE id=$1", [sessionId]);

        json(201, {
          id: sessionId,
          name: name || `Team ${sessionId}`,
          leaderId,
          teammateIds,
          status: "running",
        });
      } catch (err) {
        log.error("POST /api/acp/team/create failed", { error: err.message });
        json(500, { error: err.message });
      }
    });
  });

  // ── POST /api/acp/team/:id/task — delegate task to team ────────────────────

  router.post(/^\/api\/acp\/team\/([^/]+)\/task$/, ({ json, body, params }) => {
    body(async (b) => {
      try {
        const sessionId = params[1];
        const { targetAgentId, task, broadcast: doBroadcast } = b;

        // Verify session exists
        const { rows } = await pool.query("SELECT * FROM acp_sessions WHERE id=$1", [sessionId]);
        if (!rows[0]) return json(404, { error: "Session not found" });

        // Store task in mailbox
        await pool.query(
          `INSERT INTO acp_mailbox (session_id, from_agent, to_agent, message_type, payload)
           VALUES ($1,$2,$3,'task',$4)`,
          [sessionId, rows[0].leader_id, targetAgentId || "all", JSON.stringify(task)],
        );

        // Execute via acpClient
        let result;
        if (doBroadcast) {
          // Send to all teammates
          const { rows: members } = await pool.query(
            "SELECT agent_id FROM acp_session_members WHERE session_id=$1 AND role='teammate'",
            [sessionId],
          );
          const results = {};
          for (const m of members) {
            try {
              results[m.agent_id] = await acpClient.sendTask(m.agent_id, task);
            } catch (err) {
              results[m.agent_id] = { error: err.message };
            }
          }
          result = results;
        } else if (targetAgentId) {
          result = await acpClient.sendTask(targetAgentId, task);
        } else {
          return json(400, { error: "targetAgentId or broadcast=true required" });
        }

        // Store result in mailbox
        await pool.query(
          `INSERT INTO acp_mailbox (session_id, from_agent, to_agent, message_type, payload)
           VALUES ($1,$2,$3,'result',$4)`,
          [sessionId, targetAgentId || "all", rows[0].leader_id, JSON.stringify(result)],
        );

        json(200, { sessionId, result });
      } catch (err) {
        log.error("POST /api/acp/team/:id/task failed", { error: err.message });
        json(500, { error: err.message });
      }
    });
  });

  // ── GET /api/acp/team/:id/mailbox — get mailbox messages ────────────────────

  router.get(/^\/api\/acp\/team\/([^/]+)\/mailbox$/, async ({ json, params, url }) => {
    try {
      const sessionId = params[1];
      const sp = url.searchParams || new URL(`http://x${url.pathname || ""}?${url.search || ""}`).searchParams;
      const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);
      const unreadOnly = sp.get("unread") === "true";

      let query = "SELECT * FROM acp_mailbox WHERE session_id=$1";
      const vals = [sessionId];
      if (unreadOnly) {
        query += " AND read=false";
      }
      query += " ORDER BY created_at DESC LIMIT $" + (vals.push(limit));

      const { rows } = await pool.query(query, vals);
      json(200, rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        from: r.from_agent,
        to: r.to_agent,
        type: r.message_type,
        payload: r.payload,
        read: r.read,
        createdAt: r.created_at,
      })));
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // ── POST /api/acp/scan — scan PATH for installed CLI agents ────────────────

  router.post("/api/acp/scan", async ({ json }) => {
    try {
      const found = await scanForAgents();

      // Upsert detected agents into DB
      for (const agent of found) {
        await pool.query(
          `INSERT INTO acp_agents (id, name, command, args, role, status, config, detected)
           VALUES ($1,$2,$3,$4,'standalone','stopped',$5,true)
           ON CONFLICT (id) DO UPDATE SET name=$2, command=$3, detected=true, config=$5, updated_at=NOW()`,
          [
            agent.id,
            agent.name,
            agent.command,
            agent.args || [],
            JSON.stringify({ provider: agent.provider, version: agent.version, path: agent.path }),
          ],
        );
      }

      json(200, { scanned: found.length, agents: found });
    } catch (err) {
      log.error("POST /api/acp/scan failed", { error: err.message });
      json(500, { error: err.message });
    }
  });

  // ── GET /api/acp/server — ACP server status ────────────────────────────────

  router.get("/api/acp/server", ({ json }) => {
    if (!acpServer) return json(200, { running: false });
    json(200, acpServer.getStatus());
  });

  // ── POST /api/acp/server/start — start ACP server ──────────────────────────

  router.post("/api/acp/server/start", ({ json, body }) => {
    body(async (b) => {
      try {
        if (acpServer && acpServer._running) {
          return json(200, { ok: true, message: "Already running", ...acpServer.getStatus() });
        }
        acpServer = new AcpServer({ port: b.port || 0, pool, ctx });
        await acpServer.start();
        json(200, { ok: true, ...acpServer.getStatus() });
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });

  // ── POST /api/acp/server/stop — stop ACP server ────────────────────────────

  router.post("/api/acp/server/stop", ({ json }) => {
    if (!acpServer) return json(200, { ok: true, message: "Not running" });
    acpServer.stop();
    acpServer = null;
    json(200, { ok: true, status: "stopped" });
  });

  // ── GET /api/acp/stream — SSE for real-time ACP events ─────────────────────

  router.get("/api/acp/stream", ({ sse, res }) => {
    sse(acpSseClients);
    res.write(`data: ${JSON.stringify({ event: "connected", agents: acpClient.getStatus() })}\n\n`);
  });
}
