// ─── Workspace + Browser Routes ──────────────────────────────────────────────
// File tree browsing, upload, preview, and browser control via MCP Playwright.

import { readdir, stat, readFile, mkdir, writeFile } from "fs/promises";
import { join, resolve, extname, basename } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

const WORKSPACE_ROOT = join(homedir(), ".openclaw", "workspace");
const UPLOAD_ROOT = join(WORKSPACE_ROOT, "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".js",
  ".ts",
  ".py",
  ".sh",
  ".html",
  ".css",
  ".log",
  ".diff",
  ".xml",
  ".toml",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildTree(dir, relativeTo) {
  const entries = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
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
    // directory doesn't exist yet
  }
  return entries;
}

function sanitizePath(p) {
  // Prevent path traversal
  const resolved = resolve(WORKSPACE_ROOT, p);
  if (!resolved.startsWith(resolve(WORKSPACE_ROOT))) {
    return null;
  }
  return resolved;
}

// ─── Register Routes ─────────────────────────────────────────────────────────

export function register(router, ctx) {
  // ── Workspace tree ──────────────────────────────────────────────────────

  router.get("/api/workspace/tree", async ({ json }) => {
    try {
      // Ensure workspace exists
      await mkdir(WORKSPACE_ROOT, { recursive: true });
      // Ensure subdirs exist
      for (const sub of [
        "agents",
        "tasks",
        "reports",
        "uploads/global",
        "uploads/lia",
      ]) {
        await mkdir(join(WORKSPACE_ROOT, sub), { recursive: true });
      }
      const tree = await buildTree(WORKSPACE_ROOT, WORKSPACE_ROOT);
      json(200, tree);
    } catch (err) {
      json(500, { error: err.message });
    }
  });

  // ── File preview ────────────────────────────────────────────────────────

  router.get(/^\/api\/workspace\/file/, async ({ json, url, req, res }) => {
    const urlObj = new URL(url, "http://localhost");
    const filePath = urlObj.searchParams.get("path");
    if (!filePath) return json(400, { error: "Missing path param" });

    const safe = sanitizePath(filePath);
    if (!safe) return json(403, { error: "Path traversal blocked" });

    try {
      const content = await readFile(safe, "utf-8");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(content);
    } catch {
      json(404, { error: "File not found" });
    }
  });

  // ── File upload (multipart) ─────────────────────────────────────────────

  router.post("/api/workspace/upload", async ({ req, res, json }) => {
    // Simple multipart parser (no external deps)
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return json(400, { error: "Expected multipart/form-data" });
    }

    const boundary = contentType.split("boundary=")[1];
    if (!boundary) return json(400, { error: "Missing boundary" });

    const chunks = [];
    let totalSize = 0;

    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_FILE_SIZE) {
          req.destroy();
          return reject(new Error("File too large (max 10MB)"));
        }
        chunks.push(chunk);
      });
      req.on("end", resolve);
      req.on("error", reject);
    }).catch((err) => {
      return json(413, { error: err.message });
    });

    const buf = Buffer.concat(chunks);
    const parts = parseMultipart(buf, boundary);

    const scope =
      parts.find((p) => p.name === "scope")?.data?.toString() || "global";
    const targetId =
      parts.find((p) => p.name === "targetId")?.data?.toString() || "";
    const files = parts.filter((p) => p.filename);

    if (files.length === 0) return json(400, { error: "No files" });

    // Determine target directory
    let targetDir;
    switch (scope) {
      case "task":
        targetDir = join(UPLOAD_ROOT, "tasks", targetId || "misc");
        break;
      case "agent":
        targetDir = join(UPLOAD_ROOT, "agents", targetId || "main");
        break;
      case "lia":
        targetDir = join(UPLOAD_ROOT, "lia");
        break;
      default:
        targetDir = join(UPLOAD_ROOT, "global");
    }

    // Validate target dir is within workspace
    const safeDir = resolve(targetDir);
    if (!safeDir.startsWith(resolve(WORKSPACE_ROOT))) {
      return json(403, { error: "Invalid upload target" });
    }

    await mkdir(targetDir, { recursive: true });

    const results = [];
    for (const file of files) {
      const ext = extname(file.filename).toLowerCase();
      const safeName = basename(file.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!ALLOWED_EXT.has(ext) && ext !== "") {
        results.push({
          name: file.filename,
          error: `Extension ${ext} non autorisée`,
        });
        continue;
      }
      const dest = join(targetDir, safeName);
      // Prevent overwrite of existing system files
      if (!resolve(dest).startsWith(resolve(targetDir))) {
        results.push({ name: file.filename, error: "Invalid filename" });
        continue;
      }
      await writeFile(dest, file.data);
      results.push({ name: safeName, size: file.data.length, ok: true });
    }

    json(200, { ok: true, uploaded: results });
  });

  // ── Browser connect/disconnect/action (MCP relay) ───────────────────────

  router.post("/api/browser/connect", async ({ json, body }) => {
    body(async (b) => {
      // Try to call MCP Playwright browser_navigate as a connection test
      try {
        const mcpEntry = ctx.state?.mcpProcesses?.get?.("playwright");
        if (mcpEntry) {
          json(200, { ok: true, method: "mcp" });
          return;
        }
      } catch {
        /* */
      }
      // Fallback: demo mode
      json(200, { ok: true, method: "demo" });
    });
  });

  router.post("/api/browser/disconnect", ({ json }) => {
    json(200, { ok: true });
  });

  router.post("/api/browser/action", async ({ json, body }) => {
    body(async (b) => {
      const { type, params } = b;
      if (!type) return json(400, { error: "Missing action type" });

      // Try MCP Playwright if available
      // This would relay to the MCP server's tools
      // For now, return demo response
      const result = { ok: true, result: `Action ${type} exécutée (demo)` };
      if (type === "screenshot") {
        result.screenshot = null; // Would be base64 from Playwright
      }
      json(200, result);
    });
  });
}

// ─── Minimal multipart parser ────────────────────────────────────────────────

function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let pos = 0;

  while (pos < buf.length) {
    const start = buf.indexOf(delim, pos);
    if (start === -1) break;

    const nextStart = buf.indexOf(delim, start + delim.length + 2);
    if (
      nextStart === -1 &&
      !buf.includes(Buffer.from(`--${boundary}--`), start + delim.length)
    )
      break;

    const partEnd = nextStart !== -1 ? nextStart : buf.length;
    const partBuf = buf.slice(start + delim.length + 2, partEnd);

    // Split headers from body
    const headerEnd = partBuf.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      pos = partEnd;
      continue;
    }

    const headerStr = partBuf.slice(0, headerEnd).toString();
    const bodyBuf = partBuf.slice(headerEnd + 4, partBuf.length - 2); // strip trailing \r\n

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch?.[1] || null,
        data: bodyBuf,
      });
    }

    pos = partEnd;
  }

  return parts;
}
