# ClawBoard — Changelog / Résumé des modifications

**Date** : 27 Mai 2026  
**Version** : v2.0.0  
**Auteur** : Assistant AI (opencode)

---

## Résumé

Transformation majeure de ClawBoard en plateforme d'orchestration multi-agents. Ajout de MCP, ACP, skills model-agnostiques, connectors hub, et optimisations de performance inspirées d'AionUi, Dify et CrewAI.

---

## Étape 1 — Fluidité Immédiate ✅

### Packages installés
- `@tanstack/react-query` — Data fetching avec cache stale-while-revalidate
- `react-virtuoso` — Virtualisation des listes
- `react-markdown` + `remark-gfm` + `remark-breaks` — Rendu markdown pro
- `react-syntax-highlighter` — Syntax highlighting pour le code
- `@dnd-kit/core` + `@dnd-kit/sortable` — Drag & Drop Kanban
- `zod` — Validation schemas
- `@modelcontextprotocol/sdk` — Client/serveur MCP
- `@monaco-editor/react` — Éditeur de code VS Code
- `mammoth` — Lecture fichiers DOCX
- `xlsx` — Lecture fichiers Excel
- `croner` — Scheduled tasks
- `pdf-parse` — Lecture PDF
- `@types/react-syntax-highlighter` — Types TypeScript

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `src/hooks/useSSE.ts` | **REFACTOR COMPLET** — Singleton EventSource (1 connexion au lieu de 7) |
| `src/hooks/useQueryData.ts` | **CRÉÉ** — Hooks React Query (useTasks, useArchives, useModeles, etc.) |
| `src/lib/queryClient.ts` | **CRÉÉ** — Configuration React Query |
| `src/main.tsx` | Ajout QueryClientProvider + React.StrictMode |
| `src/index.css` | Ajout classes CSS (error-boundary, stat-card, kanban-card, chat-bubble, terminal-line, etc.) |
| `src/components/TerminalModule.tsx` | Virtualisation avec react-virtuoso |
| `vite.config.ts` | Chunking optimisé (vendor-data, vendor-editor, vendor-interaction, vendor-protocol) |
| `package.json` | ~30 nouvelles dépendances |

---

## Étape 2 — Markdown Pro + Zod + DnD ✅

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `src/components/MarkdownRenderer.tsx` | Composant react-markdown avec GFM, syntax highlighting, task lists, tables |
| `src/components/DndKanban.tsx` | Kanban avec drag & drop entre colonnes (@dnd-kit) |
| `src/lib/validate.mjs` | Réécrit avec Zod (schemas pour toutes les routes API) |
| `src/types/react-syntax-highlighter.d.ts` | Types TypeScript pour react-syntax-highlighter |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `src/components/ChatModule.tsx` | Remplacement de `marked` par `MarkdownRenderer` |

---

## Étape 3 — MCP Client/Server ✅

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `src/lib/mcp/client.mjs` | Client MCP — connexion serveurs externes (stdio/sse/http) |
| `src/lib/mcp/server.mjs` | Serveur MCP — expose les outils ClawBoard |
| `src/components/McpManager.tsx` | UI gestion serveurs MCP (liste, test, tool list, JSON import) |
| `routes/mcp.mjs` | API REST MCP (CRUD servers, test, tools, call) |
| `database/mcp_tables.sql` | Migration SQL table `mcp_servers` |

---

## Étape 4 — ACP Multi-Agent ✅

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `src/lib/acp/client.mjs` | Client ACP — spawn CLI agents, communication stdin/stdout |
| `src/lib/acp/server.mjs` | Serveur ACP — expose ClawBoard comme agent |
| `src/components/AcpManager.tsx` | UI gestion agents ACP (scan PATH, start/stop, CPU/RAM) |
| `src/components/TeamMode.tsx` | UI Team Mode (créer session Leader+Teammates, mailbox) |
| `routes/acp.mjs` | API REST ACP (agents, team, mailbox, scan) |
| `database/acp_tables.sql` | Migration SQL tables `acp_agents`, `acp_sessions`, `acp_mailbox` |

---

## Étape 5 — Skills Model-Agnostiques ✅

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `src/lib/llm/adapter.mjs` | Adaptateur LLM unifié (OpenAI, Anthropic, Google, Ollama, DeepSeek, OpenRouter) |
| `src/lib/llm/skill-loader.mjs` | Chargeur de skills (scan skills/, hot-reload, validation) |
| `src/components/SkillToggle.tsx` | Indicateur skills actifs par conversation (toggle on/off) |
| `routes/skills.mjs` | API REST Skills (registry, enable/disable) |
| `skills/cowork/skill.json` | Skill cowork — exécution autonome |
| `skills/code-writer/skill.json` | Skill code-writer — écriture code 30+ langages |
| `skills/web-search/skill.json` | Skill web-search — recherche web |
| `skills/file-manager/skill.json` | Skill file-manager — gestion fichiers |
| `skills/summarizer/skill.json` | Skill summarizer — résumé de textes |

