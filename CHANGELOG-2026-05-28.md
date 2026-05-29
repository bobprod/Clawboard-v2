# ClawBoard — Changelog 28 Mai 2026

**Itération** : #2 (suite du 27 mai)  
**Date** : 28 Mai 2026  
**Build** : ✅ 0 erreurs TS · ✅ Vite 2.44s  
**Auteur** : Assistant AI (Claude)

---

## CONTEXTE RAPIDE (pour agents IA)

> ClawBoard = centre de commandement qui centralise TOUTES les IA installées sur le PC
> (OpenClaw, Claude Code, Codex, Gemini CLI, n8n, Ollama…) et les fait coordonner via
> NemoClaw (orchestrateur). Chat central = **Lia**. Canaux externes = Telegram / WhatsApp.
> Stack : React 18 + TypeScript strict + Vite + React Router v6 + Lucide React.
> Backend : Node.js Express-like sur port 4000. Pas de Redux — SSE + mock graceful.

---

## CE QUI A CHANGÉ (résumé 30 secondes)

| # | Quoi | Fichier(s) | Impact |
|---|------|-----------|--------|
| 1 | Fusion navigation 13→8 items + sections | `App.tsx` | Sidebar restructurée |
| 2 | Redirects anciens routes → tabs | `App.tsx` | 0 lien cassé |
| 3 | AgentsHub — page unifiée 6 tabs | `AgentsHub.tsx` (**CRÉÉ**) | Remplace 5 pages séparées |
| 4 | AgentsOverview — nouvelle vue par défaut | `AgentsOverview.tsx` (**CRÉÉ**) | Page d'accueil agents claire |
| 5 | Tab Preview dans Outils & Logs | `DevToolsPage.tsx` | +1 tab |
| 6 | Tab Planificateur dans Tâches | `TachesPage.tsx` | +1 tab |
| 7 | Détection agents : 5→11 outils, fix logique | `src/lib/acp/client.mjs` | Trouve OpenClaw, OpenCode, Gemini, AntiGravity |
| 8 | Section labels dans sidebar | `index.css` | `.nav-section-label` ajouté |

---

## DÉTAIL PAR FICHIER

### `src/App.tsx` — modifié

**Imports retirés** (devenus inutiles après fusion) :
```
AgentsHierarchyModule, SchedulerModule, CoworkModule, AcpManager,
TeamMode, PreviewPanel, AgentStorePage, CalendarClock, Store
```

**Ajouté** :
```tsx
const AgentsHub = lazy(() => import("./AgentsHub").then(m => ({ default: m.AgentsHub })));
```

**Routes supprimées** : `/scheduler`, `/acp`, `/team`, `/preview`, `/store`

**Routes ajoutées** (redirects propres) :
```tsx
/cowork    → <Navigate to="/agents?tab=cowork" />
/acp       → <Navigate to="/agents?tab=installer" />
/team      → <Navigate to="/agents?tab=team" />
/store     → <Navigate to="/agents?tab=store" />
/scheduler → <Navigate to="/tasks?tab=scheduler" />
/preview   → <Navigate to="/devtools?tab=preview" />
```

**Sidebar — nouvelle structure** :
```
AI CORE       → / (Dashboard)  |  /tasks (Tâches)  |  /agents (Agents)
TRAVAIL       → /memory        |  /collaborations  |  /security
OUTILS        → /devtools
FOOTER        → /settings
```

**Topbar Cowork button** : `href` changé `/cowork` → `/agents?tab=cowork`

---

### `src/components/AgentsHub.tsx` — CRÉÉ

Wrapper avec 6 tabs lus depuis `?tab=` (URL param). Lazy-load de chaque tab.

```ts
type TabId = "overview" | "map" | "cowork" | "installer" | "team" | "store"
```

| Tab | Label | Composant chargé |
|-----|-------|-----------------|
| overview (défaut) | Mes Agents | `AgentsOverview` |
| map | Carte réseau | `AgentsHierarchyModule` |
| cowork | Cowork | `CoworkModule` |
| installer | Installateur | `AcpManager` |
| team | Team Mode | `TeamMode` |
| store | Store | `AgentStore` |

