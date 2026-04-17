-- ─────────────────────────────────────────────────────────────────────────────
-- ClawBoard — Schéma PostgreSQL complet
-- Pré-requis : PostgreSQL 14+ avec l'extension pgvector installée.
-- Pour installer pgvector : https://github.com/pgvector/pgvector
-- ─────────────────────────────────────────────────────────────────────────────

-- Extension pgvector (embeddings pour memory_docs)
-- TODO: CREATE EXTENSION IF NOT EXISTS vector;  (pgvector non installé — à activer plus tard)

-- ─── Évolution de schéma : colonnes manquantes sur tables existantes ──────────
-- Ces instructions ADD COLUMN IF NOT EXISTS sont idempotentes.
-- Elles ajoutent les colonnes English sur les tables qui ont des noms French.

-- tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS name        TEXT        NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status      TEXT        NOT NULL DEFAULT 'planned';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent       TEXT        NOT NULL DEFAULT 'main';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS skill_name  TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_human TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tokens_prompt    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tokens_completion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cost        NUMERIC(10,4) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS modele_id   TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instructions TEXT;

-- guardrails
-- Supprime NOT NULL sur les vieilles colonnes French pour que les INSERT English ne bloquent pas
ALTER TABLE guardrails ALTER COLUMN nom DROP NOT NULL;
ALTER TABLE guardrails ADD COLUMN IF NOT EXISTS name    TEXT    NOT NULL DEFAULT '';
ALTER TABLE guardrails ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE guardrails SET name = nom, enabled = actif WHERE name = '' AND (nom IS NOT NULL OR actif IS NOT NULL);

-- audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ts          TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id   TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS payload     JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip          TEXT;

-- modeles
ALTER TABLE modeles ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
UPDATE modeles SET name = nom WHERE name = '' AND nom IS NOT NULL;

-- skills
ALTER TABLE skills ADD COLUMN IF NOT EXISTS name    TEXT NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS content TEXT;
UPDATE skills SET name = nom, content = contenu WHERE name = '' AND nom IS NOT NULL;

-- memory_docs
ALTER TABLE memory_docs ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
UPDATE memory_docs SET title = titre WHERE title = '' AND titre IS NOT NULL;

-- quotas : la table existante a une colonne id en plus, pas de conflit
-- recurrences
ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS cron_expr TEXT NOT NULL DEFAULT '';
ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS human     TEXT;
ALTER TABLE recurrences ADD COLUMN IF NOT EXISTS active    BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE recurrences SET cron_expr = cron, active = actif WHERE cron_expr = '' AND cron IS NOT NULL;

