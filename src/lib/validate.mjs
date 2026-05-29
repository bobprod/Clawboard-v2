/**
 * validate.mjs — Zod-backed input validation for Clawboard API.
 * Same export API as before, now powered by Zod schemas.
 */
import { z } from "zod";

// ─── Zod schemas per endpoint ────────────────────────────────────────────────

const MAX_TEXT = 10000;
const MAX_TITLE = 500;
const MAX_CRON = 100;
const MAX_TAGS = 20;

const zStr = (max) => z.string().max(max);
const zOptStr = (max) => z.string().max(max).optional();

export const schemas = {
  // POST /api/tasks
  createTask: z.object({
    name: zOptStr(MAX_TITLE),
    titre: zOptStr(MAX_TITLE),
    instructions: zOptStr(MAX_TEXT),
    status: z.enum(["planifie", "running", "completed", "failed", "cancelled"]).optional(),
    priorite: z.enum(["basse", "normale", "haute", "critique"]).optional(),
    agent: zOptStr(100),
    skillName: zOptStr(200),
    modeleId: zOptStr(100),
    recurrenceHuman: zOptStr(200),
  }).passthrough(),

  // PATCH /api/tasks/:id
  updateTask: z.object({
    name: zOptStr(MAX_TITLE),
    titre: zOptStr(MAX_TITLE),
    status: z.enum(["planifie", "running", "completed", "failed", "cancelled"]).optional(),
    description: zOptStr(MAX_TEXT),
    instructions: zOptStr(MAX_TEXT),
    priorite: z.enum(["basse", "normale", "haute", "critique"]).optional(),
    llm: zOptStr(200),
  }).passthrough(),

  // POST /api/modeles
  createModele: z.object({
    name: zOptStr(MAX_TITLE),
    nom: zOptStr(MAX_TITLE),
    description: zOptStr(MAX_TEXT),
    instructions: zOptStr(MAX_TEXT),
    skillName: zOptStr(200),
    agent: zOptStr(100),
    canal: zOptStr(100),
    destinataire: zOptStr(200),
    llmModel: zOptStr(200),
    disablePreInstructions: z.boolean().optional(),
  }).passthrough(),

  // PATCH /api/modeles/:id
  updateModele: z.object({
    name: zOptStr(MAX_TITLE),
    nom: zOptStr(MAX_TITLE),
    description: zOptStr(MAX_TEXT),
    instructions: zOptStr(MAX_TEXT),
    skillName: zOptStr(200),
    agent: zOptStr(100),
    canal: zOptStr(100),
    destinataire: zOptStr(200),
    llmModel: zOptStr(200),
    disablePreInstructions: z.boolean().optional(),
  }).passthrough(),

  // POST /api/recurrences
  createRecurrence: z.object({
    name: zOptStr(MAX_TITLE),
    nom: zOptStr(MAX_TITLE),
    cronExpr: zOptStr(MAX_CRON),
    cron: zOptStr(MAX_CRON),
    human: zOptStr(200),
    timezone: z.string().max(50).regex(/^[A-Za-z_/]+$/).optional(),
    modeleId: zOptStr(100),
    llmModel: zOptStr(200),
    active: z.boolean().optional(),
  }).passthrough(),

  // POST /api/crons
  createCron: z.object({
    name: zOptStr(MAX_TITLE),
    interval: zOptStr(50),
    agentId: zOptStr(100),
    llmMode: z.enum(["hybrid", "cloud", "local"]).optional(),
    mode: zOptStr(50),
  }).passthrough(),

  // POST /api/skills
  createSkill: z.object({
    name: zOptStr(MAX_TITLE),
    nom: zOptStr(MAX_TITLE),
    description: zOptStr(MAX_TEXT),
    contenu: z.string().max(50000).optional(),
    content: z.string().max(50000).optional(),
    tags: z.array(z.unknown()).max(MAX_TAGS).optional(),
  }).passthrough(),

  // POST /api/memory
  createMemory: z.object({
    title: zOptStr(MAX_TITLE),
    titre: zOptStr(MAX_TITLE),
    content: z.string().max(100000).optional(),
    tags: z.array(z.unknown()).max(MAX_TAGS).optional(),
    embedding: z.array(z.unknown()).max(2048).optional(),
  }).passthrough(),

  // PUT /api/preinstructions
  preinstructions: z.object({
    content: z.string().max(50000).optional(),
  }).passthrough(),

  // POST /api/chat
  chat: z.object({
    model: zOptStr(200),
    messages: z.array(z.unknown()).max(200),
  }).passthrough(),

  // POST /api/auth/login
  login: z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(500),
  }),

  // POST /api/auth/password
  changePassword: z.object({
    current: z.string().min(1).max(500),
    next: z.string().min(6).max(500),
  }),

  // POST /api/settings/keys
  settingsKeys: z.object({}).passthrough(),

  // POST /api/shell
  shell: z.object({
    command: z.string().min(1).max(1000),
  }),

  // PATCH /api/security/guardrails
  guardrails: z.object({
    id: z.string().max(100),
    enabled: z.boolean(),
  }),

  // POST /api/approvals/:id
  approvalDecision: z.object({
    decision: z.enum(["approve", "reject"]),
    reason: zOptStr(1000),
  }).passthrough(),

  // POST /api/ollama/pull
  ollamaPull: z.object({
    model: z.string().min(1).max(200),
  }),

  // POST /api/settings/notifications
  notifications: z.object({
    telegram_token: zOptStr(500),
    telegram_chat_id: zOptStr(100),
    discord_webhook: zOptStr(500),
    email_smtp: zOptStr(500),
    email_from: zOptStr(200),
    email_to: zOptStr(200),
    webhook_url: zOptStr(500),
    notify_on_task_done: z.boolean().optional(),
    notify_on_task_failed: z.boolean().optional(),
    notify_on_approval: z.boolean().optional(),
  }).passthrough(),
};