Chaque tab a une description affichée sous la barre d'onglets.

---

### `src/components/AgentsOverview.tsx` — CRÉÉ

Page d'accueil "Mes Agents" — **remplace le graphe ReactFlow comme vue par défaut**.

**Philosophie affichée** :
- NemoClaw = orchestrateur central (cerveau)
- Agents CLI = outils externes installés sur le PC
- ClawBoard = tableau de bord qui centralise tout

**Sections** :
1. Bannière philosophie (visible si NemoClaw offline)
2. Orchestrateur NemoClaw — grande carte avec CPU/RAM live (setInterval 2500ms)
3. Agents internes NemoClaw — grid de sous-agents
4. Agents CLI externes — grid des outils détectés + bouton "Détecter" + bouton Store

**Types clés** :
```ts
interface NemoAgent { id, label, role, model, provider?, status: "active"|"offline", parentId, cpu?, ram? }
interface AcpAgent  { id, name, command, role, status, detected, cpu, memory, taskCount, uptime, lastError }
```

**Couleurs providers** :
```
anthropic → #d97757  |  google → #4285f4  |  openai → #10a37f
nvidia    → #76b900  |  nemoclaw → #8b5cf6
```

**Endpoints utilisés** :
- `GET /api/nemoclaw/agents` → mock si absent
- `GET /api/acp/agents` → mock si absent
- `POST /api/acp/scan` → bouton Détecter

**Mock data** : `MOCK_NEMO` (4 agents) + `MOCK_ACP` (3 agents CLI) — affichés si API hors ligne.

---

### `src/components/DevToolsPage.tsx` — modifié

```ts
type TabId = "terminal" | "gitlog" | "audit" | "preview"  // "preview" ajouté
```

- Lazy import `PreviewPanel` ajouté
- `useSearchParams` ajouté → lit `?tab=preview` depuis l'URL
- `useEffect` synchronise l'onglet actif si l'URL change en cours de navigation

---

### `src/components/TachesPage.tsx` — modifié

```ts
type TabId = "taches" | "modeles" | "recurrences" | "archives" | "planificateur"  // "planificateur" ajouté
```

- Lazy import `SchedulerModule` ajouté
- `useSearchParams` → lit `?tab=scheduler`
- Tab affiché dans `<Suspense>` avec fallback spinner

---

### `src/lib/acp/client.mjs` — modifié

**Problème** : détectait seulement 5 outils, logique trop stricte (exit 0 requis).

**Fix 1 — `AGENT_CATALOGUE` étendu** : 5 → 11 outils

| id | commands | provider |
|----|---------|---------|
| claude | `claude` | anthropic |
| codex | `codex` | openai |
| opencode | `opencode`, `open-code` | openrouter |
| gemini | `gemini`, `gemini-cli` | google |
| antigravity | `antigravity`, `adk`, `google-adk`, `aistudio` | google |
| openclaw | `openclaw`, `nemoclaw`, `nemo`, `openclaw.exe` | nvidia |
| hermes | `hermes`, `hermes-agent` | hermes |
| n8n | `n8n` | n8n |
| ollama | `ollama` | ollama |
| continue | `continue` | continue |
| aider | `aider` | openai |

Chaque outil essaie plusieurs flags : `--version`, `-v`, `version`, `--help`, `status`.

**Fix 2 — Logique de détection changée** :
```js
// AVANT : ok = exit code 0
// APRÈS  : ok = processus se lance (pas d'erreur ENOENT = outil trouvé)
ok: err.code !== "ENOENT"  // si ENOENT → pas installé ; tout autre cas → installé
```

**Fix 3 — `buildExtraPaths(isWin)`** : augmente le PATH de recherche :
```
npm global  :  $(npm root -g)/../bin  |  %APPDATA%\npm
cargo       :  ~/.cargo/bin
pip/pyenv   :  ~/.local/bin  |  ~/.pyenv/bin
homebrew    :  /opt/homebrew/bin  |  /usr/local/bin
scoop       :  ~/scoop/shims  (Windows)
chocolatey  :  C:\ProgramData\chocolatey\bin  (Windows)
```

---

### `src/index.css` — modifié

