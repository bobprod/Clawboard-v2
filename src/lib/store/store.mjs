// ─── ImprovementStore — couche de stockage pluggable des savoirs améliorés ────
//
// Interface commune (3 backends interchangeables) :
//
//   getSkills({ agentId })          → liste des compétences d'un agent
//   getSkill(name, { agentId })     → une compétence
//   saveSkill(agentId, name, content, meta)
//   saveDirective(agentId, text, meta)   → SOUL.md (git/vault) ou règle (sql)
//   getRule(name) / setRule(name, value)
//   getProposals() / setProposalStatus(id, status, { approvedBy })
//
// Choix du backend :
//   - `sql`   : index de recherche rapide (PostgreSQL)
//   - `git`   : hub Git = vérité (SOUL.md / SKILL.md versionnés, rollback git)
//   - `vault` : vault Obsidian (connaissance humaine lisible/éditable)
//
// La configuration vient de l'environnement :
//   CLAWBOARD_IMPROVEMENT_STORE     = sql | git | vault
//   CLAWBOARD_IMPROVEMENT_REPO      = dépôt git cible (backend `git`)
//   CLAWBOARD_IMPROVEMENT_VAULT     = dossier du vault (backend `vault`)

export const STORE_BACKENDS = ["sql", "git", "vault"];

export const DEFAULT_STORE_CONFIG = {
  backend: process.env.CLAWBOARD_IMPROVEMENT_STORE || "sql",
  gitRepo: process.env.CLAWBOARD_IMPROVEMENT_REPO || "",
  vaultDir: process.env.CLAWBOARD_IMPROVEMENT_VAULT || "",
};

export function normalizeStoreConfig(cfg = {}) {
  const merged = { ...DEFAULT_STORE_CONFIG, ...(cfg || {}) };
  let backend = String(merged.backend || "sql").toLowerCase();
  if (!STORE_BACKENDS.includes(backend)) backend = "sql";
  return {
    ...merged,
    backend,
    gitRepo: merged.gitRepo || DEFAULT_STORE_CONFIG.gitRepo,
    vaultDir: merged.vaultDir || DEFAULT_STORE_CONFIG.vaultDir,
  };
}

/**
 * Instancie le backend demandé.
 *
 * @param {object} cfg { backend, gitRepo, vaultDir, pool }
 * @returns {Promise<object>} store conforme à l'interface ImprovementStore
 */
export async function getStore(cfg = {}) {
  const config = normalizeStoreConfig(cfg);
  switch (config.backend) {
    case "git": {
      const { createGitStore } = await import("./store_git.mjs");
      return createGitStore(config);
    }
    case "vault": {
      const { createVaultStore } = await import("./store_vault.mjs");
      return createVaultStore(config);
    }
    case "sql":
    default: {
      const { createSqlStore } = await import("./store_sql.mjs");
      return createSqlStore(config);
    }
  }
}

/** Contrat attendu d'un backend (utilisé par les tests de cohérence). */
export const STORE_CONTRACT = [
  "getSkills",
  "getSkill",
  "saveSkill",
  "saveDirective",
  "getRule",
  "setRule",
  "getProposals",
  "setProposalStatus",
];
