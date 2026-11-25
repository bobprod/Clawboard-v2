// ─── Auto-amélioration des agents — capture, détection, approbation ──────────
//
// Boucle complète (A→F de la campagne « auto-amélioration ») :
//   A. CAPTURE   → agent_events (append-only) + source_hash anti-poisoning
//   B. DÉTECTION → pattern ≥3 occurrences / 7j → improvement_proposals
//   C. PROPOSITION→ UI « Améliorations » (preuves, diff, statut)
//   D. APPLICATION→ ImprovementStore (sql | git | vault) + provenance signée
//   E. GARDE-FOUS→ 3 modes (human | safe | auto) + pause globale + audit
//
// Garde-fous OWASP :
//   - ASI06 : chaque savoir publié conserve son hash source + sa provenance
//   - ASI09 : mode `human` par défaut — rien n'est appliqué sans accord
//   - le mode `auto` ne peut jamais toucher aux règles de sécurité
//   - pause globale (« prendre la main ») → aucun auto-appliqué

import { randomUUID } from "crypto";
import pool from "../src/db/client.js";
import { createLogger } from "../src/lib/logger.mjs";
import { getStore } from "../src/lib/store/store.mjs";
import {
  sha256,
  signAgentProvenance,
  verifySignedSource,
} from "../src/lib/store/provenance.mjs";

const log = createLogger("route:improvements");

export const EVENT_TYPES = [
  "tool_error",
  "user_correction",
  "approval_refused",
  "task_failed",
  "latency",
];

export const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "applied",
  "rejected",
  "escalated",
];

export const IMPROVEMENT_MODES = ["human", "safe", "auto"];

const THRESHOLD = 3;
const WINDOW_DAYS = 7;
const EXPIRY_DAYS = 30;
const CONTROL_KEY = "improvements.control";

// Mapping event_type → kind de proposition
const KINDS = {
  tool_error: "agent_fix",
  task_failed: "agent_fix",
  user_correction: "directive",
  approval_refused: "suggest_existing_workflow",
};

// Heuristique « cette proposition touche la sécurité » → jamais auto-appliquée
const SECURITY_PATTERN =
  /permission|guardrail|s[ée]curit|autonom|auto-?complet|r[èe]gle de s[ée]curit|access control|rbac|secret|api[_ -]?key/i;

let storePromise = null;

export async function getImprovementStore(ctx = {}) {
  if (!storePromise) {
    storePromise = getStore({
      backend: ctx.storeConfig?.backend || process.env.CLAWBOARD_IMPROVEMENT_STORE,
      gitRepo: ctx.storeConfig?.gitRepo || process.env.CLAWBOARD_IMPROVEMENT_REPO,
      vaultDir: ctx.storeConfig?.vaultDir || process.env.CLAWBOARD_IMPROVEMENT_VAULT,
      pool: ctx.pool || pool,
    }).catch((err) => {
      storePromise = null;
      throw err;
    });
  }
  return storePromise;
}

// ─── Schéma ───────────────────────────────────────────────────────────────────

