-- ClawBoard — Add Remotion & Heygen MCP Connectors
INSERT INTO mcp_servers (id, name, description, transport, command, args, url, env, headers, status, tools_snapshot, auto_sync_cli, enabled) VALUES
('remotion', 'Remotion', 'Cree des videos programmatically avec React. Rendu MP4, compositions, animations, thumbnails. Integration FFmpeg.', 'stdio', 'npx', '["-y", "remotion-mcp-server"]', NULL, '{"REMOTION_TEMPLATE_DIR":"","REMOTION_OUTPUT_DIR":""}', '{}', 'disconnected', '[]', false, true),
('remotion-skills', 'Remotion Skills', 'Skills Remotion pour agents IA : generation de videos, templates dynamiques, rendering cloud. API complete pour automation video.', 'streamable-http', NULL, '[]', 'https://skills.remotion.dev/mcp', '{"REMOTION_SKILLS_API_KEY":""}', '{}', 'disconnected', '[]', false, true),
('heygen-hyperframes', 'Heygen Hyperframes', 'Cree des frames video interactives avec Heygen. Avatars AI, overlays, QR codes, call-to-action dynamiques.', 'streamable-http', NULL, '[]', 'https://api.heygen.com/hyperframes/mcp', '{"HEYGEN_API_KEY":"","HEYGEN_WORKSPACE_ID":""}', '{}', 'disconnected', '[]', false, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  transport = EXCLUDED.transport,
  command = EXCLUDED.command,
  args = EXCLUDED.args,
  url = EXCLUDED.url,
  env = EXCLUDED.env,
  headers = EXCLUDED.headers,
  auto_sync_cli = EXCLUDED.auto_sync_cli,
  enabled = EXCLUDED.enabled;