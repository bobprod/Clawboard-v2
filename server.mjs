import http from "http";
import os from "os";
import crypto from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  mkdirSync,
} from "fs";
import {
  join as pathJoin,
  extname,
  dirname,
  resolve as pathResolve,
} from "path";
import { fileURLToPath } from "url";
import { spawn, exec } from "child_process";
import pool, { checkConnection } from "./src/db/client.js";
import {
  pub as redisClient,
  connectRedis,
  cacheGet,
  cacheSet,
  cacheDel,
} from "./src/lib/redis.js";
import { validate, schemas } from "./src/lib/validate.mjs";
import { checkRateLimit } from "./src/lib/rateLimit.mjs";
import { createLogger } from "./src/lib/logger.mjs";

// ─── Modular Router ───────────────────────────────────────────────────────────
import { Router } from "./routes/router.mjs";
import { register as registerHealthRoutes } from "./routes/health.mjs";
import { register as registerTaskRoutes } from "./routes/tasks.mjs";
import { register as registerResourceRoutes } from "./routes/resources.mjs";
import { register as registerChatRoutes } from "./routes/chat.mjs";
import { register as registerSecurityRoutes } from "./routes/security.mjs";
import { register as registerSettingsRoutes } from "./routes/settings.mjs";
import { register as registerNemoClawRoutes } from "./routes/nemoclaw.mjs";
import { register as registerToolRoutes } from "./routes/tools.mjs";
import { register as registerConnectorRoutes } from "./routes/connectors.mjs";
import { register as registerWorkspaceRoutes } from "./routes/workspace.mjs";
import { register as registerMemoryEngineRoutes } from "./routes/memory-engine.mjs";
import { register as registerComputerUseRoutes } from "./routes/computer-use.mjs";
import { register as registerMcpRoutes } from "./routes/mcp.mjs";
import { register as registerAcpRoutes } from "./routes/acp.mjs";
import { register as registerSkillRoutes } from "./routes/skills.mjs";
import { register as registerFileRoutes } from "./routes/files.mjs";
import { register as registerAgentStoreRoutes } from "./routes/agent-store.mjs";
import { createMcpSseHandler } from "./src/lib/mcp/server.mjs";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const log = createLogger("server");
const logDb = createLogger("db");
const logRoute = createLogger("route");
const logSse = createLogger("sse");
const SECRET = process.env.CLAWBOARD_SECRET || "";
const KEK_HEX = process.env.CLAWBOARD_KEK || "";
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const BODY_LIMIT = 1 * 1024 * 1024; // 1 MB

if (!SECRET)
  console.warn(
    "[SECURITY] CLAWBOARD_SECRET not set — all routes are unauthenticated!",
  );
if (!KEK_HEX)
  console.warn(
    "[SECURITY] CLAWBOARD_KEK not set — API keys stored in plaintext!",
  );

// ─── Security helpers ─────────────────────────────────────────────────────────

const PUBLIC_PREFIXES = [
  "/api/ping",
  "/api/health",
  "/api/vitals",
  "/api/quota",
  "/api/logs/",
  "/api/auth/login",
  "/mcp/",
];

function checkAuth(req) {
  if (!SECRET) return true;
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  try {
    const a = Buffer.from(SECRET.padEnd(64), "utf8");
    const b = Buffer.from(token.padEnd(64), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b) && token === SECRET;
  } catch {
    return false;
  }
}

function requireAuth(req, res) {
  if (checkAuth(req)) return true;
  res.writeHead(401, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const BANNED = new Set(["__proto__", "constructor", "prototype"]);
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !BANNED.has(k)),
  );
}

// ─── AES-256-GCM ──────────────────────────────────────────────────────────────

const KEK = KEK_HEX.length === 64 ? Buffer.from(KEK_HEX, "hex") : null;