/**
 * validate(body, schema) → { ok: true } | { ok: false, errors: string[] }
 *
 * `schema` can be a Zod schema or a legacy field-descriptor object.
 * For backward compatibility, legacy objects are still supported.
 */
export function validate(body, schema) {
  if (!body || typeof body !== "object")
    return { ok: false, errors: ["Corps de requete invalide"] };

  // If schema is a Zod schema (has .parse), use it
  if (schema && typeof schema.parse === "function") {
    const result = schema.safeParse(body);
    if (result.success) return { ok: true };
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") + ": " : "";
      return `${path}${issue.message}`;
    });
    return { ok: false, errors };
  }

  // Legacy field-descriptor fallback
  const errors = [];
  for (const [name, field] of Object.entries(schema)) {
    const err = validateField(body[name], field, name);
    if (err) errors.push(err);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

// ─── Legacy primitive checkers (kept for backward compat) ────────────────────

const isStr = (v) => typeof v === "string";
const isBool = (v) => typeof v === "boolean";
const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const isArr = (v) => Array.isArray(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function validateField(value, field, name) {
  if (value === undefined || value === null) {
    if (field.required) return `${name} est requis`;
    return null;
  }
  const typeMap = { string: isStr, boolean: isBool, number: isNum, array: isArr, object: isObj };
  if (typeMap[field.type] && !typeMap[field.type](value))
    return `${name} doit etre de type ${field.type}`;
  if (field.type === "string") {
    if (field.maxLen && value.length > field.maxLen) return `${name} depasse ${field.maxLen} caracteres`;
    if (field.minLen && value.length < field.minLen) return `${name} doit avoir au moins ${field.minLen} caracteres`;
    if (field.pattern && !field.pattern.test(value)) return `${name} : format invalide`;
    if (field.enum && !field.enum.includes(value)) return `${name} doit etre l'un de : ${field.enum.join(", ")}`;
  }
  if (field.type === "number") {
    if (field.min !== undefined && value < field.min) return `${name} doit etre >= ${field.min}`;
    if (field.max !== undefined && value > field.max) return `${name} doit etre <= ${field.max}`;
  }
  if (field.type === "array" && field.maxLen && value.length > field.maxLen)
    return `${name} depasse ${field.maxLen} elements`;
  return null;
}