Ajouté :
```css
.nav-section-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted, #6b7280);
  padding: 14px 16px 4px;
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
}
```

---

## ERREURS CORRIGÉES EN COURS

| Erreur TS | Cause | Fix |
|-----------|-------|-----|
| `TS6133` imports inutilisés App.tsx | Lazy imports devenus inutiles après fusion | Supprimés |
| `TS6133` imports inutilisés AgentsOverview.tsx | RefreshCw, Settings2, Cpu… importés mais jamais utilisés | Supprimés |
| `TS2339` `agent.name` sur NemoAgent | NemoAgent utilise `label`, pas `name` | Cast différencié via `isNemo ? nemo.label : acp.name` |

---

## STATS BUILD FINAL

```
npx tsc --noEmit  →  0 erreurs
npm run build     →  ✅ built in 2.44s
Chunks principaux :
  index          106 KB  (31 KB gzip)
  TachesPage      98 KB  (22 KB gzip)
  vendor-react   178 KB  (56 KB gzip)
  vendor-flow    302 KB  (97 KB gzip)
  vendor-editor 1847 KB (589 KB gzip)  ← Monaco, déjà lazy
```

---

---

## ITÉRATION #3 — Intégration Ableton MCP (28 Mai 2026)

### Analyse effectuée
| Source | Type | Résultat |
|--------|------|---------|
| `mcp.directory/servers/ableton-live` | MCP stdio | 16 outils, `uvx ableton-mcp` |
| `github.com/ahujasid/ableton-mcp` | MCP + Remote Script | TCP socket JSON entre Remote Script et serveur Python |
| `github.com/ideoforms/AbletonOSC` | Remote Script OSC | Port 11000/11001, Live Object Model complet |
| `ableton.com/en/packs/connection-kit` | Max for Live pack | Discontinué, OSC + JSON API + Arduino |

### Fichiers modifiés

**`src/data/mcpCatalog.ts`**
- Type `McpCategory` : ajout `"music"`
- `MCP_CATEGORIES` : ajout `{ id: "music", label: "Musique & Audio", icon: "🎵" }`
- `MCP_CATALOG` : 2 nouvelles entrées

| id | name | transport | command | tags clés |
|----|------|-----------|---------|-----------|
| `ableton-mcp` | Ableton Live MCP | stdio | `uvx ableton-mcp` | ableton, midi, daw, remote-script |
| `ableton-osc` | AbletonOSC | stdio | `python3 -m ableton_osc_bridge` | osc, live-object-model, remote-script |

**`src/components/McpModule.tsx`**
- Badge orange "Remote Script" dans le drawer si `tags.includes("remote-script")`
- Bannière warning "Installation en 2 étapes" avec instructions complètes :
  - **ableton-mcp** : 5 étapes (download, copy Remote Script, activer dans Ableton, installer uv, connecter)
  - **ableton-osc** : 4 étapes (download, copy, activer, tester OSC)
  - Chemins Windows + Mac affichés
- Bouton "Copier uvx" si `entry.command === "uvx"` (équivalent du bouton "Copier npx")

### Build final
```
npx tsc --noEmit  →  0 erreurs
```

---

## RESTE À FAIRE (backlog immédiat)

- [ ] WhatsApp dans Settings → Plugins (entrée manquante)
- [ ] Toggle "Sync Lia" sur chaque canal plugin (Telegram, WhatsApp…)
- [ ] Tester le scan `/api/acp/scan` après redémarrage serveur pour valider les 11 outils

---

## RÈGLES À RESPECTER (rappel pour agents futurs)

1. `npx tsc --noEmit` doit toujours passer **0 erreurs** avant de livrer
2. Toujours utiliser `var(--bg-glass)`, `var(--border-subtle)`, etc. — jamais de couleurs hardcodées
3. Tout endpoint API doit avoir un `.catch()` qui renvoie des **mock data** (mock graceful)
4. Lazy-load obligatoire pour tous les composants de routes (pattern `lazy(() => import(...))`)
5. URL params pour les tabs : `useSearchParams()` + `?tab=xxx`
6. Jamais de `Redux` — état local React + SSE hook + React Query
7. **Mettre à jour ce fichier** à chaque fin de session avec le numéro d'itération et la date