function encryptKey(plaintext) {
  if (!KEK || !plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEK, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decryptKey(stored) {
  if (!KEK || !stored || !stored.startsWith("enc:")) return stored;
  try {
    const [, ivHex, tagHex, encHex] = stored.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      KEK,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const H = 3600000,
  M = 60000;

// ─── DB Row Mappers ───────────────────────────────────────────────────────────

function rowToModele(r) {
  return {
    id: r.id,
    name: r.name || r.nom,
    description: r.description || "",
    instructions: r.instructions || "",
    skillName: r.skill_name || null,
    agent: r.agent || "main",
    canal: r.canal || null,
    destinataire: r.destinataire || null,
    llmModel: r.llm_model || "claude-sonnet-4-6",
    disablePreInstructions: r.disable_pre_instructions || false,
    executionCount: r.execution_count || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToRecurrence(r) {
  return {
    id: r.id,
    name: r.name || r.nom,
    cronExpr: r.cron_expr || r.cron,
    human: r.human || r.human_label || r.cron_expr,
    timezone: r.timezone || "UTC",
    modeleId: r.modele_id || null,
    llmModel: r.llm_model || null,
    active: r.active ?? r.actif,
    nextRun: r.next_run || null,
    lastRun: r.last_run || null,
    runCount: r.run_count || 0,
  };
}

function rowToActivity(r) {
  return {
    type: r.type,
    label: r.label || r.message || r.type,
    ts: r.created_at,
  };
}

function rowToExecution(r) {
  return {
    id: String(r.id),
    taskId: r.task_id,
    startedAt: r.started_at || r.created_at,
    duration: r.duration || r.duree_ms || null,
    promptTokens: r.prompt_tokens || r.tokens_in || 0,
    completionTokens: r.completion_tokens || r.tokens_out || 0,
    cost: r.cout || 0,
    exitCode: r.exit_code ?? (r.statut === "completed" ? 0 : null),
    stdout: r.stdout || "",
  };
}

function rowToTask(r, activities = [], executions = []) {
  return {
    id: r.id,
    name: r.titre,
    modeleId: r.modele_id || r.modele || null,
    status: r.statut,
    agent: r.agent || "main",
    skillName: r.skill_name || null,
    instructions: r.instructions || "",
    scheduledAt: r.scheduled_at || r.created_at,
    createdAt: r.created_at,
    recurrenceHuman: r.recurrence_human || null,
    activity: activities,
    executions: executions,
    tokensUsed: { prompt: r.tokens_in || 0, completion: r.tokens_out || 0 },
    cost: r.cout || 0,
  };
}

// ─── DB Query Functions ───────────────────────────────────────────────────────

async function getAllModeles() {
  const { rows } = await pool.query(
    "SELECT * FROM modeles ORDER BY created_at ASC",
  );
  return rows.map(rowToModele);
}

async function getAllRecurrences() {
  const { rows } = await pool.query(
    "SELECT * FROM recurrences ORDER BY created_at ASC",
  );
  return rows.map(rowToRecurrence);
}

const TASKS_CACHE_KEY = "clawboard:tasks";
const TASKS_CACHE_TTL = 4; // secondes

async function getAllTasks() {
  // Lit depuis le cache Redis si disponible
  const cached = await cacheGet(TASKS_CACHE_KEY).catch(() => null);
  if (cached) return cached;

  const { rows: tasks } = await pool.query(
    "SELECT * FROM tasks ORDER BY created_at DESC",
  );
  if (tasks.length === 0) {
    await cacheSet(TASKS_CACHE_KEY, [], TASKS_CACHE_TTL).catch(() => {});
    return [];
  }
  const ids = tasks.map((t) => t.id);
  const { rows: acts } = await pool.query(
    "SELECT * FROM task_activities WHERE task_id = ANY($1) ORDER BY created_at ASC",
    [ids],
  );
  const { rows: execs } = await pool.query(
    "SELECT * FROM task_executions WHERE task_id = ANY($1) ORDER BY created_at DESC",
    [ids],
  );
  const actsByTask = {},
    execsByTask = {};
  for (const a of acts) (actsByTask[a.task_id] ??= []).push(rowToActivity(a));
  for (const e of execs)
    (execsByTask[e.task_id] ??= []).push(rowToExecution(e));
  const result = tasks.map((t) =>
    rowToTask(t, actsByTask[t.id] || [], execsByTask[t.id] || []),
  );
  await cacheSet(TASKS_CACHE_KEY, result, TASKS_CACHE_TTL).catch(() => {});
  return result;
}

/** Invalide le cache des tâches — à appeler après chaque write. */
async function invalidateTasksCache() {
  await cacheDel(TASKS_CACHE_KEY).catch(() => {});
}

/** Invalide le cache, recharge les tâches depuis DB et broadcast SSE. */
async function broadcastTasks() {
  await invalidateTasksCache();
  const tasks = await getAllTasks();
  broadcast(sseClients.tasks, tasks);
  return tasks;
}

async function getTaskById(id) {
  const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
  if (!rows[0]) return null;
  const { rows: acts } = await pool.query(
    "SELECT * FROM task_activities WHERE task_id=$1 ORDER BY created_at ASC",
    [id],
  );
  const { rows: execs } = await pool.query(
    "SELECT * FROM task_executions WHERE task_id=$1 ORDER BY created_at DESC",
    [id],
  );
  return rowToTask(rows[0], acts.map(rowToActivity), execs.map(rowToExecution));
}

async function getPreInstructions() {
  const { rows } = await pool.query(
    "SELECT * FROM pre_instructions WHERE id=1",
  );
  return rows[0]
    ? { content: rows[0].content, savedAt: rows[0].saved_at }
    : { content: "", savedAt: null };
}

async function getAllSkills() {
  const { rows } = await pool.query(
    "SELECT * FROM skills ORDER BY created_at ASC",
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name || r.nom,
    description: r.description,
    content: r.content || r.contenu,
    tags: r.tags || [],
    category: r.category || "general",
    status: r.status || "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function getAllMemoryDocs() {
  const { rows } = await pool.query(
    "SELECT * FROM memory_docs ORDER BY created_at ASC",
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.titre,
    content: r.content,
    chars: r.chars,
    embedding: r.embedding,
    tags: r.tags || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function getAllGuardrails() {
  const { rows } = await pool.query("SELECT * FROM guardrails ORDER BY id ASC");
  return rows.map((r) => ({
    id: r.id,
    name: r.name || r.nom,
    description: r.description,
    enabled: r.enabled ?? r.actif,
    type: r.type,
    config: r.config || {},
  }));
}

async function getPipeline() {
  const { rows } = await pool.query("SELECT * FROM pipeline WHERE id=1");
  return rows[0]
    ? {
        nodes: rows[0].nodes,
        edges: rows[0].edges,
        savedAt: rows[0].updated_at,
      }
    : { nodes: [], edges: [], savedAt: null };
}

// ─── Phase 2 migration (idempotent ALTER TABLE) ───────────────────────────────

async function runPhase2Migration() {
  await pool.query(`
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS skill_name TEXT;
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS agent TEXT DEFAULT 'main';
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS canal TEXT;
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS destinataire TEXT;
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS llm_model TEXT;
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS disable_pre_instructions BOOLEAN DEFAULT false;
    ALTER TABLE modeles ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0;

    ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS human_label TEXT;
    ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS llm_model TEXT;

    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS modele_id TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent TEXT DEFAULT 'main';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS skill_name TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_human TEXT;

    ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS duration INTEGER;
    ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
    ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
    ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS exit_code INTEGER;
    ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS stdout TEXT;

    ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS label TEXT;

    CREATE TABLE IF NOT EXISTS crons (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      interval TEXT NOT NULL DEFAULT '1h',
      agent_id TEXT DEFAULT 'agent-main',
      llm_mode TEXT DEFAULT 'hybrid',
      mode TEXT DEFAULT 'always',
      mode_config JSONB DEFAULT '{}',
      actif BOOLEAN DEFAULT true,
      last_run TIMESTAMPTZ,
      next_run TIMESTAMPTZ,
      run_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // pgvector : migrer embedding JSONB → vector(1536) si disponible
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    const embCol = await pool.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name='memory_docs' AND column_name='embedding'`,
    );
    if (embCol.rows[0]?.data_type === "jsonb") {
      await pool.query(`ALTER TABLE memory_docs DROP COLUMN embedding`);
      await pool.query(
        `ALTER TABLE memory_docs ADD COLUMN embedding vector(1536)`,
      );
      logDb.info("memory_docs.embedding migré JSONB → vector(1536)");
    }
    await pool.query(
      `CREATE INDEX IF NOT EXISTS memory_docs_embedding_hnsw ON memory_docs USING hnsw (embedding vector_cosine_ops)`,
    );
  } catch (e) {
    console.warn(
      "[DB] pgvector non disponible — fonctionnalités embeddings désactivées:",
      e.message,
    );
  }

  // Table settings (TOTP + configs générales clé/valeur)
  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `,
    )
    .catch(() => {});

  // Colonne status/category dans skills (pour plugins)
  await pool
    .query(
      `
    ALTER TABLE skills ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE skills ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'local';
  `,
    )
    .catch(() => {});

  // run_count dans recurrences
  await pool
    .query(
      `
    ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;
  `,
    )
    .catch(() => {});

  // Approvals table (persisted human-in-the-loop queue)
  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      task_name TEXT,
      agent TEXT DEFAULT 'main',
      reason TEXT,
      risk_level TEXT DEFAULT 'medium',
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      decision TEXT,
      decided_at TIMESTAMPTZ,
      payload JSONB DEFAULT '{}',
      openshell_id TEXT
    );
  `,
    )
    .catch(() => {});

  logDb.info("Phase 2 migration OK");
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_MODELES = [
  {
    id: "mod_001",
    name: "Check InBox",
    skillName: "inbox-monitor",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: true,
    executionCount: 9,
  },
  {
    id: "mod_002",
    name: "X Trends",
    skillName: "twitter-trends-analyzer",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: false,
    executionCount: 2,
  },
  {
    id: "mod_003",
    name: "YouTube Trends",
    skillName: "youtube-competitor-watch",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: false,
    executionCount: 2,
  },
  {
    id: "mod_004",
    name: "Backlog Idées YouTube",
    skillName: "youtube-ideas-backlog",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: true,
    executionCount: 2,
  },
  {
    id: "mod_005",
    name: "Planning du jour",
    skillName: "morning-briefing",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "kimi-k2.5",
    disablePreInstructions: false,
    executionCount: 12,
  },
  {
    id: "mod_006",
    name: "Mémoire Quotidienne",
    skillName: null,
    instructions:
      "Rédige la note mémoire du jour. Résume ce qui s'est passé aujourd'hui ou indique que c'était un jour de maintenance routinière.",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "kimi-k2.5",
    disablePreInstructions: false,
    executionCount: 3,
  },
  {
    id: "mod_007",
    name: "Sauvegarde OpenClaw",
    skillName: null,
    instructions:
      "bash /Users/mireillemonin/.openclaw/workspace/scripts/backup-openclaw.sh",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "kimi-k2.5",
    disablePreInstructions: false,
    executionCount: 0,
  },
  {
    id: "mod_008",
    name: "Analyse Accélérateur IA",
    skillName: "accélérateur-ia-analyse",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: false,
    executionCount: 2,
  },
  {
    id: "mod_009",
    name: "MAJ OpenClaw / ClawHub",
    skillName: "update-openclaw",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: true,
    executionCount: 2,
  },
  {
    id: "mod_010",
    name: "Audit Newsletter",
    skillName: "newsletter-audit",
    instructions: "",
    agent: "main",
    canal: "discord",
    destinataire: "147873345753440121",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    disablePreInstructions: false,
    executionCount: 3,
  },
];

const SEED_RECURRENCES = [
  {
    id: "rec_001",
    name: "Analyse Accélérateur IA",
    cronExpr: "0 10 1,15 * *",
    human: "1 et 15 du mois à 10h",
    timezone: "Europe/Paris",
    modeleId: "mod_008",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: true,
    nextRun: "2026-03-15T10:00:00",
  },
  {
    id: "rec_002",
    name: "Sauvegarde OpenClaw",
    cronExpr: "0 3 * * *",
    human: "Quotidien à 3h",
    timezone: "Europe/Paris",
    modeleId: "mod_007",
    llmModel: "kimi-k2.5",
    active: true,
    nextRun: "2026-03-06T03:00:00",
  },
  {
    id: "rec_003",
    name: "Mémoire Quotidienne",
    cronExpr: "45 2 * * *",
    human: "Quotidien à 2h45",
    timezone: "Europe/Paris",
    modeleId: "mod_006",
    llmModel: "kimi-k2.5",
    active: true,
    nextRun: "2026-03-06T02:45:00",
  },
  {
    id: "rec_004",
    name: "X Trends",
    cronExpr: "0 7 * * *",
    human: "Quotidien à 7h",
    timezone: "Europe/Paris",
    modeleId: "mod_002",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: true,
    nextRun: "2026-03-06T07:00:00",
  },
  {
    id: "rec_005",
    name: "YouTube Trends",
    cronExpr: "10 7 * * *",
    human: "Quotidien à 7h10",
    timezone: "Europe/Paris",
    modeleId: "mod_003",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: false,
    nextRun: null,
  },
  {
    id: "rec_006",
    name: "Backlog Idées YouTube",
    cronExpr: "30 7 * * *",
    human: "Quotidien à 7h30",
    timezone: "Europe/Paris",
    modeleId: "mod_004",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: true,
    nextRun: "2026-03-06T07:30:00",
  },
  {
    id: "rec_007",
    name: "MAJ OpenClaw / ClawHub",
    cronExpr: "0 4 * * 0",
    human: "Dimanche à 4h",
    timezone: "Europe/Paris",
    modeleId: "mod_009",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: true,
    nextRun: "2026-03-06T04:00:00",
  },
  {
    id: "rec_008",
    name: "Planning du jour",
    cronExpr: "43 7 * * 1-5",
    human: "Lun-Ven à 7h43",
    timezone: "Europe/Paris",
    modeleId: "mod_005",
    llmModel: "kimi-k2.5",
    active: true,
    nextRun: "2026-03-06T07:43:00",
  },
  {
    id: "rec_009",
    name: "Check InBox",
    cronExpr: "0 7,11,15,19 * * 1-5",
    human: "Lun-Ven à 7h, 11h, 15h, 19h",
    timezone: "Europe/Paris",
    modeleId: "mod_001",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: true,
    nextRun: "2026-03-05T19:00:00",
  },
  {
    id: "rec_010",
    name: "Audit Newsletter",
    cronExpr: "0 9 1 * *",
    human: "Mensuel le 1er à 9h",
    timezone: "Europe/Paris",
    modeleId: "mod_010",
    llmModel: "openrouter/anthropic/claude-sonnet-4.6",
    active: false,
    nextRun: null,
  },
];

const SEED_PREINSTRUCTIONS = `IMPORTANT : Si tu rencontres des erreurs, des blocages ou des instructions confuses, signale-les dans ton rapport final.

Ne tente PAS d'envoyer de messages Discord toi-même. La delivery est gérée automatiquement par le système cron.

## Output

Chaque exécution produit UN SEUL fichier Markdown dans ~/.openclaw/workspace/reports/. Nomme-le avec la date et le nom de la tâche (ex : 2026-03-02-analyse-twitter.md). Écris tout dans ce fichier unique : résultats, analyses, notes. Ne crée pas d'autres fichiers sauf si la tâche le demande explicitement.`;

const SEED_GUARDRAILS = [
  { id: "npm", nom: "NPM Packages (Allowlist)", actif: true },
  { id: "pypi", nom: "PyPI Packages (Allowlist)", actif: true },
  { id: "network", nom: "Network Outbound (All)", actif: false },
  { id: "filesystem", nom: "File System (Root Access)", actif: false },
  { id: "pii", nom: "PII Privacy Router", actif: true },
  { id: "sandbox", nom: "Code Sandbox", actif: true },
];

const SEED_QUOTAS = [
  {
    modele: "claude-sonnet-4.6",
    used: 0,
    limit_val: 100000,
    cost: 0,
    is_local: false,
  },
  { modele: "kimi-k2.5", used: 0, limit_val: 50000, cost: 0, is_local: false },
  {
    modele: "ollama/qwen2.5",
    used: 0,
    limit_val: null,
    cost: 0,
    is_local: true,
  },
];

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*) AS cnt FROM modeles");
  if (parseInt(rows[0].cnt) > 0) {
    logDb.info("Tables already seeded.");
    return;
  }
  logDb.info("Seeding initial data...");

  for (const m of SEED_MODELES) {
    await pool.query(
      `INSERT INTO modeles (id, name, instructions, skill_name, agent, canal, destinataire, llm_model, disable_pre_instructions, execution_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [
        m.id,
        m.name,
        m.instructions,
        m.skillName,
        m.agent,
        m.canal,
        m.destinataire,
        m.llmModel,
        m.disablePreInstructions,
        m.executionCount,
      ],
    );
  }

  for (const r of SEED_RECURRENCES) {
    await pool.query(
      `INSERT INTO recurrences (id, name, cron_expr, human, timezone, modele_id, llm_model, active, next_run)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [
        r.id,
        r.name,
        r.cronExpr,
        r.human,
        r.timezone,
        r.modeleId,
        r.llmModel,
        r.active,
        r.nextRun,
      ],
    );
  }

  await pool.query(
    `INSERT INTO pre_instructions (id, content, saved_at) VALUES (1,$1,NOW()) ON CONFLICT DO NOTHING`,
    [SEED_PREINSTRUCTIONS],
  );

  for (const g of SEED_GUARDRAILS) {
    await pool.query(
      `INSERT INTO guardrails (id, name, enabled) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [g.id, g.nom, g.actif],
    );
  }

  for (const q of SEED_QUOTAS) {
    await pool.query(
      `INSERT INTO quotas (modele, used, limit_val, cost, is_local) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [q.modele, q.used, q.limit_val, q.cost, q.is_local],
    );
  }

  await pool.query(
    `INSERT INTO pipeline (id, nodes, edges) VALUES (1,'[]','[]') ON CONFLICT DO NOTHING`,
  );
  logDb.info("Seed complete.");
}

// ─── In-memory cache (API keys + quotas — loaded from DB at startup) ──────────

let apiKeys = {};
let quotas = {};
let totalCost24h = 0;

// ─── Agents — in-memory fleet (enrichi depuis /api/tasks quand branché) ───────

const AGENTS = new Map([
  [
    "main",
    {
      id: "main",
      label: "NemoClaw Router",
      role: "Main Orchestrator",
      model: "claude-sonnet-4-6",
      status: "active",
      parentId: null,
      position: { x: 300, y: 50 },
    },
  ],
  [
    "sub1",
    {
      id: "sub1",
      label: "Code Architect",
      role: "Software Engineer",
      model: "llama-3.2",
      status: "active",
      parentId: "main",
      position: { x: 50, y: 300 },
    },
  ],
  [
    "sub2",
    {
      id: "sub2",
      label: "Data Analyst",
      role: "Data processing",
      model: "claude-haiku-4-5",
      status: "offline",
      parentId: "main",
      position: { x: 300, y: 300 },
    },
  ],
  [
    "sub3",
    {
      id: "sub3",
      label: "Security Scanner",
      role: "Vulnerability check",
      model: "qwen-2.5",
      status: "active",
      parentId: "main",
      position: { x: 550, y: 300 },
    },
  ],
]);

// ─── Notifications config — in-memory (persisted to DB as a memory doc optionally) ─

let notificationsConfig = {
  telegram_token: "",
  telegram_chat_id: "",
  discord_webhook: "",
  email_smtp: "",
  email_from: "",
  email_to: "",
  webhook_url: "",
  notify_on_task_done: true,
  notify_on_task_failed: true,
  notify_on_approval: true,
};

async function loadApiKeys() {
  const { rows } = await pool.query(
    "SELECT provider, encrypted_value FROM api_keys",
  );
  apiKeys = {};
  for (const r of rows) apiKeys[r.provider] = r.encrypted_value;
}

async function loadQuotas() {
  const { rows } = await pool.query("SELECT * FROM quotas");
  quotas = {};
  totalCost24h = 0;
  for (const r of rows) {
    quotas[r.modele] = {
      used: r.used,
      limit: r.limit_val,
      cost: r.cost,
      local: r.is_local,
    };
    totalCost24h += r.cost || 0;
  }
}

// ─── SSE + vitals ─────────────────────────────────────────────────────────────

const sseClients = {
  vitals: new Set(),
  quota: new Set(),
  tasks: new Set(),
  logs: {},
  approvals: new Set(),
};

// ─── Approval queue (DB-backed, Human-in-the-loop) ────────────────────────────
const approvalQueue = {
  async get(id) {
    const { rows } = await pool.query(
      "SELECT * FROM approvals WHERE id=$1 AND decision IS NULL",
      [id],
    );
    return rows[0] ? dbRowToApproval(rows[0]) : undefined;
  },
  async has(id) {
    const { rows } = await pool.query("SELECT 1 FROM approvals WHERE id=$1", [
      id,
    ]);
    return rows.length > 0;
  },
  async set(id, item) {
    await pool.query(
      `INSERT INTO approvals (id, task_id, task_name, agent, reason, risk_level, requested_at, payload, openshell_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [
        id,
        item.taskId,
        item.taskName,
        item.agent,
        item.reason,
        item.riskLevel,
        item.requestedAt,
        JSON.stringify(item.payload || {}),
        item._openShellId || null,
      ],
    );
  },
  async delete(id) {
    await pool.query("DELETE FROM approvals WHERE id=$1", [id]);
  },
  async decide(id, decision) {
    await pool.query(
      "UPDATE approvals SET decision=$2, decided_at=NOW() WHERE id=$1",
      [id, decision],
    );
  },
  async values() {
    const { rows } = await pool.query(
      "SELECT * FROM approvals WHERE decision IS NULL ORDER BY requested_at DESC",
    );
    return rows.map(dbRowToApproval);
  },
};

function dbRowToApproval(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    agent: row.agent,
    reason: row.reason,
    riskLevel: row.risk_level,
    requestedAt: row.requested_at,
    payload: row.payload,
    _openShellId: row.openshell_id,
  };
}

// Poll OpenShell every 20s for blocked sandbox requests
setInterval(() => {
  const cmd = `wsl -d Ubuntu -- bash -c "curl -sk https://127.0.0.1:8080/api/v1/requests?status=blocked 2>/dev/null"`;
  exec(cmd, { timeout: 8000 }, async (err, stdout) => {
    if (!stdout) return;
    try {
      const raw = JSON.parse(stdout);
      const requests = Array.isArray(raw)
        ? raw
        : raw.requests || raw.items || [];
      for (const r of requests) {
        const id = `os_${r.id || r.requestId}`;
        if (await approvalQueue.has(id)) continue;
        const item = {
          id,
          taskId: r.sandbox || "my-assistant",
          taskName: `Sandbox ${r.sandbox || "my-assistant"}`,
          agent: r.sandbox || "my-assistant",
          reason: `Requête réseau bloquée : ${r.method || "GET"} ${r.url || r.host || "inconnu"}`,
          riskLevel: "medium",
          requestedAt: r.timestamp || new Date().toISOString(),
          payload: r,
          _openShellId: r.id || r.requestId,
        };
        await approvalQueue.set(id, item);
        const event = `event: approval\ndata: ${JSON.stringify(item)}\n\n`;
        for (const c of sseClients.approvals) {
          try {
            c.write(event);
          } catch {
            sseClients.approvals.delete(c);
          }
        }
      }
    } catch {
      /* OpenShell not responding or no blocked requests */
    }
  });
}, 20000);

function broadcast(set, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(msg);
    } catch (_) {}
  }
}

let prevCpu = os.cpus();
function getCpuUsage() {
  const cpus = os.cpus();
  let idle = 0,
    tick = 0;
  cpus.forEach((c, i) => {
    const p = prevCpu[i] || c;
    for (const k in c.times) tick += c.times[k] - (p.times[k] || 0);
    idle += c.times.idle - (p.times.idle || 0);
  });
  prevCpu = cpus;
  return tick === 0 ? 0 : Math.round((1 - idle / tick) * 100);
}

function getVitals() {
  const tot = os.totalmem(),
    fr = os.freemem(),
    used = tot - fr;
  return {
    cpu: getCpuUsage(),
    ram: {
      used: Math.round(used / 1024 / 1024),
      total: Math.round(tot / 1024 / 1024),
      pct: Math.round((used / tot) * 100),
    },
    uptime: Math.round(os.uptime()),
    platform: os.platform(),
    hostname: os.hostname(),
  };
}

setInterval(async () => {
  broadcast(sseClients.vitals, getVitals());
  broadcast(sseClients.quota, { quotas, totalCost24h });
  try {
    const allTasks = await getAllTasks();
    broadcast(sseClients.tasks, allTasks);
  } catch (e) {
    logSse.error("broadcast tasks failed", { error: e.message });
  }
}, 2000);

// ─── Lia Chat — system prompt + tools ────────────────────────────────────────

const LIA_SYSTEM = `Tu es Lia, l'assistante IA agentique intégrée à ClawBoard (Nemoclaw). Tu AGIS, tu ne décris pas.

RÈGLE ABSOLUE — TOUJOURS AGIR :
- Quand l'utilisateur demande de créer des tâches → appeler batch_create_tasks ou create_task IMMÉDIATEMENT
- Quand il demande un plan/roadmap → créer les tâches ET les modèles avec create_modele
- Quand il demande d'automatiser → créer les CRONs avec create_cron
- Quand il dit "mémorise" ou "retiens" → appeler save_note
- Ne JAMAIS lister des actions à faire — les FAIRE avec les outils disponibles
- Ne JAMAIS demander confirmation sauf pour une suppression définitive
- Ne JAMAIS répondre "je vais créer..." sans l'avoir fait

OUTILS DISPONIBLES (utiliser sans attendre) :
• batch_create_tasks — créer plusieurs tâches d'un coup
• create_task — créer une tâche
• create_modele — créer un modèle/template réutilisable
• create_cron — créer une récurrence planifiée (CRON)
• save_note — sauvegarder une note en mémoire
• list_tasks / get_task / start_task / patch_task / delete_task
• list_modeles / list_recurrences
• list_directory / read_file / write_file — opérations fichiers (sandbox NemoClaw)
• web_search — recherche web sécurisée via proxy
• web_fetch — récupérer le contenu d'une page web
• exec_command — exécuter des commandes shell (sécurisé, allowlist NemoClaw)
• search_memory — chercher dans la mémoire agent (MEMORY.md, notes)
• send_message — envoyer un message via canal (telegram, discord, slack)

SÉCURITÉ NEMOCLAW :
- Les outils exec_command et write_file sont sandboxés (chemins autorisés uniquement)
- Les requêtes réseau passent par le proxy NemoClaw (deny-by-default)
- Les credentials ne sont jamais exposés à l'agent
- Toujours vérifier les permissions avant d'agir

FORMAT DE RÉPONSE :
- Toujours en français
- Concis et direct (pas de raisonnement interne affiché)
- Après avoir agi : résumer ce qui a été fait ("✅ J'ai créé X tâches : ...")
- Markdown pour la mise en forme
- Si chemin de fichier mentionné → utiliser list_directory ou read_file directement`;

const LIA_TOOLS = [
  {
    name: "list_tasks",
    description:
      "Liste toutes les tâches avec id, nom, statut, agent, coût et tokens. Utilise TOUJOURS cette fonction en premier pour obtenir les IDs avant d'appeler get_task.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_task",
    description:
      "Récupère les détails complets d'une tâche par son ID (format: tsk_xxx). Tu DOIS d'abord appeler list_tasks pour obtenir l'ID.",
    input_schema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description:
            "ID de la tâche au format tsk_xxx, obtenu via list_tasks",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "create_task",
    description: "Crée une nouvelle tâche.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        modeleId: { type: "string" },
        agent: { type: "string" },
        skillName: { type: "string" },
        scheduledAt: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "start_task",
    description: "Démarre l'exécution d'une tâche existante.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "delete_task",
    description: "Supprime définitivement une tâche.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "patch_task",
    description: "Modifie les champs d'une tâche existante.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" }, updates: { type: "object" } },
      required: ["taskId", "updates"],
    },
  },
  {
    name: "list_modeles",
    description: "Liste tous les modèles/templates disponibles.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_recurrences",
    description: "Liste toutes les récurrences CRON configurées.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_directory",
    description: "Liste le contenu d'un dossier local (chemin absolu).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, recursive: { type: "boolean" } },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Lit le contenu d'un fichier texte local.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, maxLines: { type: "number" } },
      required: ["path"],
    },
  },
  {
    name: "batch_create_tasks",
    description:
      "Crée plusieurs tâches d'un seul coup. Utiliser quand l'utilisateur demande de créer un plan ou plusieurs tâches.",
    input_schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              agent: { type: "string" },
              skillName: { type: "string" },
            },
            required: ["name"],
          },
          description: "Liste des tâches à créer",
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "create_modele",
    description:
      "Crée un modèle/template de tâche réutilisable avec instructions.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        instructions: { type: "string" },
        agent: { type: "string" },
        llmModel: { type: "string" },
      },
      required: ["name", "instructions"],
    },
  },
  {
    name: "create_cron",
    description:
      "Crée une récurrence CRON planifiée. Utiliser pour automatiser des tâches périodiques.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        cronExpr: {
          type: "string",
          description: 'Expression CRON, ex: "0 9 * * 1-5" pour lun-ven à 9h',
        },
        human: { type: "string", description: "Description humaine du CRON" },
        modeleId: { type: "string" },
        timezone: {
          type: "string",
          description: "Fuseau horaire, ex: Europe/Paris",
        },
      },
      required: ["name", "cronExpr"],
    },
  },
  {
    name: "save_note",
    description:
      "Sauvegarde une note importante en mémoire (NOTES.md). Utiliser pour retenir des infos projet, décisions, contexte.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        category: {
          type: "string",
          description: "Ex: projet, décision, tâche, bug",
        },
      },
      required: ["title", "content"],
    },
  },
  // ── OpenClaw built-in tools (adapted for NemoClaw security) ────────────────
  {
    name: "web_search",
    description:
      "Recherche web sécurisée via le proxy NemoClaw. Retourne les résultats de recherche avec titre, URL et extrait.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Requête de recherche" },
        maxResults: {
          type: "number",
          description: "Nombre max de résultats (défaut: 5, max: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Récupère le contenu textuel d'une page web. Utile pour analyser une URL mentionnée par l'utilisateur.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL de la page à récupérer" },
        maxChars: {
          type: "number",
          description: "Nombre max de caractères à retourner (défaut: 3000)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "write_file",
    description:
      "Écrit ou crée un fichier dans le workspace sandbox. Chemins autorisés uniquement (sécurité NemoClaw).",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Chemin absolu du fichier à écrire",
        },
        content: { type: "string", description: "Contenu à écrire" },
        append: {
          type: "boolean",
          description:
            "Si true, ajoute au fichier existant au lieu de remplacer",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "exec_command",
    description:
      "Exécute une commande shell dans le sandbox NemoClaw. Seules les commandes de l'allowlist sont autorisées (sécurité NemoClaw). Timeout 30s.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Commande à exécuter" },
        workdir: {
          type: "string",
          description: "Répertoire de travail (optionnel)",
        },
        timeout: {
          type: "number",
          description: "Timeout en secondes (défaut: 30, max: 120)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_memory",
    description:
      "Cherche dans la mémoire de l'agent (MEMORY.md, NOTES.md, fichiers mémoire quotidiens). Trouve les informations retenues précédemment.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Terme ou phrase à chercher dans la mémoire",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "send_message",
    description:
      "Envoie un message via un canal de messagerie configuré (telegram, discord, slack). Bridge NemoClaw requis.",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "Canal: telegram, discord, slack, webhook",
        },
        content: {
          type: "string",
          description: "Contenu du message à envoyer",
        },
        recipient: {
          type: "string",
          description: "Destinataire (chat_id telegram, channel discord, etc.)",
        },
      },
      required: ["channel", "content"],
    },
  },
];

async function executeTool(name, input, permissions) {
  if (permissions[name] === false) {
    return {
      __denied: true,
      message: `Permission "${name}" désactivée. Activez-la dans le panneau de permissions.`,
    };
  }
  switch (name) {
    case "list_tasks": {
      const tasks = await getAllTasks();
      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          agent: t.agent,
          cost: t.cost,
          tokensUsed: t.tokensUsed,
          scheduledAt: t.scheduledAt,
        })),
      };
    }
    case "get_task": {
      if (
        !input.taskId ||
        input.taskId === "undefined" ||
        !input.taskId.startsWith("tsk_")
      ) {
        return {
          error: `ID invalide "${input.taskId}". Appelle d'abord list_tasks pour obtenir les IDs (format tsk_xxx).`,
        };
      }
      const t = await getTaskById(input.taskId);
      return t || { error: `Tâche "${input.taskId}" introuvable.` };
    }
    case "create_task": {
      const id = `tsk_${Date.now()}`;
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, scheduled_at, created_at, updated_at, cout, tokens_in, tokens_out)
         VALUES ($1,$2,$3,'planned',$4,$5,$6,$7,$7,0,0,0)`,
        [
          id,
          input.name,
          input.modeleId || null,
          input.agent || "main",
          input.skillName || null,
          input.scheduledAt || now,
          now,
        ],
      );
      await pool.query(
        `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'created','Tâche créée par Lia','Tâche créée par Lia',$2)`,
        [id, now],
      );
      await broadcastTasks();
      return { created: { id, name: input.name, status: "planned" } };
    }
    case "start_task": {
      const task = await getTaskById(input.taskId);
      if (!task) return { error: `Tâche "${input.taskId}" introuvable.` };
      const now = new Date().toISOString();
      await pool.query(
        `UPDATE tasks SET statut='running', updated_at=$2 WHERE id=$1`,
        [task.id, now],
      );
      await pool.query(
        `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'launched','Exécution lancée par Lia','Exécution lancée par Lia',$2)`,
        [task.id, now],
      );
      await pool.query(
        `INSERT INTO task_executions (task_id, statut, cout, tokens_in, tokens_out, started_at, prompt_tokens, completion_tokens) VALUES ($1,'running',0,0,0,$2,0,0)`,
        [task.id, now],
      );
      await broadcastTasks();
      setTimeout(async () => {
        try {
          const dur = Math.floor(Math.random() * 60 + 10);
          const doneNow = new Date().toISOString();
          const cost = Math.round(Math.random() * 0.4 * 10000) / 10000;
          const tokIn = Math.floor(Math.random() * 30000 + 3000);
          const tokOut = Math.floor(Math.random() * 1500 + 100);
          await pool.query(
            `UPDATE tasks SET statut='completed', updated_at=$2, cout=$3, tokens_in=$4, tokens_out=$5, completed_at=$2 WHERE id=$1`,
            [task.id, doneNow, cost, tokIn, tokOut],
          );
          await pool.query(
            `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'completed',$2,$2,$3)`,
            [task.id, `Terminée en ${dur}s`, doneNow],
          );
          await broadcastTasks();
        } catch (e) {
          logRoute.error("executeTool.start_task failed", { error: e.message });
        }
      }, 3000);
      return { ok: true, taskId: task.id, status: "running" };
    }
    case "delete_task": {
      const { rowCount } = await pool.query("DELETE FROM tasks WHERE id=$1", [
        input.taskId,
      ]);
      if (!rowCount) return { error: `Tâche "${input.taskId}" introuvable.` };
      await broadcastTasks();
      return { ok: true, deleted: input.taskId };
    }
    case "patch_task": {
      const task = await getTaskById(input.taskId);
      if (!task) return { error: `Tâche "${input.taskId}" introuvable.` };
      const safe = sanitizeObject(input.updates);
      const setClauses = [],
        vals = [input.taskId];
      if (safe.status !== undefined)
        setClauses.push(`statut=$${vals.push(safe.status)}`);
      if (safe.name !== undefined)
        setClauses.push(`titre=$${vals.push(safe.name)}`);
      if (safe.instructions !== undefined)
        setClauses.push(`instructions=$${vals.push(safe.instructions)}`);
      if (setClauses.length > 0) {
        await pool.query(
          `UPDATE tasks SET ${setClauses.join(",")}, updated_at=NOW() WHERE id=$1`,
          vals,
        );
      }
      const updated = await getTaskById(input.taskId);
      await broadcastTasks();
      return { ok: true, updated };
    }
    case "list_modeles": {
      const mods = await getAllModeles();
      return {
        modeles: mods.map((m) => ({
          id: m.id,
          name: m.name,
          skillName: m.skillName,
          llmModel: m.llmModel,
          executionCount: m.executionCount,
        })),
      };
    }
    case "list_recurrences": {
      const recs = await getAllRecurrences();
      return {
        recurrences: recs.map((r) => ({
          id: r.id,
          name: r.name,
          human: r.human,
          active: r.active,
          nextRun: r.nextRun,
        })),
      };
    }
    case "batch_create_tasks": {
      const tasks = input.tasks || [];
      if (!tasks.length) return { error: "Aucune tâche à créer." };
      const created = [];
      for (const t of tasks.slice(0, 20)) {
        const id = `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        const fullName = t.name + (t.description ? ` — ${t.description}` : "");
        await pool.query(
          `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, scheduled_at, created_at, updated_at, cout, tokens_in, tokens_out)
           VALUES ($1,$2,$3,'planned',$4,$5,$6,$7,$7,0,0,0)`,
          [
            id,
            fullName.slice(0, 200),
            null,
            t.agent || "main",
            t.skillName || null,
            now,
            now,
          ],
        );
        await pool.query(
          `INSERT INTO task_activities (task_id, type, label, message, created_at) VALUES ($1,'created','Créée par Lia','Créée par Lia',$2)`,
          [id, now],
        );
        created.push({ id, name: fullName, agent: t.agent || "main" });
        await new Promise((r) => setTimeout(r, 30));
      }
      await broadcastTasks();
      return { created, count: created.length };
    }
    case "create_modele": {
      const id = `mod_${Date.now()}`;
      const now = new Date().toISOString();
      await pool
        .query(
          `INSERT INTO modeles (id, name, description, instructions, agent, llm_model, created_at, updated_at, execution_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0)
         ON CONFLICT (id) DO NOTHING`,
          [
            id,
            input.name,
            input.description || "",
            input.instructions || "",
            input.agent || "main",
            input.llmModel || "meta/llama-3.3-70b-instruct",
            now,
          ],
        )
        .catch(async () => {
          // Fallback if table schema differs
          await pool.query(
            `INSERT INTO modeles (id, nom, description, instructions, agent, llm_model, created_at, updated_at, execution_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0)`,
            [
              id,
              input.name,
              input.description || "",
              input.instructions || "",
              input.agent || "main",
              input.llmModel || "meta/llama-3.3-70b-instruct",
              now,
            ],
          );
        });
      return { created: { id, name: input.name } };
    }
    case "create_cron": {
      const id = `rec_${Date.now()}`;
      const now = new Date().toISOString();
      await pool
        .query(
          `INSERT INTO recurrences (id, name, cron_expr, human, timezone, modele_id, active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)`,
          [
            id,
            input.name,
            input.cronExpr,
            input.human || input.cronExpr,
            input.timezone || "Europe/Paris",
            input.modeleId || null,
            now,
          ],
        )
        .catch(() => {}); // table might have different schema
      return {
        created: {
          id,
          name: input.name,
          cronExpr: input.cronExpr,
          human: input.human || input.cronExpr,
        },
      };
    }
    case "save_note": {
      const timestamp = new Date().toLocaleString("fr-FR");
      const entry = `\n## [${input.category || "note"}] ${input.title}\n*${timestamp}*\n\n${input.content}\n`;
      const { rows } = await pool
        .query(
          `SELECT id, content FROM memory WHERE filename='NOTES.md' LIMIT 1`,
        )
        .catch(() => ({ rows: [] }));
      if (rows.length) {
        await pool.query(
          `UPDATE memory SET content=$1, updated_at=NOW() WHERE id=$2`,
          [(rows[0].content || "") + entry, rows[0].id],
        );
      } else {
        await pool
          .query(
            `INSERT INTO memory (id, filename, content, type, created_at, updated_at) VALUES ($1,'NOTES.md',$2,'note',NOW(),NOW())`,
            [`mem_${Date.now()}`, `# Notes Lia\n${entry}`],
          )
          .catch(() => {});
      }
      return { saved: true, title: input.title };
    }
    case "list_directory": {
      try {
        const dirPath = input.path;
        if (!isPathAllowed(dirPath))
          return {
            __denied: true,
            message: `⛔ Accès refusé : \`${dirPath}\` n'est pas dans les chemins autorisés. Configurez les accès dans **Paramètres → Accès Fichiers**.`,
          };
        if (!existsSync(dirPath))
          return { error: `Dossier introuvable : ${dirPath}` };
        const stat = statSync(dirPath);
        if (!stat.isDirectory())
          return { error: `Ce chemin n'est pas un dossier : ${dirPath}` };
        const entries = readdirSync(dirPath, { withFileTypes: true });
        const files = entries.map((e) => {
          try {
            const fullPath = pathJoin(dirPath, e.name);
            const s = statSync(fullPath);
            return {
              name: e.name,
              type: e.isDirectory() ? "dir" : "file",
              size: e.isFile() ? s.size : null,
              ext: e.isFile() ? extname(e.name) : null,
            };
          } catch {
            return { name: e.name, type: e.isDirectory() ? "dir" : "file" };
          }
        });
        const dirs = files.filter((f) => f.type === "dir");
        const fileList = files.filter((f) => f.type === "file");
        if (input.recursive) {
          const walk = (p, depth = 0) => {
            if (depth > 3) return [];
            try {
              return readdirSync(p, { withFileTypes: true }).flatMap((e) => {
                const fp = pathJoin(p, e.name);
                return e.isDirectory()
                  ? [
                      { name: fp.replace(dirPath, ""), type: "dir" },
                      ...walk(fp, depth + 1),
                    ]
                  : [
                      {
                        name: fp.replace(dirPath, ""),
                        type: "file",
                        ext: extname(e.name),
                      },
                    ];
              });
            } catch {
              return [];
            }
          };
          return {
            path: dirPath,
            total: files.length,
            entries: walk(dirPath).slice(0, 200),
          };
        }
        return {
          path: dirPath,
          total: files.length,
          dirs: dirs.map((d) => d.name),
          files: fileList.map(
            (f) =>
              `${f.name} (${f.size != null ? (f.size > 1024 ? Math.round(f.size / 1024) + "KB" : f.size + "B") : "?"})`,
          ),
        };
      } catch (e) {
        return { error: `Erreur lecture dossier : ${e.message}` };
      }
    }
    case "read_file": {
      try {
        const filePath = input.path;
        if (!isPathAllowed(filePath))
          return {
            __denied: true,
            message: `⛔ Accès refusé : \`${filePath}\` n'est pas dans les chemins autorisés. Configurez les accès dans **Paramètres → Accès Fichiers**.`,
          };
        if (!existsSync(filePath))
          return { error: `Fichier introuvable : ${filePath}` };
        const stat = statSync(filePath);
        if (stat.isDirectory())
          return {
            error: `C'est un dossier, pas un fichier. Utilisez list_directory.`,
          };
        if (stat.size > 500 * 1024)
          return {
            error: `Fichier trop grand (${Math.round(stat.size / 1024)}KB). Max 500KB.`,
          };
        const content = readFileSync(filePath, "utf8");
        const lines = content.split("\n");
        const maxL = input.maxLines || 150;
        const truncated = lines.length > maxL;
        return {
          path: filePath,
          lines: lines.length,
          truncated,
          content:
            lines.slice(0, maxL).join("\n") +
            (truncated
              ? `\n\n… [${lines.length - maxL} lignes supplémentaires tronquées]`
              : ""),
        };
      } catch (e) {
        return { error: `Erreur lecture fichier : ${e.message}` };
      }
    }

    // ── OpenClaw built-in tools (NemoClaw secured) ────────────────────────────

    case "web_search": {
      try {
        const query = (input.query || "").trim();
        if (!query) return { error: "Requête de recherche vide." };
        const maxR = Math.min(input.maxResults || 5, 10);
        // Use DuckDuckGo instant answer API (no API key needed, NemoClaw proxy-safe)
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const resp = await fetch(ddgUrl, {
          signal: AbortSignal.timeout(10000),
        });
        const data = await resp.json();
        const results = [];
        if (data.AbstractText) {
          results.push({
            title: data.Heading || query,
            url: data.AbstractURL || "",
            snippet: data.AbstractText.slice(0, 300),
            source: data.AbstractSource || "DuckDuckGo",
          });
        }
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(
            0,
            maxR - results.length,
          )) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title:
                  topic.Text.split(" - ")[0]?.slice(0, 80) ||
                  topic.Text.slice(0, 80),
                url: topic.FirstURL,
                snippet: topic.Text.slice(0, 200),
              });
            }
            if (topic.Topics) {
              for (const sub of topic.Topics.slice(0, 3)) {
                if (sub.Text && sub.FirstURL) {
                  results.push({
                    title: sub.Text.split(" - ")[0]?.slice(0, 80),
                    url: sub.FirstURL,
                    snippet: sub.Text.slice(0, 200),
                  });
                }
              }
            }
          }
        }
        return {
          query,
          results: results.slice(0, maxR),
          total: results.length,
          note: "Recherche via proxy NemoClaw (deny-by-default egress)",
        };
      } catch (e) {
        return { error: `Erreur web_search: ${e.message}` };
      }
    }

    case "web_fetch": {
      try {
        const url = (input.url || "").trim();
        if (!url) return { error: "URL requise." };
        // SSRF protection: block private/internal IPs (NemoClaw security)
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const blockedHosts = [
          "localhost",
          "127.0.0.1",
          "0.0.0.0",
          "::1",
          "169.254.169.254",
          "metadata.google.internal",
        ];
        if (
          blockedHosts.some((h) => hostname === h) ||
          hostname.startsWith("10.") ||
          hostname.startsWith("192.168.") ||
          hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
        ) {
          return {
            error:
              "⛔ Accès réseau interne bloqué par la politique NemoClaw (SSRF protection).",
          };
        }
        if (!["http:", "https:"].includes(urlObj.protocol)) {
          return { error: "Seuls les protocoles HTTP/HTTPS sont autorisés." };
        }
        const maxC = Math.min(input.maxChars || 3000, 8000);
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "NemoClaw/1.0 (ClawBoard Agent)" },
        });
        if (!resp.ok)
          return { error: `HTTP ${resp.status} ${resp.statusText}` };
        const contentType = resp.headers.get("content-type") || "";
        if (
          !contentType.includes("text") &&
          !contentType.includes("json") &&
          !contentType.includes("xml")
        ) {
          return {
            error: `Type non supporté: ${contentType}. Seul texte/JSON/XML autorisé.`,
          };
        }
        const text = await resp.text();
        const clean = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
        return {
          url,
          status: resp.status,
          contentType,
          content: clean.slice(0, maxC),
          truncated: clean.length > maxC,
          totalChars: clean.length,
        };
      } catch (e) {
        return { error: `Erreur web_fetch: ${e.message}` };
      }
    }

    case "write_file": {
      try {
        const filePath = input.path;
        if (!isPathAllowed(filePath))
          return {
            __denied: true,
            message: `⛔ Accès refusé : \`${filePath}\` — politique NemoClaw filesystem.`,
          };
        // Block dangerous file extensions (NemoClaw process security)
        const dangerousExt = [
          ".exe",
          ".bat",
          ".cmd",
          ".ps1",
          ".sh",
          ".dll",
          ".so",
          ".msi",
        ];
        const fileExt = extname(filePath).toLowerCase();
        if (dangerousExt.includes(fileExt)) {
          return {
            error: `⛔ Écriture de fichiers exécutables bloquée (${fileExt}). Politique NemoClaw process.`,
          };
        }
        const parentDir = dirname(filePath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }
        const content = input.content || "";
        if (content.length > 512 * 1024) {
          return { error: "Contenu trop volumineux (max 512KB)." };
        }
        if (input.append && existsSync(filePath)) {
          const existing = readFileSync(filePath, "utf8");
          writeFileSync(filePath, existing + content, "utf8");
        } else {
          writeFileSync(filePath, content, "utf8");
        }
        return {
          written: true,
          path: filePath,
          bytes: Buffer.byteLength(content, "utf8"),
          mode: input.append ? "append" : "write",
        };
      } catch (e) {
        return { error: `Erreur write_file: ${e.message}` };
      }
    }

    case "exec_command": {
      try {
        const cmd = (input.command || "").trim();
        if (!cmd) return { error: "Commande vide." };
        // NemoClaw exec security: allowlist enforcement
        const EXEC_ALLOWLIST = [
          /^ls(\s|$)/i,
          /^dir(\s|$)/i,
          /^pwd$/i,
          /^cd\s/i,
          /^echo\s/i,
          /^cat\s[\w./ -]+$/i,
          /^type\s[\w./ -]+$/i,
          /^node\s/i,
          /^python3?\s/i,
          /^npm\s(list|run|test|start|install)\b/i,
          /^npx\s/i,
          /^git\s(log|status|branch|diff|show|add|commit)\b/i,
          /^ps(\s|$)/i,
          /^df\s/i,
          /^du\s/i,
          /^env$/i,
          /^date$/i,
          /^curl\s/i,
          /^wget\s/i,
          /^ping\s-c\s\d+\s/i,
          /^grep\s/i,
          /^find\s/i,
          /^head\s/i,
          /^tail\s/i,
          /^wc\s/i,
          /^sort(\s|$)/i,
          /^mkdir\s/i,
          /^touch\s/i,
          /^cp\s/i,
          /^mv\s/i,
        ];
        // Block dangerous patterns (NemoClaw process security)
        const BLOCKED_PATTERNS = [
          /rm\s+-rf?\s+\//i,
          /rmdir\s+\//i,
          />\s*\/dev\/sd/i,
          /dd\s+if=/i,
          /chmod\s+[0-7]*777/i,
          /chmod\s+\+s/i,
          /chown\s/i,
          /chgrp\s/i,
          /sudo\s/i,
          /su\s-/i,
          /\|\s*sh\b/i,
          /\|\s*bash\b/i,
          /eval\s/i,
          /curl.*\|\s*(sh|bash)/i,
          /wget.*\|\s*(sh|bash)/i,
          /nc\s+-l/i,
          /ncat\s/i,
          /netcat\s/i,
          />\s*\/etc\//i,
        ];
        if (BLOCKED_PATTERNS.some((re) => re.test(cmd))) {
          return {
            error: `⛔ Commande bloquée — patterns dangereux détectés (NemoClaw process security).`,
          };
        }
        if (!EXEC_ALLOWLIST.some((re) => re.test(cmd))) {
          return {
            error: `⛔ Commande non autorisée: "${cmd.slice(0, 60)}" — politique NemoClaw allowlist.`,
            hint: "Autorisées: ls, cat, node, python, npm, git, curl, grep, find, head, tail, mkdir, cp, mv...",
          };
        }
        const timeoutSec = Math.min(input.timeout || 30, 120);
        const workdir = input.workdir || repoDir;
        if (input.workdir && !isPathAllowed(input.workdir)) {
          return {
            error: `⛔ Répertoire de travail non autorisé: ${input.workdir}`,
          };
        }
        return new Promise((resolve) => {
          exec(
            cmd,
            { cwd: workdir, timeout: timeoutSec * 1000, maxBuffer: 256 * 1024 },
            (err, stdout, stderr) => {
              resolve({
                command: cmd,
                exitCode: err ? err.code || 1 : 0,
                stdout: (stdout || "").slice(0, 4000),
                stderr: (stderr || "").slice(0, 1000),
                truncated: (stdout || "").length > 4000,
                timeout: timeoutSec,
                workdir,
              });
            },
          );
        });
      } catch (e) {
        return { error: `Erreur exec_command: ${e.message}` };
      }
    }

    case "search_memory": {
      try {
        const query = (input.query || "").trim().toLowerCase();
        if (!query) return { error: "Terme de recherche vide." };
        const results = [];
        const { rows } = await pool
          .query(
            `SELECT id, filename, content, type, updated_at FROM memory ORDER BY updated_at DESC LIMIT 20`,
          )
          .catch(() => ({ rows: [] }));
        for (const row of rows) {
          const content = (row.content || "").toLowerCase();
          if (content.includes(query)) {
            const idx = content.indexOf(query);
            const start = Math.max(0, idx - 100);
            const end = Math.min(content.length, idx + query.length + 100);
            results.push({
              file: row.filename,
              type: row.type,
              match: row.content.slice(start, end).trim(),
              updatedAt: row.updated_at,
            });
          }
        }
        const { rows: activities } = await pool
          .query(
            `SELECT ta.message, ta.label, ta.created_at, t.titre AS task_name
             FROM task_activities ta JOIN tasks t ON t.id = ta.task_id
             WHERE LOWER(ta.message) LIKE $1 OR LOWER(ta.label) LIKE $1
             ORDER BY ta.created_at DESC LIMIT 10`,
            [`%${query}%`],
          )
          .catch(() => ({ rows: [] }));
        for (const act of activities) {
          results.push({
            file: `task:${act.task_name}`,
            type: "activity",
            match: `${act.label}: ${act.message}`,
            updatedAt: act.created_at,
          });
        }
        return {
          query: input.query,
          results: results.slice(0, 15),
          total: results.length,
        };
      } catch (e) {
        return { error: `Erreur search_memory: ${e.message}` };
      }
    }

    case "send_message": {
      try {
        const channel = (input.channel || "").toLowerCase();
        const content = (input.content || "").trim();
        if (!content) return { error: "Contenu du message vide." };
        if (!["telegram", "discord", "slack", "webhook"].includes(channel)) {
          return {
            error: `Canal non supporté: ${channel}. Disponibles: telegram, discord, slack, webhook`,
          };
        }
        const settingsPath = pathJoin(repoDir, "settings.local.json");
        let settings = {};
        try {
          if (existsSync(settingsPath))
            settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        } catch {
          /* fallback */
        }
        if (channel === "telegram") {
          const token =
            process.env.TELEGRAM_BOT_TOKEN || settings.telegramToken;
          const chatId =
            input.recipient ||
            process.env.ALLOWED_CHAT_IDS?.split(",")[0] ||
            settings.telegramChatId;
          if (!token) return { error: "TELEGRAM_BOT_TOKEN non configuré." };
          if (!chatId)
            return { error: "Destinataire telegram requis (chat_id)." };
          const resp = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: content,
                parse_mode: "Markdown",
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          const data = await resp.json();
          return { sent: data.ok, channel: "telegram", recipient: chatId };
        }
        if (channel === "discord") {
          const webhookUrl = input.recipient || settings.discordWebhook;
          if (!webhookUrl) return { error: "Discord webhook URL requis." };
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(10000),
          });
          return { sent: resp.ok, channel: "discord", status: resp.status };
        }
        if (channel === "slack") {
          const webhookUrl = input.recipient || settings.slackWebhook;
          if (!webhookUrl) return { error: "Slack webhook URL requis." };
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: content }),
            signal: AbortSignal.timeout(10000),
          });
          return { sent: resp.ok, channel: "slack", status: resp.status };
        }
        if (channel === "webhook") {
          const webhookUrl = input.recipient;
          if (!webhookUrl) return { error: "URL du webhook requise." };
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: content, source: "nemoclaw-agent" }),
            signal: AbortSignal.timeout(10000),
          });
          return { sent: resp.ok, channel: "webhook", status: resp.status };
        }
        return { error: "Canal non traité." };
      } catch (e) {
        return { error: `Erreur send_message: ${e.message}` };
      }
    }

    default:
      return { error: `Outil inconnu: ${name}` };
  }
}

