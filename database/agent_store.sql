-- ClawBoard — Agent Store templates
-- Pre-configured agent definitions that can be installed in 1 click.

CREATE TABLE IF NOT EXISTS agent_store (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  description     TEXT        NOT NULL DEFAULT '',
  category        TEXT        NOT NULL DEFAULT 'productivity',
  icon            TEXT        NOT NULL DEFAULT '🤖',
  color           TEXT        NOT NULL DEFAULT '#8b5cf6',
  provider        TEXT        NOT NULL DEFAULT 'openai',
  model           TEXT        NOT NULL DEFAULT 'gpt-4o',
  command         TEXT,
  args            TEXT[]      NOT NULL DEFAULT '{}',
  env             JSONB       NOT NULL DEFAULT '{}',
  skills          TEXT[]      NOT NULL DEFAULT '{}',
  config          JSONB       NOT NULL DEFAULT '{}',
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  popular         INTEGER     NOT NULL DEFAULT 0,
  installed       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_store_category_idx ON agent_store(category);
CREATE INDEX IF NOT EXISTS agent_store_popular_idx ON agent_store(popular DESC);

INSERT INTO agent_store (id, name, description, category, icon, color, provider, model, command, args, env, skills, config, tags, popular) VALUES
-- Coding
('code-writer', 'Code Writer', 'Agent codeur expert. Genere, refactore et debogue du code dans tous les langages. Supporte TypeScript, Python, Rust, Go, et plus.', 'coding', '💻', '#3b82f6', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['code-writer','web-search'], '{"temperature":0.2,"maxTokens":8192,"systemPrompt":"You are an expert programmer. Write clean, idiomatic code with proper error handling and type safety."}', ARRAY['code','programming','typescript','python'], 1),
('code-reviewer', 'Code Reviewer', 'Revue de code automatique : detection de bugs, vulnerabilites securite, performance, lisibilite. Genere des PR comments.', 'coding', '🔍', '#10b981', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['code-writer'], '{"temperature":0.1,"maxTokens":4096,"systemPrompt":"You are a senior code reviewer. Identify bugs, security issues, performance problems, and style violations. Be constructive and specific."}', ARRAY['code-review','security','quality'], 2),
('devops-agent', 'DevOps Agent', 'Automatise les taches DevOps : deploiement, CI/CD, Docker, Kubernetes, monitoring, logs. Gere l infrastructure as code.', 'coding', '🚀', '#f59e0b', 'openai', 'gpt-4o', NULL, '{}', '{}', ARRAY['exec_command','list_directory','read_file'], '{"temperature":0.2,"systemPrompt":"You are a DevOps specialist. Help with deployments, CI/CD, Docker, Kubernetes, monitoring, and infrastructure management."}', ARRAY['devops','docker','kubernetes','ci-cd'], 3),
('test-writer', 'Test Writer', 'Genere des tests unitaires, integration et e2e. Couverture maximale avec Jest, Vitest, Playwright, Cypress.', 'coding', '🧪', '#8b5cf6', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['code-writer','read_file'], '{"temperature":0.2,"maxTokens":4096,"systemPrompt":"You are a test engineer. Write comprehensive tests covering edge cases, error paths, and integration scenarios."}', ARRAY['testing','jest','vitest','playwright'], 14),

-- Data & Research
('data-analyst', 'Data Analyst', 'Analyse de donnees avancee : SQL, Python, visualisations, statistiques. Genere des rapports et dashboards.', 'data', '📊', '#06b6d4', 'openai', 'gpt-4o', NULL, '{}', '{}', ARRAY['code-writer','web-search'], '{"temperature":0.3,"systemPrompt":"You are a data analyst expert. Analyze datasets, write SQL queries, create visualizations, and generate insights.", "enableCodeExecution":true}', ARRAY['data','sql','python','analytics','visualization'], 4),
('web-searcher', 'Web Searcher', 'Agent de recherche web avance. Cherche, synthetise et cite ses sources. Ideal pour le research et fact-checking.', 'data', '🌐', '#6366f1', 'openai', 'gpt-4o', NULL, '{}', '{}', ARRAY['web-search','web_fetch'], '{"temperature":0.2,"systemPrompt":"You are a research specialist. Search the web, verify facts from multiple sources, and synthesize findings with proper citations."}', ARRAY['search','research','fact-checking'], 5),
('doc-writer', 'Documentation Writer', 'Genere et maintient la documentation technique : README, API docs, guides, changelogs, JSDoc/TSDoc.', 'data', '📖', '#f97316', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['code-writer','read_file','write_file'], '{"temperature":0.3,"maxTokens":6144,"systemPrompt":"You are a technical writer. Create clear, comprehensive documentation with examples, API references, and guides."}', ARRAY['documentation','readme','api-docs','guides'], 6),

-- Content & Marketing
('blog-writer', 'Blog Writer', 'Redaction SEO avancee : articles de blog, LinkedIn posts, newsletters. Optimise pour le referencement et l engagement.', 'content', '✍️', '#8b5cf6', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['web-search'], '{"temperature":0.7,"maxTokens":4096,"systemPrompt":"You are an expert content writer specializing in SEO. Write engaging, well-structured content that ranks."}', ARRAY['blog','seo','content','writing'], 7),
('social-media', 'Social Media Manager', 'Cree et planifie du contenu pour Twitter/X, LinkedIn, Instagram, Facebook. Calendrier editorial et analytics.', 'content', '📱', '#ec4899', 'openai', 'gpt-4o', NULL, '{}', '{}', ARRAY['web-search'], '{"temperature":0.8,"systemPrompt":"You are a social media strategist. Create viral content for multiple platforms, schedule posts, and analyze engagement."}', ARRAY['social-media','marketing','content','planning'], 8),
('email-writer', 'Email Writer', 'Redaction d emails professionnels : cold outreach, follow-ups, newsletters, rapports. Ton adapte au contexte.', 'content', '📧', '#14b8a6', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', '{}', '{"temperature":0.5,"systemPrompt":"You are an expert email writer. Craft compelling, professional emails with the right tone for any context."}', ARRAY['email','communication','outreach'], 9),
('translator', 'Translator', 'Traduction professionnelle multi-langues avec adaptation culturelle. 40+ langues supportees.', 'content', '🌍', '#a855f7', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', '{}', '{"temperature":0.3,"systemPrompt":"You are a professional translator. Translate text while preserving tone, cultural context, and idiomatic expressions."}', ARRAY['translation','languages','localization'], 10),

-- Security
('security-scanner', 'Security Scanner', 'Scan de vulnerabilites : OWASP Top 10, dependances, secrets leaks, misconfigurations. Rapports detailles.', 'security', '🛡️', '#ef4444', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['exec_command','read_file','web-search'], '{"temperature":0.1,"systemPrompt":"You are a security auditor. Scan code and configurations for vulnerabilities following OWASP standards. Provide severity ratings and remediation steps."}', ARRAY['security','owasp','audit','vulnerabilities'], 11),

-- Productivity
('resume-builder', 'Resume Builder', 'Cree des CV et lettres de motivation sur mesure. Optimise pour ATS avec mots-cles specifiques.', 'productivity', '📋', '#0ea5e9', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', '{}', '{"temperature":0.5,"systemPrompt":"You are a professional resume and cover letter writer. Create ATS-optimized documents tailored to specific job postings."}', ARRAY['resume','cv','career','ats'], 12),
('seo-optimizer', 'SEO Optimizer', 'Analyse et optimise le contenu pour le SEO : mots-cles, meta tags, schema markup, vitesse, accessibilite.', 'productivity', '📈', '#22c55e', 'openai', 'gpt-4o', NULL, '{}', '{}', ARRAY['web-search','web_fetch'], '{"temperature":0.3,"systemPrompt":"You are an SEO specialist. Analyze and optimize content for search engines. Handle keywords, meta tags, schema markup, and technical SEO."}', ARRAY['seo','keywords','optimization','ranking'], 13),
('customer-support', 'Customer Support', 'Agent support client : repond aux questions, gere les reclamations, redirige vers les bons services. Ton empathique.', 'productivity', '💬', '#6366f1', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['web-search'], '{"temperature":0.6,"systemPrompt":"You are a customer support specialist. Handle inquiries with empathy, resolve issues efficiently, and escalate when needed."}', ARRAY['support','customer','helpdesk','communication'], 15),
('summarizer', 'Summarizer', 'Synthetise documents, articles, reunions, threads. Extrait les points cles et action items.', 'productivity', '📝', '#64748b', 'anthropic', 'claude-sonnet-4-20250514', NULL, '{}', '{}', ARRAY['summarizer'], '{"temperature":0.2,"maxTokens":2048,"systemPrompt":"You are an expert summarizer. Extract key points, action items, and decisions from documents and meetings."}', ARRAY['summary','notes','meetings','extract'], 16)
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