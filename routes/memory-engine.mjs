// ─── Memory Engine (NemoClaw Advanced Memory Architecture) ──────────────────
// Inspired by: Bonsai Memory, Claude Code patterns, MemGPT, autoDream
//
// Architecture 3 couches :
//   1. INDEX (toujours chargé) — MEMORY.md = pointeurs ~150 chars/ligne
//   2. TOPICS (on-demand) — fichiers thématiques, chargés par grep/search
//   3. TRANSCRIPTS (jamais lus) — logs bruts, uniquement grep'd
//
// Features :
//   - autoDream : consolidation mémoire en background (merge, dédupe, prune)
//   - Sessions structurées : State, Task, Files, Errors, Learnings, Worklog
//   - File deduplication : ne relit pas les fichiers inchangés
//   - Staleness detection : mémoire vs réalité
//   - Context budget : limite stricte de tokens

const MEMORY_INDEX_FILE = "MEMORY.md";
const MAX_INDEX_LINES = 100;
const MAX_LINE_CHARS = 150;
const TOPIC_DIR = "memory/topics";
const SESSION_DIR = "memory/sessions";

// ─── In-memory session store ─────────────────────────────────────────────────

const activeSessions = new Map();
const fileHashes = new Map(); // path → hash (dedup)

function createSessionId() {
  return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(agentId = "main", taskId = null) {
  const id = createSessionId();
  const session = {
    id,
    agentId,
    taskId,
    createdAt: new Date().toISOString(),
    state: "active", // active | paused | completed
    title: "",
    currentTask: "",
    filesOpened: [], // { path, hash, lastRead }
    worklog: [], // { ts, action, detail }
    errors: [], // { ts, error, resolution }
    learnings: [], // string[]
    contextTokens: 0,
    lastActivity: new Date().toISOString(),
  };
  activeSessions.set(id, session);
  return session;
}

function getSession(id) {
  return activeSessions.get(id) || null;
}

function updateSession(id, updates) {
  const s = activeSessions.get(id);
  if (!s) return null;
  Object.assign(s, updates, { lastActivity: new Date().toISOString() });
  return s;
}

// ─── File Deduplication ──────────────────────────────────────────────────────

function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function isFileChanged(path, content) {
  const newHash = hashContent(content);
  const oldHash = fileHashes.get(path);
  fileHashes.set(path, newHash);
  return oldHash !== newHash;
}

// ─── Memory Index Operations ─────────────────────────────────────────────────

function parseMemoryIndex(content) {
  const entries = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Format: `- [topic] pointer text (→ filename.md)`
    const match = trimmed.match(
      /^[-*]\s*\[([^\]]+)\]\s*(.+?)(?:\s*→\s*(\S+))?$/,
    );
    if (match) {
      entries.push({
        topic: match[1],
        summary: match[2].trim(),
        file: match[3] || null,
      });
    } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      entries.push({
        topic: "general",
        summary: trimmed.slice(1).trim(),
        file: null,
      });
    }
  }
  return entries;
}

function buildMemoryIndex(entries) {
  // Enforce max lines and char limits
  const pruned = entries.slice(-MAX_INDEX_LINES).map((e) => {
    const summary =
      e.summary.length > MAX_LINE_CHARS
        ? e.summary.slice(0, MAX_LINE_CHARS - 3) + "…"
        : e.summary;
    return e.file
      ? `- [${e.topic}] ${summary} → ${e.file}`
      : `- [${e.topic}] ${summary}`;
  });
  return `# Memory Index\n\n${pruned.join("\n")}\n`;
}

// ─── autoDream: Background Memory Consolidation ──────────────────────────────

