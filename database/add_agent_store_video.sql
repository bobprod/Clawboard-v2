-- Add Remotion & Heygen to Agent Store
INSERT INTO agent_store (id, name, description, category, icon, color, provider, model, command, args, env, skills, config, tags, popular) VALUES
('remotion', 'Remotion Video', 'Cree des videos programmatically avec React et Remotion. Rendu MP4, compositions, animations, thumbnails.', 'video', '🎬', '#ff0057', 'anthropic', 'claude-sonnet-4-20250514', 'npx', ARRAY['-y', 'remotion-mcp-server'], '{"REMOTION_TEMPLATE_DIR":"","REMOTION_OUTPUT_DIR":""}'::jsonb, ARRAY['remotion'], '{"temperature":0.3}'::jsonb, ARRAY['video','react','animation','rendering'], 20),
('heygen', 'Heygen Hyperframes', 'Cree des frames video interactives avec Heygen. Avatars AI, overlays, QR codes, call-to-action dynamiques.', 'video', '🖼️', '#00d4ff', 'anthropic', 'claude-sonnet-4-20250514', NULL, ARRAY[]::TEXT[], '{"HEYGEN_API_KEY":"","HEYGEN_WORKSPACE_ID":""}'::jsonb, ARRAY['heygen-hyperframes'], '{"temperature":0.5}'::jsonb, ARRAY['video','avatar','interactive','hyperframes'], 21)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  command = EXCLUDED.command,
  args = EXCLUDED.args,
  env = EXCLUDED.env,
  skills = EXCLUDED.skills,
  config = EXCLUDED.config,
  tags = EXCLUDED.tags,
  popular = EXCLUDED.popular;