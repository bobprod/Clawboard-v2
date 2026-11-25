import { useState, useEffect, useRef } from 'react';
import { Search, X, Code, ToyBrick, ExternalLink, Check, Zap } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';

const BASE = 'http://localhost:4000';

interface Skill {
  id:          string;
  name:        string;
  version:     string;
  source:      string;
  desc:        string;
  content:     string;
  status:      'active' | 'inactive';
  installedAt: string;
  tags?:       string[];
  usageCount?: number;
}

const SOURCE_COLORS: Record<string, string> = {
  local:  '#10b981',
  github: '#a1a1aa',
  npm:    '#f59e0b',
};

// ─── Catégories inférées depuis les tags/source ───────────────────────────────
const CATEGORIES = ['Tous', 'local', 'github', 'npm'];

interface SkillsPickerProps {
  value:    string;
  onChange: (skillName: string) => void;
}

export function SkillsPicker({ value, onChange }: SkillsPickerProps) {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState<Skill[]>([]);
  const [search,    setSearch]    = useState('');
  const [category,  setCategory]  = useState('Tous');
  const [hovered,   setHovered]   = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch(`${BASE}/api/skills`).then(r => r.json()).then(data => {
      setSkills(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
    setTimeout(() => searchRef.current?.focus(), 80);
  }, [open]);

  // Close on overlay click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const filtered = skills
    .filter(s => category === 'Tous' || s.source === category)
    .filter(s => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [s.name, s.desc, ...(s.tags ?? [])].some(v => v?.toLowerCase().includes(q));
    });

  const handleSelect = (skill: Skill) => {
    onChange(skill.name);
    setOpen(false);
    setSearch('');
  };

  const handleClear = () => { onChange(''); };

  return (
    <>
      {/* ── Trigger input ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="inbox-monitor, morning-briefing…"
            style={{
              width: '100%', padding: '9px 36px 9px 12px', borderRadius: 8,
              background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {value && (
            <button onClick={handleClear} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex',
            }}><X size={13} /></button>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          title="Parcourir le registre de skills"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
            background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-accent) 25%, transparent)',
            color: 'var(--brand-accent)', fontSize: '12px', fontWeight: 600,
            whiteSpace: 'nowrap', transition: 'all 0.2s',
          }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--brand-accent) 15%, transparent)'; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--brand-accent) 8%, transparent)'; }}
        >
          <ToyBrick size={14} /> Parcourir
        </button>
      </div>

      {/* ── Modal overlay ───────────────────────────────────────────────── */}
      {open && (
        <div
          ref={overlayRef}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 760, maxHeight: '80vh',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 18, display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            animation: 'modalSlideUp 0.2s ease',
            overflow: 'hidden',
          }}>

            {/* Header */}
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
            }}>
              <ToyBrick size={20} color="var(--brand-accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Skills Registry</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                  {skills.length} skill{skills.length !== 1 ? 's' : ''} installé{skills.length !== 1 ? 's' : ''} · Cliquez pour sélectionner
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 8,
              }}><X size={18} /></button>
            </div>

            {/* Search + categories */}
            <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher par nom, description, tag…"
                  style={{
                    width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, boxSizing: 'border-box',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--brand-accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                />
              </div>
              {/* Category pills */}
              <div style={{ display: 'flex', gap: 4 }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)} style={{
                    padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontWeight: 600, fontSize: '11px', transition: 'all 0.15s',
                    background: category === cat ? 'color-mix(in srgb, var(--brand-accent) 15%, transparent)' : 'var(--bg-glass)',
                    color: category === cat ? 'var(--brand-accent)' : 'var(--text-muted)',
                    borderWidth: 1, borderStyle: 'solid',
                    borderColor: category === cat ? 'color-mix(in srgb, var(--brand-accent) 30%, transparent)' : 'var(--border-subtle)',
                  }}>
                    {cat} {cat !== 'Tous' && `(${skills.filter(s => s.source === cat).length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Chargement du registre…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.6 }}>
                  {skills.length === 0 ? 'Aucun skill installé — créez-en un depuis la page Skills.' : 'Aucun résultat pour cette recherche.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 10 }}>
                  {filtered.map(skill => {
                    const isSelected = value === skill.name;
                    const isHov      = hovered === skill.id;
                    const srcColor   = SOURCE_COLORS[skill.source] ?? '#a1a1aa';
                    return (
                      <div
                        key={skill.id}
                        onClick={() => handleSelect(skill)}
                        onMouseEnter={() => setHovered(skill.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                          background: isSelected ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : isHov ? 'rgba(255,255,255,0.04)' : 'var(--bg-glass)',
                          border: `1px solid ${isSelected ? 'color-mix(in srgb, var(--brand-accent) 45%, transparent)' : isHov ? 'color-mix(in srgb, var(--brand-accent) 20%, transparent)' : 'var(--border-subtle)'}`,
                          transition: 'all 0.15s', position: 'relative',
                        }}
                      >
                        {/* Selected checkmark */}
                        {isSelected && (
                          <div style={{
                            position: 'absolute', top: 10, right: 10,
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--brand-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Check size={11} color="#fff" />
                          </div>
                        )}

                        {/* Top row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                          <div style={{ padding: 8, background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)', borderRadius: 8, flexShrink: 0 }}>
                            <Code size={15} color="var(--brand-accent)" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', marginBottom: 2 }}>
                              {skill.name}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>v{skill.version}</span>
                              <span style={{
                                fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                                background: `${srcColor}18`, color: srcColor,
                              }}>{skill.source}</span>
                              <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                                background: skill.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(161,161,170,0.1)',
                                color: skill.status === 'active' ? '#10b981' : 'var(--text-muted)',
                              }}>
                                {skill.status === 'active' ? '● Actif' : '○ Inactif'}
                              </span>
                              {(skill.usageCount ?? 0) > 0 && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Zap size={9} /> {skill.usageCount}×
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        {skill.desc && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: skill.tags?.length ? 8 : 0 }}>
                            {skill.desc.length > 90 ? skill.desc.slice(0, 90) + '…' : skill.desc}
                          </div>
                        )}

                        {/* Tags */}
                        {skill.tags && skill.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                            {skill.tags.slice(0, 4).map(t => (
                              <span key={t} style={{
                                background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)', color: 'var(--brand-accent)',
                                fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                              }}>#{t}</span>
                            ))}
                          </div>
                        )}

                        {/* Hover hint */}
                        {isHov && !isSelected && (
                          <div style={{
                            position: 'absolute', bottom: 10, right: 12,
                            fontSize: '10px', color: 'var(--brand-accent)', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 3, opacity: 0.8,
                          }}>
                            <ExternalLink size={10} /> Sélectionner
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 22px', borderTop: '1px solid var(--border-subtle)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '12px', color: 'var(--text-muted)',
              background: 'var(--bg-glass)',
            }}>
              <span>
                {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
                {search && ` pour "${search}"`}
                {category !== 'Tous' && ` · ${category}`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7 }}>
                <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', fontSize: '10px' }}>Échap</kbd>
                pour fermer
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalSlideUp {
          from { transform: translateY(20px) scale(0.98); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
      `}</style>
    </>
  );
}