// ── Smart mock (no API key) ───────────────────────────────────────────────────

async function smartMock(messages, permissions) {
  const last = messages.filter((m) => m.role === "user").pop()?.content || "";
  const text =
    (Array.isArray(last) ? last.find((c) => c.type === "text")?.text : last) ||
    "";
  const lower = text.toLowerCase();
  const toolCalls = [];

  const run = async (name, input) => {
    const r = await executeTool(name, input, permissions);
    toolCalls.push({ tool: name, input, result: r });
    return r;
  };

  // ── Filesystem via smartMock ───────────────────────────────────────────────
  const paths = extractPaths(text);
  if (paths.length) {
    const toolCalls2 = [];
    const parts = [];
    for (const p of paths.slice(0, 2)) {
      try {
        const s = statSync(p);
        if (s.isDirectory()) {
          const r = await executeTool(
            "list_directory",
            { path: p },
            permissions,
          );
          if (!r.error) {
            toolCalls2.push({
              tool: "list_directory",
              input: { path: p },
              result: r,
            });
            parts.push(
              `**📁 \`${p}\`** — ${r.total} entrées\n\n**Dossiers :** ${r.dirs?.slice(0, 15).join(", ") || "aucun"}\n**Fichiers :** ${r.files?.slice(0, 20).join("\n• ") || "aucun"}`,
            );
          }
        } else {
          const r = await executeTool(
            "read_file",
            { path: p, maxLines: 60 },
            permissions,
          );
          if (!r.error) {
            toolCalls2.push({
              tool: "read_file",
              input: { path: p },
              result: r,
            });
            parts.push(
              `**📄 \`${p}\`** — ${r.lines} lignes\n\n\`\`\`\n${r.content}\n\`\`\``,
            );
          }
        }
      } catch {
        parts.push(`❌ Impossible d'accéder à \`${p}\``);
      }
    }
    if (parts.length)
      return { message: parts.join("\n\n"), toolCalls: toolCalls2 };
  }
  if (lower.match(/reexplique|ré-?explique|explain again|clarifi/)) {
    return {
      message: `Bien sûr ! Voici un résumé de ce qui s'est passé :\n\nJe suis **Lia**, l'assistante intégrée à ClawBoard. Pour l'instant, le modèle sélectionné ne répond pas correctement — je fonctionne en **mode démo**.\n\nEssayez de changer de modèle (ex: *Llama 3.3 70B* ou *Mixtral 8x22B*) dans le sélecteur en haut, puis répétez votre demande.`,
      toolCalls: [],
    };
  }
  if (lower.match(/bonjour|salut|hello|hey|coucou|lia/)) {
    return {
      message: `Bonjour ! Je suis **Lia**, votre assistante ClawBoard. 👋\n\nJe peux gérer vos tâches :\n• 📋 *"Liste mes tâches"*\n• ▶️ *"Démarre tsk_001"*\n• ➕ *"Crée une tâche nommée Test"*\n• 🗑️ *"Supprime tsk_005"*\n• 📊 *"Montre-moi les modèles"*\n\n> Mode démo — Ajoutez \`ANTHROPIC_API_KEY\` pour connecter le vrai Claude.`,
      toolCalls: [],
    };
  }
  if (lower.match(/tâches?|tasks?|liste|affich|montr|voir/)) {
    const r = await run("list_tasks", {});
    const tks = r.tasks || [];
    const groups = {
      planned: "📅",
      running: "▶️",
      completed: "✅",
      failed: "❌",
    };
    const lines = tks
      .map(
        (t) =>
          `${groups[t.status] || "•"} **${t.name || t.id}** \`${t.id}\` — ${t.status}`,
      )
      .join("\n");
    return {
      message: `**${tks.length} tâches** dans le système :\n\n${lines || "_(aucune)_"}`,
      toolCalls,
    };
  }
  if (lower.match(/démarre|lance|exécute|start|run/)) {
    const match = text.match(/tsk_\w+/i);
    if (match) {
      const r = await run("start_task", { taskId: match[0] });
      if (r.__denied) return { message: `⛔ ${r.message}`, toolCalls: [] };
      return {
        message: r.error
          ? `❌ ${r.error}`
          : `▶️ Tâche \`${match[0]}\` **démarrée** ! Elle passera en *completed* dans ~3s.`,
        toolCalls,
      };
    }
  }
  if (lower.match(/supprim|delet|effac|remove/)) {
    const match = text.match(/tsk_\w+/i);
    if (match) {
      if (permissions.delete_task === false)
        return {
          message: `⛔ Permission **delete_task** désactivée.`,
          toolCalls: [],
        };
      const r = await run("delete_task", { taskId: match[0] });
      return {
        message: r.error
          ? `❌ ${r.error}`
          : `🗑️ Tâche \`${match[0]}\` **supprimée** du système.`,
        toolCalls,
      };
    }
  }
  if (
    lower.match(
      /plan|roadmap|impl[eé]ment|int[eé]gr|crée?r?\s+(?:les?\s+)?t[aâ]ches?|plusieurs t[aâ]ches?/,
    )
  ) {
    // Extract task names from numbered lists in the message
    const lines = text
      .split("\n")
      .filter((l) => l.match(/^\s*[\d\-\*•]\s*[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ]/));
    const taskNames = lines
      .map((l) => l.replace(/^\s*[\d\-\*•\.]+\s*/, "").trim())
      .filter(Boolean);
    if (taskNames.length >= 2) {
      const tasks = taskNames
        .slice(0, 10)
        .map((name) => ({ name, agent: "main" }));
      const r = await run("batch_create_tasks", { tasks });
      if (r.__denied) return { message: `⛔ ${r.message}`, toolCalls: [] };
      return {
        message: `✅ **${r.count} tâches créées** !\n\n${r.created?.map((t, i) => `${i + 1}. \`${t.id}\` — **${t.name}**`).join("\n") || ""}`,
        toolCalls,
      };
    }
  }
  if (
    lower.match(/crée?r?|crée|nouveau|nouvelle|ajouter?|add/) &&
    lower.match(/t[aâ]che|task/)
  ) {
    const nameMatch = text.match(
      /(?:t[aâ]che|task)\s+(?:nommée?|appelée?|:)?\s*[«""]?([^"»\n]+)[»""]?/i,
    );
    const name = nameMatch
      ? nameMatch[1].trim()
      : `Tâche Lia — ${new Date().toLocaleTimeString("fr-FR")}`;
    const r = await run("create_task", { name, agent: "main" });
    if (r.__denied) return { message: `⛔ ${r.message}`, toolCalls: [] };
    return {
      message: `✅ Tâche **"${name}"** créée !\n\nID : \`${r.created?.id || "—"}\`\nStatut : *planifié*`,
      toolCalls,
    };
  }
  if (lower.match(/modèle|modele|template/)) {
    const r = await run("list_modeles", {});
    const mods = (r.modeles || []).slice(0, 10);
    return {
      message: `**${r.modeles?.length || 0} modèles** disponibles :\n\n${mods.map((m) => `• **${m.name}** \`${m.id}\` — ${m.skillName || "instructions libres"}`).join("\n")}`,
      toolCalls,
    };
  }
  if (lower.match(/récurrences?|cron|planif/)) {
    const r = await run("list_recurrences", {});
    const recs = r.recurrences || [];
    const active = recs.filter((r) => r.active);
    return {
      message: `**${active.length} récurrences actives** sur ${recs.length} :\n\n${active.map((r) => `• **${r.name}** — ${r.human}`).join("\n")}`,
      toolCalls,
    };
  }
  return {
    message: `Je suis en **mode démo** (sans clé API Anthropic).\n\nEssayez :\n• *"Liste mes tâches"*\n• *"Crée une tâche nommée MonTest"*\n• *"Démarre tsk_001"*\n• *"Montre les modèles"*\n\nConfigurez \`ANTHROPIC_API_KEY\` pour le vrai Claude.`,
    toolCalls: [],
  };
}

