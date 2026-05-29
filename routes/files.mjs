// ─── File Operations Routes ─────────────────────────────────────────────────
// Workspace file browsing, reading, writing, and git diff preview.

import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve, extname, dirname } from "path";
import { homedir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = join(homedir(), ".openclaw", "workspace");

const ALLOWED_READ_EXT = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".pdf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
  ".js", ".ts", ".tsx", ".jsx", ".py", ".sh", ".rb", ".go", ".rs",
  ".java", ".c", ".cpp", ".h", ".css", ".scss", ".html", ".xml",
  ".toml", ".ini", ".cfg", ".conf", ".sql", ".graphql", ".env",
  ".log", ".diff", ".patch", ".mjs", ".mdx", ".markdown",
]);

const BLOCKED_WRITE_EXT = new Set([
  ".exe", ".bat", ".cmd", ".ps1", ".msi", ".dll", ".com", ".scr",
  ".sh", ".bash", ".zsh", ".fish", ".csh", ".ksh",
]);

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".pdf",
]);

const MAX_READ_SIZE = 512 * 1024; // 512 KB

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizePath(p) {
  const normalized = p.replace(/^\/+/, "").replace(/\.\./g, "");
  const resolved = resolve(WORKSPACE_ROOT, normalized);
  if (!resolved.startsWith(resolve(WORKSPACE_ROOT))) {
    return null;
  }
  return resolved;
}

async function buildTree(dir, relativeTo) {
  const entries = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const fullPath = join(dir, item.name);
      const relPath = fullPath
        .replace(relativeTo + "/", "")
        .replace(relativeTo + "\\", "");
      if (item.isDirectory()) {
        const children = await buildTree(fullPath, relativeTo);
        entries.push({
          name: item.name,
          path: relPath.replace(/\\/g, "/"),
          type: "directory",
          children,
        });
      } else {
        const s = await stat(fullPath).catch(() => null);
        entries.push({
          name: item.name,
          path: relPath.replace(/\\/g, "/"),
          type: "file",
          size: s?.size || 0,
          modified: s?.mtime?.toISOString() || null,
        });
      }
    }
  } catch {
    // directory doesn't exist
  }
  return entries;
}

// ─── Register Routes ─────────────────────────────────────────────────────────

export function register(router) {
  mkdir(WORKSPACE_ROOT, { recursive: true }).catch(() => {});

  // ── GET /api/files — list workspace files ──────────────────────────────────

  router.get("/api/files", async ({ json }) => {
    try {
      await mkdir(WORKSPACE_ROOT, { recursive: true });
      const tree = await buildTree(WORKSPACE_ROOT, WORKSPACE_ROOT);
      json(200, tree);
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // ── GET /api/files/diff/* — git diff for a specific file ───────────────────
  // NOTE: Must be registered BEFORE the catch-all GET /api/files/*

  router.get(/^\/api\/files\/diff\/(.+)$/, async ({ json, params }) => {
    const filePath = params[1];
    if (!filePath) return json(400, { error: "Missing file path" });

    const safe = sanitizePath(filePath);
    if (!safe) return json(403, { error: "Path traversal blocked" });

    try {
      const { stdout } = await execFileAsync("git", [
        "diff",
        "--no-color",
        "--",
        safe,
      ], {
        cwd: WORKSPACE_ROOT,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });

      json(200, { diff: stdout || "", path: filePath });
    } catch {
      json(200, { diff: "", path: filePath, note: "No git diff available" });
    }
  });

  // ── GET /api/files/* — read file content ───────────────────────────────────

  router.get(/^\/api\/files\/(.+)$/, async ({ json, params }) => {
    const filePath = params[1];
    if (!filePath) return json(400, { error: "Missing file path" });

    const safe = sanitizePath(filePath);
    if (!safe) return json(403, { error: "Path traversal blocked" });

    const ext = extname(safe).toLowerCase();
    if (!ALLOWED_READ_EXT.has(ext) && ext !== "") {
      return json(403, { error: "Extension " + ext + " not allowed" });
    }

    try {
      const s = await stat(safe);
      if (s.size > MAX_READ_SIZE) {
        return json(413, { error: "File too large (max 512KB)" });
      }

      if (BINARY_EXTS.has(ext)) {
        const buf = await readFile(safe);
        json(200, {
          content: buf.toString("base64"),
          encoding: "base64",
          path: filePath,
          size: s.size,
        });
      } else {
        const content = await readFile(safe, "utf-8");
        json(200, {
          content,
          encoding: "utf-8",
          path: filePath,
          size: s.size,
        });
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        json(404, { error: "File not found" });
      } else {
        json(500, { error: err.message });
      }
    }
  });

  // ── PUT /api/files/* — write file content ──────────────────────────────────

  router.put(/^\/api\/files\/(.+)$/, async ({ json, body, params }) => {
    const filePath = params[1];
    if (!filePath) return json(400, { error: "Missing file path" });

    const safe = sanitizePath(filePath);
    if (!safe) return json(403, { error: "Path traversal blocked" });

    const ext = extname(safe).toLowerCase();
    if (BLOCKED_WRITE_EXT.has(ext)) {
      return json(403, { error: "Extension " + ext + " blocked for writes" });
    }

    body(async (parsed) => {
      const { content } = parsed;
      if (typeof content !== "string") {
        return json(400, { error: "Missing 'content' string" });
      }

      if (Buffer.byteLength(content, "utf-8") > MAX_READ_SIZE) {
        return json(413, { error: "Content too large (max 512KB)" });
      }

      try {
        await mkdir(dirname(safe), { recursive: true });
        await writeFile(safe, content, "utf-8");
        const s = await stat(safe);
        json(200, {
          ok: true,
          path: filePath,
          size: s.size,
          modified: s.mtime.toISOString(),
        });
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });
}
