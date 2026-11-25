import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { DollarSign, Activity, Clock, CheckCircle2, XCircle, Zap } from 'lucide-react';

const BASE = 'http://localhost:4000';

type Period = '7d' | '30d' | 'all';
type MCBTab = 'costs' | 'traces';

interface ModelStat {
  model:  string;
  runs:   number;
  cost:   number;
  tokens: number;
}

// ── OTel trace types ──────────────────────────────────────────────────────────

interface TraceSpan {
  traceId:    string;
  spanId:     string;
  name:       string;
  agent?:     string;
  model?:     string;
  startTime:  number;
  duration:   number; // ms
  status:     'ok' | 'error' | 'timeout';
  tokens?:    number;
  cost?:      number;
  error?:     string;
}

const MOCK_TRACES: TraceSpan[] = [
  { traceId: 'trace-001', spanId: 's1', name: 'agent.run',         agent: 'NemoClaw',   model: 'claude-sonnet-4-5',       startTime: Date.now() - 120_000, duration: 4200,  status: 'ok',      tokens: 1840, cost: 0.0092 },
  { traceId: 'trace-002', spanId: 's2', name: 'agent.run',         agent: 'TinyClaw',   model: 'llama-3.1-8b',            startTime: Date.now() - 80_000,  duration: 1100,  status: 'ok',      tokens: 620,  cost: 0.0003 },
  { traceId: 'trace-003', spanId: 's3', name: 'agent.run',         agent: 'NemoClaw',   model: 'nemotron-super',          startTime: Date.now() - 55_000,  duration: 9800,  status: 'error',   tokens: 3200, cost: 0.016,  error: 'Context length exceeded' },
  { traceId: 'trace-004', spanId: 's4', name: 'tool.web_search',   agent: 'NemoClaw',   model: undefined,                 startTime: Date.now() - 50_000,  duration: 780,   status: 'ok' },
  { traceId: 'trace-005', spanId: 's5', name: 'agent.run',         agent: 'NemoClaw',   model: 'deepseek-v3',             startTime: Date.now() - 30_000,  duration: 2600,  status: 'ok',      tokens: 980,  cost: 0.0049 },
  { traceId: 'trace-006', spanId: 's6', name: 'tool.exec',         agent: 'TinyClaw',   model: undefined,                 startTime: Date.now() - 20_000,  duration: 340,   status: 'ok' },
  { traceId: 'trace-007', spanId: 's7', name: 'agent.run',         agent: 'NemoClaw',   model: 'gemini-2.0-flash',        startTime: Date.now() - 10_000,  duration: 1950,  status: 'timeout', tokens: 400,  cost: 0.0008 },
];

const MODEL_COLORS: Record<string, string> = {
  claude:    'var(--brand-accent)',
  nemotron:  '#76b900',
  llama:     '#0064c8',
  deepseek:  '#1a73e8',
  gemini:    '#4285f4',
  kimi:      'var(--brand-accent)',
  qwq:       'var(--brand-accent)',
  local:     '#10b981',
};

function modelColor(id: string): string {
  const lower = id.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#a1a1aa';
}

function modelLabel(id: string): string {
  if (!id) return '—';
  if (id.includes('claude'))           return 'Claude Sonnet';
  if (id.includes('nemotron-ultra'))   return 'Nemotron Ultra';
  if (id.includes('nemotron-super'))   return 'Nemotron Super';
  if (id.includes('llama-3.1-405'))    return 'Llama 405B';
  if (id.includes('deepseek'))         return 'DeepSeek V3';
  if (id.includes('kimi'))             return 'Kimi K2.5';
  if (id.includes('qwq'))              return 'QwQ 32B';
  if (id.includes('gemini'))           return 'Gemini Flash';
  if (id.includes('ollama'))           return 'Qwen Local';
  return id.split('/').pop()?.slice(0, 14) ?? id;
}

function cutoffFor(period: Period): number {
  const now = Date.now();
  if (period === '7d')  return now - 7  * 86_400_000;
  if (period === '30d') return now - 30 * 86_400_000;
  return 0;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ── TracesPanel ───────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ok:      { color: '#10b981', icon: CheckCircle2, label: 'OK' },
  error:   { color: '#ef4444', icon: XCircle,      label: 'Erreur' },
  timeout: { color: '#f59e0b', icon: Clock,         label: 'Timeout' },
};

