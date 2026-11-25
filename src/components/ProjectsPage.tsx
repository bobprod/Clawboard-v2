import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FolderKanban, ChevronDown, ChevronRight, Inbox, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { apiFetchJson } from "../lib/apiFetch";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  nom: string;
  description: string | null;
  couleur: string;
  statut: string;
  taskCount: number;
  taskDone: number;
  createdAt: string;
  updatedAt: string;
}

interface TaskItem {
  id: string;
  name: string;
  status: string;
  projectId: string | null;
  agent?: string;
  skillName?: string | null;
  instructions?: string;
}

const STATUS_LABEL: Record<string, string> = {
  planifie: "Planifiée",
  planned: "Planifiée",
  running: "En cours",
  completed: "Terminée",
  terminee: "Terminée",
  failed: "Échouée",
  cancelled: "Annulée",
};

const STATUS_COLOR: Record<string, string> = {
  planifie: "var(--text-secondary)",
  planned: "var(--text-secondary)",
  running: "var(--status-info)",
  completed: "var(--status-success)",
  terminee: "var(--status-success)",
  failed: "var(--status-error)",
  cancelled: "var(--text-muted)",
};

// ─── Petits helpers UI ────────────────────────────────────────────────────────

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "var(--brand-primary)",
  borderColor: "var(--brand-primary)",
  color: "#fff",
};

const input: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  padding: 16,
  boxShadow: "var(--shadow-sm)",
};

const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12.5 };

// ─── Composant principal ──────────────────────────────────────────────────────

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#5e6ad2");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showUnassigned, setShowUnassigned] = useState(true);

  async function load() {
    setLoading(true);
    const [p, t] = await Promise.all([
      apiFetchJson<Project[]>("/api/projects"),
      apiFetchJson<TaskItem[]>("/api/tasks"),
    ]);
    if (p.error) setError(p.error);
    else setProjects(p.data || []);
    if (t.error && !p.error) setError(t.error);
    else if (t.data) setTasks(Array.isArray(t.data) ? t.data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const byProject = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    for (const t of tasks) {
      const key = t.projectId || "__none__";
      (map[key] ||= []).push(t);
    }
    return map;
  }, [tasks]);

  async function createProject() {
    const nom = newName.trim();
    if (!nom) return;
    const r = await apiFetchJson<Project>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, description: newDesc || null, couleur: newColor }),
    });
    if (r.error) setError(r.error);
    else {
      setShowNew(false);
      setNewName("");
      setNewDesc("");
      await load();
    }
  }

  async function deleteProject(id: string) {
    if (!window.confirm("Supprimer ce projet ? Les tâches seront conservées (sans projet).")) return;
    await apiFetchJson(`/api/projects/${id}`, { method: "DELETE" });
    await load();
  }

  async function assignTask(taskId: string, projectId: string | null) {
    await apiFetchJson(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    await load();
  }

  function TaskRow({ t }: { t: TaskItem }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
        }}
      >
        <span style={{ color: STATUS_COLOR[t.status] || "var(--text-secondary)" }}>
          {t.status === "completed" || t.status === "terminee" ? (
            <CheckCircle2 size={15} />
          ) : (
            <Circle size={15} />
          )}
        </span>
        <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.name || t.id}
        </span>
        <span style={muted}>{STATUS_LABEL[t.status] || t.status}</span>
        <select
          value={t.projectId || ""}
          onChange={(e) => assignTask(t.id, e.target.value || null)}
          style={{
            ...input,
            width: "auto",
            padding: "4px 8px",
            fontSize: 12,
          }}
        >
          <option value="">Aucun projet</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function ProjectCard({ p }: { p: Project }) {
    const tasksList = byProject[p.id] || [];
    const open = expanded[p.id];
    const pct = p.taskCount ? Math.round((p.taskDone / p.taskCount) * 100) : 0;
    return (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", padding: 0, display: "flex", alignItems: "center", gap: 6, flex: 1, textAlign: "left" }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                background: p.couleur || "var(--brand-accent)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--heading)" }}>{p.nom}</span>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <span style={muted}>
            {p.taskDone}/{p.taskCount} tâches
          </span>
          <button
            title="Supprimer le projet"
            onClick={() => deleteProject(p.id)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <Trash2 size={15} />
          </button>
        </div>
        {p.description && (
          <p style={{ ...muted, margin: "6px 0 10px 22px" }}>{p.description}</p>
        )}
        {p.taskCount > 0 && (
          <div style={{ height: 6, background: "var(--bg-surface)", borderRadius: 3, margin: "4px 0 12px 22px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: p.couleur || "var(--brand-accent)" }} />
          </div>
        )}
        {open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {tasksList.length === 0 ? (
              <p style={muted}>Aucune tâche dans ce projet.</p>
            ) : (
              tasksList.map((t) => <TaskRow key={t.id} t={t} />)
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 32, color: "var(--text-muted)" }}>Chargement des projets…</div>;
  }

  const unassigned = byProject["__none__"] || [];

  return (
    <div style={{ padding: 24, maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: "var(--heading)" }}>
            <FolderKanban size={22} style={{ verticalAlign: "-4px", marginRight: 8 }} />
            Projets
          </h2>
          <p style={{ ...muted, margin: "4px 0 0" }}>
            Regroupez vos tâches par projet, comme dans Notion.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={load} title="Actualiser">
            <RefreshCw size={15} />
            Actualiser
          </button>
          <button style={btnPrimary} onClick={() => setShowNew((v) => !v)}>
            <Plus size={16} />
            Nouveau projet
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "var(--status-error)", color: "var(--status-error)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {showNew && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={input} placeholder="Nom du projet" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <input style={input} placeholder="Description (optionnel)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ ...muted, display: "flex", alignItems: "center", gap: 6 }}>
              Couleur
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 32, height: 28, border: "none", background: "none", cursor: "pointer" }} />
            </label>
            <button style={btnPrimary} onClick={createProject} disabled={!newName.trim()}>
              Créer
            </button>
            <button style={btn} onClick={() => setShowNew(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <FolderKanban size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
          <p style={{ margin: 0 }}>Aucun projet pour l'instant.</p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>
            Créez votre premier projet pour regrouper vos tâches.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      <div style={card}>
        <button
          onClick={() => setShowUnassigned((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", color: "var(--heading)", padding: 0, fontSize: 14, fontWeight: 700 }}
        >
          <Inbox size={16} />
          Tâches sans projet
          <span style={muted}>({unassigned.length})</span>
          {showUnassigned ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showUnassigned && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {unassigned.length === 0 ? (
              <p style={muted}>Toutes les tâches sont rangées. 🎉</p>
            ) : (
              unassigned.map((t) => <TaskRow key={t.id} t={t} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
