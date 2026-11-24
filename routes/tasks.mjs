// ─── Task Routes (CRUD + run + archives + logs SSE) ─────────────────────────
import { createLogger } from '../src/lib/logger.mjs';
import { generateText } from '../src/lib/llm.mjs';
const log = createLogger("tasks");
export function register(router, ctx) {
  const {
    pool,
    sseClients,
    schemas,
    sanitizeObject,
    checkRateLimit,
    getAllTasks,
    getTaskById,
    broadcastTasks,
    invalidateTasksCache,
    decryptKey,
  } = ctx;

  // Résout une clé LLM : environnement d'abord, puis base chiffrée.
  async function resolveLlmKey() {
    if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY;
    try {
      const { rows } = await pool.query(
        "SELECT encrypted_value FROM api_keys WHERE provider IN ('opencode','opencode-go','opencode-zen') LIMIT 1",
      );
      const value = rows[0]?.encrypted_value;
      return value && decryptKey ? decryptKey(value) : null;
    } catch {
      return null;
    }
  }

  // GET /api/tasks (SSE or JSON, with optional pagination)
  router.get("/api/tasks", async ({ req, url, json, sse }) => {
    if (url.searchParams.get("stream") === "1") {
      sse(sseClients.tasks);
      const all = await getAllTasks();
      return void sse; // already connected — broadcast loop will push
    }
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "0", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "0", 10)),
    );
    const status = (url.searchParams.get("status") || "").replace(
      /[^a-z]/g,
      "",
    );

    if (page && limit) {
      const where = status ? `WHERE statut=$3` : "";
      const params = status
        ? [limit, (page - 1) * limit, status]
        : [limit, (page - 1) * limit];
      const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query(
          `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          params,
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM tasks ${where}`,
          status ? [status] : [],
        ),
      ]);
      const total = countRows[0]?.total ?? 0;
      json(200, {
        data: rows,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    } else {
      const all = await getAllTasks();
      json(200, all);
    }
  });

  // POST /api/tasks
  router.post("/api/tasks", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.createTask, async (b) => {
      const id = `tsk_${Date.now()}`;
      const now = new Date().toISOString();
      const safe = sanitizeObject(b);
      await pool.query(
        `INSERT INTO tasks (id, titre, modele_id, statut, priorite, agent, skill_name, instructions, scheduled_at, recurrence_human, created_at, updated_at, cout, tokens_in, tokens_out)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,0,0,0)`,
        [
          id,
          safe.name || safe.titre || "Sans titre",
          safe.modeleId || null,
          safe.status || "planifie",
          safe.priorite || "normale",
          safe.agent || "main",
          safe.skillName || null,
          safe.instructions || null,
          safe.scheduledAt || now,
          safe.recurrenceHuman || null,
          now,
        ],
      );
      await pool.query(
        `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'created','Tâche créée','Tâche créée',$2)`,
        [id, now],
      );
      await broadcastTasks();
      const task = await getTaskById(id);
      json(201, task);
    });
  });

  // POST /api/tasks/:id/run
  router.post(/^\/api\/tasks\/([^/]+)\/run$/, ({ json, params }) => {
    getTaskById(params[1])
      .then(async (task) => {
        if (!task) return json(404, { error: "Not found" });
        const now = new Date().toISOString();
        await pool.query(
          `UPDATE tasks SET statut='running', updated_at=$2, started_at=$2 WHERE id=$1`,
          [task.id, now],
        );
        await pool.query(
          `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'launched','Exécution lancée','Exécution lancée',$2)`,
          [task.id, now],
        );
        await pool.query(
          `INSERT INTO task_executions (task_id, statut, cout, tokens_in, tokens_out, started_at, prompt_tokens, completion_tokens) VALUES ($1,'running',0,0,0,$2,0,0)`,
          [task.id, now],
        );
        await broadcastTasks();
        json(200, { ok: true });
        setTimeout(async () => {
          const doneNow = new Date().toISOString();
          let statut = "completed";
          let stdout = "";
          let cost = 0;
          let tokIn = 0;
          let tokOut = 0;

          const instructions = String(
            task.instructions || task.titre || task.name || "",
          ).trim();
          const key = await resolveLlmKey();

          if (key && instructions) {
            try {
              const r = await generateText({
                key,
                baseUrl: process.env.LLM_BASE_URL || "https://opencode.ai/inference/go/v1",
                model: process.env.LLM_MODEL || "deepseek-v4.1-flash",
                sessionHeader: "clawboard-llm",
                messages: [
                  { role: "system", content: "Tu es l'agent ClawBoard. Execute la tache demandee de facon utile et concise." },
                  { role: "user", content: instructions },
                ],
              });
              tokIn = r.promptTokens;
              tokOut = r.completionTokens;
              stdout = `✅ Tâche exécutée (${r.model})\n\n${r.text}`;
            } catch (e) {
              statut = "failed";
              stdout = `❌ Erreur d'exécution : ${e.message}`;
            }
          } else {
            // Aucune clé LLM : on marque clairement la simulation.
            const dur = Math.floor(Math.random() * 60 + 10);
            stdout = `⚠️ SIMULATION (aucune clé LLM configurée : OPENCODE_API_KEY)\n\nDurée : ${dur}s\n\n## Résultat\nExécution simulée.`;
          }

          try {
            await pool.query(
              `UPDATE tasks SET statut=$2, updated_at=$3, cout=$4, tokens_in=$5, tokens_out=$6, completed_at=$3, resultat=$7, erreur=$8 WHERE id=$1`,
              [task.id, statut, doneNow, cost, tokIn, tokOut, statut === "completed" ? stdout : null, statut === "failed" ? stdout : null],
            );
            await pool.query(
              `UPDATE task_executions SET statut=$3, cout=$4, tokens_in=$5, tokens_out=$6, exit_code=$7, stdout=$8 WHERE task_id=$1 AND started_at=$2`,
              [task.id, now, statut, cost, tokIn, tokOut, statut === "completed" ? 0 : 1, stdout],
            );
            await pool.query(
              `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,$2,$2,$3)`,
              [task.id, statut === "completed" ? "Exécution terminée" : "Exécution échouée", doneNow],
            );
            await broadcastTasks();
          } catch (e) {
            log.error("Task run completion failed", { error: e.message });
          }
        }, 1000);
      })
      .catch((err) => json(500, { error: err.message }));
  });

  // GET /api/tasks/:id
  router.get(/^\/api\/tasks\/([^/]+)$/, ({ json, params }) => {
    getTaskById(params[1])
      .then((t) => json(t ? 200 : 404, t || { error: "Not found" }))
      .catch((err) => json(500, { error: err.message }));
  });

  // PATCH /api/tasks/:id
  router.patch(
    /^\/api\/tasks\/([^/]+)$/,
    ({ req, res, json, validatedBody, params }) => {
      if (!checkRateLimit(req, res, "write")) return;
      validatedBody(schemas.updateTask, async (b) => {
        const { executions: _e, activity: _a, tokensUsed: _tk, ...rest } = b;
        const safe = sanitizeObject(rest);
        const setClauses = [],
          vals = [params[1]];
        if (safe.status !== undefined)
          setClauses.push(`statut=$${vals.push(safe.status)}`);
        if (safe.name !== undefined)
          setClauses.push(`titre=$${vals.push(safe.name)}`);
        if (safe.titre !== undefined)
          setClauses.push(`titre=$${vals.push(safe.titre)}`);
        if (safe.description !== undefined)
          setClauses.push(`description=$${vals.push(safe.description)}`);
        if (safe.instructions !== undefined)
          setClauses.push(`instructions=$${vals.push(safe.instructions)}`);
        if (safe.priorite !== undefined)
          setClauses.push(`priorite=$${vals.push(safe.priorite)}`);
        if (safe.llm !== undefined)
          setClauses.push(`llm=$${vals.push(safe.llm)}`);
        if (setClauses.length > 0) {
          await pool.query(
            `UPDATE tasks SET ${setClauses.join(",")}, updated_at=NOW() WHERE id=$1`,
            vals,
          );
        }
        await broadcastTasks();
        const task = await getTaskById(params[1]);
        json(200, task);
      });
    },
  );

  // DELETE /api/tasks/:id
  router.delete(/^\/api\/tasks\/([^/]+)$/, ({ json, params }) => {
    pool
      .query("DELETE FROM tasks WHERE id=$1", [params[1]])
      .then(async () => {
        await broadcastTasks();
        json(200, { ok: true });
      })
      .catch((err) => json(500, { error: err.message }));
  });

  // GET /api/logs/:id (SSE)
  router.get(/^\/api\/logs\/([^/]+)$/, ({ sse, res, req, params }) => {
    const taskId = params[1];
    if (!sseClients.logs[taskId]) sseClients.logs[taskId] = new Set();
    sse(sseClients.logs[taskId]);
    getTaskById(taskId)
      .then((task) => {
        const lines = [
          `[BOOT] Task ${taskId} initialized`,
          `[INIT] Agent: ${task?.agent || "main"}`,
          `[NET]  Connecting to inference backend...`,
          `[NET]  TLS handshake OK`,
          `[EXEC] Starting execution...`,
        ];
        let i = 0;
        const iv = setInterval(() => {
          const line =
            i < lines.length
              ? lines[i++]
              : `[LLM]  Completion chunk +${Math.floor(Math.random() * 80 + 20)} tokens`;
          try {
            res.write(
              `data: ${JSON.stringify({ line, ts: new Date().toISOString() })}\n\n`,
            );
          } catch (_) {
            clearInterval(iv);
          }
        }, 400);
        req.on("close", () => clearInterval(iv));
      })
      .catch(() => {
        const iv = setInterval(() => {
          try {
            res.write(
              `data: ${JSON.stringify({ line: `[LLM]  Chunk +${Math.floor(Math.random() * 80 + 20)} tokens`, ts: new Date().toISOString() })}\n\n`,
            );
          } catch (_) {
            clearInterval(iv);
          }
        }, 400);
        req.on("close", () => clearInterval(iv));
      });
  });

  // GET /api/archives (with optional pagination)
  router.get("/api/archives", ({ url, json }) => {
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "0", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "0", 10)),
    );
    const status = (url.searchParams.get("status") || "").replace(
      /[^a-z]/g,
      "",
    );

    const statusWhere =
      status === "ok"
        ? `AND (te.statut = 'completed' OR te.exit_code = 0)`
        : status === "error"
          ? `AND te.statut != 'completed' AND (te.exit_code IS NULL OR te.exit_code != 0)`
          : "";

    const mapRow = (r) => ({
      id: String(r.id),
      taskName: r.task_name,
      skillName: r.skill_name,
      startedAt: r.started_at || r.created_at,
      duration: r.duration || r.duree_ms,
      promptTokens: r.prompt_tokens || r.tokens_in || 0,
      completionTokens: r.completion_tokens || r.tokens_out || 0,
      cost: r.cout || 0,
      exitCode: r.exit_code ?? (r.statut === "completed" ? 0 : null),
      status: r.statut === "completed" || r.exit_code === 0 ? "ok" : "error",
    });

    if (page && limit) {
      const offset = (page - 1) * limit;
      Promise.all([
        pool.query(
          `
          SELECT te.id, te.task_id, te.statut, te.cout, te.tokens_in, te.tokens_out, te.duree_ms,
                 te.started_at, te.duration, te.prompt_tokens, te.completion_tokens, te.exit_code, te.stdout,
                 t.titre AS task_name, t.skill_name
          FROM task_executions te JOIN tasks t ON t.id = te.task_id
          WHERE 1=1 ${statusWhere}
          ORDER BY COALESCE(te.started_at, te.created_at) DESC
          LIMIT $1 OFFSET $2
        `,
          [limit, offset],
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM task_executions te JOIN tasks t ON t.id = te.task_id WHERE 1=1 ${statusWhere}`,
        ),
      ])
        .then(([{ rows }, { rows: countRows }]) => {
          const total = countRows[0]?.total ?? 0;
          json(200, {
            data: rows.map(mapRow),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          });
        })
        .catch((err) => json(500, { error: err.message }));
    } else {
      pool
        .query(
          `
        SELECT te.id, te.task_id, te.statut, te.cout, te.tokens_in, te.tokens_out, te.duree_ms,
               te.started_at, te.duration, te.prompt_tokens, te.completion_tokens, te.exit_code, te.stdout,
               t.titre AS task_name, t.skill_name
        FROM task_executions te JOIN tasks t ON t.id = te.task_id
        WHERE 1=1 ${statusWhere}
        ORDER BY COALESCE(te.started_at, te.created_at) DESC
        LIMIT 100
      `,
        )
        .then(({ rows }) => json(200, rows.map(mapRow)))
        .catch((err) => json(500, { error: err.message }));
    }
  });

  // ── Approvals (Human in the loop) ─────────────────────────────────────────

  router.get("/api/approvals", async ({ json, url, sse }) => {
    if (url.searchParams.get("stream") === "1") {
      if (!sseClients.approvals) sseClients.approvals = new Set();
      sse(sseClients.approvals);
      try {
        const { rows } = await pool.query("SELECT * FROM approvals WHERE decision IS NULL ORDER BY requested_at DESC");
        const list = rows.map(r => ({
          id: r.id, taskId: r.task_id, taskName: r.task_name, agent: r.agent,
          reason: r.reason, riskLevel: r.risk_level, requestedAt: r.requested_at, payload: r.payload
        }));
        return void sse; // push handled inside sse implementation if possible or just connected
      } catch (e) {
        return void sse;
      }
    }
    try {
      const { rows } = await pool.query("SELECT * FROM approvals WHERE decision IS NULL ORDER BY requested_at DESC");
      const list = rows.map(r => ({
        id: r.id, taskId: r.task_id, taskName: r.task_name, agent: r.agent,
        reason: r.reason, riskLevel: r.risk_level, requestedAt: r.requested_at, payload: r.payload
      }));
      json(200, list);
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  router.post(/^\/api\/approvals\/([^/]+)$/, ({ json, params, body }) => {
    body(async (b) => {
      const decision = b.decision; // "approve" or "reject"
      if (!decision) return json(400, { error: "Decision required" });
      try {
        await pool.query(
          "UPDATE approvals SET decision=$2, decided_at=NOW() WHERE id=$1 RETURNING *",
          [params[1], decision]
        );
        // Dispatch to SSE clients if any
        if (sseClients.approvals) {
          const payload = JSON.stringify({ id: params[1], decision });
          sseClients.approvals.forEach(client => {
            try { client.res.write(`event: decision\ndata: ${payload}\n\n`); } catch (_) { }
          });
        }
        json(200, { ok: true });
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });
}
