// ─── Backend Vault — savoirs améliorés dans le vault Obsidian ─────────────────
//
// Layout :
//   <vault>/agents/<agentId>/SOUL.md          → directives comportementales
//   <vault>/agents/<agentId>/skills/<name>.md → compétences (SKILL.md)
//   <vault>/agents/<agentId>/skills/<name>.meta.json → métadonnées
//   <vault>/rules/<name>.json                  → règles globales
//
// Les propositions (workflows) restent dans PostgreSQL : le vault porte les
// savoirs, la base porte le processus.

import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve, sep } from "path";
import { sha256 } from "./provenance.mjs";

/** Neutralise tout caractère dangereux dans un segment de chemin. */
export function safeSegment(value, fallback = "unnamed") {
  const s = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return s || fallback;
}

/** Empêche toute sortie du dossier racine. */
export function safeJoin(root, ...segments) {
  const base = resolve(root);
  const target = resolve(base, ...segments.map((s) => safeSegment(s)));
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error("Chemin hors du dossier autorisé");
  }
  return target;
}

async function readJson(file, fallback = null) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

/**
 * Store fichiers (base du backend vault).
 * @param {{ root: string, backend?: string, pool?: any }} config
 */
export function createFileStore(config = {}) {
  const root = config.root || config.vaultDir || "";
  const backend = config.backend || "vault";
  let pool = config.pool || null;
  let ready = false;

  async function getPool() {
    if (!pool) {
      const mod = await import("../../db/client.js");
      pool = mod.default;
    }
    return pool;
  }

  async function ensureDirs() {
    if (!root) throw new Error("Aucun dossier cible pour le store fichiers");
    await mkdir(join(root, "agents"), { recursive: true });
    await mkdir(join(root, "rules"), { recursive: true });
    ready = true;
  }

  function agentDir(agentId) {
    return safeJoin(root, "agents", safeSegment(agentId, "global"));
  }

  function skillsDir(agentId) {
    return safeJoin(root, "agents", safeSegment(agentId, "global"), "skills");
  }

  async function ensureReady() {
    if (!ready) await ensureDirs();
  }

  return {
    backend,
    root,

    async getSkills({ agentId } = {}) {
      await ensureReady();
      const dir = skillsDir(agentId);
      if (!existsSync(dir)) return [];
      const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
      const out = [];
      for (const file of files) {
        const name = file.replace(/\.md$/, "");
        const content = await readFile(join(dir, file), "utf8");
        const meta = (await readJson(join(dir, `${name}.meta.json`), {})) || {};
        out.push({
          agentId,
          name,
          content,
          metadata: meta,
          version: meta.version || 1,
          hash: sha256(content),
          updatedAt: meta.updatedAt || null,
        });
      }
      return out;
    },

    async getSkill(name, { agentId } = {}) {
      await ensureReady();
      const file = join(skillsDir(agentId), `${safeSegment(name)}.md`);
      if (!existsSync(file)) return null;
      const content = await readFile(file, "utf8");
      const meta =
        (await readJson(
          join(skillsDir(agentId), `${safeSegment(name)}.meta.json`),
          {},
        )) || {};
      return {
        agentId,
        name: safeSegment(name),
        content,
        metadata: meta,
        version: meta.version || 1,
        hash: sha256(content),
        updatedAt: meta.updatedAt || null,
      };
    },

    async saveSkill(agentId, name, content = "", meta = {}) {
      await ensureReady();
      const dir = skillsDir(agentId);
      await mkdir(dir, { recursive: true });
      const safeName = safeSegment(name, "skill");
      const body = String(content ?? "");
      const file = join(dir, `${safeName}.md`);
      const previous = existsSync(file) ? await readFile(file, "utf8") : null;
      const version =
        Number(
          (await readJson(join(dir, `${safeName}.meta.json`), {}))?.version || 0,
        ) + 1;
      await writeFile(file, body, "utf8");
      const metadata = {
        ...(meta || {}),
        agentId,
        name: safeName,
        version,
        hash: sha256(body),
        updatedAt: new Date().toISOString(),
      };
      await writeJson(join(dir, `${safeName}.meta.json`), metadata);
      return { ...metadata, content: body, previous, file, metaFile: join(dir, `${safeName}.meta.json`) };
    },

    async saveDirective(agentId, text = "", meta = {}) {
      await ensureReady();
      const dir = agentDir(agentId);
      await mkdir(dir, { recursive: true });
      const soulFile = join(dir, "SOUL.md");
      const marker = `<!-- improvement:${safeSegment(meta?.proposalId || "directive")} -->`;
      let current = existsSync(soulFile) ? await readFile(soulFile, "utf8") : "";
      // Retrait de la section précédente (idempotence + rollback simple)
      current = current
        .split("\n")
        .filter((line) => line.trim() !== marker)
        .join("\n")
        .trimEnd();
      const block = [
        "",
        marker,
        `<!-- actor: ${String(meta?.actor || "system").replace(/[<>]/g, "")} -->`,
        `<!-- hash: ${sha256(String(text ?? ""))} -->`,
        "",
        String(text ?? "").trim(),
      ].join("\n");
      const next = `${current}${current ? "\n" : ""}${block}\n`;
      await writeFile(soulFile, next, "utf8");
      return {
        agentId,
        file: soulFile,
        content: next,
        hash: sha256(next),
        proposalId: meta?.proposalId || null,
      };
    },

    async getRule(name) {
      await ensureReady();
      const file = join(root, "rules", `${safeSegment(name)}.json`);
      const payload = await readJson(file, null);
      if (!payload) return null;
      return {
        name,
        value: payload,
        version: payload.version ?? 1,
        updatedAt: payload.updatedAt ?? null,
        file,
      };
    },

    async setRule(name, value = {}) {
      await ensureReady();
      const file = join(root, "rules", `${safeSegment(name)}.json`);
      const previous = (await readJson(file, null)) || {};
      const payload = {
        ...(typeof value === "object" && value !== null ? value : { value }),
        version: Number(previous.version || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await writeJson(file, payload);
      return {
        name,
        value: payload,
        version: payload.version,
        updatedAt: payload.updatedAt,
        file,
      };
    },

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

export function createVaultStore(config = {}) {
  return createFileStore({ ...config, backend: "vault" });
}
