/**
 * validate.mjs — Lightweight input validation for Clawboard API.
 * No external dependency — pure JS schema validation.
 */

// ─── Primitive checkers ───────────────────────────────────────────────────────

const isStr = (v) => typeof v === "string";
const isBool = (v) => typeof v === "boolean";
const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const isArr = (v) => Array.isArray(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ─── Field descriptors ────────────────────────────────────────────────────────

/**
 * Each field descriptor: { type, required?, maxLen?, min?, max?, pattern?, enum?, itemType? }
 * type: 'string' | 'boolean' | 'number' | 'array' | 'object'
 */
function validateField(value, field, name) {
  if (value === undefined || value === null) {
    if (field.required) return `${name} est requis`;
    return null; // optional, skip
  }
  const typeMap = {
    string: isStr,
    boolean: isBool,
    number: isNum,
    array: isArr,
    object: isObj,
  };
  if (typeMap[field.type] && !typeMap[field.type](value)) {
    return `${name} doit être de type ${field.type}`;
  }
  if (field.type === "string") {
    if (field.maxLen && value.length > field.maxLen)
      return `${name} dépasse ${field.maxLen} caractères`;
    if (field.minLen && value.length < field.minLen)
      return `${name} doit avoir au moins ${field.minLen} caractères`;
    if (field.pattern && !field.pattern.test(value))
      return `${name} : format invalide`;
    if (field.enum && !field.enum.includes(value))
      return `${name} doit être l'un de : ${field.enum.join(", ")}`;
  }
  if (field.type === "number") {
    if (field.min !== undefined && value < field.min)
      return `${name} doit être >= ${field.min}`;
    if (field.max !== undefined && value > field.max)
      return `${name} doit être <= ${field.max}`;
  }
  if (field.type === "array" && field.maxLen && value.length > field.maxLen) {
    return `${name} dépasse ${field.maxLen} éléments`;
  }
  return null;
}

/**
 * validate(body, schema) → { ok: true } | { ok: false, errors: string[] }
 */
export function validate(body, schema) {
  if (!body || typeof body !== "object")
    return { ok: false, errors: ["Corps de requête invalide"] };
  const errors = [];
  for (const [name, field] of Object.entries(schema)) {
    const err = validateField(body[name], field, name);
    if (err) errors.push(err);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

// ─── Pre-defined schemas per endpoint ─────────────────────────────────────────

const MAX_TEXT = 10000;
const MAX_TITLE = 500;
const MAX_CRON = 100;
const MAX_TAGS = 20;

export const schemas = {
  // POST /api/tasks
  createTask: {
    name: { type: "string", maxLen: MAX_TITLE },
    titre: { type: "string", maxLen: MAX_TITLE },
    instructions: { type: "string", maxLen: MAX_TEXT },
    status: {
      type: "string",
      enum: ["planifie", "running", "completed", "failed", "cancelled"],
    },
    priorite: {
      type: "string",
      enum: ["basse", "normale", "haute", "critique"],
    },
    agent: { type: "string", maxLen: 100 },
    skillName: { type: "string", maxLen: 200 },
    modeleId: { type: "string", maxLen: 100 },
    recurrenceHuman: { type: "string", maxLen: 200 },
  },

  // PATCH /api/tasks/:id
  updateTask: {
    name: { type: "string", maxLen: MAX_TITLE },
    titre: { type: "string", maxLen: MAX_TITLE },
    status: {
      type: "string",
      enum: ["planifie", "running", "completed", "failed", "cancelled"],
    },
    description: { type: "string", maxLen: MAX_TEXT },
    instructions: { type: "string", maxLen: MAX_TEXT },
    priorite: {
      type: "string",
      enum: ["basse", "normale", "haute", "critique"],
    },
    llm: { type: "string", maxLen: 200 },
  },

  // POST /api/modeles
  createModele: {
    name: { type: "string", maxLen: MAX_TITLE },
    nom: { type: "string", maxLen: MAX_TITLE },
    description: { type: "string", maxLen: MAX_TEXT },
    instructions: { type: "string", maxLen: MAX_TEXT },
    skillName: { type: "string", maxLen: 200 },
    agent: { type: "string", maxLen: 100 },
    canal: { type: "string", maxLen: 100 },
    destinataire: { type: "string", maxLen: 200 },
    llmModel: { type: "string", maxLen: 200 },
    disablePreInstructions: { type: "boolean" },
  },

  // PATCH /api/modeles/:id
  updateModele: {
    name: { type: "string", maxLen: MAX_TITLE },
    nom: { type: "string", maxLen: MAX_TITLE },
    description: { type: "string", maxLen: MAX_TEXT },
    instructions: { type: "string", maxLen: MAX_TEXT },
    skillName: { type: "string", maxLen: 200 },
    agent: { type: "string", maxLen: 100 },
    canal: { type: "string", maxLen: 100 },
    destinataire: { type: "string", maxLen: 200 },
    llmModel: { type: "string", maxLen: 200 },
    disablePreInstructions: { type: "boolean" },
  },

  // POST /api/recurrences
  createRecurrence: {
    name: { type: "string", maxLen: MAX_TITLE },
    nom: { type: "string", maxLen: MAX_TITLE },
    cronExpr: { type: "string", maxLen: MAX_CRON },
    cron: { type: "string", maxLen: MAX_CRON },
    human: { type: "string", maxLen: 200 },
    timezone: { type: "string", maxLen: 50, pattern: /^[A-Za-z_/]+$/ },
    modeleId: { type: "string", maxLen: 100 },
    llmModel: { type: "string", maxLen: 200 },
    active: { type: "boolean" },
  },

  // POST /api/crons
  createCron: {
    name: { type: "string", maxLen: MAX_TITLE },
    interval: { type: "string", maxLen: 50 },
    agentId: { type: "string", maxLen: 100 },
    llmMode: { type: "string", enum: ["hybrid", "cloud", "local"] },
    mode: { type: "string", maxLen: 50 },
  },

  // POST /api/skills
  createSkill: {
    name: { type: "string", maxLen: MAX_TITLE },
    nom: { type: "string", maxLen: MAX_TITLE },
    description: { type: "string", maxLen: MAX_TEXT },
    contenu: { type: "string", maxLen: 50000 },
    content: { type: "string", maxLen: 50000 },
    tags: { type: "array", maxLen: MAX_TAGS },
  },

  // POST /api/memory
  createMemory: {
    title: { type: "string", maxLen: MAX_TITLE },
    titre: { type: "string", maxLen: MAX_TITLE },
    content: { type: "string", maxLen: 100000 },
    tags: { type: "array", maxLen: MAX_TAGS },
    embedding: { type: "array", maxLen: 2048 },
  },

  // PUT /api/preinstructions
  preinstructions: {
    content: { type: "string", maxLen: 50000 },
  },

  // POST /api/chat
  chat: {
    model: { type: "string", maxLen: 200 },
    messages: { type: "array", required: true, maxLen: 200 },
  },

  // POST /api/auth/login
  login: {
    username: { type: "string", required: true, minLen: 1, maxLen: 100 },
    password: { type: "string", required: true, minLen: 1, maxLen: 500 },
  },

  // POST /api/auth/password
  changePassword: {
    current: { type: "string", required: true, minLen: 1, maxLen: 500 },
    next: { type: "string", required: true, minLen: 6, maxLen: 500 },
  },

  // POST /api/settings/keys
  settingsKeys: {
    // Dynamic keys — validated per-field only for type & length
  },

  // POST /api/shell
  shell: {
    command: { type: "string", required: true, minLen: 1, maxLen: 1000 },
  },

  // PATCH /api/security/guardrails
  guardrails: {
    id: { type: "string", required: true, maxLen: 100 },
    enabled: { type: "boolean", required: true },
  },

  // POST /api/approvals/:id
  approvalDecision: {
    decision: { type: "string", required: true, enum: ["approve", "reject"] },
    reason: { type: "string", maxLen: 1000 },
  },

  // POST /api/ollama/pull
  ollamaPull: {
    model: { type: "string", required: true, minLen: 1, maxLen: 200 },
  },

  // POST /api/settings/notifications
  notifications: {
    telegram_token: { type: "string", maxLen: 500 },
    telegram_chat_id: { type: "string", maxLen: 100 },
    discord_webhook: { type: "string", maxLen: 500 },
    email_smtp: { type: "string", maxLen: 500 },
    email_from: { type: "string", maxLen: 200 },
    email_to: { type: "string", maxLen: 200 },
    webhook_url: { type: "string", maxLen: 500 },
    notify_on_task_done: { type: "boolean" },
    notify_on_task_failed: { type: "boolean" },
    notify_on_approval: { type: "boolean" },
  },
};
