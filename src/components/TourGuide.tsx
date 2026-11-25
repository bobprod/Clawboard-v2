import { useState, useEffect, useCallback } from 'react';
import Joyride, { STATUS, EVENTS } from 'react-joyride';
import type { CallBackProps, Step } from 'react-joyride';

const TOUR_KEY = 'clawboard-tour-v1';

const STEPS: Step[] = [
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: '👋 Bienvenue sur ClawBoard',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          ClawBoard est ton <strong>tableau de bord IA</strong> — gestion de tâches, agents, mémoire sémantique et automatisation CRON.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Fais un tour rapide pour découvrir chaque section. ✨
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
    disableBeacon: true,
    title: '📊 Tableau de bord',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Vue d'ensemble en <strong>temps réel</strong> : tâches actives, complétées, CRONs, échecs.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Flux d'exécutions live via SSE — les données se mettent à jour sans recharger la page.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-tasks"]',
    placement: 'right',
    disableBeacon: true,
    title: '⚡ Tâches & Modèles',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Crée, lance et suis tes <strong>tâches IA</strong>. Organise-les en <strong>modèles réutilisables</strong> et configure des <strong>récurrences CRON</strong>.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Vue Kanban, détail d'exécution, logs en direct et archives historiques.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-chat"]',
    placement: 'right',
    disableBeacon: true,
    title: '💬 Chat avec Lia',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Discute avec <strong>Lia</strong>, ton assistante IA. Elle peut créer des tâches, consulter les modèles, gérer les récurrences — directement depuis la conversation.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Supporte Claude, NVIDIA NIM, Gemini, OpenRouter et modèles locaux (Ollama).
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-scheduler"]',
    placement: 'right',
    disableBeacon: true,
    title: '🕐 Planificateur',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Configure des <strong>CRONs intelligents</strong> avec 6 modes de déclenchement : toujours, si inactif, évitement de conflits, file de priorité…
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Intervalles de 15 min à 24h. Les agents tournent de façon autonome.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-security"]',
    placement: 'right',
    disableBeacon: true,
    title: '🛡️ Sécurité & Scan',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          <strong>Guardrails</strong> de sécurité pour contrôler ce que les agents peuvent faire. Suivi des événements bloqués et autorisés.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Propulsé par NemoClaw Privacy Core.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-memory"]',
    placement: 'right',
    disableBeacon: true,
    title: '🧠 Mémoire (QMD)',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Stocke des documents dans une <strong>base vectorielle</strong> (pgvector). Les agents peuvent les retrouver par <strong>recherche sémantique</strong> (similarité cosinus).
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Embeddings 1536 dimensions, index HNSW pour des recherches instantanées.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-collaborations"]',
    placement: 'right',
    disableBeacon: true,
    title: '🔗 Collaborations',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Visualise et configure le <strong>pipeline de traitement</strong> : routage des messages, connexion à n8n, Telegram, webhooks.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Éditeur de flux visuel interactif (ReactFlow).
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="nav-settings"]',
    placement: 'right',
    disableBeacon: true,
    title: '⚙️ Paramètres',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Configure tes <strong>clés API</strong> (Anthropic, NVIDIA, Gemini, OpenRouter…) et personnalise l'interface.
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>
          Les clés sont chiffrées AES-256-GCM et stockées en base de données.
        </p>
      </div>
    ),
  },
];

interface TourGuideProps {
  run?: boolean;
  onFinish?: () => void;
}

export const TourGuide = ({ run: runProp, onFinish }: TourGuideProps) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // Demarrage MANUEL uniquement : evite le double overlay avec les tours
    // contextuels (DashboardTour, TasksTour) au premier lancement.
    if (runProp !== undefined) {
      setRun(runProp);
    }
  }, [runProp]);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, type, action } = data;

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(i => action === 'prev' ? Math.max(0, i - 1) : i + 1);
    }

    const finished = ([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status);
    if (finished) {
      setRun(false);
      setStepIndex(0);
      localStorage.setItem(TOUR_KEY, '1');
      onFinish?.();
    }
  }, [onFinish]);

  return (
    <Joyride
      steps={STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableOverlayClose
      spotlightPadding={6}
      locale={{
        back: 'Précédent',
        close: 'Fermer',
        last: 'Terminer',
        next: 'Suivant',
        open: 'Ouvrir',
        skip: 'Passer le tour',
      }}
      styles={{
        options: {
          primaryColor: 'var(--brand-accent)',
          backgroundColor: '#1e1b2e',
          textColor: '#e2e8f0',
          arrowColor: '#1e1b2e',
          overlayColor: 'rgba(0, 0, 0, 0.72)',
          zIndex: 10000,
          width: 340,
        },
        tooltip: {
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px color-mix(in srgb, var(--brand-accent) 20%, transparent)',
          padding: '20px 24px 16px',
        },
        tooltipTitle: {
          fontSize: '1rem',
          fontWeight: 700,
          marginBottom: 10,
          color: '#f1f5f9',
        },
        tooltipContent: {
          fontSize: '0.875rem',
          color: '#cbd5e1',
          padding: '0 0 8px',
          lineHeight: 1.6,
        },
        tooltipFooter: {
          marginTop: 8,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        },
        buttonNext: {
          background: 'var(--brand-accent)',
          borderRadius: 8,
          fontSize: '0.875rem',
          fontWeight: 600,
          padding: '8px 18px',
        },
        buttonBack: {
          color: '#94a3b8',
          fontSize: '0.875rem',
          marginRight: 8,
        },
        buttonSkip: {
          color: '#64748b',
          fontSize: '0.8rem',
        },
        spotlight: {
          borderRadius: 10,
        },
        buttonClose: {
          color: '#64748b',
        },
      }}
      callback={handleCallback}
    />
  );
};

/** Retourne true si le tour n'a pas encore été vu */
export const isTourPending = () => !localStorage.getItem(TOUR_KEY);

/** Réinitialise le tour (pour le relancer depuis les paramètres) */
export const resetTour = () => localStorage.removeItem(TOUR_KEY);
