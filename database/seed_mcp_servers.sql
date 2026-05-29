-- ClawBoard — Seed MCP servers from catalog
INSERT INTO mcp_servers (id, name, description, transport, command, args, url, env, headers, status, tools_snapshot, auto_sync_cli, enabled) VALUES
-- Featured
('filesystem', 'Filesystem', 'Acces fichiers locaux en lecture/ecriture : read/write/edit, list/search directories, move, metadata. Sandbox securise.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('github', 'GitHub', 'Gerez repos, issues, PRs, branches. Code search et file operations via le protocole MCP.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-github"]', NULL, '{"GITHUB_PERSONAL_ACCESS_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
('playwright', 'Playwright', 'Automatisation navigateur via MCP : screenshots, navigation, clics, remplissage de formulaires, scraping structure.', 'stdio', 'npx', '["-y", "@playwright/mcp"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('memory', 'Memory', 'Memoire persistante pour agents : knowledge graph avec entites, relations et observations.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-memory"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('desktop-commander', 'Desktop Commander', 'Controle desktop, fichiers, navigateur, terminal. Le MCP le plus complet pour l automatisation locale.', 'stdio', 'npx', '["-y", "@wonderwhy-er/desktop-commander-mcp"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
-- AI
('claude-code', 'Claude Code', 'Sub-agent Claude pour l execution de code, editing et tool use dans un sandbox securise.', 'stdio', 'claude', '["mcp", "serve"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('huggingface', 'Hugging Face', 'Recherchez modeles, datasets, papers et Spaces sur le Hub HF. Inferences via l API.', 'stdio', 'npx', '["-y", "@huggingface/mcp-server"]', NULL, '{"HF_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
('ollama', 'Ollama', 'Gerez vos modeles locaux : list, pull, run, chat. Proxy d inference locale.', 'streamable-http', NULL, '[]', 'http://localhost:11434', '{}', '{}', 'disconnected', '[]', false, true),
('minimax', 'MiniMax MCP', 'TTS, generation d images, videos Hailuo, musique, voice clone & design via l API MiniMax.', 'stdio', 'npx', '["-y", "minimax-mcp-js"]', NULL, '{"MINIMAX_API_KEY":"","MINIMAX_API_HOST":""}', '{}', 'disconnected', '[]', false, true),
('context7', 'Context7', 'Documentation technique a jour pour n importe quelle library. Resolve library ID + fetch docs en temps reel.', 'stdio', 'npx', '["-y", "@upstash/context7-mcp"]', NULL, '{"CONTEXT7_API_KEY":""}', '{}', 'disconnected', '[]', false, true),
-- Dev Tools
('docker', 'Docker', 'Gerez conteneurs, images et volumes. Listez, demarrez, stoppez et inspectez les conteneurs.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-docker"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('postgres-mcp', 'PostgreSQL', 'Requetez et explorez vos bases PostgreSQL. Schema introspection, SELECT, analyse de donnees.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-postgres"]', NULL, '{"POSTGRES_URL":""}', '{}', 'disconnected', '[]', false, true),
('redis', 'Redis', 'Accedez a vos donnees Redis : GET, SET, KEYS, HGETALL. Monitoring et cache management.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-redis"]', NULL, '{"REDIS_URL":""}', '{}', 'disconnected', '[]', false, true),
('git', 'Git', 'Operations Git : log, diff, blame, branch, status. Inspectez l historique de vos repositories.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-git"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('sentry', 'Sentry', 'Recuperez erreurs et crashs depuis Sentry. Analysez les stack traces et identifiez les regressions.', 'stdio', 'npx', '["-y", "@sentry/mcp-server"]', NULL, '{"SENTRY_AUTH_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
-- Data & Search
('brave-search', 'Brave Search', 'Recherche web via l API Brave Search. Resultats structures : web + news + images.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-brave-search"]', NULL, '{"BRAVE_API_KEY":""}', '{}', 'disconnected', '[]', false, true),
('fetch', 'Fetch', 'Recuperez le contenu de n importe quelle URL. Convertit HTML en Markdown ou texte brut.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-fetch"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('apify', 'Apify', 'Milliers de scrapers et actors depuis l Apify Store. Web scraping a grande echelle via MCP.', 'stdio', 'npx', '["-y", "@apify/actors-mcp-server"]', NULL, '{"APIFY_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
-- Browser & Automation
('puppeteer', 'Puppeteer', 'Automatisation Chrome headless : screenshots, generation PDF, formulaires, scraping.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-puppeteer"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
('computer-use-anthropic', 'Computer Use (Anthropic)', 'Controle complet du bureau via l API Claude Computer Use : screenshots, souris, clavier, scroll.', 'streamable-http', NULL, '[]', 'http://localhost:4000/api/computer-use', '{}', '{}', 'disconnected', '[]', false, true),
-- Cloud & Storage
('aws', 'AWS', 'Gerez vos ressources AWS : S3, Lambda, EC2, CloudWatch. CLI AWS encapsulee en MCP.', 'stdio', 'npx', '["-y", "aws-mcp-server"]', NULL, '{"AWS_ACCESS_KEY_ID":"","AWS_SECRET_ACCESS_KEY":"","AWS_REGION":""}', '{}', 'disconnected', '[]', false, true),
('supabase', 'Supabase', 'Requetez et gerez vos projets Supabase : database, auth, storage, edge functions.', 'stdio', 'npx', '["-y", "@supabase/mcp-server"]', NULL, '{"SUPABASE_URL":"","SUPABASE_SERVICE_KEY":""}', '{}', 'disconnected', '[]', false, true),
-- Productivite
('slack', 'Slack', 'Envoyez et lisez des messages Slack, gérez les channels et répondez aux threads.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-slack"]', NULL, '{"SLACK_BOT_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
('notion', 'Notion', 'Lisez et éditez des pages et databases Notion. Sync bidirectionnel de contenu.', 'stdio', 'npx', '["-y", "@notionhq/notion-mcp-server"]', NULL, '{"NOTION_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
('windows-mcp', 'Windows MCP', 'Contrôlez Windows : PowerShell, fichiers, fenêtres, applications. Mode local ou cloud sandbox.', 'stdio', 'npx', '["-y", "windows-mcp-server"]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
-- Google
('google-workspace', 'Google Workspace', 'Gmail, Drive, Calendar, Docs, Sheets, Slides. Automatisez votre suite Google.', 'sse', NULL, '[]', 'https://google-workspace-mcp.example.com/sse', '{"GOOGLE_CLIENT_ID":"","GOOGLE_CLIENT_SECRET":"","GOOGLE_REFRESH_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
('google-drive', 'Google Drive', 'Listez, recherchez, importez et exportez des fichiers depuis Google Drive via MCP.', 'stdio', 'npx', '["-y", "@modelcontextprotocol/server-gdrive"]', NULL, '{"GOOGLE_CLIENT_ID":"","GOOGLE_CLIENT_SECRET":""}', '{}', 'disconnected', '[]', false, true),
('bigquery', 'Google BigQuery', 'Interrogez vos donnees massives dans BigQuery avec SQL. Analyse et reporting automatise.', 'sse', NULL, '[]', 'https://bigquery-mcp.example.com/sse', '{"GOOGLE_APPLICATION_CREDENTIALS":"","BIGQUERY_PROJECT_ID":""}', '{}', 'disconnected', '[]', false, true),
('google-maps', 'Google Maps', 'Geocoding, itineraires, Places, Distance Matrix. Integrez la geolocalisation dans vos agents.', 'sse', NULL, '[]', 'https://google-maps-mcp.example.com/sse', '{"GOOGLE_MAPS_API_KEY":""}', '{}', 'disconnected', '[]', false, true),
('google-analytics', 'Google Analytics', 'Recuperez et analysez vos donnees GA4. Rapports automatises et insights.', 'sse', NULL, '[]', 'https://google-analytics-mcp.example.com/sse', '{"GA4_PROPERTY_ID":"","GOOGLE_APPLICATION_CREDENTIALS":""}', '{}', 'disconnected', '[]', false, true),
-- Marketing
('meta-marketing', 'Meta Marketing API', 'Gerez vos campagnes Facebook & Instagram Ads, audiences, rapports de performance.', 'sse', NULL, '[]', 'https://mcp.facebook.com/sse', '{"META_ACCESS_TOKEN":"","META_APP_ID":"","META_APP_SECRET":"","META_AD_ACCOUNT_ID":""}', '{}', 'disconnected', '[]', false, true),
('meta-graph', 'Meta Graph API', 'Acces complet au Graph API Facebook : pages, posts, comments, messenger, insights.', 'sse', NULL, '[]', 'https://mcp.facebook.com/graph/sse', '{"META_ACCESS_TOKEN":"","META_APP_ID":""}', '{}', 'disconnected', '[]', false, true),
-- Design
('canva', 'Canva MCP', 'Generez des designs, presentations, posts reseaux sociaux via l API Canva. Templates et brand kit.', 'sse', NULL, '[]', 'https://mcp.canva.com/sse', '{"CANVA_API_KEY":"","CANVA_TEAM_ID":""}', '{}', 'disconnected', '[]', false, true),
('adobe-suite', 'Adobe Suite', 'Serveur MCP unifie pour Adobe Creative Suite : Photoshop, Premiere Pro, Illustrator, InDesign.', 'stdio', 'adobe-photoshop', '[]', NULL, '{}', '{}', 'disconnected', '[]', false, true),
-- Video
('capcut', 'CapCut', 'Controlez CapCut via MCP : creez des drafts, ajoutez videos, audio, textes, sous-titres, effets, exportez.', 'streamable-http', NULL, '[]', 'http://localhost:9000/mcp', '{}', '{}', 'disconnected', '[]', false, true),
('premiere-pro', 'Premiere Pro', '269 outils pour controle Adobe Premiere Pro : timeline, effets, keyframes, export, color grading, audio.', 'stdio', 'npx', '["-y", "premiere-pro-mcp"]', NULL, '{"PREMIERE_TEMP_DIR":""}', '{}', 'disconnected', '[]', false, true),
('higgsfield', 'Higgsfield', 'Creation de videos IA, avatars virtuels, contenus video personnalises.', 'sse', NULL, '[]', 'https://mcp.higgsfield.ai/sse', '{"HIGGSFIELD_API_KEY":""}', '{}', 'disconnected', '[]', false, true),
-- CMS & E-commerce
('easy-mcp-ai', 'Easy MCP AI (WordPress)', 'Le serveur MCP WordPress le plus complet : 204 outils (posts, WooCommerce, SEO, GA, Semrush).', 'sse', NULL, '[]', 'https://your-site.com/wp-json/easy-mcp-ai/v1/mcp', '{"WP_SITE_URL":"","WP_BEARER_TOKEN":""}', '{}', 'disconnected', '[]', false, true),
('wordpress-adapter', 'WordPress MCP Adapter', 'Adapter officiel WordPress. Transforme les Abilities API en outils MCP : posts, pages, media, users, menus.', 'sse', NULL, '[]', 'https://your-site.com/wp-json/mcp/v1/sse', '{"WP_SITE_URL":"","WP_MCP_NAMESPACE":""}', '{}', 'disconnected', '[]', false, true),
('woocommerce', 'WooCommerce', '46 outils WooCommerce : produits, commandes, clients, coupons, livraison, paiements, rapports ventes.', 'sse', NULL, '[]', 'https://your-site.com/wp-json/easy-mcp-ai/v1/mcp', '{"WP_SITE_URL":"","WP_BEARER_TOKEN":""}', '{}', 'disconnected', '[]', false, true)
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