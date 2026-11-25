import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { Flame } from 'lucide-react';

const BASE = 'http://localhost:4000';
const DAYS = 35; // 5 semaines complètes

interface DayData {
  date:  string; // YYYY-MM-DD
  count: number;
  cost:  number;
}

function getDateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

function getIntensity(count: number, max: number): number {
  if (max === 0 || count === 0) return 0;
  return Math.ceil((count / max) * 4); // 0–4
}

const INTENSITY_COLORS = [
  'rgba(255,255,255,0.04)', // 0 — vide
  'color-mix(in srgb, var(--brand-accent) 15%, transparent)',  // 1 — faible
  'color-mix(in srgb, var(--brand-accent) 35%, transparent)',  // 2 — moyen
  'color-mix(in srgb, var(--brand-accent) 60%, transparent)',  // 3 — élevé
  'color-mix(in srgb, var(--brand-accent) 90%, transparent)',  // 4 — max
];

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS_FR  = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export function ActivityHeatmap() {
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});
  const [hovered, setHovered] = useState<DayData & { x: number; y: number } | null>(null);

  useEffect(() => {
    apiFetch(`${BASE}/api/archives`)
      .then(r => r.json())
      .then((archives: any[]) => {
        const map: Record<string, DayData> = {};
        for (const a of archives) {
          const date = (a.startedAt ?? a.date ?? '').slice(0, 10);
          if (!date) continue;
          if (!map[date]) map[date] = { date, count: 0, cost: 0 };
          map[date].count++;
          map[date].cost += typeof a.cost === 'number' ? a.cost : parseFloat(a.cost ?? '0') || 0;
        }
        setDayMap(map);
      })
      .catch(() => {});
  }, []);

  // Build grid: last DAYS days, starting from Sunday so columns align
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) days.push(getDateStr(i));

  const max = Math.max(...days.map(d => dayMap[d]?.count ?? 0), 1);

  // total stats
  const total30 = days.slice(-30).reduce((s, d) => s + (dayMap[d]?.count ?? 0), 0);
  const cost30  = days.slice(-30).reduce((s, d) => s + (dayMap[d]?.cost  ?? 0), 0);
  const streak  = (() => {
    let s = 0;
    for (let i = 0; i < days.length; i++) {
      const d = days[days.length - 1 - i];
      if ((dayMap[d]?.count ?? 0) > 0) s++; else break;
    }
    return s;
  })();

  // group by week columns (7 rows per column)
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="glass-panel p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Flame size={17} color="var(--brand-accent)" />
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Activité des 30 derniers jours</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{total30}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>exécutions</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', letterSpacing: '-0.5px' }}>${cost30.toFixed(2)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>coût total</div>
          </div>
          {streak > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b', letterSpacing: '-0.5px' }}>{streak}🔥</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>jours streak</div>
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        {/* Day labels (rows) */}
        <div style={{ display: 'flex', gap: 0 }}>
          {/* Row labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 6, justifyContent: 'space-around', paddingTop: 18 }}>
            {DAY_LABELS.map((l, i) => (
              <div key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'right', height: 13, lineHeight: '13px', opacity: i % 2 === 0 ? 1 : 0 }}>
                {l}
              </div>
            ))}
          </div>

          {/* Columns (weeks) */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Month labels */}
            <div style={{ display: 'flex', marginBottom: 4, height: 14 }}>
              {weeks.map((week, wi) => {
                const firstDay = new Date(week[0]);
                const showMonth = wi === 0 || new Date(weeks[wi - 1][0]).getMonth() !== firstDay.getMonth();
                return (
                  <div key={wi} style={{ width: 13, marginRight: 3, fontSize: '9px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>
                    {showMonth ? MONTHS_FR[firstDay.getMonth()] : ''}
                  </div>
                );
              })}
            </div>

            {/* Cell grid */}
            <div style={{ display: 'flex', gap: 3 }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {week.map(date => {
                    const data   = dayMap[date];
                    const count  = data?.count ?? 0;
                    const cost   = data?.cost  ?? 0;
                    const level  = getIntensity(count, max);
                    const isToday = date === getDateStr(0);
                    return (
                      <div
                        key={date}
                        onMouseEnter={e => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setHovered({ date, count, cost, x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          width: 13, height: 13, borderRadius: 3,
                          background: INTENSITY_COLORS[level],
                          border: isToday ? '1px solid var(--brand-accent)' : '1px solid rgba(255,255,255,0.04)',
                          cursor: count > 0 ? 'pointer' : 'default',
                          transition: 'transform 0.1s',
                          flexShrink: 0,
                        }}
                        onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'; }}
                        onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hovered && (
          <div style={{
            position: 'fixed',
            left: hovered.x, top: hovered.y - 52,
            transform: 'translateX(-50%)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '7px 12px', pointerEvents: 'none', zIndex: 9999,
            fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontWeight: 700 }}>{new Date(hovered.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
              {hovered.count} exécution{hovered.count !== 1 ? 's' : ''} · <span style={{ color: '#10b981' }}>${hovered.cost.toFixed(3)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -4 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Moins</span>
        {INTENSITY_COLORS.map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, border: '1px solid rgba(255,255,255,0.06)' }} />
        ))}
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Plus</span>
      </div>
    </div>
  );
}
