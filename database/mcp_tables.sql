-- ─────────────────────────────────────────────────────────────────────────────
-- ClawBoard — MCP Servers table
-- Stores configured MCP server connections and their discovered tool snapshots.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mcp_servers (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  description     TEXT        NOT NULL DEFAULT '',
  transport       TEXT        NOT NULL DEFAULT 'stdio',
  -- stdio fields
  command         TEXT,
  args            JSONB       NOT NULL DEFAULT '[]',
  -- http/sse fields
  url             TEXT,
  -- shared fields
  env             JSONB       NOT NULL DEFAULT '{}',
  headers         JSONB       NOT NULL DEFAULT '{}',
  -- state
  status          TEXT        NOT NULL DEFAULT 'disconnected',
  tools_snapshot  JSONB       NOT NULL DEFAULT '[]',
  auto_sync_cli   BOOLEAN     NOT NULL DEFAULT FALSE,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  error           TEXT,
  last_sync       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mcp_servers_status_idx  ON mcp_servers(status);
CREATE INDEX IF NOT EXISTS mcp_servers_enabled_idx ON mcp_servers(enabled);