function TracesPanel() {
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${BASE}/api/traces`)
      .then(r => r.json())
      .then(d => setSpans(Array.isArray(d) ? d : (d.spans ?? d.data ?? [])))
      .catch(() => setSpans(MOCK_TRACES))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Chargement des traces…</div>
  );

  const okCount      = spans.filter(s => s.status === 'ok').length;
  const errorCount   = spans.filter(s => s.status === 'error').length;
  const timeoutCount = spans.filter(s => s.status === 'timeout').length;
  const avgLatency   = spans.length ? Math.round(spans.reduce((a, s) => a + s.duration, 0) / spans.length) : 0;
  const totalCost    = spans.reduce((a, s) => a + (s.cost ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'OK',        val: okCount,      color: '#10b981' },
          { label: 'Erreurs',   val: errorCount,   color: '#ef4444' },
          { label: 'Timeouts',  val: timeoutCount, color: '#f59e0b' },
          { label: 'Latence moy.', val: fmtDuration(avgLatency), color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {totalCost > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Coût total traces : <strong style={{ color: '#10b981' }}>${totalCost.toFixed(4)}</strong>
          <span style={{ marginLeft: 8, opacity: 0.6 }}>· {spans.length} spans</span>
        </div>
      )}

      {/* Spans list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {spans.map(span => {
          const sCfg = STATUS_CFG[span.status];
          const SIcon = sCfg.icon;
          return (
            <div key={span.spanId} style={{ background: 'var(--bg-glass)', border: `1px solid ${sCfg.color}33`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <SIcon size={14} color={sCfg.color} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>{span.name}</span>
                  {span.agent && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)', color: 'var(--brand-accent)', fontWeight: 700 }}>{span.agent}</span>}
                  {span.model && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: `color-mix(in srgb, ${modelColor(span.model)} 20%, transparent)`, color: modelColor(span.model), fontWeight: 600 }}>
                      {modelLabel(span.model)}
                    </span>
                  )}
                  {span.error && <span style={{ fontSize: 10, color: '#ef4444', fontStyle: 'italic' }}>{span.error}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {span.tokens && <span><Zap size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{(span.tokens / 1000).toFixed(1)}k tk</span>}
                {span.cost   && <span style={{ color: '#10b981', fontWeight: 700 }}>${span.cost.toFixed(4)}</span>}
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} />{fmtDuration(span.duration)}</span>
                <span style={{ opacity: 0.6 }}>{timeAgo(span.startTime)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        Traces via <code style={{ background: 'var(--bg-glass)', padding: '1px 6px', borderRadius: 4 }}>@openclaw/plugin-otel</code> — Installer le plugin pour brancher Grafana / Jaeger.
      </div>
    </div>
  );
}

// ── ModelCostBreakdown ────────────────────────────────────────────────────────

export function ModelCostBreakdown() {
  const [archives, setArchives] = useState<any[]>([]);
  const [period,   setPeriod]   = useState<Period>('30d');
  const [tab,      setTab]      = useState<MCBTab>('costs');

  useEffect(() => {
    apiFetch(`${BASE}/api/archives`).then(r => r.json()).then(d => setArchives(Array.isArray(d) ? d : (d.archives ?? d.data ?? []))).catch(() => {});
  }, []);

  const cutoff  = cutoffFor(period);
  const filtered = archives.filter(a => {
    const t = new Date(a.startedAt ?? a.date ?? 0).getTime();
    return t >= cutoff;
  });

  const map: Record<string, ModelStat> = {};
  for (const a of filtered) {
    const model = a.llmModel ?? 'unknown';
    if (!map[model]) map[model] = { model, runs: 0, cost: 0, tokens: 0 };
    map[model].runs++;
    map[model].cost   += typeof a.cost === 'number' ? a.cost : parseFloat(a.cost ?? '0') || 0;
    map[model].tokens += (a.promptTokens ?? 0) + (a.completionTokens ?? a.tokens ?? 0);
  }
  const stats    = Object.values(map).sort((a, b) => b.cost - a.cost);
  const maxCost  = Math.max(...stats.map(s => s.cost), 0.0001);
  const totalCost = stats.reduce((s, m) => s + m.cost, 0);

  return (
    <div className="glass-panel p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <DollarSign size={17} color="#10b981" />
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Coûts & Traces LLM</h2>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-glass)', padding: '3px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
          <button onClick={() => setTab('costs')} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: tab === 'costs' ? 'rgba(16,185,129,0.15)' : 'transparent', color: tab === 'costs' ? '#10b981' : 'var(--text-muted)', fontWeight: 600, fontSize: '11px', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}>
            <DollarSign size={11} /> Coûts
          </button>
          <button onClick={() => setTab('traces')} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: tab === 'traces' ? 'color-mix(in srgb, var(--brand-accent) 15%, transparent)' : 'transparent', color: tab === 'traces' ? 'var(--brand-accent)' : 'var(--text-muted)', fontWeight: 600, fontSize: '11px', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Activity size={11} /> Traces OTel
          </button>
        </div>

        {/* Period (coûts seulement) */}
        {tab === 'costs' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: 'var(--bg-glass)', padding: '3px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            {(['7d', '30d', 'all'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: period === p ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: period === p ? '#10b981' : 'var(--text-muted)',
                fontWeight: 600, fontSize: '11px', transition: 'all 0.15s',
              }}>
                {p === '7d' ? '7 jours' : p === '30d' ? '30 jours' : 'Tout'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {tab === 'costs' && <>
        {totalCost > 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Total période : <strong style={{ color: '#10b981', fontSize: '15px' }}>${totalCost.toFixed(4)}</strong>
            <span style={{ marginLeft: 10, opacity: 0.6 }}>· {filtered.length} exécutions</span>
          </div>
        )}
        {stats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.6 }}>
            Aucune exécution sur cette période
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.map(s => {
              const pct   = (s.cost / maxCost) * 100;
              const share = totalCost > 0 ? (s.cost / totalCost) * 100 : 0;
              const color = modelColor(s.model);
              return (
                <div key={s.model} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{modelLabel(s.model)}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{s.runs} run{s.runs !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(s.tokens / 1000).toFixed(1)}k tk</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color, fontFamily: 'var(--mono)', minWidth: 64, textAlign: 'right' }}>
                        ${s.cost.toFixed(4)}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${pct}%`,
                      background: 'var(--brand-accent)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>}

      {tab === 'traces' && <TracesPanel />}
    </div>
  );
}