async function autoDream(pool) {
  try {
    // 1. Load current memory index
    const { rows } = await pool.query(
      `SELECT id, content FROM memory WHERE filename=$1 LIMIT 1`,
      [MEMORY_INDEX_FILE],
    );
    if (!rows.length) return { status: "no-index", actions: [] };

    const entries = parseMemoryIndex(rows[0].content);
    const actions = [];

    // 2. Deduplicate — remove entries with same topic+summary (keep latest)
    const seen = new Map();
    const deduped = [];
    for (const e of entries) {
      const key = `${e.topic}::${e.summary.toLowerCase().trim()}`;
      if (seen.has(key)) {
        actions.push({ type: "dedup", removed: e.summary });
      } else {
        seen.set(key, true);
        deduped.push(e);
      }
    }

    // 3. Prune — remove vague entries (< 20 chars with no file reference)
    const pruned = deduped.filter((e) => {
      if (e.summary.length < 20 && !e.file) {
        actions.push({ type: "prune", removed: e.summary });
        return false;
      }
      return true;
    });

    // 4. Merge — group topics and keep only latest N per topic
    const byTopic = new Map();
    for (const e of pruned) {
      if (!byTopic.has(e.topic)) byTopic.set(e.topic, []);
      byTopic.get(e.topic).push(e);
    }
    const merged = [];
    for (const [topic, items] of byTopic) {
      // Keep max 10 entries per topic
      if (items.length > 10) {
        const kept = items.slice(-10);
        const removed = items.length - 10;
        actions.push({ type: "merge", topic, removed });
        merged.push(...kept);
      } else {
        merged.push(...items);
      }
    }

    // 5. Truncate to max index lines
    const final = merged.slice(-MAX_INDEX_LINES);
    if (merged.length > MAX_INDEX_LINES) {
      actions.push({
        type: "truncate",
        removed: merged.length - MAX_INDEX_LINES,
      });
    }

    // 6. Write back
    const newContent = buildMemoryIndex(final);
    await pool.query(
      `UPDATE memory SET content=$1, updated_at=NOW() WHERE id=$2`,
      [newContent, rows[0].id],
    );

    return {
      status: "ok",
      before: entries.length,
      after: final.length,
      actions,
    };
  } catch (err) {
    return { status: "error", error: err.message, actions: [] };
  }
}

// ─── Context Budget Calculator ───────────────────────────────────────────────

function estimateTokens(text) {
  // ~4 chars per token for mixed content
  return Math.ceil((text || "").length / 4);
}

