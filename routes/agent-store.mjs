// ─── Agent Store Routes ──────────────────────────────────────────────────────
// REST API for the agent marketplace: list templates, install agents.

import { createLogger } from "../src/lib/logger.mjs";

const log = createLogger("route:agent-store");

export function register(router, ctx) {
  const { pool } = ctx;

  // ── GET /api/agent-store/categories — list categories (MUST be before regex routes) ─

  router.get("/api/agent-store/categories", async ({ json }) => {
    try {
      const { rows } = await pool.query(
        "SELECT DISTINCT category, COUNT(*) as count FROM agent_store GROUP BY category ORDER BY category",
      );
      json(200, rows.map((r) => ({ id: r.category, count: parseInt(r.count, 10) })));
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // ── GET /api/agent-store — list all store agents ──────────────────────────

  router.get("/api/agent-store", async ({ json, url }) => {
    try {
      const sp = url.searchParams || new URL(`http://x${url.pathname || ""}?${url.search || ""}`).searchParams;
      const category = sp.get("category") || null;
      const search = sp.get("search") || null;

      let query = "SELECT * FROM agent_store";
      const vals = [];
      const conditions = [];

      if (category && category !== "all") {
        vals.push(category);
        conditions.push(`category = $${vals.length}`);
      }
      if (search) {
        vals.push(`%${search.toLowerCase()}%`);
        conditions.push(`(LOWER(name) LIKE $${vals.length} OR LOWER(description) LIKE $${vals.length} OR $${vals.length} = ANY(tags))`);
      }

      if (conditions.length) query += " WHERE " + conditions.join(" AND ");
      query += " ORDER BY popular ASC, name ASC";

      const { rows } = await pool.query(query, vals);

      // Check which agents are already installed in acp_agents
      const { rows: installed } = await pool.query("SELECT id FROM acp_agents");
      const installedSet = new Set(installed.map((r) => r.id));

      const agents = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        icon: r.icon,
        color: r.color,
        provider: r.provider,
        model: r.model,
        command: r.command,
        args: r.args,
        env: r.env,
        skills: r.skills,
        config: r.config,
        tags: r.tags,
        popular: r.popular,
        installed: installedSet.has(r.id),
        createdAt: r.created_at,
      }));

      json(200, { agents, total: agents.length });
    } catch (err) {
      log.error("GET /api/agent-store failed", { error: err.message });
      json(500, { error: err.message });
    }
  });

  // ── GET /api/agent-store/:id — get single agent ────────────────────────────

  router.get(/^\/api\/agent-store\/([^/]+)$/, async ({ json, params }) => {
    try {
      const id = params[1];
      const { rows } = await pool.query("SELECT * FROM agent_store WHERE id=$1", [id]);
      if (!rows[0]) return json(404, { error: "Agent not found" });

      const r = rows[0];
      const { rows: installed } = await pool.query("SELECT id FROM acp_agents WHERE id=$1", [r.id]);

      json(200, {
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        icon: r.icon,
        color: r.color,
        provider: r.provider,
        model: r.model,
        command: r.command,
        args: r.args,
        env: r.env,
        skills: r.skills,
        config: r.config,
        tags: r.tags,
        popular: r.popular,
        installed: installed.length > 0,
        createdAt: r.created_at,
      });
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // ── POST /api/agent-store/:id/install — install agent to acp_agents ───────

  router.post(/^\/api\/agent-store\/([^/]+)\/install$/, ({ json, params, body }) => {
    body(async (b) => {
      try {
        const id = params[1];
        const { rows } = await pool.query("SELECT * FROM agent_store WHERE id=$1", [id]);
        if (!rows[0]) return json(404, { error: "Agent template not found" });

        const agent = rows[0];

        // Merge user-provided overrides (env vars, config tweaks)
        const userEnv = b?.env || {};
        const userConfig = b?.config || {};
        const mergedEnv = { ...agent.env, ...userEnv };
        const mergedConfig = { ...agent.config, ...userConfig };

        // Insert into acp_agents
        await pool.query(
          `INSERT INTO acp_agents (id, name, command, args, role, status, config, detected)
           VALUES ($1,$2,$3,$4,'standalone','stopped',$5,false)
           ON CONFLICT (id) DO UPDATE SET name=$2, command=$3, args=$4, config=$5, updated_at=NOW()`,
          [
            agent.id,
            agent.name,
            agent.command || "npx",
            agent.args || [],
            JSON.stringify({ ...mergedConfig, provider: agent.provider, model: agent.model, color: agent.color, skills: agent.skills }),
          ],
        );

        // Mark as installed in store
        await pool.query("UPDATE agent_store SET installed=true WHERE id=$1", [agent.id]);

        log.info("Agent installed", { id: agent.id, name: agent.name });

        json(201, {
          id: agent.id,
          name: agent.name,
          role: "standalone",
          status: "stopped",
          config: mergedConfig,
          installed: true,
        });
      } catch (err) {
        log.error("POST /api/agent-store/:id/install failed", { error: err.message });
        json(500, { error: err.message });
      }
    });
  });

  // ── DELETE /api/agent-store/:id/install — uninstall agent ──────────────────

  router.delete(/^\/api\/agent-store\/([^/]+)\/install$/, ({ json, params }) => {
    (async () => {
      try {
        const id = params[1];

        // Remove from acp_agents
        const { rowCount } = await pool.query("DELETE FROM acp_agents WHERE id=$1", [id]);

        // Mark as not installed in store
        await pool.query("UPDATE agent_store SET installed=false WHERE id=$1", [id]);

        json(200, { ok: true, id, removed: rowCount > 0 });
      } catch (err) {
        json(500, { error: err.message });
      }
    })();
  });

  }