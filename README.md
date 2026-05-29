# ClawBoard — AI Agent Orchestrator

> Multi-agent orchestration dashboard for NemoClaw with MCP, ACP, and universal model support.

## Features

- **Multi-Agent Dashboard** — Kanban, tasks, archives, recurrences
- **AI Chat** — Real-time streaming with tool calls, plans, and memory
- **Cowork Sessions** — Autonomous agent execution with human-in-the-loop
- **MCP Integration** — Connect any MCP server, sync tools across agents
- **ACP Multi-Agent** — Team Mode with Leader/Teammate orchestration
- **35 Built-in Skills** — Code, docs, web, files, images — model-agnostic
- **6 Themes** — Dark, Light, Synthwave, Nord, Catppuccin, Ocean
- **Scheduled Tasks** — Cron-based automation with keep-awake
- **Security** — 4-layer security (network, filesystem, process, inference)

## Quick Start

### Prerequisites
- Node.js 22+
- PostgreSQL 16+
- Redis (optional, graceful fallback)

### Install
```bash
git clone https://github.com/your-org/clawboard.git
cd clawboard
npm install
```

### Configure
```bash
cp .env.example .env
# Edit .env with your database and API keys
```

### Run
```bash
# Frontend (Vite dev server)
npm run dev

# Backend (Node.js API server)
npm run server
```

### Docker
```bash
docker-compose up -d
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 8 |
| Routing | React Router DOM 7 |
| State | @tanstack/react-query, SSE |
| Styling | CSS Variables + 6 themes |
| Editor | @monaco-editor/react |
| Markdown | react-markdown + remark-gfm |
| DnD | @dnd-kit |
| Virtualization | react-virtuoso |
| Backend | Node.js 22 (ES modules) |
| Database | PostgreSQL 16 (pg pool) |
| Cache | Redis 5 (optional) |
| MCP | @modelcontextprotocol/sdk |
| Validation | Zod |
| Testing | Vitest + Playwright |

## Architecture

```
src/
  main.tsx              — Entry point, QueryClientProvider
  App.tsx               — Router, sidebar, ThemeSwitcher
  hooks/
    useSSE.ts           — Singleton SSE (1 EventSource per URL)
    useQueryData.ts     — React Query hooks for API
  components/
    Dashboard.tsx       — Main dashboard with widgets
    ChatModule.tsx      — AI chat with streaming
    TasksKanban.tsx     — Kanban board
    TachesPage.tsx      — Tasks, archives, recurrences
    McpManager.tsx      — MCP server management
    AcpManager.tsx      — ACP agent management
    TeamMode.tsx        — Multi-agent team orchestration
    PreviewPanel.tsx    — Multi-format file preview
    SkillToggle.tsx     — Skill activation per conversation
    MarkdownRenderer.tsx — react-markdown based renderer
  lib/
    apiFetch.ts         — Auth-aware fetch wrapper
    queryClient.ts      — React Query client config
    validate.mjs        — Zod validation schemas
    mcp/                — MCP client & server
    acp/                — ACP client & server
    llm/                — LLM adapter, skill loader
server.mjs              — Backend HTTP server
routes/                 — API route handlers
database/               — Schema & migrations
skills/                 — Built-in skill definitions
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tasks | List tasks (paginated) |
| POST | /api/tasks | Create task |
| PATCH | /api/tasks/:id | Update task |
| POST | /api/tasks/:id/run | Execute task |
| GET | /api/tasks?stream=1 | SSE live task stream |
| GET | /api/quota | SSE quota stream |
| GET | /api/mcp/servers | List MCP servers |
| POST | /api/mcp/servers | Add MCP server |
| GET | /api/acp/agents | List ACP agents |
| POST | /api/acp/team/create | Create team session |
| GET | /api/skills | List available skills |
| GET | /api/memory | List memory documents |
| GET | /api/files | List workspace files |
| GET | /api/files/* | Read file content |
| PUT | /api/files/* | Write file content |
| GET | /api/files/diff/* | Get git diff for file |

## Security

- **Network**: SSRF protection, CORS, rate limiting
- **Filesystem**: Path allowlist, executable blocking, 512KB limit
- **Process**: Command allowlist, dangerous pattern blocking, timeouts
- **Inference**: Credential isolation, circuit breaker, token limits
- **Auth**: Bearer token, AES-256-GCM encryption for API keys

## Testing

```bash
npm run test:unit    # Vitest unit tests
npm run test:api     # Node.js API tests
npm run test:e2e     # Playwright E2E tests
```

## License

MIT
