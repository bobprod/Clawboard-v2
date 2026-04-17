// ─── Resource Routes (modeles, recurrences, crons, preinstructions, pipeline, skills, memory) ──

export function register(router, ctx) {
  const {
    pool,
    schemas,
    sanitizeObject,
    checkRateLimit,
    broadcast,
    getAllModeles,
    getAllRecurrences,
    getAllSkills,
    getAllMemoryDocs,
    getAllGuardrails,
    getPipeline,
    getPreInstructions,
    broadcastTasks,
    rowToModele,
    rowToRecurrence,
  } = ctx;

  // ── Modèles ───────────────────────────────────────────────────────────────

  router.get("/api/modeles", ({ json }) => {
    getAllModeles()
      .then((m) => json(200, m))
      .catch((err) => json(500, { error: err.message }));
  });

  router.post("/api/modeles", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.createModele, async (b) => {
      const id = `mod_${Date.now()}`;
      const safe = sanitizeObject(b);
      const nomVal = safe.name || safe.nom || "Sans nom";
      await pool
        .query(
          `INSERT INTO modeles (id, nom, name, description, instructions, skill_name, agent, canal, destinataire, llm_model, disable_pre_instructions, execution_count)
         VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)`,
          [
            id,
            nomVal,
            safe.description || null,
            safe.instructions || null,
            safe.skillName || null,
            safe.agent || "main",
            safe.canal || null,
            safe.destinataire || null,
            safe.llmModel || null,
            safe.disablePreInstructions || false,
          ],
        )
        .catch(async () => {
          await pool.query(
            `INSERT INTO modeles (id, nom, instructions, agent, llm_model, execution_count) VALUES ($1,$2,$3,$4,$5,0)`,
            [
              id,
              nomVal,
              safe.instructions || null,
              safe.agent || "main",
              safe.llmModel || null,
            ],
          );
        });
      const { rows } = await pool.query("SELECT * FROM modeles WHERE id=$1", [
        id,
      ]);
      json(201, rowToModele(rows[0]));
    });
  });

  // POST /api/modeles/:id/run — create+run a task from a modele
  router.post(/^\/api\/modeles\/([^/]+)\/run$/, ({ json, params }) => {
    pool
      .query("SELECT * FROM modeles WHERE id=$1", [params[1]])
      .then(async ({ rows }) => {
        if (!rows[0]) return json(404, { error: "Not found" });
        const mod = rowToModele(rows[0]);
        const id = `tsk_${Date.now()}`;
        const now = new Date().toISOString();
        await pool.query(
          `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, instructions, scheduled_at, recurrence_human, created_at, updated_at, started_at, cout, tokens_in, tokens_out)
         VALUES ($1,$2,$3,'running',$4,$5,$6,$7,'Manuel',$8,$8,$8,0,0,0)`,
          [
            id,
            mod.name,
            mod.id,
            mod.agent,
            mod.skillName,
            mod.instructions,
            now,
            now,
          ],
        );
        await pool.query(
          `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'created','Tâche créée','Tâche créée',$2), ($1,'launched','Exécution lancée','Exécution lancée',$2)`,
          [id, now],
        );
        await pool.query(
          `UPDATE modeles SET execution_count=execution_count+1, updated_at=NOW() WHERE id=$1`,
          [mod.id],
        );
        await broadcastTasks();
        json(201, { ok: true, taskId: id });
      })
      .catch((err) => json(500, { error: err.message }));
  });

  // PATCH /api/modeles/:id
  router.patch(
    /^\/api\/modeles\/([^/]+)$/,
    ({ req, res, json, validatedBody, params }) => {
      if (!checkRateLimit(req, res, "write")) return;
      validatedBody(schemas.updateModele, async (b) => {
        const safe = sanitizeObject(b);
        const setClauses = [],
          vals = [params[1]];
        if (safe.name !== undefined)
          setClauses.push(`nom=$${vals.push(safe.name)}`);
        if (safe.nom !== undefined)
          setClauses.push(`nom=$${vals.push(safe.nom)}`);
        if (safe.description !== undefined)
          setClauses.push(`description=$${vals.push(safe.description)}`);
        if (safe.instructions !== undefined)
          setClauses.push(`instructions=$${vals.push(safe.instructions)}`);
        if (safe.skillName !== undefined)
          setClauses.push(`skill_name=$${vals.push(safe.skillName)}`);
        if (safe.agent !== undefined)
          setClauses.push(`agent=$${vals.push(safe.agent)}`);
        if (safe.canal !== undefined)
          setClauses.push(`canal=$${vals.push(safe.canal)}`);
        if (safe.destinataire !== undefined)
          setClauses.push(`destinataire=$${vals.push(safe.destinataire)}`);
        if (safe.llmModel !== undefined)
          setClauses.push(`llm_model=$${vals.push(safe.llmModel)}`);
        if (safe.disablePreInstructions !== undefined)
          setClauses.push(
            `disable_pre_instructions=$${vals.push(safe.disablePreInstructions)}`,
          );
        if (safe.executionCount !== undefined)
          setClauses.push(`execution_count=$${vals.push(safe.executionCount)}`);
        if (setClauses.length > 0) {
          await pool.query(
            `UPDATE modeles SET ${setClauses.join(",")}, updated_at=NOW() WHERE id=$1`,
            vals,
          );
        }
        const { rows } = await pool.query("SELECT * FROM modeles WHERE id=$1", [
          params[1],
        ]);
        json(200, rows[0] ? rowToModele(rows[0]) : null);
      });
    },
  );

  router.delete(/^\/api\/modeles\/([^/]+)$/, ({ json, params }) => {
    pool
      .query("DELETE FROM modeles WHERE id=$1", [params[1]])
      .then(() => json(200, { ok: true }))
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Récurrences ───────────────────────────────────────────────────────────

  router.get("/api/recurrences", ({ json }) => {
    getAllRecurrences()
      .then((r) => json(200, r))
      .catch((err) => json(500, { error: err.message }));
  });

  router.post("/api/recurrences", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.createRecurrence, async (b) => {
      const id = `rec_${Date.now()}`;
      const safe = sanitizeObject(b);
      await pool.query(
        `INSERT INTO recurrences (id, name, cron_expr, human, timezone, modele_id, llm_model, active, next_run)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          safe.name || safe.nom || "Sans nom",
          safe.cronExpr || safe.cron || "* * * * *",
          safe.human || null,
          safe.timezone || "UTC",
          safe.modeleId || null,
          safe.llmModel || null,
          safe.active !== false,
          safe.nextRun || null,
        ],
      );
      const { rows } = await pool.query(
        "SELECT * FROM recurrences WHERE id=$1",
        [id],
      );
      json(201, rowToRecurrence(rows[0]));
    });
  });

  router.patch(/^\/api\/recurrences\/([^/]+)$/, ({ json, body, params }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      const setClauses = [],
        vals = [params[1]];
      if (safe.name !== undefined)
        setClauses.push(`name=$${vals.push(safe.name)}`);
      if (safe.nom !== undefined)
        setClauses.push(`nom=$${vals.push(safe.nom)}`);
      if (safe.cronExpr !== undefined)
        setClauses.push(`cron=$${vals.push(safe.cronExpr)}`);
      if (safe.cron !== undefined)
        setClauses.push(`cron=$${vals.push(safe.cron)}`);
      if (safe.human !== undefined)
        setClauses.push(`human=$${vals.push(safe.human)}`);
      if (safe.timezone !== undefined)
        setClauses.push(`timezone=$${vals.push(safe.timezone)}`);
      if (safe.modeleId !== undefined)
        setClauses.push(`modele_id=$${vals.push(safe.modeleId)}`);
      if (safe.llmModel !== undefined)
        setClauses.push(`llm_model=$${vals.push(safe.llmModel)}`);
      if (safe.active !== undefined)
        setClauses.push(`active=$${vals.push(safe.active)}`);
      if (safe.nextRun !== undefined)
        setClauses.push(`next_run=$${vals.push(safe.nextRun)}`);
      if (setClauses.length > 0) {
        await pool.query(
          `UPDATE recurrences SET ${setClauses.join(",")} WHERE id=$1`,
          vals,
        );
      }
      const { rows } = await pool.query(
        "SELECT * FROM recurrences WHERE id=$1",
        [params[1]],
      );
      json(200, rows[0] ? rowToRecurrence(rows[0]) : null);
    });
  });

  router.delete(/^\/api\/recurrences\/([^/]+)$/, ({ json, params }) => {
    pool
      .query("DELETE FROM recurrences WHERE id=$1", [params[1]])
      .then(() => json(200, { ok: true }))
      .catch((err) => json(500, { error: err.message }));
  });

  // POST /api/recurrences/:id/run — trigger manually
  router.post(/^\/api\/recurrences\/([^/]+)\/run$/, ({ json, params }) => {
    const recId = params[1];
    pool
      .query("SELECT * FROM recurrences WHERE id=$1", [recId])
      .then(async ({ rows }) => {
        if (!rows.length) return json(404, { error: "Récurrence introuvable" });
        const rec = rows[0];
        let taskData = null;
        if (rec.modele_id) {
          const { rows: mRows } = await pool.query(
            "SELECT * FROM modeles WHERE id=$1",
            [rec.modele_id],
          );
          if (mRows.length) {
            const m = mRows[0];
            const taskId = `tsk_rec_${Date.now()}`;
            await pool.query(
              `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, instructions, recurrence_human, created_at, updated_at)
             VALUES ($1,$2,$3,'planifie',$4,$5,$6,$7,NOW(),NOW())`,
              [
                taskId,
                `[Récurrence] ${m.name || m.nom}`,
                rec.modele_id,
                m.agent || "main",
                m.skill_name || null,
                m.instructions || null,
                rec.name,
              ],
            );
            await pool.query(
              `UPDATE recurrences SET last_run=NOW(), run_count=COALESCE(run_count,0)+1 WHERE id=$1`,
              [recId],
            );
            taskData = { id: taskId, titre: `[Récurrence] ${m.name || m.nom}` };
          }
        }
        json(200, {
          ok: true,
          recurrenceId: recId,
          task: taskData,
          message: taskData
            ? "Tâche créée depuis la récurrence"
            : "Récurrence déclenchée (sans modèle associé)",
        });
      })
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Crons (Planificateur) ─────────────────────────────────────────────────

  const cronToJson = (r) => ({
    id: r.id,
    name: r.nom,
    interval: r.interval,
    agentId: r.agent_id,
    llmMode: r.llm_mode,
    mode: r.mode,
    modeConfig: r.mode_config || {},
    active: r.actif,
    lastRun: r.last_run,
    nextRun: r.next_run,
    runCount: r.run_count,
  });

  router.get("/api/crons", ({ json }) => {
    pool
      .query("SELECT * FROM crons ORDER BY created_at ASC")
      .then(({ rows }) => {
        json(200, rows.map(cronToJson));
      })
      .catch((err) => json(500, { error: err.message }));
  });

  router.post("/api/crons", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.createCron, async (b) => {
      const id = `cron_${Date.now()}`;
      const safe = sanitizeObject(b);
      await pool.query(
        `INSERT INTO crons (id, nom, interval, agent_id, llm_mode, mode, mode_config, actif) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [
          id,
          safe.name || "Sans nom",
          safe.interval || "1h",
          safe.agentId || "agent-main",
          safe.llmMode || "hybrid",
          safe.mode || "always",
          safe.modeConfig || {},
        ],
      );
      const { rows } = await pool.query("SELECT * FROM crons WHERE id=$1", [
        id,
      ]);
      json(201, cronToJson(rows[0]));
    });
  });

  router.post(/^\/api\/crons\/([^/]+)\/run$/, ({ json, params }) => {
    pool
      .query(
        `UPDATE crons SET last_run=NOW(), run_count=run_count+1 WHERE id=$1 RETURNING *`,
        [params[1]],
      )
      .then(({ rows }) => {
        if (!rows[0]) return json(404, { error: "Not found" });
        json(200, { ok: true, id: rows[0].id, runCount: rows[0].run_count });
      })
      .catch((err) => json(500, { error: err.message }));
  });

  router.patch(/^\/api\/crons\/([^/]+)$/, ({ json, body, params }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      const setClauses = [],
        vals = [params[1]];
      if (safe.name !== undefined)
        setClauses.push(`name=$${vals.push(safe.name)}`);
      if (safe.interval !== undefined)
        setClauses.push(`interval=$${vals.push(safe.interval)}`);
      if (safe.agentId !== undefined)
        setClauses.push(`agent_id=$${vals.push(safe.agentId)}`);
      if (safe.llmMode !== undefined)
        setClauses.push(`llm_mode=$${vals.push(safe.llmMode)}`);
      if (safe.mode !== undefined)
        setClauses.push(`mode=$${vals.push(safe.mode)}`);
      if (safe.active !== undefined)
        setClauses.push(`actif=$${vals.push(safe.active)}`);
      if (safe.nextRun !== undefined)
        setClauses.push(`next_run=$${vals.push(safe.nextRun)}`);
      if (setClauses.length > 0)
        await pool.query(
          `UPDATE crons SET ${setClauses.join(",")} WHERE id=$1`,
          vals,
        );
      const { rows } = await pool.query("SELECT * FROM crons WHERE id=$1", [
        params[1],
      ]);
      json(200, rows[0] ? cronToJson(rows[0]) : null);
    });
  });

  router.delete(/^\/api\/crons\/([^/]+)$/, ({ json, params }) => {
    pool
      .query("DELETE FROM crons WHERE id=$1", [params[1]])
      .then(() => json(200, { ok: true }))
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Pré-instructions ──────────────────────────────────────────────────────

  router.get("/api/preinstructions", ({ json }) => {
    getPreInstructions()
      .then((p) => json(200, p))
      .catch((err) => json(500, { error: err.message }));
  });

  router.put("/api/preinstructions", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.preinstructions, async (b) => {
      const content = b.content || "";
      await pool.query(
        `INSERT INTO pre_instructions (id, content, saved_at) VALUES (1,$1,NOW()) ON CONFLICT (id) DO UPDATE SET content=$1, saved_at=NOW()`,
        [content],
      );
      json(200, { content, savedAt: new Date().toISOString() });
    });
  });

  // ── Pipeline ──────────────────────────────────────────────────────────────

  router.get("/api/pipeline", ({ json }) => {
    getPipeline()
      .then((p) => json(200, p))
      .catch((err) => json(500, { error: err.message }));
  });

  router.put("/api/pipeline", ({ json, body }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      await pool.query(
        `INSERT INTO pipeline (id, nodes, edges, updated_at) VALUES (1,$1,$2,NOW()) ON CONFLICT (id) DO UPDATE SET nodes=$1, edges=$2, updated_at=NOW()`,
        [safe.nodes || [], safe.edges || []],
      );
      json(200, {
        nodes: safe.nodes || [],
        edges: safe.edges || [],
        savedAt: new Date().toISOString(),
      });
    });
  });

  // ── Skills ────────────────────────────────────────────────────────────────

  router.get("/api/skills", ({ json }) => {
    getAllSkills()
      .then((s) => json(200, s))
      .catch((err) => json(500, { error: err.message }));
  });

  router.post("/api/skills", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.createSkill, async (b) => {
      const id = `skl_${Date.now()}`;
      const safe = sanitizeObject(b);
      await pool.query(
        `INSERT INTO skills (id, name, description, content, tags, category, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          safe.name || safe.nom || "Sans nom",
          safe.description || null,
          safe.content || safe.contenu || null,
          safe.tags || [],
          safe.category || "general",
          safe.status || "active",
        ],
      );
      const { rows } = await pool.query("SELECT * FROM skills WHERE id=$1", [
        id,
      ]);
      const r = rows[0];
      json(201, {
        id: r.id,
        name: r.name,
        description: r.description,
        content: r.content,
        tags: r.tags,
        category: r.category,
        status: r.status,
      });
    });
  });

  router.patch(/^\/api\/skills\/([^/]+)$/, ({ json, body, params }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      const setClauses = [],
        vals = [params[1]];
      if (safe.name !== undefined)
        setClauses.push(`name=$${vals.push(safe.name)}`);
      if (safe.description !== undefined)
        setClauses.push(`description=$${vals.push(safe.description)}`);
      if (safe.content !== undefined)
        setClauses.push(`content=$${vals.push(safe.content)}`);
      if (safe.tags !== undefined)
        setClauses.push(`tags=$${vals.push(safe.tags)}`);
      if (safe.category !== undefined)
        setClauses.push(`category=$${vals.push(safe.category)}`);
      if (safe.status !== undefined)
        setClauses.push(`status=$${vals.push(safe.status)}`);
      if (setClauses.length > 0)
        await pool.query(
          `UPDATE skills SET ${setClauses.join(",")}, updated_at=NOW() WHERE id=$1`,
          vals,
        );
      const { rows } = await pool.query("SELECT * FROM skills WHERE id=$1", [
        params[1],
      ]);
      const r = rows[0];
      json(
        200,
        r
          ? {
              id: r.id,
              name: r.name,
              description: r.description,
              content: r.content,
              tags: r.tags,
              category: r.category,
              status: r.status,
            }
          : null,
      );
    });
  });

  router.delete(/^\/api\/skills\/([^/]+)$/, ({ json, params }) => {
    pool
      .query("DELETE FROM skills WHERE id=$1", [params[1]])
      .then(() => json(200, { ok: true }))
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Memory ────────────────────────────────────────────────────────────────

  router.get("/api/memory", ({ url, json }) => {
    const q = url.searchParams.get("q");
    if (q && q.length >= 2) {
      pool
        .query(
          `SELECT * FROM memory_docs WHERE titre ILIKE $1 OR content ILIKE $1 OR $1 = ANY(tags::text[]) ORDER BY updated_at DESC LIMIT 30`,
          [`%${q}%`],
        )
        .then(({ rows }) => {
          json(
            200,
            rows.map((r) => ({
              id: r.id,
              title: r.titre,
              type: r.type || "Document",
              content: r.content,
              chars: r.chars,
              tags: r.tags || [],
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            })),
          );
        })
        .catch((err) => json(500, { error: err.message }));
    } else {
      getAllMemoryDocs()
        .then((d) => json(200, d))
        .catch((err) => json(500, { error: err.message }));
    }
  });

  router.post("/api/memory", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "write")) return;
    validatedBody(schemas.createMemory, async (b) => {
      const id = `mem_${Date.now()}`;
      const safe = sanitizeObject(b);
      const chars = (safe.content || "").length;
      const embeddingVal = Array.isArray(safe.embedding)
        ? `[${safe.embedding.join(",")}]`
        : null;
      await pool.query(
        `INSERT INTO memory_docs (id, titre, content, chars, tags, embedding) VALUES ($1,$2,$3,$4,$5,$6::vector)`,
        [
          id,
          safe.title || safe.titre || null,
          safe.content || "",
          chars,
          safe.tags || [],
          embeddingVal,
        ],
      );
      const { rows } = await pool.query(
        "SELECT * FROM memory_docs WHERE id=$1",
        [id],
      );
      const r = rows[0];
      json(201, {
        id: r.id,
        title: r.titre,
        content: r.content,
        chars: r.chars,
        tags: r.tags,
        hasEmbedding: r.embedding !== null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    });
  });

  // Memory search (cosine similarity)
  router.post("/api/memory/search", ({ json, body }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      if (!Array.isArray(safe.embedding) || safe.embedding.length === 0)
        return json(400, { error: "embedding array requis" });
      const limit = Math.min(safe.limit || 5, 20);
      const vec = `[${safe.embedding.join(",")}]`;
      const { rows } = await pool.query(
        `
        SELECT id, titre, content, chars, tags, created_at,
               1 - (embedding <=> $1::vector) AS similarity
        FROM memory_docs WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector LIMIT $2
      `,
        [vec, limit],
      );
      json(
        200,
        rows.map((r) => ({
          id: r.id,
          title: r.titre,
          content: r.content,
          chars: r.chars,
          tags: r.tags,
          similarity: r.similarity,
          createdAt: r.created_at,
        })),
      );
    });
  });

  router.patch(/^\/api\/memory\/([^/]+)$/, ({ json, body, params }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      const setClauses = [],
        vals = [params[1]];
      if (safe.title !== undefined)
        setClauses.push(`titre=$${vals.push(safe.title)}`);
      if (safe.titre !== undefined)
        setClauses.push(`titre=$${vals.push(safe.titre)}`);
      if (safe.content !== undefined) {
        setClauses.push(`content=$${vals.push(safe.content)}`);
        setClauses.push(`chars=$${vals.push(safe.content.length)}`);
      }
      if (safe.tags !== undefined)
        setClauses.push(`tags=$${vals.push(safe.tags)}`);
      if (Array.isArray(safe.embedding))
        setClauses.push(
          `embedding=$${vals.push(`[${safe.embedding.join(",")}]`)}::vector`,
        );
      if (setClauses.length > 0)
        await pool.query(
          `UPDATE memory_docs SET ${setClauses.join(",")}, updated_at=NOW() WHERE id=$1`,
          vals,
        );
      const { rows } = await pool.query(
        "SELECT * FROM memory_docs WHERE id=$1",
        [params[1]],
      );
      const r = rows[0];
      json(
        200,
        r
          ? {
              id: r.id,
              title: r.titre,
              content: r.content,
              chars: r.chars,
              tags: r.tags,
              hasEmbedding: r.embedding !== null,
              updatedAt: r.updated_at,
            }
          : null,
      );
    });
  });

  router.delete(/^\/api\/memory\/([^/]+)$/, ({ json, params }) => {
    pool
      .query("DELETE FROM memory_docs WHERE id=$1", [params[1]])
      .then(() => json(200, { ok: true }))
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Security guardrails ───────────────────────────────────────────────────

  router.get("/api/security/guardrails", ({ json }) => {
    getAllGuardrails()
      .then((g) => json(200, g))
      .catch((err) => json(500, { error: err.message }));
  });

  router.patch(
    "/api/security/guardrails",
    ({ req, res, json, validatedBody }) => {
      if (!checkRateLimit(req, res, "write")) return;
      validatedBody(schemas.guardrails, async (b) => {
        await pool.query(
          `UPDATE guardrails SET enabled=$2, updated_at=NOW() WHERE id=$1`,
          [b.id, b.enabled],
        );
        const g = await getAllGuardrails();
        json(200, g);
      });
    },
  );

  // ── Security events ───────────────────────────────────────────────────────

  router.get("/api/security/events", ({ json }) => {
    pool
      .query(
        `
      SELECT ta.created_at AS ts, ta.type, ta.label, ta.message, ta.task_id, t.titre AS task_name
      FROM task_activities ta JOIN tasks t ON t.id = ta.task_id
      ORDER BY ta.created_at DESC LIMIT 40
    `,
      )
      .then(({ rows }) => {
        json(
          200,
          rows.map((r) => ({
            ts: r.ts,
            time: new Date(r.ts).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            type: r.type === "failed" ? "block" : "allow",
            desc: `${r.label || r.message || r.type} — ${r.task_name}`,
            reason:
              r.type === "launched"
                ? "Agent Exec"
                : r.type === "completed"
                  ? "Succès"
                  : r.type === "failed"
                    ? "Erreur"
                    : "Info",
            taskId: r.task_id,
          })),
        );
      })
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Suggest Model ─────────────────────────────────────────────────────────

  router.post("/api/suggest-model", ({ json, body }) => {
    body((b) => {
      const text = (
        (b.instructions || "") +
        " " +
        (b.name || "")
      ).toLowerCase();
      const routes = [
        {
          keywords: [
            "code",
            "script",
            "fonction",
            "function",
            "bug",
            "debug",
            "python",
            "javascript",
            "typescript",
            "api",
            "programme",
            "implement",
            "refactor",
            "sql",
            "regex",
            "algorithme",
            "unit test",
          ],
          model: "meta/llama-3.1-405b-instruct",
          reason: "code détecté",
        },
        {
          keywords: [
            "analyse",
            "analyze",
            "research",
            "rapport",
            "résumé",
            "summarize",
            "insight",
            "données",
            "data",
            "compare",
            "évalue",
            "audit",
            "benchmark",
            "synthèse",
          ],
          model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
          reason: "analyse détectée",
        },
        {
          keywords: [
            "rédige",
            "écris",
            "traduit",
            "email",
            "article",
            "blog",
            "contenu",
            "rédaction",
            "write",
            "letter",
            "documentation",
            "readme",
            "copywriting",
          ],
          model: "claude-sonnet-4-6",
          reason: "rédaction détectée",
        },
        {
          keywords: [
            "math",
            "calcul",
            "equation",
            "statistique",
            "formula",
            "calcule",
            "résoudre",
            "solve",
            "theorem",
            "probability",
            "intégrale",
            "dérivée",
          ],
          model: "deepseek-ai/deepseek-v3.2",
          reason: "maths/raisonnement détecté",
        },
      ];
      for (const { keywords, model, reason } of routes) {
        if (keywords.some((k) => text.includes(k)))
          return json(200, { model, reason });
      }
      json(200, {
        model: null,
        reason: "Aucun pattern détecté — sélection manuelle recommandée",
      });
    });
  });

  // ── Enhance Prompt ────────────────────────────────────────────────────────

  router.post("/api/enhance-prompt", ({ json, body }) => {
    body(async (b) => {
      const raw = (b.instructions || "").trim();
      if (!raw) return json(400, { error: "instructions required" });
      const { state, decryptKey, runAgenticLoop } = ctx;
      const hasKey =
        (state.apiKeys.anthropic && decryptKey(state.apiKeys.anthropic)) ||
        process.env.ANTHROPIC_API_KEY;
      if (hasKey) {
        const messages = [
          {
            role: "user",
            content: `Tu es un expert en prompt engineering. Améliore le prompt suivant en le rendant plus précis, structuré et efficace pour un agent IA. Conserve l'intention originale, ajoute du contexte utile, des étapes claires si nécessaire. Réponds UNIQUEMENT avec le prompt amélioré, sans commentaire ni explication.\n\nPrompt original :\n${raw}`,
          },
        ];
        const result = await runAgenticLoop(messages, "claude-sonnet-4-6", {});
        const msg = result.message || "";
        if (msg && !msg.includes("mode démo") && !msg.startsWith("❌"))
          return json(200, { enhanced: msg });
      }
      const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const verb = lines[0].split(" ")[0];
      const enhanced = `## Objectif\n${lines[0]}\n\n## Instructions détaillées\n${
        lines.slice(1).length
          ? lines
              .slice(1)
              .map((l) => `- ${l}`)
              .join("\n")
          : `- ${verb} de manière exhaustive et structurée\n- Produire un rapport clair et actionnable\n- Inclure les métriques clés et recommandations`
      }\n\n## Format de sortie\nRépondre en français, structuré avec des sections claires. Être concis et précis.`;
      json(200, { enhanced, demo: true });
    });
  });

  // ── Plugins install ───────────────────────────────────────────────────────

  router.post("/api/plugins/install", ({ json, body }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      const pkg = safe.pkg || safe.id;
      if (!pkg) return json(400, { error: "pkg requis" });
      const id = `plugin_${pkg.replace(/[^a-z0-9]/gi, "_")}`;
      await pool
        .query(
          `INSERT INTO skills (id, nom, description, tags, status, category)
         VALUES ($1,$2,$3,$4,'active','npm')
         ON CONFLICT (id) DO UPDATE SET status='active', updated_at=NOW()`,
          [
            id,
            safe.name || pkg,
            safe.description || `Plugin npm : ${pkg}`,
            ["plugin", "npm"],
          ],
        )
        .catch(() => {
          return pool.query(
            `INSERT INTO skills (id, nom, description, tags) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
            [
              id,
              safe.name || pkg,
              safe.description || `Plugin npm : ${pkg}`,
              ["plugin", "npm"],
            ],
          );
        });
      json(200, {
        ok: true,
        id,
        pkg,
        message: `Plugin "${pkg}" enregistré en base.`,
      });
    });
  });
}