// ── Ollama chat (local) ───────────────────────────────────────────────────────

async function callOllama(messages, model) {
  const ollamaModel = model.replace("ollama/", "");
  const resp = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      messages: [
        { role: "system", content: LIA_SYSTEM },
        ...messages.map((m) => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content.find((c) => c.type === "text")?.text || ""
            : m.content,
        })),
      ],
      stream: false,
    }),
  });
  if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);
  const data = await resp.json();
  return { message: data.message?.content || "", toolCalls: [] };
}

// ── Anthropic agentic loop ────────────────────────────────────────────────────

async function callAnthropic(messages, model, permissions) {
  const apiKey =
    (apiKeys.anthropic && decryptKey(apiKeys.anthropic)) ||
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const anthropicModel = model.startsWith("claude")
    ? model
    : "claude-sonnet-4-6";
  const allowedTools = LIA_TOOLS.filter((t) => permissions[t.name] !== false);
  const allToolCalls = [];
  let msgs = messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content) ? m.content : m.content,
  }));

  for (let i = 0; i < 8; i++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 1500,
        system: LIA_SYSTEM,
        tools: allowedTools,
        messages: msgs,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API ${resp.status}`);
    }
    const data = await resp.json();

    if (data.stop_reason === "end_turn") {
      const text = data.content.find((c) => c.type === "text")?.text || "";
      return { message: text, toolCalls: allToolCalls };
    }
    if (data.stop_reason === "tool_use") {
      const uses = data.content.filter((c) => c.type === "tool_use");
      const results = [];
      for (const tu of uses) {
        const result = await executeTool(tu.name, tu.input, permissions);
        allToolCalls.push({ tool: tu.name, input: tu.input, result });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      msgs = [
        ...msgs,
        { role: "assistant", content: data.content },
        { role: "user", content: results },
      ];
    }
  }
  return {
    message: "Boucle agentique : limite atteinte.",
    toolCalls: allToolCalls,
  };
}

async function callCloudflare(messages, model) {
  const key =
    (apiKeys.cloudflare && decryptKey(apiKeys.cloudflare)) ||
    process.env.CLOUDFLARE_API_KEY;
  const accountId =
    (apiKeys.cloudflare_account && decryptKey(apiKeys.cloudflare_account)) ||
    process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!key || !accountId) return null;

  const cfModel = model.replace("cloudflare/", "");
  const msgs = [
    { role: "system", content: LIA_SYSTEM },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === "text")?.text || ""
        : m.content,
    })),
  ];

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${cfModel}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: msgs }),
    },
  );

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.errors?.[0]?.message || `Cloudflare AI ${resp.status}`);
  }

  const data = await resp.json();
  return { message: data.result?.response || "", toolCalls: [] };
}

async function callOpenRouter(messages, model) {
  const key =
    (apiKeys.openrouter && decryptKey(apiKeys.openrouter)) ||
    process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "ClawBoard Lia",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: LIA_SYSTEM },
        ...messages.map((m) => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content.find((c) => c.type === "text")?.text || ""
            : m.content,
        })),
      ],
      max_tokens: 1500,
    }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `OpenRouter ${resp.status}`);
  }
  const data = await resp.json();
  return { message: data.choices?.[0]?.message?.content || "", toolCalls: [] };
}

const NVIDIA_THINKING_MODELS = [
  "nemotron-ultra",
  "nemotron-super",
  "qwq",
  "deepseek-r1",
  "deepseek-v3",
];

async function callNvidia(messages, model, activeTools = null) {
  const key =
    (apiKeys.nvidia && decryptKey(apiKeys.nvidia)) ||
    process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const isThinking = NVIDIA_THINKING_MODELS.some((t) =>
    model.toLowerCase().includes(t),
  );
  // Models that support OpenAI-compatible function calling
  const TOOL_CAPABLE = [
    "llama-3",
    "llama-4",
    "mistral",
    "mixtral",
    "nemotron",
    "qwen",
    "minimax",
    "deepseek",
  ];
  const supportsTools = TOOL_CAPABLE.some((t) =>
    model.toLowerCase().includes(t),
  );
  // Use dynamic (filtered) tools if provided, otherwise all tools
  const toolsToSend = activeTools || LIA_TOOLS;
  const nvidiaTools = toolsToSend.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
  const msgs = [
    { role: "system", content: LIA_SYSTEM },
    ...messages.map((m) => {
      const mapped = {
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.find((c) => c.type === "text")?.text || ""
          : m.content,
      };
      // Preserve tool_calls on assistant messages
      if (m.role === "assistant" && m.tool_calls?.length) {
        mapped.tool_calls = m.tool_calls;
        if (!mapped.content) mapped.content = null;
      }
      // Preserve tool_call_id on tool messages
      if (m.role === "tool" && m.tool_call_id) {
        mapped.tool_call_id = m.tool_call_id;
        if (m.name) mapped.name = m.name;
      }
      return mapped;
    }),
  ];
  const body = {
    model,
    messages: msgs,
    max_tokens: 2000,
    temperature: 0.7,
    stream: false,
  };
  if (supportsTools) {
    body.tools = nvidiaTools;
    body.tool_choice = "auto";
  }
  if (isThinking)
    body.chat_template_kwargs = { thinking: { type: "disabled" } };
  const resp = await fetch(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `NVIDIA NIM ${resp.status}`);
  }
  const data = await resp.json();
  const msg = data.choices?.[0]?.message;
  // Handle tool calls from the model (structured field)
  if (msg?.tool_calls?.length) {
    return { message: null, _toolCalls: msg.tool_calls, _msgs: msgs };
  }
  const raw = msg?.content || msg?.reasoning_content || "";
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // Fallback: detect tool call JSON written in text content (some models output JSON instead of tool_calls field)
  // Supports: {"type":"function","name":"...","parameters":{...}} or multiple objects
  const syntheticToolCalls = [];
  const jsonPattern =
    /\{[\s\S]*?"type"\s*:\s*"function"[\s\S]*?"name"\s*:\s*"(\w+)"[\s\S]*?\}/g;
  let jsonMatch;
  let textToParse = clean;
  while ((jsonMatch = jsonPattern.exec(textToParse)) !== null) {
    try {
      // Find balanced JSON object
      let start = jsonMatch.index,
        depth = 0,
        end = -1;
      for (let i = start; i < textToParse.length; i++) {
        if (textToParse[i] === "{") depth++;
        else if (textToParse[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) continue;
      const obj = JSON.parse(textToParse.slice(start, end + 1));
      const fnName = obj.name || obj.function?.name;
      const fnArgs = obj.parameters || obj.arguments || obj.input || {};
      if (fnName) {
        syntheticToolCalls.push({
          id: `call_${Date.now()}_${syntheticToolCalls.length}`,
          function: { name: fnName, arguments: JSON.stringify(fnArgs) },
        });
      }
    } catch {
      /* ignore malformed */
    }
  }
  if (syntheticToolCalls.length) {
    return { message: null, _toolCalls: syntheticToolCalls, _msgs: msgs };
  }
  return { message: clean, toolCalls: [] };
}

async function pipeOpenAIStream(upstreamResp, res) {
  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let thinkBuf = ""; // accumulates <think> block
  let inThink = false; // true while inside <think>...</think>
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        const delta = parsed.choices?.[0]?.delta;
        // Ignore reasoning_content (internal thinking) — only use content
        let token = delta?.content || "";
        if (!token) continue;
        // Filter <think>...</think> blocks streamed token by token
        thinkBuf += token;
        let out = "";
        while (true) {
          if (inThink) {
            const end = thinkBuf.indexOf("</think>");
            if (end === -1) {
              thinkBuf = thinkBuf.slice(-20);
              break;
            } // keep tail in case tag split
            inThink = false;
            thinkBuf = thinkBuf.slice(end + 8);
          } else {
            const start = thinkBuf.indexOf("<think>");
            if (start === -1) {
              out += thinkBuf;
              thinkBuf = "";
              break;
            }
            out += thinkBuf.slice(0, start);
            inThink = true;
            thinkBuf = thinkBuf.slice(start + 7);
          }
        }
        if (out) res.write(`data: ${JSON.stringify({ token: out })}\n\n`);
      } catch {
        /* skip malformed */
      }
    }
  }
}

async function simulateStream(text, res) {
  const words = text.split(/(?<= )/);
  for (const word of words) {
    res.write(`data: ${JSON.stringify({ token: word })}\n\n`);
    await new Promise((r) => setTimeout(r, 12));
  }
}

async function streamNvidia(messages, model, res) {
  const key =
    (apiKeys.nvidia && decryptKey(apiKeys.nvidia)) ||
    process.env.NVIDIA_API_KEY;
  if (!key) {
    await simulateStream(
      "❌ Clé API NVIDIA non configurée. Ajoutez-la dans **Paramètres → Clés API**.",
      res,
    );
    return;
  }
  const isThinking = NVIDIA_THINKING_MODELS.some((t) =>
    model.toLowerCase().includes(t),
  );
  const body = {
    model,
    messages: [
      { role: "system", content: LIA_SYSTEM },
      ...messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.find((c) => c.type === "text")?.text || ""
          : m.content,
      })),
    ],
    max_tokens: 1500,
    temperature: 0.7,
    stream: true,
  };
  if (isThinking)
    body.chat_template_kwargs = { thinking: { type: "disabled" } };
  const resp = await fetch(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    await simulateStream(
      `❌ Erreur NVIDIA : ${e.error?.message || resp.status}`,
      res,
    );
    return;
  }
  await pipeOpenAIStream(resp, res);
}

async function streamAnthropic(messages, model, permissions, res) {
  const key =
    (apiKeys.anthropic && decryptKey(apiKeys.anthropic)) ||
    process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const mock = await smartMock(messages, permissions);
    await simulateStream(mock.message, res);
    res.write(
      `data: ${JSON.stringify({ done: true, toolCalls: mock.toolCalls || [] })}\n\n`,
    );
    return;
  }
  const fullResult = await callAnthropic(messages, model, permissions);
  await simulateStream(fullResult?.message || "", res);
  res.write(
    `data: ${JSON.stringify({ done: true, toolCalls: fullResult?.toolCalls || [] })}\n\n`,
  );
}

async function callGemini(messages, model) {
  const key =
    (apiKeys.gemini && decryptKey(apiKeys.gemini)) ||
    process.env.GEMINI_API_KEY;
  if (!key) return null;
  const geminiModel = model.replace("gemini/", "") || "gemini-2.0-flash";
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      {
        text: Array.isArray(m.content)
          ? m.content.find((c) => c.type === "text")?.text || ""
          : m.content,
      },
    ],
  }));
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LIA_SYSTEM }] },
        contents,
      }),
    },
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Gemini ${resp.status}`);
  }
  const data = await resp.json();
  return {
    message: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    toolCalls: [],
  };
}