---

## Étape 6 — Preview Panel + Documents ✅

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `src/components/PreviewPanel.tsx` | Aperçu multi-format (code, markdown, images, diff, PDF, texte) avec multi-tab |
| `routes/files.mjs` | API REST fichiers (list, read, write, diff) |

---

## Étape 7 — MCP Connectors Hub ✅

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `src/components/McpConnectors.tsx` | Hub de 27 connectors MCP pré-configurés avec gestion API keys |

### Connectors disponibles

| Catégorie | Connectors |
|-----------|-----------|
| **Système** | Desktop Commander, Filesystem |
| **Marketing** | Meta Marketing API, Meta Graph API |
| **Google** | Workspace, BigQuery, Maps, Analytics, Security, Cloud SQL |
| **Design** | Canva MCP |
| **Vidéo** | Higgsfield, CapCut MCP, CapCut VectCutAPI, CapCut SmartCut AI |
| **Communication** | Slack |
| **DevTools** | GitHub |
| **Productivité** | Notion |
| **Database** | PostgreSQL |
| **CMS** | WordPress MCP, Easy MCP AI, WooCommerce, SEO, GA4, GSC |

---

## Étape 8 — Navigation & Routing ✅

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `src/App.tsx` | Ajout lazy imports + routes + sidebar nav pour : MCP, Connectors, ACP, Team, Preview |
| `server.mjs` | Import + enregistrement des routes : MCP, ACP, Skills, Files |

### Nouvelles pages
| Route | Page | Description |
|-------|------|-------------|
| `/mcp` | MCP Servers | Gestion des serveurs MCP connectés |
| `/connectors` | Connectors Hub | Marketplace de 27 connectors MCP |
| `/acp` | ACP Agents | Gestion des agents CLI (auto-detect + custom) |
| `/team` | Team Mode | Sessions Leader + Teammates avec mailbox |
| `/preview` | Preview Panel | Aperçu multi-format de fichiers |

---

## Étape 9 — Documentation ✅

### Fichiers créés/modifiés
| Fichier | Description |
|---------|-------------|
| `README.md` | **RÉÉCRIT** — Documentation professionnelle (features, quickstart, stack, architecture, API, security) |

---

## Étape 10 — Validation Backend ✅

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `src/lib/validate.mjs` | **RÉÉCRIT** — Validation Zod pour toutes les routes API |
| `src/lib/redis.js` | Inchangé (compatible) |
| `src/db/client.js` | Inchangé (compatible) |

---

## Statistiques du Build

```
✓ 0 erreurs TypeScript
✓ 3271 modules transformés
✓ Bundles optimisés avec code splitting
✓ vendor-react: 178 KB (gzip 56 KB)
✓ vendor-editor: 1847 KB (gzip 589 KB)
✓ vendor-flow: 302 KB (gzip 97 KB)
✓ index: 107 KB (gzip 31 KB)
```

---

## Stack Technique Utilisée

| Couche | Technologie |
|--------|------------|
| Frontend | React 19, TypeScript 5.9, Vite 8 |
| Routing | React Router DOM 7 |
| State | @tanstack/react-query, SSE singleton |
| Virtualisation | react-virtuoso |
| DnD | @dnd-kit |
| Markdown | react-markdown + remark-gfm |
| Éditeur | @monaco-editor/react |
| Validation | Zod |
| MCP | @modelcontextprotocol/sdk |
| Backend | Node.js 22 (ES modules), serveur HTTP natif |
| Database | PostgreSQL 16 (pg pool) |
| Cache | Redis 5 (optionnel) |

---

## Prochaines Étapes

- [ ] Integrer les routes MCP/ACP dans l'UI sidebar (navigation complète)
- [ ] Ajouter les 35+ skills builtin dans le dossier `skills/`
- [ ] Créer le Prompt IDE (A/B testing, versioning)
- [ ] Workflow Canvas avec @xyflow/react
- [ ] RAG Pipeline (ingestion, chunking, embeddings, retrieval)
- [ ] Vector Memory (pgvector, Qdrant, Weaviate)
- [ ] Scheduled Tasks avancés (croner, conversation-bound, keep-awake)
- [ ] Chat Platform Integrations (Telegram, Discord, Slack, Lark, DingTalk)
- [ ] Tests E2E avec Playwright
