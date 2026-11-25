// ─── Backend Git — savoirs améliorés versionnés dans le hub Git ──────────────
//
// Le hub Git est la vérité (R6) : chaque compétence ou directive appliquée est
// un fichier versionné → diff lisible, rollback = `git revert`.
//
// Sûreté :
//   - jamais de `--force`, jamais de réécriture d'historique
//   - commit local uniquement (le push reste au sync du hub)
//   - dégradation propre en mode fichier si le dépôt n'est pas un dépôt git

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { createFileStore } from "./store_vault.mjs";

const execFileP = promisify(execFile);

async function git(args, cwd) {
  const { stdout, stderr } = await execFileP("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() };
}

export function createGitStore(config = {}) {
  const repo = config.gitRepo || config.root || "";
  const base = createFileStore({ ...config, root: repo, backend: "git" });
  let isRepo = false;
  let checked = false;

  async function ensureRepo() {
    if (checked) return isRepo;
    checked = true;
    if (!repo || !existsSync(repo)) {
      isRepo = false;
      return false;
    }
    try {
      const { stdout } = await git(["rev-parse", "--is-inside-work-tree"], repo);
      isRepo = stdout === "true";
    } catch {
      isRepo = false;
    }
    return isRepo;
  }

  async function commitPath(fileOrFiles, message) {
    const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles])
      .filter(Boolean);
    if (!files.length) return null;
    if (!(await ensureRepo())) return null;
    try {
      await git(["add", "--", ...files], repo);
      const { stdout: dirty } = await git(["status", "--porcelain"], repo);
      if (!dirty) return null;
      await git(["commit", "-m", message], repo);
      const { stdout: sha } = await git(["rev-parse", "HEAD"], repo);
      return sha || null;
    } catch {
      return null;
    }
  }

  return {
    ...base,
    backend: "git",
    repo,

    async isGitRepo() {
      return ensureRepo();
    },

    async saveSkill(agentId, name, content = "", meta = {}) {
      const res = await base.saveSkill(agentId, name, content, meta);
      const sha = await commitPath(
        [res.file, res.metaFile],
        `[clawboard] feat: compétence ${safeName(name)} pour ${agentId}`,
      );
      return { ...res, commitSha: sha, versioned: Boolean(sha) };
    },

    async saveDirective(agentId, text = "", meta = {}) {
      const res = await base.saveDirective(agentId, text, meta);
      const sha = await commitPath(
        res.file,
        `[clawboard] feat: directive pour ${agentId}`,
      );
      return { ...res, commitSha: sha, versioned: Boolean(sha) };
    },

    async setRule(name, value = {}) {
      const res = await base.setRule(name, value);
      const sha = await commitPath(
        res.file,
        `[clawboard] feat: règle ${name}`,
      );
      return { ...res, commitSha: sha, versioned: Boolean(sha) };
    },
  };
}

function safeName(value) {
  return String(value ?? "skill")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .slice(0, 80);
}