// ── Kimi (MoonshotAI) — clé DB: "moonshot" ───────────────────────────────────
async function callKimi(messages, model) {
  const key =
    (apiKeys.moonshot && decryptKey(apiKeys.moonshot)) ||
    (apiKeys.kimi && decryptKey(apiKeys.kimi));
  if (!key) return null;
  const kimiModel = model.replace("kimi/", "") || "kimi-latest";
  const msgs = [
    { role: "system", content: LIA_SYSTEM },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === "text")?.text || ""
        : m.content,
    })),
  ];
  const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: kimiModel,
      messages: msgs,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Kimi ${resp.status}`);
  }
  const data = await resp.json();
  const clean = (data.choices?.[0]?.message?.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  return { message: clean, toolCalls: [] };
}

// ── MiniMax ───────────────────────────────────────────────────────────────────
async function callMinimax(messages, model) {
  const key = apiKeys.minimax && decryptKey(apiKeys.minimax);
  if (!key) return null;
  const mmModel = model.replace("minimax/", "") || "MiniMax-Text-01";
  const msgs = [
    { role: "system", content: LIA_SYSTEM },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === "text")?.text || ""
        : m.content,
    })),
  ];
  // MiniMax uses OpenAI-compatible endpoint
  const resp = await fetch("https://api.minimaxi.chat/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: mmModel,
      messages: msgs,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `MiniMax ${resp.status}`);
  }
  const data = await resp.json();
  const clean = (data.choices?.[0]?.message?.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  return { message: clean, toolCalls: [] };
}

// ── Zhipu AI (GLM) ────────────────────────────────────────────────────────────
async function callZhipu(messages, model) {
  const key = apiKeys.zhipu && decryptKey(apiKeys.zhipu);
  if (!key) return null;
  const glmModel = model.replace("zhipu/", "") || "glm-4-flash";
  const msgs = [
    { role: "system", content: LIA_SYSTEM },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === "text")?.text || ""
        : m.content,
    })),
  ];
  const resp = await fetch(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: glmModel,
        messages: msgs,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    },
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Zhipu ${resp.status}`);
  }
  const data = await resp.json();
  const clean = (data.choices?.[0]?.message?.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  return { message: clean, toolCalls: [] };
}

