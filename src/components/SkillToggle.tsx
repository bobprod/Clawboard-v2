import { useState, useEffect } from "react";
import { Zap, Check, X, ChevronDown, Loader2 } from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

interface Skill {
  id: string;
  name: string;
  description?: string;
  status: "active" | "inactive";
  tags?: string[];
}

interface SkillToggleProps {
  compact?: boolean;
  onToggle?: (name: string, enabled: boolean) => void;
}

export function SkillToggle({ compact = false, onToggle }: SkillToggleProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${BASE}/api/skills`);
        const data: unknown = await res.json();
        if (!cancelled) setSkills(Array.isArray(data) ? (data as Skill[]) : []);
      } catch {
        if (!cancelled) setSkills([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (skill: Skill) => {
    const newName = skill.name;
    const newStatus = skill.status === "active" ? "disable" : "enable";
    setToggling(newName);
    try {
      await apiFetch(`${BASE}/api/skills/${encodeURIComponent(newName)}/${newStatus}`, {
        method: "POST",
      });
      setSkills((prev) =>
        prev.map((s) =>
          s.name === newName
            ? { ...s, status: newStatus === "enable" ? "active" : "inactive" }
            : s
        )
      );
      onToggle?.(newName, newStatus === "enable");
    } catch {
      // revert
    }
    setToggling(null);
  };

  const activeSkills = skills.filter((s) => s.status === "active");

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {activeSkills.length === 0 ? (
          <span style={{ fontSize: "11px", color: "var(--text-muted)", opacity: 0.6 }}>
            Aucun skill actif
          </span>
        ) : (
          activeSkills.map((s) => (
            <span
              key={s.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 20,
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.25)",
                color: "var(--brand-accent)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onClick={() => handleToggle(s)}
              title={`Desactiver ${s.name}`}
            >
              <Zap size={10} />
              {s.name}
              <X size={9} style={{ opacity: 0.5, marginLeft: 2 }} />
            </span>
          ))
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 10,
          background: "var(--bg-glass)",
          border: "1px solid var(--border-subtle)",
          color: activeSkills.length > 0 ? "var(--brand-accent)" : "var(--text-muted)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          transition: "all 0.15s",
        }}
      >
        <Zap size={14} />
        {activeSkills.length} skill{activeSkills.length !== 1 ? "s" : ""} actif
        {activeSkills.length !== 1 ? "s" : ""}
        <ChevronDown
          size={14}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            width: 320,
            maxHeight: 400,
            overflowY: "auto",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
            zIndex: 1500,
            animation: "skillDropIn 0.15s ease",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--bg-glass)",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-primary)" }}>
              Skills
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                padding: 4,
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ padding: "8px" }}>
            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : skills.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                Aucun skill disponible
              </div>
            ) : (
              skills.map((skill) => {
                const isActive = skill.status === "active";
                const isToggling = toggling === skill.name;
                return (
                  <div
                    key={skill.name}
                    onClick={() => !isToggling && handleToggle(skill)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: isToggling ? "wait" : "pointer",
                      transition: "background 0.15s",
                      opacity: isToggling ? 0.6 : 1,
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isActive ? "rgba(16,185,129,0.12)" : "rgba(161,161,170,0.08)",
                        flexShrink: 0,
                      }}
                    >
                      {isToggling ? (
                        <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
                      ) : isActive ? (
                        <Check size={13} color="#10b981" />
                      ) : (
                        <Zap size={13} color="var(--text-muted)" />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                        {skill.name}
                      </div>
                      {skill.description && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {skill.description.length > 60
                            ? skill.description.slice(0, 60) + "..."
                            : skill.description}
                        </div>
                      )}
                    </div>

                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: isActive ? "rgba(16,185,129,0.1)" : "rgba(161,161,170,0.08)",
                        color: isActive ? "#10b981" : "var(--text-muted)",
                      }}
                    >
                      {isActive ? "ON" : "OFF"}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--border-subtle)",
              fontSize: "11px",
              color: "var(--text-muted)",
              background: "var(--bg-glass)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>{activeSkills.length} actif{activeSkills.length !== 1 ? "s" : ""}</span>
            <span style={{ opacity: 0.5 }}>Cliquez pour basculer</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes skillDropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