-- ─── modeles — Templates de tâches ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS modeles (
  id                      TEXT        PRIMARY KEY,
  name                    TEXT        NOT NULL,
  skill_name              TEXT,
  instructions            TEXT,
  agent                   TEXT        NOT NULL DEFAULT 'main',
  canal                   TEXT,
  destinataire            TEXT,
  llm_model               TEXT,
  disable_pre_instructions BOOLEAN    NOT NULL DEFAULT FALSE,
  execution_count         INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── recurrences — Planifications CRON ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS recurrences (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  cron_expr  TEXT        NOT NULL,
  human      TEXT,
  timezone   TEXT        NOT NULL DEFAULT 'Europe/Paris',
  modele_id  TEXT        REFERENCES modeles(id) ON DELETE SET NULL,
  llm_model  TEXT,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  next_run   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── tasks — Instances de tâches ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  modele_id        TEXT        REFERENCES modeles(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'planned',
  -- planned | running | completed | failed | cancelled
  agent            TEXT        NOT NULL DEFAULT 'main',
  skill_name       TEXT,
  instructions     TEXT,
  scheduled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recurrence_human TEXT,
  tokens_prompt    INTEGER     NOT NULL DEFAULT 0,
  tokens_completion INTEGER    NOT NULL DEFAULT 0,
  cost             NUMERIC(10,4) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS tasks_status_idx     ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_scheduled_idx  ON tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS tasks_created_idx    ON tasks(created_at DESC);

-- ─── task_activities — Journal d'événements par tâche ────────────────────────

CREATE TABLE IF NOT EXISTS task_activities (
  id      BIGSERIAL   PRIMARY KEY,
  task_id TEXT        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type    TEXT        NOT NULL,
  -- created | launched | completed | failed | cancelled
  label   TEXT        NOT NULL,
  ts      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_activities_task_id_idx ON task_activities(task_id);

-- ─── task_executions — Exécutions individuelles ───────────────────────────────

CREATE TABLE IF NOT EXISTS task_executions (
  id                TEXT        PRIMARY KEY,
  task_id           TEXT        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL,
  duration          INTEGER,            -- secondes
  prompt_tokens     INTEGER     NOT NULL DEFAULT 0,
  completion_tokens INTEGER     NOT NULL DEFAULT 0,
  cost              NUMERIC(10,4) NOT NULL DEFAULT 0,
  exit_code         INTEGER,
  stdout            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_executions_task_id_idx  ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS task_executions_started_idx  ON task_executions(started_at DESC);

-- ─── pre_instructions — Ligne unique (prompt système global) ─────────────────

CREATE TABLE IF NOT EXISTS pre_instructions (
  id       INTEGER     PRIMARY KEY DEFAULT 1,
  content  TEXT        NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pre_instructions_single_row CHECK (id = 1)
);

-- Ligne initiale vide garantie
INSERT INTO pre_instructions (id, content) VALUES (1, '')
  ON CONFLICT (id) DO NOTHING;

-- ─── skills — Bibliothèque de skills ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS skills (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  content     TEXT,
  tags        TEXT[],
  category    TEXT        NOT NULL DEFAULT 'general',
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE skills ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS status   TEXT NOT NULL DEFAULT 'active';

-- ─── memory_docs — Documents mémoire + embeddings pgvector ───────────────────
-- embedding vector(1536) : compatible OpenAI text-embedding-3-small/large
--                          et NVIDIA NeMo / NV-Embed-QA

CREATE TABLE IF NOT EXISTS memory_docs (
  id         TEXT        PRIMARY KEY,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  source     TEXT,
  tags       TEXT[],
  embedding  JSONB,              -- TODO: remplacer par vector(1536) quand pgvector est installé
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TODO: Index HNSW (à activer quand pgvector est installé)
-- CREATE INDEX IF NOT EXISTS memory_docs_embedding_idx
--   ON memory_docs USING hnsw (embedding vector_cosine_ops);

-- ─── guardrails — Contrôles de sécurité ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS guardrails (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valeurs par défaut (idempotent)
INSERT INTO guardrails (id, name, enabled) VALUES
  ('npm',        'NPM Packages (Allowlist)',  TRUE),
  ('pypi',       'PyPI Packages (Allowlist)', TRUE),
  ('network',    'Network Outbound (All)',    FALSE),
  ('filesystem', 'File System (Root Access)', FALSE),
  ('pii',        'PII Privacy Router',        TRUE),
  ('sandbox',    'Code Sandbox',              TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── pipeline — Graphe visuel (ligne unique JSONB) ────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline (
  id       INTEGER     PRIMARY KEY DEFAULT 1,
  nodes    JSONB       NOT NULL DEFAULT '[]',
  edges    JSONB       NOT NULL DEFAULT '[]',
  saved_at TIMESTAMPTZ,
  CONSTRAINT pipeline_single_row CHECK (id = 1)
);

INSERT INTO pipeline (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ─── api_keys — Clés API chiffrées (AES-256-GCM) ─────────────────────────────
-- Format encrypted_value : enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
-- ou valeur plaintext si KEK non configuré (mode dev)

CREATE TABLE IF NOT EXISTS api_keys (
  provider        TEXT        PRIMARY KEY,
  encrypted_value TEXT        NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── quotas — Suivi de consommation par modèle LLM ───────────────────────────

CREATE TABLE IF NOT EXISTS quotas (
  modele     TEXT          PRIMARY KEY,
  used       INTEGER       NOT NULL DEFAULT 0,
  limit_val  INTEGER       NOT NULL DEFAULT 0,
  cost       NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_local   BOOLEAN       NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── audit_logs — Journal d'audit ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  payload     JSONB,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS audit_logs_ts_idx          ON audit_logs(ts DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx      ON audit_logs(entity_type, entity_id);

-- ─── connectors — Connecteurs externes ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS connectors (
  id            BIGSERIAL   PRIMARY KEY,
  connector_id  TEXT        NOT NULL UNIQUE,
  enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  status        TEXT        NOT NULL DEFAULT 'disconnected',
  config        JSONB       NOT NULL DEFAULT '{}',
  last_sync     TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS connectors_cid_idx ON connectors(connector_id);