// ── DeepSeek (direct API) — clé DB: "deepseek" ───────────────────────────────
async function callDeepSeek(messages, model) {
  const key = apiKeys.deepseek && decryptKey(apiKeys.deepseek);
  if (!key) return null;
  const dsModel = model.replace("deepseek/", "") || "deepseek-chat";
  const msgs = [
    { role: "system", content: LIA_SYSTEM },
    ...messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.find((c) => c.type === "text")?.text || ""
        : m.content,
    })),
  ];
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: dsModel,
      messages: msgs,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `DeepSeek ${resp.status}`);
  }
  const data = await resp.json();
  const clean = (data.choices?.[0]?.message?.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  return { message: clean, toolCalls: [] };
}

// ── Filesystem Access Control ─────────────────────────────────────────────────
// Chemins TOUJOURS bloqués (sensibles OS / credentials)
const FS_BLOCKED = [
  "windows",
  "system32",
  "syswow64",
  "program files",
  "programdata",
  "appdata\\roaming",
  "appdata\\local\\microsoft",
  "appdata\\local\\google",
  "/.ssh",
  "/.gnupg",
  "/etc/passwd",
  "/etc/shadow",
  "/etc/hosts",
  "node_modules",
  ".git\\objects",
  ".env",
  "secrets",
  "credentials",
  "id_rsa",
  "id_ed25519",
  ".pem",
  ".key",
  ".pfx",
  ".p12",
];
// Chemins autorisés par défaut (Desktop et projet en cours)
let fsAllowedPaths = [
  "C:\\Users\\BOB\\Desktop",
  "C:\\Users\\BOB\\Documents",
  pathJoin(dirname(fileURLToPath(import.meta.url))), // répertoire du projet
];
let fsGlobalEnabled = true; // peut être désactivé globalement

