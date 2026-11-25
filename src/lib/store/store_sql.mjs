// ─── Backend SQL — index rapide des savoirs améliorés (PostgreSQL) ───────────
//
// PostgreSQL sert d'index de recherche (Lia cherche vite) ; la vérité
// versionnée reste dans le hub Git si le backend `git` est choisi.
//
// Tables dédiées (créées à la demande, idempotentes) :
//   agent_skills  → compétences (SKILL.md équivalent)
//   agent_rules   → directives comportementales (SOUL.md équivalent)

import { randomUUID } from "crypto";
import { sha256 } from "./provenance.mjs";

export async function ensureStoreTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_skills (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (agent_id, name)
    );

    CREATE TABLE IF NOT EXISTS agent_rules (
      name TEXT PRIMARY KEY,
      agent_id TEXT,
      value JSONB NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
  `);
}

function rowToSkill(row) {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    content: row.content,
    metadata: row.metadata || {},
    version: row.version,
    hash: sha256(row.content || ""),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqlStore(config = {}) {
  let pool = config.pool || null;
  let ready = false;

  async function getPool() {
    if (!pool) {
      const mod = await import("../../db/client.js");
      pool = mod.default;
    }
    if (!ready) {
      await ensureStoreTables(pool);
      ready = true;
    }
    return pool;
  }

  return {
    backend: "sql",

    async getSkills({ agentId } = {}) {
      const p = await getPool();
      const { rows } = await p.query(
        agentId
          ? `SELECT * FROM agent_skills WHERE agent_id = $1 ORDER BY name`
          : `SELECT * FROM agent_skills ORDER BY agent_id, name`,
        agentId ? [agentId] : [],
      );
      return rows.map(rowToSkill);
    },

    async getSkill(name, { agentId } = {}) {
      const p = await getPool();
      const { rows } = await p.query(
        agentId
          ? `SELECT * FROM agent_skills WHERE name = $1 AND agent_id = $2`
          : `SELECT * FROM agent_skills WHERE name = $1 ORDER BY updated_at DESC LIMIT 1`,
        agentId ? [name, agentId] : [name],
      );
      return rows[0] ? rowToSkill(rows[0]) : null;
    },

    async saveSkill(agentId, name, content = "", meta = {}) {
      const p = await getPool();
      const metadata = { ...(meta || {}) };
      const { rows } = await p.query(
        `INSERT INTO agent_skills (id, agent_id, name, content, metadata, version)
         VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT (agent_id, name) DO UPDATE
           SET content = EXCLUDED.content,
               metadata = EXCLUDED.metadata,
               version = agent_skills.version + 1,
               updated_at = NOW()
         RETURNING *`,
        [randomUUID(), agentId, name, String(content ?? ""), metadata],
      );
      return rowToSkill(rows[0]);
    },

    async saveDirective(agentId, text = "", meta = {}) {
      const p = await getPool();
      const name = `directive:${agentId}`;
      const value = { ...(meta || {}), text: String(text ?? "") };
      const { rows } = await p.query(
        `INSERT INTO agent_rules (name, agent_id, value, version)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (name) DO UPDATE
           SET value = EXCLUDED.value,
               agent_id = EXCLUDED.agent_id,
               version = agent_rules.version + 1,
               updated_at = NOW()
         RETURNING *`,
        [name, agentId, value],
      );
      return {
        name,
        agentId,
        value: rows[0].value,
        version: rows[0].version,
        updatedAt: rows[0].updated_at,
      };
    },

    async getRule(name) {
      const p = await getPool();
      const { rows } = await p.query(
        `SELECT * FROM agent_rules WHERE name = $1`,
        [name],
      );
      if (!rows[0]) return null;
      return {
        name: rows[0].name,
        agentId: rows[0].agent_id,
        value: rows[0].value,
        version: rows[0].version,
        updatedAt: rows[0].updated_at,
      };
    },

    async setRule(name, value = {}) {
      const p = await getPool();
      const { rows } = await p.query(
        `INSERT INTO agent_rules (name, agent_id, value, version)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (name) DO UPDATE
           SET value = EXCLUDED.value,
               agent_id = COALESCE(EXCLUDED.agent_id, agent_rules.agent_id),
               version = agent_rules.version + 1,
               updated_at = NOW()
         RETURNING *`,
        [name, value?.agentId ?? null, value || {}],
      );
      return {
        name: rows[0].name,
        agentId: rows[0].agent_id,
        value: rows[0].value,
        version: rows[0].version,
        updatedAt: rows[0].updated_at,
      };
    },

    // Les propositions restent dans PostgreSQL (source de vérité des workflows),
    // quel que soit le backend des savoirs.
    async getProposals() {
      const p = await getPool();
      const { rows } = await p.query(
        `SELECT id, agent_id, trigger_pattern, counts, payload, status,
                proposed_at, expires, mode
         FROM improvement_proposals
         ORDER BY proposed_at DESC, id ASC`,
      );
      return rows;
    },

    async setProposalStatus(id, status, { approvedBy = null } = {}) {
      const p = await getPool();
      const { rows } = await p.query(
        `UPDATE improvement_proposals
            SET status = $2,
                approved_by = COALESCE($3, approved_by),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, status, approvedBy],
      );
      return rows[0] || null;
    },
  };
}
