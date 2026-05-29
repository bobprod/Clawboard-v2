// ─── Skills Routes (builtin + custom, enable/disable) ───────────────────────
import { createLogger } from "../src/lib/logger.mjs";
import { SkillLoader } from "../src/lib/llm/skill-loader.mjs";
import { resolve } from "path";

const log = createLogger("skills");

let skillLoader = null;

function getLoader() {
  if (!skillLoader) {
    skillLoader = new SkillLoader({
      skillsDir: resolve("skills"),
      hotReload: true,
    });
  }
  return skillLoader;
}

export function register(router, ctx) {
  const { pool, getAllSkills, sanitizeObject, checkRateLimit } = ctx;

  // GET /api/skills — list all skills (builtin from filesystem + custom from DB)
  router.get("/api/skills", async ({ json }) => {
    try {
      // Load filesystem skills
      const loader = getLoader();
      const { skills: builtinSkills, errors } = await loader.load();

      // Load DB skills (custom)
      let dbSkills = [];
      try {
        dbSkills = await getAllSkills();
      } catch { /* DB may not have skills table yet */ }

      // Merge: builtin skills first, then DB custom skills
      // DB skills override builtin if same name
      const merged = new Map();
      for (const s of builtinSkills) {
        merged.set(s.name, {
          id: `skill_${s.name}`,
          name: s.name,
          version: s.version,
          description: s.description,
          type: s.type,
          tools: s.tools,
          prompt_template: s.prompt_template,
          inputs: s.inputs,
          outputs: s.outputs,
          tags: s.tags,
          author: s.author,
          status: s.enabled ? "active" : "inactive",
          source: "builtin",
        });
      }
      for (const s of dbSkills) {
        const existing = merged.get(s.name);
        merged.set(s.name, {
          id: s.id || `skill_${s.name}`,
          name: s.name,
          description: s.description || existing?.description || "",
          content: s.content || "",
          status: s.status || existing?.status || "active",
          category: s.category || "local",
          tags: s.tags || existing?.tags || [],
          version: existing?.version || "1.0.0",
          type: existing?.type || "custom",
          tools: existing?.tools || [],
          source: s.category === "local" ? "local" : "custom",
        });
      }

      json(200, Array.from(merged.values()));
    } catch (err) {
      log.error("GET /api/skills failed", { error: err.message });
      json(500, { error: err.message });
    }
  });

  // GET /api/skills/:name — get skill details
  router.get(/^\/api\/skills\/([^/]+)$/, async ({ params, json }) => {
    const name = decodeURIComponent(params[0]);
    try {
      const loader = getLoader();
      await loader.load();
      const skill = loader.get(name);
      if (skill) {
        return json(200, {
          id: `skill_${skill.name}`,
          name: skill.name,
          version: skill.version,
          description: skill.description,
          type: skill.type,
          tools: skill.tools,
          prompt_template: skill.prompt_template,
          inputs: skill.inputs,
          outputs: skill.outputs,
          tags: skill.tags,
          author: skill.author,
          status: skill.enabled ? "active" : "inactive",
          source: "builtin",
        });
      }

      // Try DB
      try {
        const { rows } = await pool.query(
          "SELECT * FROM skills WHERE name=$1 OR id=$1 LIMIT 1",
          [name],
        );
        if (rows[0]) {
          const r = rows[0];
          return json(200, {
            id: r.id,
            name: r.name || r.nom,
            description: r.description || "",
            content: r.content || r.contenu || "",
            status: r.status || "active",
            category: r.category || "local",
            tags: r.tags || [],
            source: "custom",
          });
        }
      } catch { /* DB error */ }

      json(404, { error: `Skill "${name}" not found` });
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // POST /api/skills/:name/enable — enable skill for current session
  router.post(/^\/api\/skills\/([^/]+)\/enable$/, async ({ params, json }) => {
    const name = decodeURIComponent(params[0]);
    try {
      const loader = getLoader();
      await loader.load();
      if (loader.get(name)) {
        loader.setEnabled(name, true);
        return json(200, { ok: true, name, status: "active" });
      }
      // Try DB
      try {
        await pool.query(
          "UPDATE skills SET status='active' WHERE name=$1 OR id=$1",
          [name],
        );
      } catch { /* ignore */ }
      json(200, { ok: true, name, status: "active" });
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // POST /api/skills/:name/disable — disable skill
  router.post(/^\/api\/skills\/([^/]+)\/disable$/, async ({ params, json }) => {
    const name = decodeURIComponent(params[0]);
    try {
      const loader = getLoader();
      await loader.load();
      if (loader.get(name)) {
        loader.setEnabled(name, false);
        return json(200, { ok: true, name, status: "inactive" });
      }
      try {
        await pool.query(
          "UPDATE skills SET status='inactive' WHERE name=$1 OR id=$1",
          [name],
        );
      } catch { /* ignore */ }
      json(200, { ok: true, name, status: "inactive" });
    } catch (err) {
      json(500, { error: err.message });
    }
  });
}
