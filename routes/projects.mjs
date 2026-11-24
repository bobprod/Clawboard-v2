// ─── Project Routes (regroupement de tâches façon Notion) ───────────────────
//
// GET    /api/projects            -> liste + compteurs de tâches
// POST   /api/projects            -> créer
// PATCH  /api/projects/:id        -> renommer / couleur / description / statut
// DELETE /api/projects/:id        -> supprimer (détache les tâches)

export function register(router, ctx) {
  const { pool, sanitizeObject, checkRateLimit } = ctx;

  async function projectWithCounts(id) {
    const [{ rows: proj }, { rows: counts }] = await Promise.all([
      pool.query(`SELECT * FROM projects WHERE id=$1`, [id]),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE statut IN ('completed','termine'))::int AS done
         FROM tasks WHERE project_id=$1`,
        [id],
      ),
    ]);
    const p = proj[0];
    if (!p) return null;
    return {
      id: p.id,
      nom: p.nom,
      name: p.nom,
      description: p.description,
      couleur: p.couleur,
      color: p.couleur,
      statut: p.statut,
      status: p.statut,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      taskCount: counts[0]?.total ?? 0,
      taskDone: counts[0]?.done ?? 0,
    };
  }

  router.get("/api/projects", async ({ json }) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.*,
           COUNT(t.id)::int AS task_count,
           COUNT(t.id) FILTER (WHERE t.statut IN ('completed','termine'))::int AS task_done
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
      );
      const out = rows.map((r) => ({
        id: r.id,
        nom: r.nom,
        name: r.nom,
        description: r.description,
        couleur: r.couleur,
        color: r.couleur,
        statut: r.statut,
        status: r.statut,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        taskCount: r.task_count,
        taskDone: r.task_done,
      }));
      json(200, out);
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  router.post("/api/projects", ({ req, res, json, body }) => {
    if (!checkRateLimit(req, res, "write")) return;
    body(async (raw) => {
      const safe = sanitizeObject(raw || {});
      const id = `prj_${Date.now()}`;
      const nom = String(safe.nom || safe.name || "Nouveau projet").slice(0, 200);
      await pool.query(
        `INSERT INTO projects (id, nom, description, couleur, statut) VALUES ($1,$2,$3,$4,$5)`,
        [
          id,
          nom,
          safe.description || null,
          safe.couleur || safe.color || "#8b5cf6",
          safe.statut || "actif",
        ],
      );
      json(201, await projectWithCounts(id));
    });
  });

  router.patch(/^\/api\/projects\/([^/]+)$/, ({ req, res, json, body, params }) => {
    if (!checkRateLimit(req, res, "write")) return;
    body(async (raw) => {
      const safe = sanitizeObject(raw || {});
      const sets = [];
      const vals = [params[1]];
      const map = [
        ["nom", safe.nom ?? safe.name],
        ["description", safe.description],
        ["couleur", safe.couleur ?? safe.color],
        ["statut", safe.statut ?? safe.status],
      ];
      for (const [col, val] of map) {
        if (val !== undefined) {
          vals.push(val);
          sets.push(`${col}=$${vals.length}`);
        }
      }
      if (sets.length) {
        sets.push(`updated_at=NOW()`);
        await pool.query(`UPDATE projects SET ${sets.join(", ")} WHERE id=$1`, vals);
      }
      json(200, await projectWithCounts(params[1]));
    });
  });

  router.delete(/^\/api\/projects\/([^/]+)$/, async ({ json, params }) => {
    try {
      await pool.query(`UPDATE tasks SET project_id=NULL WHERE project_id=$1`, [params[1]]);
      await pool.query(`DELETE FROM projects WHERE id=$1`, [params[1]]);
      json(200, { ok: true });
    } catch (err) {
      json(500, { error: err.message });
    }
  });
}
