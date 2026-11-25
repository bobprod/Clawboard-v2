import { Zap, Server, DollarSign } from 'lucide-react';
import { useSSE } from '../hooks/useSSE';

interface QuotaEntry {
  used: number;
  limit: number;
  cost: number;
  local: boolean;
}

interface QuotaData {
  quotas: Record<string, QuotaEntry>;
  totalCost24h: number;
}

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-6':   'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'ollama/qwen2.5':    'Qwen 2.5',
  'ollama/llama3.2':   'Llama 3.2',
};

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-6':   'var(--brand-accent)',
  'claude-sonnet-4-6': 'var(--brand-accent)',
  'ollama/qwen2.5':    '#10b981',
  'ollama/llama3.2':   '#f59e0b',
};

const fuelColor = (pct: number) =>
  pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';

export const FuelGauges = () => {
  const { data, connected } = useSSE<QuotaData | null>('/api/quota', null);

  return (
    <div className="glass-panel p-6" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          LLM Fuel Gauges
        </h3>
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#10b981', fontWeight: 700, fontFamily: 'var(--mono)' }}>
            <DollarSign size={13} />
            {Number(data.totalCost24h).toFixed(2)} / 24h
          </div>
        )}
      </div>

      {!data ? (
        <div className="text-muted" style={{ fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
          {connected ? 'Chargement...' : 'Backend hors ligne'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {Object.entries(data.quotas).map(([model, q]) => {
            const pct = q.local ? null : Math.round((q.used / q.limit) * 100);
            const color = MODEL_COLORS[model] || '#a1a1aa';
            const label = MODEL_LABELS[model] || model;

            return (
              <div key={model}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {q.local ? <Server size={13} color={color} /> : <Zap size={13} color={color} />}
                    <span style={{ fontSize: '13px', fontWeight: 600, color }}>{label}</span>
                    {q.local && (
                      <span style={{ fontSize: '10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        LOCAL
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {!q.local && q.cost > 0 && (
                      <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: '#10b981' }}>
                        ${Number(q.cost).toFixed(3)}
                      </span>
                    )}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: pct !== null ? fuelColor(pct) : '#10b981' }}>
                      {pct !== null ? `${pct}%` : '∞'}
                    </span>
                  </div>
                </div>

                <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: pct !== null ? `${Math.min(pct, 100)}%` : '30%',
                    background: pct !== null ? fuelColor(pct) : color,
                    borderRadius: '99px',
                    transition: 'width 1.5s ease',
                    boxShadow: `0 0 8px ${pct !== null ? fuelColor(pct) : color}55`
                  }} />
                </div>

                {pct !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      {q.used.toLocaleString()} tkns
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      {q.limit.toLocaleString()} max
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