function buildContextBudget(session, memoryIndex, maxTokens = 8000) {
  const parts = [];
  let used = 0;

  // 1. Always include memory index (layer 1)
  const indexTokens = estimateTokens(memoryIndex);
  if (indexTokens < maxTokens * 0.3) {
    parts.push({
      type: "memory-index",
      content: memoryIndex,
      tokens: indexTokens,
    });
    used += indexTokens;
  }

  // 2. Session context (compact)
  if (session) {
    const sessionSummary = [
      `## Session: ${session.title || session.id}`,
      `State: ${session.state} | Agent: ${session.agentId}`,
      session.currentTask ? `Task: ${session.currentTask}` : "",
      session.errors.length ? `Errors: ${session.errors.length}` : "",
      session.learnings.length
        ? `Learnings: ${session.learnings.join("; ")}`
        : "",
      session.worklog.length ? `Steps: ${session.worklog.length}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const sessionTokens = estimateTokens(sessionSummary);
    if (used + sessionTokens < maxTokens * 0.5) {
      parts.push({
        type: "session",
        content: sessionSummary,
        tokens: sessionTokens,
      });
      used += sessionTokens;
    }
  }

  // 3. File references — only changed files get full content
  if (session?.filesOpened) {
    for (const f of session.filesOpened.slice(-5)) {
      // max 5 recent files
      const fileTokens = estimateTokens(f.preview || "");
      if (used + fileTokens < maxTokens * 0.8) {
        parts.push({ type: "file", path: f.path, tokens: fileTokens });
        used += fileTokens;
      }
    }
  }

  return {
    parts,
    totalTokens: used,
    budget: maxTokens,
    remaining: maxTokens - used,
  };
}

// ─── Subagent Fork System ────────────────────────────────────────────────────

function forkSubagent(parentSession, purpose) {
  const sub = createSession(
    parentSession.agentId + ":sub",
    parentSession.taskId,
  );
  sub.title = purpose;
  sub.state = "active";
  // Inherit parent context but isolate mutations
  sub.filesOpened = [...parentSession.filesOpened];
  sub.learnings = []; // subagent starts fresh on learnings
  sub.worklog = [
    {
      ts: new Date().toISOString(),
      action: "fork",
      detail: `Forked from ${parentSession.id}: ${purpose}`,
    },
  ];
  return sub;
}

function mergeSubagentResults(parentSession, subSession) {
  // Only merge learnings and worklog, not errors or files (isolation)
  parentSession.learnings.push(...subSession.learnings);
  parentSession.worklog.push({
    ts: new Date().toISOString(),
    action: "subagent-complete",
    detail: `${subSession.title}: ${subSession.learnings.length} learnings, ${subSession.worklog.length} steps`,
  });
  // Clean up
  activeSessions.delete(subSession.id);
  return parentSession;
}

// ─── Register Routes ─────────────────────────────────────────────────────────

export function register(router, ctx) {
  const { pool, checkRateLimit } = ctx;

  // GET /api/memory/engine/status — Memory engine status
  router.get("/api/memory/engine/status", ({ req, res, json }) => {
    json(200, {
      sessions: activeSessions.size,
      cachedFiles: fileHashes.size,
      indexMaxLines: MAX_INDEX_LINES,
      indexMaxChars: MAX_LINE_CHARS,
      features: [
        "3-layer-memory",
        "autoDream",
        "structured-sessions",
        "file-dedup",
        "subagent-fork",
        "context-budget",
      ],
    });
  });

  // GET /api/memory/engine/sessions — List active sessions
  router.get("/api/memory/engine/sessions", ({ req, res, json }) => {
    const sessions = [...activeSessions.values()].map((s) => ({
      id: s.id,
      agentId: s.agentId,
      taskId: s.taskId,
      state: s.state,
      title: s.title,
      worklogSize: s.worklog.length,
      errorsCount: s.errors.length,
      learningsCount: s.learnings.length,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    }));
    json(200, sessions);
  });

  // GET /api/memory/engine/sessions/:id — Get session detail
  router.get(
    /^\/api\/memory\/engine\/sessions\/([^/]+)$/,
    ({ res, json, params }) => {
      const session = getSession(params[1]);
      if (!session) return json(404, { error: "Session not found" });
      json(200, session);
    },
  );

  // POST /api/memory/engine/sessions — Create session
  router.post("/api/memory/engine/sessions", ({ req, res, json, body }) => {
    if (!checkRateLimit(req, res, "write")) return;
    body((b) => {
      const session = createSession(b.agentId || "main", b.taskId || null);
      if (b.title) session.title = b.title;
      json(201, session);
    });
  });

  // PATCH /api/memory/engine/sessions/:id — Update session
  router.patch(
    /^\/api\/memory\/engine\/sessions\/([^/]+)$/,
    ({ req, res, json, body, params }) => {
      if (!checkRateLimit(req, res, "write")) return;
      body((b) => {
        const updated = updateSession(params[1], b);
        if (!updated) return json(404, { error: "Session not found" });
        json(200, updated);
      });
    },
  );

  // POST /api/memory/engine/sessions/:id/worklog — Add worklog entry
  router.post(
    /^\/api\/memory\/engine\/sessions\/([^/]+)\/worklog$/,
    ({ req, res, json, body, params }) => {
      body((b) => {
        const s = getSession(params[1]);
        if (!s) return json(404, { error: "Session not found" });
        s.worklog.push({
          ts: new Date().toISOString(),
          action: b.action || "step",
          detail: b.detail || "",
        });
        s.lastActivity = new Date().toISOString();
        json(200, { ok: true, worklogSize: s.worklog.length });
      });
    },
  );

  // POST /api/memory/engine/sessions/:id/error — Log error
  router.post(
    /^\/api\/memory\/engine\/sessions\/([^/]+)\/error$/,
    ({ req, res, json, body, params }) => {
      body((b) => {
        const s = getSession(params[1]);
        if (!s) return json(404, { error: "Session not found" });
        s.errors.push({
          ts: new Date().toISOString(),
          error: b.error || "",
          resolution: b.resolution || "",
        });
        json(200, { ok: true, errorsCount: s.errors.length });
      });
    },
  );

  // POST /api/memory/engine/sessions/:id/learning — Add learning
  router.post(
    /^\/api\/memory\/engine\/sessions\/([^/]+)\/learning$/,
    ({ req, res, json, body, params }) => {
      body((b) => {
        const s = getSession(params[1]);
        if (!s) return json(404, { error: "Session not found" });
        const text = (b.text || "").slice(0, 200);
        if (text) s.learnings.push(text);
        json(200, { ok: true, learningsCount: s.learnings.length });
      });
    },
  );

  // POST /api/memory/engine/sessions/:id/fork — Fork subagent
  router.post(
    /^\/api\/memory\/engine\/sessions\/([^/]+)\/fork$/,
    ({ req, res, json, body, params }) => {
      body((b) => {
        const parent = getSession(params[1]);
        if (!parent) return json(404, { error: "Parent session not found" });
        const sub = forkSubagent(parent, b.purpose || "background work");
        json(201, sub);
      });
    },
  );

  // POST /api/memory/engine/sessions/:id/merge — Merge subagent results
  router.post(
    /^\/api\/memory\/engine\/sessions\/([^/]+)\/merge$/,
    ({ req, res, json, body, params }) => {
      body((b) => {
        const parent = getSession(params[1]);
        if (!parent) return json(404, { error: "Parent session not found" });
        const sub = getSession(b.subSessionId);
        if (!sub) return json(404, { error: "Sub-session not found" });
        const merged = mergeSubagentResults(parent, sub);
        json(200, merged);
      });
    },
  );

  // POST /api/memory/engine/autodream — Run memory consolidation
  router.post("/api/memory/engine/autodream", async ({ req, res, json }) => {
    if (!checkRateLimit(req, res, "write")) return;
    const result = await autoDream(pool);
    json(200, result);
  });

  // GET /api/memory/engine/context — Get context budget for session
  router.get(
    /^\/api\/memory\/engine\/context\/([^/]+)$/,
    async ({ res, json, params }) => {
      const session = getSession(params[1]);
      // Load memory index
      let indexContent = "";
      try {
        const { rows } = await pool.query(
          `SELECT content FROM memory WHERE filename=$1 LIMIT 1`,
          [MEMORY_INDEX_FILE],
        );
        if (rows.length) indexContent = rows[0].content;
      } catch {
        /* no index */
      }
      const budget = buildContextBudget(session, indexContent);
      json(200, budget);
    },
  );

  // POST /api/memory/engine/index/add — Add entry to memory index
  router.post("/api/memory/engine/index/add", ({ req, res, json, body }) => {
    if (!checkRateLimit(req, res, "write")) return;
    body(async (b) => {
      try {
        const { topic = "general", summary = "", file = null } = b;
        if (!summary) return json(400, { error: "summary required" });

        const { rows } = await pool.query(
          `SELECT id, content FROM memory WHERE filename=$1 LIMIT 1`,
          [MEMORY_INDEX_FILE],
        );
        const entries = rows.length ? parseMemoryIndex(rows[0].content) : [];
        entries.push({
          topic,
          summary: summary.slice(0, MAX_LINE_CHARS),
          file,
        });
        const newContent = buildMemoryIndex(entries);

        if (rows.length) {
          await pool.query(
            `UPDATE memory SET content=$1, updated_at=NOW() WHERE id=$2`,
            [newContent, rows[0].id],
          );
        } else {
          await pool.query(
            `INSERT INTO memory (id, filename, content, type, created_at, updated_at) VALUES ($1,$2,$3,'index',NOW(),NOW())`,
            [`mem_idx_${Date.now()}`, MEMORY_INDEX_FILE, newContent],
          );
        }
        json(200, { ok: true, entries: entries.length });
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });

  // POST /api/memory/engine/search — Search across memory layers
  router.post("/api/memory/engine/search", ({ req, res, json, body }) => {
    body(async (b) => {
      try {
        const query = (b.query || "").toLowerCase().trim();
        if (!query) return json(400, { error: "query required" });

        const results = { index: [], topics: [], transcripts: [] };

        // Layer 1: Search index
        const { rows: idxRows } = await pool
          .query(`SELECT content FROM memory WHERE filename=$1 LIMIT 1`, [
            MEMORY_INDEX_FILE,
          ])
          .catch(() => ({ rows: [] }));
        if (idxRows.length) {
          const entries = parseMemoryIndex(idxRows[0].content);
          results.index = entries.filter(
            (e) =>
              e.summary.toLowerCase().includes(query) ||
              e.topic.toLowerCase().includes(query),
          );
        }

        // Layer 2: Search topic files
        const { rows: topicRows } = await pool
          .query(
            `SELECT filename, content FROM memory WHERE type IN ('topic','note','document') AND LOWER(content) LIKE $1 LIMIT 10`,
            [`%${query}%`],
          )
          .catch(() => ({ rows: [] }));
        results.topics = topicRows.map((r) => ({
          file: r.filename,
          preview: extractRelevantLines(r.content, query, 3),
        }));

        // Layer 3: Search transcripts (lightweight — just count matches)
        const { rows: txRows } = await pool
          .query(
            `SELECT COUNT(*) as cnt FROM task_activities WHERE LOWER(message) LIKE $1`,
            [`%${query}%`],
          )
          .catch(() => ({ rows: [{ cnt: 0 }] }));
        results.transcripts = [{ matches: parseInt(txRows[0]?.cnt || 0) }];

        json(200, results);
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractRelevantLines(content, query, contextLines = 2) {
  const lines = (content || "").split("\n");
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(query)) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length, i + contextLines + 1);
      matches.push(lines.slice(start, end).join("\n"));
      if (matches.length >= 3) break; // max 3 snippets
    }
  }
  return matches.join("\n---\n");
}

// Export internals for use by chat routes
export const memoryEngine = {
  createSession,
  getSession,
  updateSession,
  forkSubagent,
  mergeSubagentResults,
  isFileChanged,
  estimateTokens,
  buildContextBudget,
  autoDream,
  parseMemoryIndex,
  buildMemoryIndex,
};