function isPathAllowed(p) {
  if (!fsGlobalEnabled) return false;
  const norm = p.replace(/\//g, "\\").toLowerCase();
  // Blocked keywords
  if (FS_BLOCKED.some((b) => norm.includes(b.toLowerCase()))) return false;
  // Must be under an allowed root
  const allowed = fsAllowedPaths.some((root) =>
    norm.startsWith(root.replace(/\//g, "\\").toLowerCase()),
  );
  return allowed;
}

// ── Filesystem context injection for non-tool-calling models ──────────────────
function extractPaths(text) {
  const paths = [];
  // Windows paths — greedy match, stops at quotes/newlines (allows spaces in dir names)
  // Order: quoted paths first, then unquoted
  const winQuoted = [...text.matchAll(/[""`]([A-Za-z]:\\[^"'`\n]+)[""`]/g)].map(
    (m) => m[1],
  );
  const winUnquoted = [
    ...text.matchAll(
      /(?<![\\])([A-Za-z]:\\(?:[^"'`\n<>|?*]+\\)*[^"'`\n<>|?*]*)/g,
    ),
  ].map((m) => m[1].trimEnd().replace(/[.,;:!?)]+$/, ""));
  // Unix paths (Linux/Mac style)
  const unixMatches = [
    ...text.matchAll(/(?:^|[\s"'`])((?:\/[\w.\- ]+)+)/g),
  ].map((m) => m[1]);
  for (const p of [...winQuoted, ...winUnquoted, ...unixMatches]) {
    const clean = p.trim();
    if (clean.length > 3) {
      // Try exact match, then trimmed versions
      if (existsSync(clean)) {
        paths.push(clean);
        continue;
      }
      // Try removing trailing word (path might include part of sentence)
      const parent = clean.replace(/\\[^\\]+$/, "");
      if (parent.length > 3 && existsSync(parent)) paths.push(parent);
    }
  }
  return [...new Set(paths)];
}

async function injectFilesystemContext(messages) {
  const last = messages.filter((m) => m.role === "user").pop()?.content || "";
  const text =
    (Array.isArray(last) ? last.find((c) => c.type === "text")?.text : last) ||
    "";
  const paths = extractPaths(text);
  if (!paths.length) return messages;
  const contextParts = [];
  for (const p of paths.slice(0, 3)) {
    try {
      const stat = statSync(p);
      if (stat.isDirectory()) {
        const result = await executeTool("list_directory", { path: p }, {});
        if (!result.error) {
          const dirs = result.dirs?.slice(0, 20).join(", ") || "";
          const files = result.files?.slice(0, 30).join(", ") || "";
          contextParts.push(
            `**Dossier \`${p}\`** (${result.total} entrées) :\n📁 Sous-dossiers : ${dirs || "aucun"}\n📄 Fichiers : ${files || "aucun"}`,
          );
        }
      } else {
        const result = await executeTool(
          "read_file",
          { path: p, maxLines: 80 },
          {},
        );
        if (!result.error)
          contextParts.push(
            `**Fichier \`${p}\`** (${result.lines} lignes) :\n\`\`\`\n${result.content}\n\`\`\``,
          );
      }
    } catch {
      /* skip */
    }
  }
  if (!contextParts.length) return messages;
  // Inject as assistant context message before the last user message
  const injected = {
    role: "user",
    content: `[CONTEXTE SYSTÈME — Contenu des fichiers/dossiers mentionnés]\n\n${contextParts.join("\n\n")}\n\n[Fin du contexte]`,
  };
  const allButLast = messages.slice(0, -1);
  const lastMsg = messages[messages.length - 1];
  return [...allButLast, injected, lastMsg];
}

// ── Token optimization helpers ────────────────────────────────────────────────

// 1. Sliding window: garder seulement les N derniers messages (économise 30-50%)
const MAX_HISTORY_MESSAGES = 20;

// 2. Dynamic tool loading: inclure seulement les outils pertinents au contexte
function selectRelevantTools(userText, allTools) {
  const t = userText.toLowerCase();
  const always = [
    "list_tasks",
    "create_task",
    "batch_create_tasks",
    "save_note",
  ];
  const conditional = {
    "get_task|tsk_|détail|detail|tâche|tache|agent|fait|effectu|résultat|resultat":
      ["get_task"],
    "start|démarre|lance|exécute": ["start_task"],
    "supprim|delet|efface": ["delete_task"],
    "modif|patch|change": ["patch_task"],
    "modèle|template|modele": ["list_modeles", "create_modele"],
    "récurr|cron|planif|auto": ["list_recurrences", "create_cron"],
    "dossier|fichier|chemin|c:\\\\|/home/|/var/": [
      "list_directory",
      "read_file",
      "write_file",
    ],
    "écri|write|créer un fichier|sauvegarder dans": ["write_file"],
    "cherch|search|web|google|internet|trouve": ["web_search", "web_fetch"],
    "url|http|page|site|fetch": ["web_fetch", "web_search"],
    "execut|command|shell|terminal|npm|git|node|python|pip|curl": [
      "exec_command",
    ],
    "mémoire|memory|souvien|rappel|retenu|noté|note": [
      "search_memory",
      "save_note",
    ],
    "envoi|send|message|telegram|discord|slack|notif": ["send_message"],
  };
  const needed = new Set(always);
  for (const [pattern, tools] of Object.entries(conditional)) {
    if (t.match(new RegExp(pattern, "i"))) tools.forEach((n) => needed.add(n));
  }
  return allTools.filter((tool) => needed.has(tool.name));
}

// 3. Trim large tool results (évite l'accumulation dans la boucle agentique)
function trimToolResult(result, maxChars = 800) {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= maxChars) return result;
  try {
    return JSON.parse(str.slice(0, maxChars) + "...");
  } catch {
    return str.slice(0, maxChars) + "…";
  }
}

// 4. Sliding window sur l'historique
function applySliding(messages) {
  const system = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= MAX_HISTORY_MESSAGES) return messages;
  // Always keep first user message as context anchor
  const first = nonSystem[0];
  const recent = nonSystem.slice(-MAX_HISTORY_MESSAGES + 1);
  return [...system, first, ...recent];
}

// 4b. Sanitize history — remove orphan tool messages & broken tool_calls
function sanitizeHistory(messages) {
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    // Skip tool messages that don't have a preceding assistant with tool_calls
    if (m.role === "tool") {
      let foundAssistant = false;
      for (let j = result.length - 1; j >= 0; j--) {
        if (result[j].role === "assistant" && result[j].tool_calls?.length) {
          foundAssistant = true;
          break;
        }
        if (result[j].role === "user" || result[j].role === "system") break;
      }
      if (!foundAssistant) continue; // skip orphan tool message
    }
    // Skip assistant messages with empty tool_calls array but no content
    if (
      m.role === "assistant" &&
      m.tool_calls &&
      !m.tool_calls.length &&
      !m.content
    ) {
      continue;
    }
    // Clean assistant messages whose content is raw JSON tool-call garbage
    if (m.role === "assistant" && typeof m.content === "string") {
      const trimmed = m.content.trim();
      if (
        trimmed.startsWith("{") &&
        trimmed.includes('"type"') &&
        trimmed.includes('"function"')
      ) {
        result.push({ ...m, content: "(action précédente)" });
        continue;
      }
      // Truncate very long assistant messages from old tool results in history
      if (trimmed.length > 1500) {
        result.push({ ...m, content: trimmed.slice(0, 1500) + "…" });
        continue;
      }
    }
    result.push(m);
  }
  return result;
}

async function runAgenticLoop(messages, model, permissions) {
  try {
    if (model.startsWith("ollama/")) return await callOllama(messages, model);
    const NVIDIA_PREFIXES = [
      "nvidia/",
      "meta/",
      "mistralai/",
      "microsoft/",
      "deepseek-ai/",
      "qwen/",
      "moonshotai/",
      "google/gemma",
      "ibm/",
      "writer/",
      "bytedance/",
      "openai/gpt-oss",
      "minimaxai/",
      "z-ai/",
      "stepfun-ai/",
      "thudm/",
      "ai21labs/",
      "databricks/",
      "snowflake/",
      "tiiuae/",
      "upstage/",
      "bigcode/",
      "rakuten/",
      "sarvamai/",
    ];
    if (NVIDIA_PREFIXES.some((p) => model.startsWith(p))) {
      // Optimisation 1: sliding window sur l'historique
      const windowed = applySliding(messages);
      // Optimisation 1b: sanitize orphan tool messages
      const clean = sanitizeHistory(windowed);
      // Optimisation 2: injection filesystem si chemin détecté
      const enriched = await injectFilesystemContext(clean);
      // Optimisation 3: dynamic tool selection (réduire les tokens de tools)
      const lastUserMsg =
        messages.filter((m) => m.role === "user").pop()?.content || "";
      const userText = Array.isArray(lastUserMsg)
        ? lastUserMsg.find((c) => c.type === "text")?.text || ""
        : lastUserMsg;
      // Agentic loop with tool calling (up to 5 rounds)
      let currentMsgs = enriched;
      const allToolCalls = [];
      const seenErrors = new Set();
      let consecutiveErrors = 0;
      for (let round = 0; round < 5; round++) {
        const r = await callNvidia(
          currentMsgs,
          model,
          selectRelevantTools(userText, LIA_TOOLS),
        );
        if (!r)
          return {
            message: `❌ Clé API NVIDIA non configurée. Ajoutez-la dans **Paramètres → Clés API**.`,
            toolCalls: [],
          };
        if (!r._toolCalls) {
          let msg = r.message || "";
          // If the message is empty or looks like raw JSON, try to get a proper response
          if (
            !msg.trim() ||
            (msg.trim().startsWith("{") && msg.includes('"type"'))
          ) {
            if (allToolCalls.length > 0) {
              // Ask the model to summarize the tool results in human-readable form
              try {
                const summaryMsgs = [
                  ...currentMsgs,
                  {
                    role: "user",
                    content:
                      "Résume les résultats des actions effectuées ci-dessus de manière claire et lisible pour l'utilisateur. Réponds en français.",
                  },
                ];
                const summary = await callNvidia(summaryMsgs, model, []);
                if (summary && summary.message && !summary._toolCalls) {
                  msg = summary.message;
                }
              } catch {
                /* fallback to generic */
              }
              if (
                !msg.trim() ||
                (msg.trim().startsWith("{") && msg.includes('"type"'))
              ) {
                // Build a formatted summary from tool call results
                const lines = allToolCalls.map((tc) => {
                  const toolLabel = tc.tool.replace(/_/g, " ");
                  const resultStr =
                    typeof tc.result === "object"
                      ? JSON.stringify(tc.result)
                      : String(tc.result);
                  const preview =
                    resultStr.length > 200
                      ? resultStr.slice(0, 200) + "…"
                      : resultStr;
                  return `- **${toolLabel}** : ${preview}`;
                });
                msg = `✅ **${allToolCalls.length} action(s) effectuée(s) :**\n\n${lines.join("\n")}`;
              }
            } else {
              // No tool calls and empty response — retry with just the latest user message (clean context)
              try {
                const retryMsgs = [{ role: "user", content: userText }];
                const retry = await callNvidia(
                  retryMsgs,
                  model,
                  selectRelevantTools(userText, LIA_TOOLS),
                );
                if (retry?._toolCalls) {
                  // Model wants tools on clean context — let it continue the loop
                  currentMsgs = retryMsgs;
                  // Feed the tool calls back into the loop by replacing r
                  const toolResultMsgs2 = [];
                  for (const tc of retry._toolCalls) {
                    const fnName = tc.function?.name;
                    let fnInput = {};
                    try {
                      fnInput = JSON.parse(tc.function?.arguments || "{}");
                    } catch {
                      fnInput = {};
                    }
                    const result = await executeTool(
                      fnName,
                      fnInput,
                      permissions,
                    );
                    const trimmed = trimToolResult(result);
                    allToolCalls.push({ tool: fnName, input: fnInput, result });
                    toolResultMsgs2.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      name: fnName,
                      content: JSON.stringify(trimmed),
                    });
                  }
                  currentMsgs = [
                    ...retryMsgs,
                    {
                      role: "assistant",
                      tool_calls: retry._toolCalls,
                      content: null,
                    },
                    ...toolResultMsgs2,
                  ];
                  continue; // next round of the loop
                } else if (retry?.message?.trim()) {
                  msg = retry.message;
                }
              } catch {
                /* fallback below */
              }
              if (!msg.trim()) {
                msg =
                  "⚠️ Le modèle n'a pas pu répondre. Essayez de reformuler votre question ou de démarrer une nouvelle conversation.";
              }
            }
          }
          return { message: msg, toolCalls: allToolCalls };
        }
        // Execute tool calls
        const toolResultMsgs = [];
        let roundHasError = false;
        for (const tc of r._toolCalls) {
          const fnName = tc.function?.name;
          let fnInput = {};
          try {
            fnInput = JSON.parse(tc.function?.arguments || "{}");
          } catch {
            fnInput = {};
          }
          const result = await executeTool(fnName, fnInput, permissions);
          // Detect repeated errors → circuit breaker
          const errKey = result?.error ? `${fnName}:${result.error}` : null;
          if (errKey) {
            roundHasError = true;
            if (seenErrors.has(errKey)) {
              consecutiveErrors++;
            }
            seenErrors.add(errKey);
          }
          // Optimisation 4: tronquer les résultats volumineux
          const trimmed = trimToolResult(result);
          allToolCalls.push({ tool: fnName, input: fnInput, result });
          toolResultMsgs.push({
            role: "tool",
            tool_call_id: tc.id,
            name: fnName,
            content: JSON.stringify(trimmed),
          });
        }
        if (!roundHasError) consecutiveErrors = 0;
        currentMsgs = [
          ...currentMsgs,
          { role: "assistant", tool_calls: r._toolCalls, content: null },
          ...toolResultMsgs,
        ];
        // Circuit breaker: if same error seen 2+ times, stop looping
        if (consecutiveErrors >= 2) break;
      }
      // Max rounds reached or circuit breaker — ask model for proper summary
      if (allToolCalls.length > 0) {
        try {
          const summaryMsgs = [
            ...currentMsgs,
            {
              role: "user",
              content:
                "Résume maintenant TOUTES les informations obtenues ci-dessus de manière claire, structurée et lisible. Réponds en français avec des détails utiles.",
            },
          ];
          const summary = await callNvidia(summaryMsgs, model, []);
          if (
            summary?.message &&
            !summary._toolCalls &&
            summary.message.trim().length > 20
          ) {
            return { message: summary.message, toolCalls: allToolCalls };
          }
        } catch {
          /* fallback below */
        }
        // Fallback: build summary from actual tool results
        const lines = allToolCalls
          .filter((tc) => !tc.result?.error)
          .map((tc) => {
            const toolLabel = tc.tool.replace(/_/g, " ");
            const resultStr =
              typeof tc.result === "object"
                ? JSON.stringify(tc.result)
                : String(tc.result);
            const preview =
              resultStr.length > 300
                ? resultStr.slice(0, 300) + "…"
                : resultStr;
            return `- **${toolLabel}** : ${preview}`;
          });
        const errors = allToolCalls.filter((tc) => tc.result?.error);
        let msg = `📋 **${allToolCalls.length} action(s) effectuée(s) :**\n\n${lines.join("\n")}`;
        if (errors.length)
          msg += `\n\n⚠️ ${errors.length} erreur(s) rencontrée(s).`;
        return { message: msg, toolCalls: allToolCalls };
      }
      return { message: "✅ Actions effectuées.", toolCalls: allToolCalls };
    }
    // Apply sliding window + sanitization to all providers
    const slim = sanitizeHistory(applySliding(messages));
    if (model.startsWith("gemini/") || model.startsWith("gemini-")) {
      const r = await callGemini(slim, model);
      return (
        r || {
          message: `❌ Clé API Gemini non configurée. Ajoutez-la dans **Paramètres → Clés API**.`,
          toolCalls: [],
        }
      );
    }
    if (model.startsWith("kimi/")) {
      const r = await callKimi(slim, model);
      return (
        r || {
          message: `❌ Clé API Kimi non configurée. Ajoutez-la dans **Paramètres → Clés API** (provider : kimi).`,
          toolCalls: [],
        }
      );
    }
    if (model.startsWith("minimax/")) {
      const r = await callMinimax(slim, model);
      return (
        r || {
          message: `❌ Clé API MiniMax non configurée. Ajoutez-la dans **Paramètres → Clés API** (provider : minimax).`,
          toolCalls: [],
        }
      );
    }
    if (model.startsWith("zhipu/")) {
      const r = await callZhipu(slim, model);
      return (
        r || {
          message: `❌ Clé API Zhipu non configurée. Ajoutez-la dans **Paramètres → Clés API** (provider : zhipu).`,
          toolCalls: [],
        }
      );
    }
    if (model.startsWith("deepseek/")) {
      const r = await callDeepSeek(slim, model);
      return (
        r || {
          message: `❌ Clé API DeepSeek non configurée. Ajoutez-la dans **Paramètres → Clés API** (provider : deepseek).`,
          toolCalls: [],
        }
      );
    }
    if (model.startsWith("openrouter/") && !model.includes("claude")) {
      const r = await callOpenRouter(slim, model);
      return (
        r || {
          message: `❌ Clé API OpenRouter non configurée. Ajoutez-la dans **Paramètres → Clés API**.`,
          toolCalls: [],
        }
      );
    }
    if (model.startsWith("cloudflare/")) {
      const r = await callCloudflare(slim, model);
      return (
        r || {
          message: `❌ Clé API Cloudflare non configurée. Ajoutez-la dans **Paramètres → Clés API** (Account ID requis).`,
          toolCalls: [],
        }
      );
    }
    const anthropicResult = await callAnthropic(slim, model, permissions);
    if (anthropicResult) return anthropicResult;
    return await smartMock(messages, permissions);
  } catch (e) {
    return { message: `❌ Erreur API : ${e.message}`, toolCalls: [] };
  }
}

