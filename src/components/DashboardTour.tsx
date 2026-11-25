import { useState, useEffect, useCallback } from 'react';
import Joyride, { STATUS, EVENTS } from 'react-joyride';
import type { CallBackProps, Step } from 'react-joyride';

const TOUR_KEY = 'clawboard-dashboard-tour-v1';

export const resetDashboardTour = () => localStorage.removeItem(TOUR_KEY);

// ─── Style helpers ────────────────────────────────────────────────────────────

const box = (color: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${color} 7%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
  borderRadius: 9,
  padding: '10px 14px',
  fontSize: '0.8rem',
  lineHeight: 1.75,
  marginBottom: 10,
});

const chip = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 9px',
  borderRadius: 99,
  fontSize: '11px',
  fontWeight: 700,
  background: bg,
  color,
  marginRight: 6,
  marginBottom: 4,
});

const label = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.6px',
  color,
  marginBottom: 5,
});

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS: Step[] = [

  // 1 — Welcome
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    content: (
      <div>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚡ Bienvenue sur Clawboard</div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.7, fontSize: '0.875rem' }}>
          Ce tableau de bord est votre centre de contrôle pour <strong>Nemoclaw</strong>,
          la version sécurisée d'OpenClaw by NVIDIA. Explorons ensemble les composants clés.
        </p>
        <div style={box('var(--brand-accent)')}>
          💡 Ce tour se lance automatiquement lors de votre première visite.
          Vous pouvez le relancer depuis <strong>Aide → Rejouer le tour</strong>.
        </div>
      </div>
    ),
  },

  // 2 — Smart Alerts Banner
  {
    target: '[data-tour="dashboard-alerts"]',
    placement: 'bottom',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('#ef4444')}>Monitoring</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>🔔 Smart Alerts Banner</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          Surveillance en temps réel de votre gateway. Les alertes se déclenchent automatiquement sur :
        </p>
        <div style={{ fontSize: '0.8rem', lineHeight: 2 }}>
          <span style={chip('#ef4444', 'rgba(239,68,68,0.12)')}>CRON échoué</span>
          <span style={chip('#f59e0b', 'rgba(245,158,11,0.12)')}>Seuil de coût dépassé</span>
          <span style={chip('var(--brand-accent)', 'color-mix(in srgb, var(--brand-accent) 12%, transparent)')}>Contexte LLM élevé</span>
          <span style={chip('#ef4444', 'rgba(239,68,68,0.12)')}>Gateway hors ligne</span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
          Cliquez sur l'icône ⚙️ pour configurer vos seuils d'alerte.
        </p>
      </div>
    ),
  },

  // 3 — KPI Cards
  {
    target: '[data-tour="dashboard-kpis"]',
    placement: 'bottom',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('var(--brand-accent)')}>Indicateurs</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>📊 KPI Temps Réel</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          4 métriques clés en direct via <strong>Server-Sent Events</strong> (SSE) — aucun rechargement manuel nécessaire.
        </p>
        <div style={box('var(--brand-accent)')}>
          📡 La connexion SSE est indiquée par le badge <span style={{ color: '#10b981', fontWeight: 700 }}>● Live</span> dans le flux d'exécutions.
        </div>
      </div>
    ),
  },

  // 4 — Heatmap
  {
    target: '[data-tour="dashboard-heatmap"]',
    placement: 'top',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('var(--brand-accent)')}>Activité</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>🗓️ Heatmap 30 jours</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          Visualisez vos patterns d'exécution sur les 5 dernières semaines.
          Chaque cellule représente un jour — survolez pour voir le détail.
        </p>
        <div style={{ fontSize: '0.8rem', lineHeight: 2 }}>
          <span style={chip('var(--brand-accent)', 'color-mix(in srgb, var(--brand-accent) 12%, transparent)')}>Intensité = nbre d'exécutions</span>
          <span style={chip('#f59e0b', 'rgba(245,158,11,0.12)')}>🔥 Streak actuel</span>
        </div>
      </div>
    ),
  },

  // 5 — Cost Breakdown
  {
    target: '[data-tour="dashboard-costs"]',
    placement: 'right',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('#10b981')}>Coûts</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>💰 Coûts par Modèle</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          Répartition des dépenses LLM par fournisseur sur 3 périodes configurables.
        </p>
        <div style={box('#10b981')}>
          Basculez entre <strong>7j / 30j / Tout</strong> pour analyser vos tendances
          et identifier les modèles les plus coûteux.
        </div>
      </div>
    ),
  },

  // 6 — Approvals
  {
    target: '[data-tour="dashboard-approvals"]',
    placement: 'left',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('#f59e0b')}>Gouvernance</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>🛡️ Flux d'Approbation</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          Les tâches à <strong>risque élevé</strong> (suppressions, envois en masse, modifications critiques)
          requièrent votre validation avant exécution.
        </p>
        <div style={{ fontSize: '0.8rem', lineHeight: 2 }}>
          <span style={chip('#ef4444', 'rgba(239,68,68,0.12)')}>🔴 Risque élevé</span>
          <span style={chip('#f59e0b', 'rgba(245,158,11,0.12)')}>🟡 Risque moyen</span>
          <span style={chip('#10b981', 'rgba(16,185,129,0.12)')}>🟢 Risque faible</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
          Auto-expiration configurable — les demandes non traitées sont rejetées automatiquement.
        </p>
      </div>
    ),
  },

  // 7 — Gateway Probes
  {
    target: '[data-tour="dashboard-probes"]',
    placement: 'left',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('#38bdf8')}>Infrastructure</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>🖥️ Gateway Readiness</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          Probes de santé sur tous vos fournisseurs LLM et services de notification,
          avec mesure de latence en temps réel.
        </p>
        <div style={box('#38bdf8')}>
          🔄 Refresh automatique toutes les 60 secondes. Cliquez sur ↺ pour une vérification manuelle.
        </div>
      </div>
    ),
  },

  // 8 — Agent Chat
  {
    target: '[data-tour="agent-chat-bubble"]',
    placement: 'left',
    disableBeacon: true,
    content: (
      <div>
        <div style={label('var(--brand-accent)')}>Assistant IA</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>🤖 Agent Chat Intégré</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.65 }}>
          Votre copilote IA flottant, accessible depuis n'importe quelle page.
          Prend en charge le <strong>streaming SSE</strong> et les <strong>tool calls</strong>.
        </p>
        <div style={{ fontSize: '0.8rem', lineHeight: 1.75 }}>
          <div>• <strong>Enter</strong> pour envoyer</div>
          <div>• <strong>Shift+Enter</strong> pour un saut de ligne</div>
          <div>• Sélectionnez un agent spécialisé dans le menu déroulant</div>
        </div>
      </div>
    ),
  },

  // 9 — Fin
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    content: (
      <div>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🚀 Vous êtes prêt !</div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.7, fontSize: '0.875rem' }}>
          Vous maîtrisez maintenant les composants principaux de Clawboard.
        </p>
        <div style={box('#10b981')}>
          📌 Prochaines étapes recommandées :<br />
          1. Créer votre première tâche (<strong>+ Nouvelle Tâche</strong>)<br />
          2. Configurer vos clés API dans <strong>Réglages → Clés API</strong><br />
          3. Planifier un CRON depuis <strong>Tâches → Récurrences</strong>
        </div>
      </div>
    ),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const DashboardTour = () => {
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => setRun(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const handleCallback = useCallback((data: CallBackProps) => {
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(data.status as any)) {
      localStorage.setItem(TOUR_KEY, '1');
      setRun(false);
    }
    if (data.type === EVENTS.TOUR_END) {
      localStorage.setItem(TOUR_KEY, '1');
    }
  }, []);

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      scrollToFirstStep
      scrollOffset={80}
      callback={handleCallback}
      styles={{
        options: {
          arrowColor: '#1e293b',
          backgroundColor: '#1e293b',
          primaryColor: 'var(--brand-accent)',
          textColor: '#e2e8f0',
          width: 400,
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 14,
          padding: '20px 22px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px color-mix(in srgb, var(--brand-accent) 20%, transparent)',
        },
        tooltipTitle: { fontWeight: 700, marginBottom: 6 },
        buttonNext: {
          borderRadius: 8,
          background: 'var(--brand-accent)',
          border: 'none',
          fontWeight: 600,
          fontSize: '0.82rem',
          padding: '8px 18px',
        },
        buttonBack: {
          color: '#94a3b8',
          fontWeight: 500,
          fontSize: '0.82rem',
        },
        buttonSkip: {
          color: '#6b7280',
          fontSize: '0.78rem',
        },
        spotlight: {
          borderRadius: 12,
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand-accent) 40%, transparent), 0 0 40px color-mix(in srgb, var(--brand-accent) 15%, transparent)',
        },
      }}
      locale={{
        back: '← Précédent',
        next: 'Suivant →',
        last: 'Terminer',
        skip: 'Passer le tour',
        close: 'Fermer',
        open: 'Ouvrir',
      }}
    />
  );
};
