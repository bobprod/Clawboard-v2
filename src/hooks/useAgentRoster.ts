/**
 * useAgentRoster — hook partagé qui fusionne :
 *   - Les agents internes NemoClaw (sub-agents hardcodés + API)
 *   - Les agents CLI externes détectés via ACP (/api/acp/agents)
 *
 * Utilisé par : ChatModule, TaskCreator, TachesPage, AgentsOverview
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AgentSource = "nemoclaw" | "acp";
export type AgentStatus = "active" | "idle" | "stopped" | "offline";

export interface RosterAgent {
  id: string;
  name: string;
  role: string;
  source: AgentSource;
  status: AgentStatus;
  provider: string;
  color: string;
  /** only for ACP agents */
  command?: string;
  taskCount?: number;
}

// ─── Couleurs providers ─────────────────────────────────────────────────────────

const PROVIDER_COLOR: Record<string, string> = {
  anthropic:  "#d97757",
  google:     "#4285f4",
  openai:     "#10a37f",
  nvidia:     "#76b900",
  nemoclaw:   "#8b5cf6",
  openrouter: "#f59e0b",
  n8n:        "#ea580c",
  ollama:     "#6366f1",
  hermes:     "#ec4899",
  continue:   "#0ea5e9",
};

// ─── Agents NemoClaw statiques (fallback + enrichissement) ─────────────────────

const NEMO_STATIC: RosterAgent[] = [
  {
    id: "nemo-router",
    name: "NemoClaw Router",
    role: "Orchestrateur principal",
    source: "nemoclaw",
    status: "active",
    provider: "nemoclaw",
    color: PROVIDER_COLOR.nemoclaw,
  },
  {
    id: "nemo-code",
    name: "Code Architect",
    role: "Génération & révision de code",
    source: "nemoclaw",
    status: "active",
    provider: "nvidia",
    color: PROVIDER_COLOR.nvidia,
  },
  {
    id: "nemo-data",
    name: "Data Analyst",
    role: "Analyse de données & rapports",
    source: "nemoclaw",
    status: "idle",
    provider: "nvidia",
    color: PROVIDER_COLOR.nvidia,
  },
  {
    id: "nemo-sec",
    name: "Security Scanner",
    role: "Audit de sécurité",
    source: "nemoclaw",
    status: "idle",
    provider: "nvidia",
    color: PROVIDER_COLOR.nvidia,
  },
];

// ─── Agents ACP statiques (fallback) ───────────────────────────────────────────

const ACP_STATIC: RosterAgent[] = [
  { id: "claude",      name: "Claude Code",      role: "Coding",     source: "acp", status: "idle", provider: "anthropic", color: PROVIDER_COLOR.anthropic, command: "claude" },
  { id: "codex",       name: "Codex CLI",         role: "Coding",     source: "acp", status: "idle", provider: "openai",    color: PROVIDER_COLOR.openai,    command: "codex" },
  { id: "gemini",      name: "Gemini CLI",        role: "Multimodal", source: "acp", status: "idle", provider: "google",    color: PROVIDER_COLOR.google,    command: "gemini" },
  { id: "openclaw",    name: "OpenClaw",          role: "Orchestration", source: "acp", status: "idle", provider: "nvidia", color: PROVIDER_COLOR.nvidia,   command: "openclaw" },
];

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useAgentRoster() {
  const [agents, setAgents]   = useState<RosterAgent[]>([...NEMO_STATIC, ...ACP_STATIC]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch ACP agents
      const acpData = await apiFetch(`${BASE}/api/acp/agents`)
        .then(r => r.json())
        .catch(() => [] as any[]);

      const acpAgents: RosterAgent[] = (Array.isArray(acpData) ? acpData : []).map((a: any) => ({
        id:       a.id,
        name:     a.name,
        role:     a.role || "CLI Agent",
        source:   "acp" as AgentSource,
        status:   (a.status === "running" ? "active" : a.status === "stopped" ? "stopped" : "idle") as AgentStatus,
        provider: a.provider || "openai",
        color:    PROVIDER_COLOR[a.provider] ?? "#6b7280",
        command:  a.command,
        taskCount: a.taskCount ?? 0,
      }));

      // Fetch NemoClaw agents
      const nemoData = await apiFetch(`${BASE}/api/nemoclaw/agents`)
        .then(r => r.json())
        .catch(() => [] as any[]);

      const nemoAgents: RosterAgent[] = Array.isArray(nemoData) && nemoData.length > 0
        ? nemoData.map((a: any) => ({
            id:       a.id,
            name:     a.label || a.name,
            role:     a.role || "NemoClaw Agent",
            source:   "nemoclaw" as AgentSource,
            status:   (a.status === "active" ? "active" : "idle") as AgentStatus,
            provider: a.provider || "nemoclaw",
            color:    PROVIDER_COLOR[a.provider ?? "nemoclaw"] ?? PROVIDER_COLOR.nemoclaw,
            taskCount: a.taskCount ?? 0,
          }))
        : NEMO_STATIC;

      // Merge: prefer live data, fallback to static if empty
      const merged = [
        ...nemoAgents,
        ...(acpAgents.length > 0 ? acpAgents : ACP_STATIC),
      ];

      setAgents(merged);
    } catch (e: any) {
      setError(e?.message ?? "Erreur roster");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Rafraîchir toutes les 30s
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Sous-ensembles pratiques
  const nemoAgents = agents.filter(a => a.source === "nemoclaw");
  const acpAgents  = agents.filter(a => a.source === "acp");
  const activeAgents = agents.filter(a => a.status === "active" || a.status === "idle");

  return { agents, nemoAgents, acpAgents, activeAgents, loading, error, refresh };
}
