# Clawboard — Instructions de développement

Frontend React + TypeScript + Vite pour **Nemoclaw** (version sécurisée d'OpenClaw by NVIDIA).

## Stack technique

- React 18, TypeScript strict, Vite
- React Router v6 (`useNavigate`, `useLocation`)
- Joyride (product tours)
- Lucide React (icônes)
- `apiFetch` wrapper : `src/lib/apiFetch.ts`
- Backend Nemoclaw : `http://localhost:4000`
- `npx tsc --noEmit` doit toujours passer à zéro erreurs

## Architecture

```
src/
  App.tsx              — Router, sidebar, ThemeSwitcher, AppShell
  index.css            — Variables CSS + 6 thèmes
  components/          — Tous les composants
  hooks/               — useSSE, useApiKeys…
  lib/                 — apiFetch
  data/                — mockData
```

## Composants implémentés

### Dashboard (`Dashboard.tsx`)

- `AlertsBanner` — smart alerts, polling 60s, seuils localStorage `clawboard-alerts-settings`
- `ActivityHeatmap` — heatmap 30j, streak, tooltip hover
- `ModelCostBreakdown` — coût par modèle, 3 périodes (7j/30j/all)
- `AgentChat` — chat flottant SSE, multi-agents, tool calls
- `ApprovalsWidget` — flux d'approbation humain, risque élevé/moyen/faible, Approuver/Rejeter, expiration
- `GatewayProbes` — probes santé providers, latence, auto-refresh 60s
- `DashboardTour` — tour Joyride 9 étapes, 1ère visite auto, relançable menu profil

### Tâches (`TachesPage.tsx`)

- Tab Tâches : clone, rejouer FAILED, dropdown, navigate avec prefill
- Tab Modèles : badges last-exec (✓ OK / ✕ FAIL) via archives cross-ref
- Tab Récurrences : badge ÉCHEC sur modèles en échec
- Tab Archives : search + filtres status + export CSV

### Création (`TaskCreator.tsx`)

- Auto-save draft : localStorage key `clawboard-task-creator-draft`
- Clone/Rejouer : `useLocation().state?.prefill`
- ValidationBanner : warnings (no-model error, no-dest warn, short-prompt warn)
- `SkillsPicker` intégré (remplace input texte pour le champ Skill)
- Compteur mots/chars, timeout suggéré, save-as-model toggle

### Mémoire (`MemoryModule.tsx`)

- Quick-access : MEMORY.md, HEARTBEAT.md, CLAUDE.md, NOTES.md
- Filtre par type, modes Edit / Split / Preview
- Rendu Markdown inline (regex, zero dépendance)
- Sync indicator, `GET /api/memory`, `PATCH /api/memory/:id`

### Skills (`SkillsModule.tsx` + `SkillsPicker.tsx`)

- Page complète + modale picker réutilisable (props: `value`, `onChange`)
- Filtres catégorie (local/github/npm), cartes status/tags
- `GET /api/skills`

### Terminal (`TerminalModule.tsx`)

- Route `/terminal` dans la nav sidebar
- Historique ↑↓, Ctrl+L clear, Ctrl+C annuler
- Builtins : help, clear, version, status, tasks, run \<id\>, logs \<id\>
- Fallback graceful si `/api/shell` absent

### Cowork Agent (`CoworkModule.tsx` + `routes/computer-use.mjs`)

- Route `/cowork` dans la nav sidebar + topbar quick-access
- Sessions Cowork : création, suivi, plan, sub-agents, messages SSE
- Computer Use : screenshot, mouse (click/drag/move), keyboard (type/key), scroll
- 6 tabs : Overview, Plan, Files, Sub-agents, Computer Use, Messages
- Modes : autonomous, supervised (human-in-the-loop), manual
- Agent loop : LLM → tool_use → execute → result → repeat (max 50 itérations)
- Sécurité 4 couches : network, filesystem, process, inference
- Dashboard widget `CoworkWidget` : sessions actives, terminées, tokens
- 4 connecteurs MCP : Computer Use Anthropic, OpenWork, Eigent, VNC Bridge
- Skills : `skills/computer-use.md`, `skills/cowork-agent.md`
- Mock graceful si backend absent

## Thèmes (6) — `src/index.css` + `THEMES` dans `App.tsx`

| id           | Nom              | Accent  |
| ------------ | ---------------- | ------- |
| `dark`       | Dark             | #8b5cf6 |
| `light`      | Light            | #7c3aed |
| `synthwave`  | Synthwave        | #ff2d78 |
| `nord`       | Nord             | #88c0d0 |
| `catppuccin` | Catppuccin Mocha | #cba6f7 |
| `ocean`      | Deep Ocean       | #38bdf8 |

Clé localStorage : `clawboard-theme`

## Endpoints Nemoclaw utilisés

```
GET  /api/tasks              (+ ?stream=1 SSE, ?status=running)
POST /api/tasks/:id/run
GET  /api/archives
GET  /api/recurrences
GET  /api/modeles
POST /api/modeles
GET  /api/memory
PATCH /api/memory/:id
GET  /api/skills
GET  /api/health
POST /api/chat               (SSE streaming)
GET  /api/quota              (SSE)
GET  /api/approvals          (mock graceful si absent)
POST /api/approvals/:id      (decision: approve|reject)
GET  /api/health/probes      (mock graceful si absent)
POST /api/shell              (terminal, mock graceful si absent)
GET  /api/tools              (liste outils + groupes + profiles + config)
GET  /api/tools/config       (configuration outils courante)
PUT  /api/tools/config       (modifier config outils: profile, allow, deny)
GET  /api/tools/groups       (groupes d'outils OpenClaw compatibles)
GET  /api/tools/security     (posture sécurité NemoClaw 4 couches)
POST /api/computer-use/action    (exécuter action Computer Use: screenshot, click, type, key, scroll)
GET  /api/computer-use/screenshot (capture écran courante)
GET  /api/cowork/sessions         (liste sessions Cowork)
POST /api/cowork/sessions         (créer nouvelle session)
GET  /api/cowork/sessions/:id     (détail session)
DELETE /api/cowork/sessions/:id   (supprimer session)
POST /api/cowork/sessions/:id/message  (envoyer message à session)
GET  /api/cowork/sessions/:id/stream   (SSE événements temps réel)
POST /api/cowork/sessions/:id/approval (approve|reject action)
GET  /api/cowork/sessions/:id/files    (lister fichiers workspace)
GET  /api/cowork/sessions/:id/files/*  (lire contenu fichier)
GET  /api/cowork/sessions/stats        (statistiques globales)
```

## Outils Agent (LIA_TOOLS) — OpenClaw adaptés NemoClaw

### Outils builtin (hérités)

| Outil                | Groupe     | Sécurité    |
| -------------------- | ---------- | ----------- |
| `list_tasks`         | sessions   | safe        |
| `get_task`           | sessions   | safe        |
| `create_task`        | sessions   | write       |
| `start_task`         | sessions   | write       |
| `delete_task`        | sessions   | destructive |
| `patch_task`         | sessions   | write       |
| `batch_create_tasks` | automation | write       |
| `list_modeles`       | modeles    | safe        |
| `create_modele`      | modeles    | write       |
| `list_recurrences`   | automation | safe        |
| `create_cron`        | automation | write       |
| `save_note`          | memory     | write       |
| `list_directory`     | fs         | safe        |
| `read_file`          | fs         | safe        |

### Outils OpenClaw (nouveaux, NemoClaw securisés)

| Outil           | Groupe    | Sécurité | Description                                           |
| --------------- | --------- | -------- | ----------------------------------------------------- |
| `write_file`    | fs        | write    | Écriture fichiers sandbox (exts dangereuses bloquées) |
| `exec_command`  | runtime   | elevated | Shell allowlist + patterns dangereux bloqués          |
| `web_search`    | web       | network  | Recherche DuckDuckGo (pas d'API key requise)          |
| `web_fetch`     | web       | network  | Fetch URL avec SSRF protection                        |
| `search_memory` | memory    | safe     | Recherche dans MEMORY.md + task activities            |
| `send_message`  | messaging | network  | Telegram/Discord/Slack/Webhook                        |

### Profiles d'outils (OpenClaw compatible)

| Profile     | Outils inclus                          |
| ----------- | -------------------------------------- |
| `full`      | Tous les 20 outils (défaut)            |
| `coding`    | fs + runtime + sessions + memory + web |
| `messaging` | messaging + sessions + memory          |
| `minimal`   | list_tasks + get_task uniquement       |

### Groupes d'outils

`group:runtime`, `group:fs`, `group:sessions`, `group:memory`, `group:web`, `group:automation`, `group:messaging`, `group:modeles`, `group:nemoclaw`

### Sécurité NemoClaw (4 couches)

- **Network** : deny-by-default egress, SSRF protection IPs privées, timeout 15s
- **Filesystem** : chemins autorisés (isPathAllowed), extensions exécutables bloquées, max 512KB
- **Process** : allowlist commandes, patterns dangereux bloqués (rm -rf, sudo, pipe-to-shell), timeout 30-120s
- **Inference** : credentials isolés, timeout 60s, circuit breaker

## Patterns importants

- **Mock graceful** : tous les endpoints optionnels ont un `.catch()` qui injecte des données de démo
- **data-tour** attributes : présents sur les éléments ciblés par les tours Joyride
- **SSE** : `useSSE` hook + `EventSource` / `ReadableStream` dans AgentChat
- **Clone prefill** : `navigate('/tasks/new', { state: { prefill: task } })`
- **CSS vars** : toujours utiliser `var(--bg-glass)`, `var(--border-subtle)`, etc. — jamais de couleurs hardcodées

## Backlog restant

- QR code pairing Telegram/Discord dans TaskCreator
- Git log viewer (`GitLogModule.tsx`)
- TOTP MFA dans `SecurityModule.tsx`
- Brancher `/api/approvals` réel quand disponible côté Nemoclaw