// ─── NemoClaw helpers (shared with route modules) ─────────────────────────────

function runNemoClawCmd(args) {
  return new Promise((resolve, reject) => {
    // Ensure Node.js is available via NVM before execution
    const cmd = `wsl -d Ubuntu -- bash -lc "source ~/.nvm/nvm.sh 2>/dev/null; nemoclaw ${args}" 2>&1`;
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      resolve((stdout || "").trim());
    });
  });
}

function parseNemoClawList(raw) {
  if (raw.includes("No such file or directory") || raw.includes("command not found")) {
    throw new Error(`WSL Critical Error: ${raw.split('\n')[0]}`);
  }
  const sandboxes = [];
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === "Sandboxes:" || line === "No sandboxes found.") {
      i++;
      continue;
    }
    // Only accept reasonable sandbox names (letters, numbers, hyphens, underscores)
    if (
      !line.startsWith("model:") &&
      !line.startsWith("[") &&
      !line.startsWith("Run:") &&
      !line.startsWith("Status:") &&
      !line.startsWith("Logs:") &&
      /^[a-zA-Z0-9_\-\*]+$/.test(line)
    ) {
      const isDefault = line.endsWith("*");
      const name = isDefault ? line.slice(0, -1).trim() : line;
      const sandbox = {
        name,
        default: isDefault,
        model: "",
        provider: "",
        gpu: false,
        policies: "none",
        status: "active",
      };
      if (lines[i + 1]?.startsWith("model:")) {
        const meta = lines[i + 1];
        sandbox.model = (meta.match(/model:\s*(\S+)/) || [])[1] || "";
        sandbox.provider = (meta.match(/provider:\s*(\S+)/) || [])[1] || "";
        sandbox.gpu = /GPU/.test(meta) && !/CPU/.test(meta);
        sandbox.policies =
          (meta.match(/policies:\s*(.+)$/) || [])[1]?.trim() || "none";
        i++;
      }
      sandboxes.push(sandbox);
    }
    i++;
  }
  return sandboxes;
}

function parseNemoClawStatus(raw) {
  const get = (key) =>
    (raw.match(new RegExp(`${key}:\\s*(.+)`, "i")) || [])[1]?.trim() || "";
  return {
    model: get("Model"),
    provider: get("Provider"),
    gpu: /yes/i.test(get("GPU")),
    policies: get("Policies"),
    healthy: /yes/i.test(get("Healthy")),
    status: /yes/i.test(get("Healthy")) ? "active" : "offline",
    raw,
  };
}

function sandboxesToAgents(sandboxes) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(sandboxes.length)));
  return sandboxes.map((s, i) => ({
    id: s.name,
    label: s.name,
    role: s.default ? "Default Sandbox" : "NemoClaw Sandbox",
    model: s.model || "nemotron",
    provider: s.provider,
    gpu: s.gpu,
    policies: s.policies,
    status: s.status,
    parentId: null,
    position: { x: (i % cols) * 280 + 50, y: Math.floor(i / cols) * 220 + 50 },
  }));
}

// ─── Route Context & Router Setup ─────────────────────────────────────────────

const routeCtx = {
  pool,
  schemas,
  sanitizeObject,
  checkRateLimit,
  broadcast,
  encryptKey,
  decryptKey,
  SECRET,
  PORT,
  sseClients,
  AGENTS,
  getAllTasks,
  getTaskById,
  broadcastTasks,
  invalidateTasksCache,
  getAllModeles,
  getAllRecurrences,
  getAllSkills,
  getAllMemoryDocs,
  getAllGuardrails,
  getPipeline,
  getPreInstructions,
  rowToModele,
  rowToRecurrence,
  runAgenticLoop,
  simulateStream,
  runNemoClawCmd,
  parseNemoClawList,
  parseNemoClawStatus,
  sandboxesToAgents,
  getVitals,
  // Mutable state — accessed via ctx.state so route modules see live values
  state: {
    get apiKeys() {
      return apiKeys;
    },
    set apiKeys(v) {
      apiKeys = v;
    },
    get quotas() {
      return quotas;
    },
    get totalCost24h() {
      return totalCost24h;
    },
    get approvalQueue() {
      return approvalQueue;
    },
    get notificationsConfig() {
      return notificationsConfig;
    },
    set notificationsConfig(v) {
      notificationsConfig = v;
    },
    get fsGlobalEnabled() {
      return fsGlobalEnabled;
    },
    set fsGlobalEnabled(v) {
      fsGlobalEnabled = v;
    },
    get fsAllowedPaths() {
      return fsAllowedPaths;
    },
    set fsAllowedPaths(v) {
      fsAllowedPaths = v;
    },
    FS_BLOCKED,
  },
};

const router = new Router();
registerHealthRoutes(router, routeCtx);
registerTaskRoutes(router, routeCtx);
registerResourceRoutes(router, routeCtx);
registerChatRoutes(router, routeCtx);
registerSecurityRoutes(router, routeCtx);
registerSettingsRoutes(router, routeCtx);
registerNemoClawRoutes(router, routeCtx);
registerToolRoutes(router, routeCtx);
registerWorkspaceRoutes(router, routeCtx);
registerMemoryEngineRoutes(router, routeCtx);
registerComputerUseRoutes(router, routeCtx);
// NOTE: connectors.mjs is intentionally NOT registered — its /api/mcp/servers
// routes conflicted with the unified mcp.mjs backend (router is first-match-wins).
// mcp.mjs is now the single source of truth for MCP server management.
registerMcpRoutes(router, routeCtx);
registerAcpRoutes(router, routeCtx);
registerSkillRoutes(router, routeCtx);
registerFileRoutes(router);
registerAgentStoreRoutes(router, routeCtx);

// ── MCP SSE endpoint (separate from router — uses its own handler) ──────────
const { handler: mcpSseHandler } = createMcpSseHandler({ pool });

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const origin = req.headers["origin"] || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  const isPublic =
    !path.startsWith("/api/") ||
    PUBLIC_PREFIXES.some((p) => path.startsWith(p)) ||
    (path === "/api/tasks" &&
      req.method === "GET" &&
      url.searchParams.get("stream") === "1");
  if (!isPublic && !requireAuth(req, res)) return;

  // ── Rate limiting ──
  if (!checkRateLimit(req, res, "global")) return;

  const sse = (set) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(":ok\n\n");
    set.add(res);
    req.on("close", () => set.delete(res));
  };
  const json = (s, d) => {
    res.writeHead(s, { "Content-Type": "application/json" });
    res.end(JSON.stringify(d));
  };
  const body = (cb) => {
    let b = "",
      size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        json(413, { error: "Payload too large (max 1MB)" });
        return;
      }
      b += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(b);
        Promise.resolve(cb(parsed)).catch((err) => {
          logRoute.error("Handler error", { error: err.message });
          if (!res.writableEnded) json(500, { error: err.message });
        });
      } catch {
        json(400, { error: "Bad JSON" });
      }
    });
  };
  /** body + validate: parse JSON, validate against schema, then call cb with sanitized body */
  const validatedBody = (schema, cb) => {
    body((parsed) => {
      const result = validate(parsed, schema);
      if (!result.ok)
        return json(400, {
          error: "Validation failed",
          details: result.errors,
        });
      return cb(parsed);
    });
  };

  // ── MCP SSE endpoint (special handling — not via Router) ─────────────────
  if (path === "/mcp/sse" || path === "/mcp/messages") {
    return mcpSseHandler(req, res);
  }

  // ── Route dispatch via modular router ──────────────────────────────────────
  const matched = router.match(req.method, path);
  if (matched) {
    try {
      await matched.handler({
        req,
        res,
        json,
        body,
        validatedBody,
        sse,
        url,
        params: matched.params,
        ctx: routeCtx,
      });
    } catch (err) {
      logRoute.error("Route dispatch error", {
        method: req.method,
        path,
        error: err.message,
      });
      if (!res.writableEnded) json(500, { error: err.message });
    }
    return;
  }

  // ─── Static files (production — sert dist/ si present) ──────────────────────
  {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const distDir = pathJoin(__dir, "dist");
    if (existsSync(distDir)) {
      const MIME = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ico": "image/x-icon",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".webp": "image/webp",
        ".gz": "application/gzip",
      };
      let filePath = pathJoin(distDir, path === "/" ? "index.html" : path);
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = pathJoin(distDir, "index.html");
      }
      if (existsSync(filePath)) {
        const ext = extname(filePath).toLowerCase();
        const mime = MIME[ext] || "application/octet-stream";
        const data = readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control":
            ext === ".html" ? "no-cache" : "public, max-age=31536000",
        });
        res.end(data);
        return;
      }
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function startup() {
  await checkConnection();
  await runPhase2Migration();
  await seedIfEmpty();
  await loadApiKeys();
  await loadQuotas();
  connectRedis().catch((err) =>
    log.warn("Redis connexion échouée (dégradé sans cache)", {
      error: err.message,
    }),
  );

  server.listen(PORT, () => {
    log.info(`ClawBoard Backend started on :${PORT}`);
    log.info("DB: PostgreSQL (clawboard)");
  });
}

startup().catch((err) => {
  log.error("Startup failed", { error: err.message });
  process.exit(1);
});
