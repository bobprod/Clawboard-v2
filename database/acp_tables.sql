-- ─────────────────────────────────────────────────────────────────────────────
-- ClawBoard — ACP (Agent Client Protocol) Tables
-- Multi-agent orchestration: external CLI agents + Team Mode
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── acp_agents — Registered CLI agents (auto-detected + custom) ─────────────

CREATE TABLE IF NOT EXISTS acp_agents (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  command     TEXT        NOT NULL,
  args        TEXT[]      NOT NULL DEFAULT '{}',
  role        TEXT        NOT NULL DEFAULT 'teammate',
  -- leader | teammate | standalone
  status      TEXT        NOT NULL DEFAULT 'stopped',
  -- idle | busy | error | disconnected | stopped
  pid         INTEGER,
  config      JSONB       NOT NULL DEFAULT '{}',
  -- { model, env, workdir, autoRestart, maxRetries, ... }
  detected    BOOLEAN     NOT NULL DEFAULT FALSE,
  -- true = auto-detected on PATH
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acp_agents_status_idx ON acp_agents(status);

-- ─── acp_sessions — Team sessions (leader + teammates) ───────────────────────

CREATE TABLE IF NOT EXISTS acp_sessions (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL DEFAULT '',
  leader_id   TEXT        NOT NULL REFERENCES acp_agents(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'created',
  -- created | running | completed | failed | cancelled
  config      JSONB       NOT NULL DEFAULT '{}',
  -- { maxTeammates, timeout, sharedContext, ... }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acp_sessions_status_idx ON acp_sessions(status);

-- ─── acp_session_members — Links agents to sessions ──────────────────────────

CREATE TABLE IF NOT EXISTS acp_session_members (
  id          BIGSERIAL   PRIMARY KEY,
  session_id  TEXT        NOT NULL REFERENCES acp_sessions(id) ON DELETE CASCADE,
  agent_id    TEXT        NOT NULL REFERENCES acp_agents(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'teammate',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, agent_id)
);

-- ─── acp_mailbox — Async messages between agents ─────────────────────────────

CREATE TABLE IF NOT EXISTS acp_mailbox (
  id           BIGSERIAL   PRIMARY KEY,
  session_id   TEXT        NOT NULL REFERENCES acp_sessions(id) ON DELETE CASCADE,
  from_agent   TEXT        NOT NULL,
  to_agent     TEXT        NOT NULL,
  message_type TEXT        NOT NULL DEFAULT 'task',
  -- task | result | error | status | permission_request | permission_grant
  payload      JSONB       NOT NULL DEFAULT '{}',
  read         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acp_mailbox_session_idx   ON acp_mailbox(session_id);
CREATE INDEX IF NOT EXISTS acp_mailbox_to_idx        ON acp_mailbox(to_agent, read);
CREATE INDEX IF NOT EXISTS acp_mailbox_created_idx   ON acp_mailbox(created_at DESC);

-- ─── Seed well-known CLI agents (auto-detectable) ────────────────────────────

INSERT INTO acp_agents (id, name, command, args, role, detected, config) VALUES
  ('claude',   'Claude Code',   'claude',   '{}',                    'standalone', TRUE, '{"provider":"anthropic","color":"#d97706"}'),
  ('codex',    'Codex CLI',     'codex',    '{}',                    'standalone', TRUE, '{"provider":"openai","color":"#10b981"}'),
  ('opencode', 'OpenCode',      'opencode', '{}',                    'standalone', TRUE, '{"provider":"openrouter","color":"#8b5cf6"}'),
  ('gemini',   'Gemini CLI',    'gemini',   '{}',                    'standalone', TRUE, '{"provider":"google","color":"#3b82f6"}'),
  ('openclaw', 'OpenClaw',      'openclaw', '{}',                    'standalone', TRUE, '{"provider":"nvidia","color":"#76b900"}')
ON CONFLICT (id) DO NOTHING;