export async function ensureImprovementTables({ pool: p = pool } = {}) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      entity_type TEXT,
      entity_id TEXT,
      source_hash TEXT,
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS improvement_proposals (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      trigger_pattern TEXT NOT NULL,
      counts JSONB NOT NULL DEFAULT '{}',
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires TIMESTAMPTZ,
      mode TEXT,
      approved_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_at TIMESTAMPTZ,
      provenance JSONB
    );

    CREATE TABLE IF NOT EXISTS improvement_provenance (
      id SERIAL PRIMARY KEY,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL,
      agent_id TEXT,
      source_hash TEXT,
      source_url TEXT,
      signature TEXT,
      doc JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_id, type)
    );

    CREATE TABLE IF NOT EXISTS agent_improvement_modes (
      agent_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'human',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_pattern
      ON agent_events (agent_id, event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_impr_proposals_status
      ON improvement_proposals (status, proposed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS improvement_proposals_agent_pattern_uidx
      ON improvement_proposals (agent_id, trigger_pattern);
  `);

  // Montée de schéma (versions antérieures de la table)
  await p
    .query(`
      ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS session_id TEXT;
      ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS entity_type TEXT;
      ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS source_hash TEXT;
      ALTER TABLE agent_events ALTER COLUMN severity SET DEFAULT 'warning';
      ALTER TABLE improvement_proposals ADD COLUMN IF NOT EXISTS approved_by TEXT;
      ALTER TABLE improvement_proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE improvement_proposals ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
      ALTER TABLE improvement_proposals ADD COLUMN IF NOT EXISTS provenance JSONB;
    `)
    .catch(() => {});

  // Correction du statut mal orthographié dans une version antérieure
  await p
    .query(
      `UPDATE improvement_proposals SET status = 'escalated' WHERE status = 'escicted'`,
    )
    .catch(() => {});
  await p
    .query(
      `ALTER TABLE improvement_proposals DROP CONSTRAINT IF EXISTS improvement_proposals_status_check`,
    )
    .catch(() => {});
  await p
    .query(
      `ALTER TABLE improvement_proposals ADD CONSTRAINT improvement_proposals_status_check CHECK (status IN ('pending','approved','applied','rejected','escalated'))`,
    )
    .catch(() => {});

  // counts INTEGER → JSONB (version antérieure) — conversion idempotente
  const { rows: countCols } = await p.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_name = 'improvement_proposals' AND column_name = 'counts'`,
  );
  if (countCols[0] && countCols[0].data_type !== "jsonb") {
    await p
      .query(
        `ALTER TABLE improvement_proposals ALTER COLUMN counts TYPE JSONB USING ('{"occurrences": ' || counts::text || '}')::jsonb`,
      )
      .catch(() => {});
  }

  // Répare les valeurs imbriquées (conversion appliquée plusieurs fois)
  try {
    const { rows: toRepair } = await p.query(
      `SELECT id, counts FROM improvement_proposals`,
    );
    for (const row of toRepair) {
      const flat = flattenOccurrences(row.counts);
      if (flat) {
        await p.query(
          `UPDATE improvement_proposals SET counts = $2 WHERE id = $1`,
          [row.id, JSON.stringify(flat)],
        );
      }
    }
  } catch (e) {
    log.warn("Réparation des compteurs impossible", { error: e.message });
  }
}

/** Descend une structure {occurrences:{occurrences:n}} jusqu'au nombre. */
function flattenOccurrences(counts) {
  let cur = counts;
  for (let i = 0; i < 20; i++) {
    if (cur == null) return null;
    if (typeof cur === "number") return { occurrences: cur };
    if (typeof cur !== "object") return null;
    if (typeof cur.occurrences === "number") {
      return { occurrences: cur.occurrences };
    }
    cur = cur.occurrences;
  }
  return null;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function audit({
  pool: p = pool,
  action,
  resource = "improvement",
  resourceId = null,
  payload = null,
} = {}) {
  try {
    await p.query(
      `INSERT INTO audit_logs (action, resource, resource_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [action, resource, resourceId, JSON.stringify(payload ?? {})],
    );
  } catch (e) {
    log.warn("Audit d'amélioration échoué", { action, error: e.message });
  }
}

// ─── Contrôle global : pause + modes par agent ────────────────────────────────

export async function getControl({ pool: p = pool } = {}) {
  let paused = false;
  try {
    const { rows } = await p.query(
      `SELECT value FROM settings WHERE key = $1`,
      [CONTROL_KEY],
    );
    if (rows[0]?.value) {
      const parsed =
        typeof rows[0].value === "string"
          ? JSON.parse(rows[0].value)
          : rows[0].value;
      paused = Boolean(parsed?.paused);
    }
  } catch {
    paused = false;
  }

  let modes = [];
  try {
    const { rows } = await p.query(
      `SELECT agent_id, mode, updated_at FROM agent_improvement_modes ORDER BY agent_id`,
    );
    modes = rows;
  } catch {
    modes = [];
  }

  return { paused, default_mode: "human", modes };
}

export async function getAgentMode({ pool: p = pool, agentId }) {
  try {
    const { rows } = await p.query(
      `SELECT mode FROM agent_improvement_modes WHERE agent_id = $1`,
      [agentId],
    );
    const mode = rows[0]?.mode;
    return IMPROVEMENT_MODES.includes(mode) ? mode : "human";
  } catch {
    return "human";
  }
}

export async function setAgentMode({ pool: p = pool, agentId, mode }) {
  if (!IMPROVEMENT_MODES.includes(mode)) {
    throw new Error(`Mode invalide. Attendu: ${IMPROVEMENT_MODES.join(", ")}`);
  }
  await p.query(
    `INSERT INTO agent_improvement_modes (agent_id, mode, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (agent_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW()`,
    [agentId, mode],
  );
  await audit({
    pool: p,
    action: "improvement.mode_changed",
    resource: "agent",
    resourceId: agentId,
    payload: { mode },
  });
  return mode;
}

export async function setPaused({ pool: p = pool, paused }) {
  await p.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CONTROL_KEY, JSON.stringify({ paused: Boolean(paused) })],
  );
  await audit({
    pool: p,
    action: paused ? "improvement.paused" : "improvement.resumed",
    resource: "control",
    resourceId: CONTROL_KEY,
    payload: { paused: Boolean(paused) },
  });
  return Boolean(paused);
}

// ─── Capture (A) ──────────────────────────────────────────────────────────────

export async function captureEvent({
  pool: p = pool,
  eventType,
  agentId,
  sessionId = null,
  entityType = null,
  entityId = null,
  severity = "warning",
  payload = {},
  sourceHash = null,
  sourceUrl = null,
  id = null,
} = {}) {
  await ensureImprovementTables({ pool: p });
  const hash =
    String(sourceHash || "").trim() ||
    sha256(JSON.stringify({ source_url: sourceUrl ?? null, payload }));
  const { rows } = await p.query(
    `INSERT INTO agent_events
       (id, agent_id, session_id, event_type, severity, entity_type, entity_id,
        source_hash, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      id || randomUUID(),
      agentId,
      sessionId,
      eventType,
      severity,
      entityType,
      entityId,
      hash,
      JSON.stringify(payload ?? {}),
    ],
  );
  return rows[0];
}

// ─── Détection (B) ────────────────────────────────────────────────────────────

function extractCorrection(payload) {
  if (!payload || typeof payload !== "object") return "";
  const raw =
    payload.correction ??
    payload.user_correction ??
    payload.correction_text ??
    payload.message ??
    payload.text ??
    payload.prompt ??
    "";
  return String(raw ?? "").trim();
}

function buildDirectivePrompt(correction) {
  return [
    "AGENT AMÉLIORÉ — façon restrictive",
    correction
      ? `Correction utilisateur : ${correction}`
      : "Correction utilisateur non extraite du payload de l'événement.",
    "Applique cette correction uniquement via des appels d'outils sécurisés.",
  ].join("\n");
}

function buildPayload({ agentId, eventType, severity, entityId, count, payload }) {
  const base = {
    agent_id: agentId,
    event_type: eventType,
    entity_id: entityId,
    severity,
    count,
    occurrences: count,
  };
  if (eventType === "user_correction") {
    const correction = extractCorrection(payload);
    return {
      ...base,
      kind: "directive",
      correction,
      directive_prompt: buildDirectivePrompt(correction),
      reversible: false,
      touches_security: SECURITY_PATTERN.test(correction),
    };
  }
  if (eventType === "approval_refused") {
    return {
      ...base,
      kind: "suggest_existing_workflow",
      reason: payload?.reason ?? null,
      suggestion:
        payload?.suggestion ??
        "Consulter les workflows existants avant d'en créer de nouveaux.",
      reversible: true,
      touches_security: false,
    };
  }
  return {
    ...base,
    kind: "agent_fix",
    reversible: true,
    touches_security: false,
  };
}

/**
 * Pattern matching sur agent_events → création de propositions.
 */
export async function detectImprovementPatterns({
  agentId,
  pool: p = pool,
  threshold = THRESHOLD,
  days = WINDOW_DAYS,
} = {}) {
  if (!agentId) {
    throw new Error(
      "agentId requis : detectImprovementPatterns({ agentId })",
    );
  }
  await ensureImprovementTables({ pool: p });

  const { rows } = await p.query(
    `SELECT event_type,
            entity_id,
            COUNT(*)::int AS count,
            MAX(severity) AS severity,
            (ARRAY_AGG(payload ORDER BY created_at DESC))[1] AS sample_payload,
            (ARRAY_AGG(source_hash ORDER BY created_at DESC))[1:5] AS source_hashes
       FROM agent_events
      WHERE agent_id = $1
        AND created_at > NOW() - ($3 * INTERVAL '1 day')
      GROUP BY 1, 2
      HAVING COUNT(*) >= $2
      ORDER BY 1, 3 DESC`,
    [agentId, threshold, days],
  );

  const created = [];
  for (const row of rows || []) {
    const mode = KINDS[row.event_type];
    if (!mode) continue;

    const triggerPattern = `${agentId}:${row.event_type}:${row.entity_id ?? ""}`;
    const payloadOut = buildPayload({
      agentId,
      eventType: row.event_type,
      severity: row.severity,
      entityId: row.entity_id,
      count: row.count,
      payload: row.sample_payload,
    });
    payloadOut.source_hashes = row.source_hashes || [];

    const { rows: inserted } = await p.query(
      `INSERT INTO improvement_proposals
         (id, agent_id, trigger_pattern, counts, payload, status, proposed_at,
          expires, mode)
       VALUES ($1,$2,$3,$4,$5,'pending',NOW(),NOW() + ($6 * INTERVAL '1 day'),$7)
       ON CONFLICT (agent_id, trigger_pattern) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        agentId,
        triggerPattern,
        JSON.stringify({ occurrences: row.count }),
        JSON.stringify(payloadOut),
        EXPIRY_DAYS,
        mode,
      ],
    );
    if (inserted && inserted.length) {
      created.push({
        id: inserted[0].id,
        triggerPattern,
        count: row.count,
        mode,
      });
    }
  }

  if (created.length) {
    log.info("Propositions d'amélioration créées", {
      agentId,
      created: created.length,
      patterns: created.map((c) => c.triggerPattern),
    });
  }
  return { created: created.length, proposals: created };
}

/**
 * Scan complet : détection des nouveaux patterns + auto-application des
 * propositions en attente selon le mode de chaque agent.
 *
 * Les propositions déjà en attente sont reconsidérées à chaque scan : changer
 * le mode d'un agent en « auto » doit appliquer ce qui l'attend déjà.
 */
export async function scanImprovements({
  pool: p = pool,
  store = null,
  applyAuto = true,
} = {}) {
  await ensureImprovementTables({ pool: p });

  const { rows: agents } = await p.query(
    `SELECT DISTINCT agent_id FROM agent_events
      WHERE created_at > NOW() - INTERVAL '7 days'`,
  );

  let created = 0;
  for (const row of agents || []) {
    if (!row?.agent_id) continue;
    try {
      const res = await detectImprovementPatterns({
        agentId: row.agent_id,
        pool: p,
      });
      created += res.created;
    } catch (e) {
      log.warn("Détection d'amélioration échouée", {
        agentId: row.agent_id,
        error: e.message,
      });
    }
  }

  let applied = 0;
  const details = [];
  if (applyAuto) {
    let st = store;
    if (!st) {
      try {
        st = await getImprovementStore({ pool: p });
      } catch (e) {
        log.warn("Store d'amélioration indisponible", { error: e.message });
      }
    }
    if (st) {
      const { rows: pending } = await p.query(
        `SELECT * FROM improvement_proposals WHERE status = 'pending'
          ORDER BY proposed_at ASC LIMIT 100`,
      );
      for (const row of pending) {
        const proposal = normalizeProposal(row);
        if (!proposal) continue;
        try {
          const auto = await maybeAutoApply({
            proposal,
            pool: p,
            store: st,
          });
          if (auto.applied) applied += 1;
          details.push({
            id: proposal.id,
            applied: auto.applied,
            reason: auto.reason || null,
            mode: auto.mode || null,
          });
        } catch (e) {
          log.warn("Auto-application échouée", {
            proposalId: proposal.id,
            error: e.message,
          });
        }
      }
    }
  }

  return { created, applied, details };
}

// ─── Lecture des propositions ─────────────────────────────────────────────────

function normalizeCounts(counts) {
  if (counts == null) return { occurrences: 0 };
  if (typeof counts === "number") return { occurrences: counts };
  if (typeof counts === "string") {
    try {
      return normalizeCounts(JSON.parse(counts));
    } catch {
      return { occurrences: 0 };
    }
  }
  if (typeof counts === "object") {
    const flat = flattenOccurrences(counts);
    const extra = {};
    for (const [k, v] of Object.entries(counts)) {
      if (k === "occurrences" && v && typeof v === "object") continue;
      extra[k] = v;
    }
    return {
      ...extra,
      occurrences: flat?.occurrences ?? Number(counts.occurrences ?? 0),
    };
  }
  return { occurrences: 0 };
}

export function normalizeProposal(row) {
  if (!row) return null;
  const payload = row.payload || {};
  return {
    id: row.id,
    agent_id: row.agent_id,
    agent: row.agent ?? row.agent_name ?? null,
    trigger_pattern: row.trigger_pattern,
    counts: normalizeCounts(row.counts),
    payload,
    kind: payload.kind ?? row.mode ?? null,
    status: row.status,
    mode: row.mode,
    proposed_at: row.proposed_at,
    updated_at: row.updated_at,
    applied_at: row.applied_at,
    expires: row.expires,
    approved_by: row.approved_by,
    provenance: row.provenance ?? null,
  };
}

export async function getImprovementProposals({
  pool: p = pool,
  agentId = null,
  status = null,
  limit = 200,
} = {}) {
  await ensureImprovementTables({ pool: p });
  const clauses = [];
  const vals = [];
  if (agentId) {
    vals.push(agentId);
    clauses.push(`p.agent_id = $${vals.length}`);
  }
  if (status) {
    vals.push(status);
    clauses.push(`p.status = $${vals.length}`);
  }
  vals.push(Math.min(Number(limit) || 200, 500));

  const { rows } = await p.query(
    `SELECT p.*, a.name AS agent_name
       FROM improvement_proposals p
       LEFT JOIN acp_agents a ON a.id = p.agent_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY p.proposed_at DESC, p.id ASC
      LIMIT $${vals.length}`,
    vals,
  );
  return rows.map(normalizeProposal);
}

// ─── Application (D) ──────────────────────────────────────────────────────────

function buildSkillContent({ proposal, payload }) {
  const occurrences = Number(payload.occurrences ?? 0);
  return [
    `# Auto-amélioration — ${payload.kind ?? "agent_fix"}`,
    "",
    `Déclencheur : \`${proposal.trigger_pattern}\``,
    `Occurrences observées : ${occurrences}`,
    payload.entity_id ? `Entité concernée : \`${payload.entity_id}\`` : null,
    "",
    "## Correction proposée",
    payload.suggestion
      ? payload.suggestion
      : payload.directive_prompt
        ? payload.directive_prompt
        : "Réduire la répétition de l'erreur détectée par le moteur d'amélioration.",
    "",
    "## Provenance",
    `- Proposition : \`${proposal.id}\``,
    `- Générée le : ${new Date().toISOString()}`,
    "- Toute modification de ce fichier doit être approuvée par un humain.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Applique une proposition au store pluggable et signe sa provenance.
 */
export async function applyProposal({
  proposal,
  pool: p = pool,
  store,
  actor = "human",
} = {}) {
  const payload = proposal.payload || {};
  const kind = payload.kind ?? "agent_fix";
  const agentId = proposal.agent_id;
  const content =
    kind === "directive"
      ? payload.directive_prompt ||
        `AGENT AMÉLIORÉ — façon restrictive\nCorrection : ${payload.correction || ""}`
      : buildSkillContent({ proposal, payload });

  let result;
  if (kind === "directive") {
    result = await store.saveDirective(agentId, content, {
      proposalId: proposal.id,
      actor,
      kind,
    });
  } else {
    result = await store.saveSkill(
      agentId,
      `impr-${String(proposal.id).slice(0, 8)}`,
      content,
      {
        proposalId: proposal.id,
        kind,
        trigger: proposal.trigger_pattern,
        occurrences: Number(payload.occurrences ?? 0),
      },
    );
  }

  const { signature, doc } = signAgentProvenance(
    {
      sourceId: proposal.id,
      sourceType: kind,
      sourceUrl: proposal.trigger_pattern,
      sourceHash: sha256(content),
      agentId,
      body: content,
      createdAt: new Date().toISOString(),
    },
    actor,
    store.backend,
  );

  await p.query(
    `INSERT INTO improvement_provenance
       (source_id, type, agent_id, source_hash, signature, doc)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (source_id, type) DO UPDATE
       SET signature = EXCLUDED.signature,
           doc = EXCLUDED.doc,
           source_hash = EXCLUDED.source_hash,
           created_at = NOW()`,
    [
      proposal.id,
      kind,
      agentId,
      doc.sourceHash,
      signature,
      JSON.stringify(doc),
    ],
  );

  const summary = {
    store: store.backend,
    file: result?.file ?? null,
    commitSha: result?.commitSha ?? null,
    version: result?.version ?? null,
    hash: result?.hash ?? doc.sourceHash,
  };

  await p.query(
    `UPDATE improvement_proposals
        SET status = 'applied',
            applied_at = NOW(),
            updated_at = NOW(),
            provenance = $2
      WHERE id = $1`,
    [proposal.id, JSON.stringify({ signature, doc, ...summary })],
  );

  await audit({
    pool: p,
    action: "improvement.applied",
    resource: "proposal",
    resourceId: proposal.id,
    payload: { agentId, kind, actor, store: store.backend, hash: doc.sourceHash },
  });

  return { applied: true, signature, doc, result: summary };
}

/**
 * Auto-application selon le mode de l'agent (jamais si la sécurité est touchée).
 */
export async function maybeAutoApply({
  proposal,
  pool: p = pool,
  store,
  actor = "auto",
} = {}) {
  const control = await getControl({ pool: p });
  if (control.paused) return { applied: false, reason: "paused" };

  const mode = await getAgentMode({ pool: p, agentId: proposal.agent_id });
  if (mode === "human") {
    return { applied: false, reason: "human_approval_required", mode };
  }

  const payload = proposal.payload || {};
  if (payload.touches_security) {
    return { applied: false, reason: "security_rule_locked", mode };
  }
  if (mode === "safe" && payload.reversible !== true) {
    return { applied: false, reason: "not_reversible", mode };
  }

  const res = await applyProposal({
    proposal,
    pool: p,
    store,
    actor: `${mode}:auto`,
  });
  return { ...res, mode };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function register(router, ctx = {}) {
  const p = ctx.pool || pool;

  // ── POST /api/improvements/capture — phase A ───────────────────────────────
  router.post("/api/improvements/capture", ({ json, body }) => {
    body(async (b) => {
      try {
        const eventType = String(b.event_type || "").trim();
        if (!EVENT_TYPES.includes(eventType)) {
          return json(400, {
            error: `event_type invalide. Attendu: ${EVENT_TYPES.join(", ")}`,
          });
        }
        const agentId = String(b.agent_id || "").trim();
        if (!agentId) return json(400, { error: "agent_id requis" });

        const event = await captureEvent({
          pool: p,
          eventType,
          agentId,
          sessionId: b.session_id ?? null,
          entityType: b.entity_type ?? null,
          entityId: b.entity_id ?? null,
          severity: b.severity || "warning",
          payload: b.payload ?? {},
          sourceHash: b.source_hash ?? null,
          sourceUrl: b.source_url ?? null,
          id: b.id ?? null,
        });
        json(201, { event });
      } catch (err) {
        log.error("POST /api/improvements/capture échoué", {
          error: err.message,
        });
        json(500, { error: err.message });
      }
    });
  });

  // ── GET /api/improvements/analysis — phase A (vue agrégée) ────────────────
  router.get("/api/improvements/analysis", async ({ json, url }) => {
    try {
      await ensureImprovementTables({ pool: p });
      const sp = url.searchParams;
      const agentId = sp.get("agent_id");
      const days = Math.min(Math.max(Number(sp.get("days")) || WINDOW_DAYS, 1), 90);

      const where = ["created_at > NOW() - ($1 * INTERVAL '1 day')"];
      const vals = [days];
      if (agentId) {
        vals.push(agentId);
        where.push(`agent_id = $${vals.length}`);
      }
      const whereSql = where.join(" AND ");

      const [counts, byAgent, provenance, recent] = await Promise.all([
        p.query(
          `SELECT event_type, COUNT(*)::int AS count
             FROM agent_events WHERE ${whereSql}
            GROUP BY 1 ORDER BY 2 DESC`,
          vals,
        ),
        p.query(
          `SELECT agent_id, COUNT(*)::int AS count, MAX(created_at) AS last_seen
             FROM agent_events WHERE ${whereSql}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 50`,
          vals,
        ),
        p.query(
          `SELECT source_hash, COUNT(*)::int AS count, MAX(created_at) AS last_seen
             FROM agent_events WHERE ${whereSql}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
          vals,
        ),
        p.query(
          `SELECT id, agent_id, session_id, event_type, severity, entity_type,
                  entity_id, source_hash, payload, created_at
             FROM agent_events WHERE ${whereSql}
            ORDER BY created_at DESC LIMIT 50`,
          vals,
        ),
      ]);

      json(200, {
        window_days: days,
        counts: Object.fromEntries(
          (counts.rows || []).map((r) => [r.event_type, r.count]),
        ),
        by_agent: byAgent.rows || [],
        provenance: provenance.rows || [],
        recent: recent.rows || [],
      });
    } catch (err) {
      log.error("GET /api/improvements/analysis échoué", {
        error: err.message,
      });
      json(500, { error: err.message });
    }
  });

  // ── GET /api/improvements/proposals — phase B/C ────────────────────────────
  router.get("/api/improvements/proposals", async ({ json, url }) => {
    try {
      const sp = url.searchParams;
      const proposals = await getImprovementProposals({
        pool: p,
        agentId: sp.get("agent_id"),
        status: sp.get("status"),
        limit: Number(sp.get("limit")) || 200,
      });
      json(200, { proposals, total: proposals.length });
    } catch (err) {
      log.error("GET /api/improvements/proposals échoué", {
        error: err.message,
      });
      json(500, { error: err.message });
    }
  });

  // ── POST /api/improvements/proposals/:id/status — approbation / rejet ──────
  router.post(
    /^\/api\/improvements\/proposals\/([^/]+)\/status$/,
    ({ json, params, body }) => {
      body(async (b) => {
        try {
          const id = params[1];
          const status = String(b.status || "").trim();
          if (!PROPOSAL_STATUSES.includes(status)) {
            return json(400, {
              error: `statut invalide. Attendu: ${PROPOSAL_STATUSES.join(", ")}`,
            });
          }
          const { rows } = await p.query(
            `UPDATE improvement_proposals
                SET status = $2,
                    approved_by = COALESCE($3, approved_by),
                    updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id, status, b.approved_by || b.actor || null],
          );
          if (!rows[0]) return json(404, { error: "Proposition introuvable" });
          await audit({
            pool: p,
            action: `improvement.${status}`,
            resource: "proposal",
            resourceId: id,
            payload: { actor: b.actor || b.approved_by || null },
          });
          json(200, { proposal: normalizeProposal(rows[0]) });
        } catch (err) {
          log.error("POST status proposal échoué", { error: err.message });
          json(500, { error: err.message });
        }
      });
    },
  );

  // ── POST /api/improvements/proposals/:id/apply — application signée ───────
  router.post(
    /^\/api\/improvements\/proposals\/([^/]+)\/apply$/,
    ({ json, params, body }) => {
      body(async (b) => {
        try {
          const id = params[1];
          const { rows } = await p.query(
            `SELECT * FROM improvement_proposals WHERE id = $1`,
            [id],
          );
          if (!rows[0]) return json(404, { error: "Proposition introuvable" });
          const proposal = normalizeProposal(rows[0]);
          if (proposal.status === "rejected") {
            return json(409, {
              error: "Proposition rejetée — ré-ouverture requise",
            });
          }
          const store = await getImprovementStore(ctx);
          const result = await applyProposal({
            proposal,
            pool: p,
            store,
            actor: b.actor || "human",
          });
          json(200, result);
        } catch (err) {
          log.error("POST apply proposal échoué", { error: err.message });
          json(500, { error: err.message });
        }
      });
    },
  );

  // ── POST /api/improvements/record-provenance — journal de provenance ──────
  router.post("/api/improvements/record-provenance", ({ json, body }) => {
    body(async (b) => {
      try {
        const sourceId = String(b.source_id || b.proposal_id || "").trim();
        if (!sourceId) {
          return json(400, { error: "source_id requis" });
        }
        const type = String(b.type || "improvement").trim();
        const content = b.content ?? null;
        const sourceHash =
          String(b.source_hash || "").trim() ||
          (content ? sha256(String(content)) : null);

        const { signature, doc } = signAgentProvenance(
          {
            sourceId,
            sourceType: type,
            sourceUrl: b.source_url ?? null,
            sourceHash,
            agentId: b.agent_id ?? null,
            body: content,
            createdAt: new Date().toISOString(),
          },
          b.actor || "system",
          b.store || null,
        );

        const { rows } = await p.query(
          `INSERT INTO improvement_provenance
             (source_id, type, agent_id, source_hash, source_url, signature, doc)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (source_id, type) DO UPDATE
             SET signature = EXCLUDED.signature,
                 doc = EXCLUDED.doc,
                 source_hash = EXCLUDED.source_hash,
                 source_url = EXCLUDED.source_url,
                 created_at = NOW()
           RETURNING *`,
          [
            sourceId,
            type,
            b.agent_id ?? null,
            sourceHash,
            b.source_url ?? null,
            signature,
            JSON.stringify(doc),
          ],
        );

        await audit({
          pool: p,
          action: "improvement.provenance_recorded",
          resource: "provenance",
          resourceId: sourceId,
          payload: { type, agent_id: b.agent_id ?? null },
        });

        json(200, {
          created: true,
          provenance: rows[0],
          signature,
          doc,
          verified: verifySignedSource(doc, signature),
        });
      } catch (err) {
        log.error("POST record-provenance échoué", { error: err.message });
        json(500, { error: err.message });
      }
    });
  });

  // ── GET /api/improvements/control — pause + modes ─────────────────────────
  router.get("/api/improvements/control", async ({ json }) => {
    try {
      const control = await getControl({ pool: p });
      const cfg = ctx.storeConfig || {};
      json(200, {
        ...control,
        store: {
          backend:
            cfg.backend || process.env.CLAWBOARD_IMPROVEMENT_STORE || "sql",
          git_repo: cfg.gitRepo || process.env.CLAWBOARD_IMPROVEMENT_REPO || null,
          vault_dir:
            cfg.vaultDir || process.env.CLAWBOARD_IMPROVEMENT_VAULT || null,
        },
      });
    } catch (err) {
      log.error("GET control échoué", { error: err.message });
      json(500, { error: err.message });
    }
  });

  // ── POST /api/improvements/control — pause / reprise / mode d'un agent ────
  router.post("/api/improvements/control", ({ json, body }) => {
    body(async (b) => {
      try {
        if (b.action === "pause" || b.action === "resume") {
          const paused = await setPaused({ pool: p, paused: b.action === "pause" });
          json(200, { paused, modes: (await getControl({ pool: p })).modes });
          return;
        }
        if (b.agent_id && b.mode) {
          const mode = await setAgentMode({
            pool: p,
            agentId: String(b.agent_id),
            mode: String(b.mode),
          });
          json(200, { agent_id: b.agent_id, mode });
          return;
        }
        json(400, {
          error:
            "Action attendue: { action: 'pause'|'resume' } ou { agent_id, mode }",
        });
      } catch (err) {
        log.error("POST control échoué", { error: err.message });
        json(500, { error: err.message });
      }
    });
  });

  // ── POST /api/improvements/scan — déclenchement manuel du job ─────────────
  router.post("/api/improvements/scan", async ({ json }) => {
    try {
      const result = await scanImprovements({ pool: p });
      json(200, result);
    } catch (err) {
      log.error("POST scan échoué", { error: err.message });
      json(500, { error: err.message });
    }
  });
}
