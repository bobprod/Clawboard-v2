import { useState, useEffect, useCallback } from 'react';
import Joyride, { STATUS, EVENTS } from 'react-joyride';
import type { CallBackProps, Step } from 'react-joyride';

const TASKS_TOUR_KEY = 'clawboard-tasks-tour-v2';

export const resetTasksTour = () => localStorage.removeItem(TASKS_TOUR_KEY);

// ─── Tour styles (shared) ─────────────────────────────────────────────────────

const TOUR_STYLES = {
  options: {
    primaryColor: 'var(--brand-accent)',
    backgroundColor: '#1a1625',
    textColor: '#e2e8f0',
    arrowColor: '#1a1625',
    overlayColor: 'rgba(0,0,0,0.68)',
    zIndex: 10000,
    width: 380,
  },
  tooltip: {
    borderRadius: 14,
    boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--brand-accent) 25%, transparent)',
    padding: '22px 26px 18px',
  },
  tooltipTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    marginBottom: 12,
    color: '#f1f5f9',
  },
  tooltipContent: {
    fontSize: '0.875rem',
    color: '#cbd5e1',
    padding: '0 0 8px',
    lineHeight: 1.65,
  },
  tooltipFooter: {
    marginTop: 10,
    paddingTop: 14,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  buttonNext: {
    background: 'var(--brand-accent)',
    borderRadius: 9,
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '9px 20px',
    boxShadow: 'none',
  },
  buttonBack: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginRight: 10,
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
};

const LOCALE = {
  back: 'Précédent',
  close: 'Fermer',
  last: 'Terminer',
  next: 'Suivant',
  open: 'Ouvrir',
  skip: 'Passer le guide',
};

// ─── Tag helper (inline) ──────────────────────────────────────────────────────

const Tag = ({ label, color = 'var(--brand-accent)' }: { label: string; color?: string }) => (
  <span style={{
    display: 'inline-block',
    fontSize: '11px', fontFamily: 'monospace', fontWeight: 700,
    padding: '2px 8px', borderRadius: 5,
    background: `color-mix(in srgb, ${color} 13%, transparent)`, color, margin: '0 2px',
    border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
  }}>{label}</span>
);

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  // ── 1. Intro ──────────────────────────────────────────────────────────────
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: '⚡ Centre de contrôle des tâches',
    content: (
      <div>
        <p style={{ margin: '0 0 14px', lineHeight: 1.7 }}>
          Bienvenue dans la section principale de ClawBoard. Tout ce qui concerne
          l'exécution de tes <strong>agents IA</strong> est centralisé ici :
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: '0.85rem', lineHeight: 1.9 }}>
          <li>Lancer et suivre des <strong>tâches</strong> en temps réel</li>
          <li>Gérer des <strong>modèles</strong> réutilisables</li>
          <li>Planifier des <strong>récurrences CRON</strong> automatiques</li>
          <li>Consulter les <strong>archives</strong> avec métriques de coût</li>
        </ul>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          Les données sont synchronisées en <strong>live</strong> via Server-Sent Events. ✨
        </p>
      </div>
    ),
  },

  // ── 2. Header — compteurs live ─────────────────────────────────────────────
  {
    target: '[data-tour="tasks-header"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '📡 Vue en temps réel',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
          Le compteur <strong>"N en cours · M total"</strong> se met à jour
          automatiquement sans recharger la page. Tu vois instantanément quand
          une tâche démarre, se termine ou échoue.
        </p>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          La connexion SSE est maintenue en permanence tant que tu es sur cette page.
        </p>
      </div>
    ),
  },

  // ── 3. Bouton Lancer Tâche ─────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-new-btn"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '➕ Lancer une nouvelle tâche',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Ce bouton ouvre le <strong>formulaire de création complet</strong>.
          Tu y configures tout ce dont l'agent a besoin :
        </p>
        <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.8 }}>
          <li>Le <strong>nom</strong> et les <strong>instructions</strong> (le prompt)</li>
          <li>Le <strong>modèle LLM</strong> — Claude, NVIDIA NIM, Gemini, Kimi…</li>
          <li>L'<strong>agent</strong> exécuteur et le <strong>skill</strong> associé</li>
          <li>Le <strong>canal de livraison</strong> — Telegram, Discord, webhook</li>
          <li>Les <strong>objectifs</strong> et <strong>actions post-exécution</strong></li>
        </ul>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          💡 Tu peux aussi sauvegarder la tâche comme <strong>modèle réutilisable</strong> depuis ce formulaire.
        </p>
      </div>
    ),
  },

  // ── 4. Les 5 onglets ───────────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-tabs"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '📂 Les 5 onglets — tour rapide',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6, opacity: 0.8, fontSize: '0.85rem' }}>
          Chaque onglet a un rôle précis dans ton workflow IA :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--brand-accent)', fontWeight: 700, flexShrink: 0 }}>▶ Tâches</span>
            <span style={{ opacity: 0.85 }}>Liste live de toutes les exécutions, filtres par statut, vues liste et Kanban</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--brand-accent)', fontWeight: 700, flexShrink: 0 }}>📄 Modèles</span>
            <span style={{ opacity: 0.85 }}>Templates préconfigurés, réutilisables en 1 clic</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: '#10b981', fontWeight: 700, flexShrink: 0 }}>🔄 Récurrences</span>
            <span style={{ opacity: 0.85 }}>CRONs qui exécutent un modèle selon une planification</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>📖 Pré-instructions</span>
            <span style={{ opacity: 0.85 }}>Prompt système injecté dans toutes les tâches</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>🗂️ Archives</span>
            <span style={{ opacity: 0.85 }}>Historique complet avec durée, tokens et coût</span>
          </div>
        </div>
      </div>
    ),
  },

  // ── 5. Recherche ───────────────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-search"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '🔍 Recherche instantanée',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Filtre la liste en tapant n'importe quelle partie du <strong>nom</strong>,
          de l'<strong>ID</strong>, du <strong>skill</strong> ou de l'<strong>agent</strong>.
          La liste réagit à chaque frappe, sans délai.
        </p>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          Exemple : tape <Tag label="veille" color="var(--brand-accent)" /> pour voir uniquement
          les tâches liées à un skill de veille.
        </p>
      </div>
    ),
  },

  // ── 6. Filtres statut ──────────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-filters"]',
    placement: 'top',
    disableBeacon: true,
    title: '🎯 Filtres par statut',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Clique sur un statut pour n'afficher que ces tâches. Le compteur
          entre parenthèses se met à jour en live :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem' }}>
          <div><span style={{ color: '#3b82f6', fontWeight: 700 }}>● En cours</span> — exécution active, indicateur qui pulse</div>
          <div><span style={{ color: '#a1a1aa', fontWeight: 700 }}>● Planifié</span> — en attente de démarrage</div>
          <div><span style={{ color: '#10b981', fontWeight: 700 }}>● Terminé</span> — succès, résultat livré</div>
          <div><span style={{ color: '#ef4444', fontWeight: 700 }}>● Échoué</span> — erreur détectée, consulter les logs</div>
        </div>
      </div>
    ),
  },

  // ── 7. Vue liste / Kanban ──────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-view-toggle"]',
    placement: 'top',
    disableBeacon: true,
    title: '⊞ Vue Liste ou Kanban',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
          Deux modes d'affichage selon tes préférences :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.875rem' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>☰ Vue Liste</div>
            <div style={{ opacity: 0.8 }}>Compacte et dense. Idéale pour parcourir rapidement de nombreuses tâches.
            Chaque ligne affiche le statut, le skill, le LLM, le coût et le nombre de tokens.</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>⊞ Vue Kanban</div>
            <div style={{ opacity: 0.8 }}>4 colonnes par statut. Tu peux <strong>glisser-déposer</strong> une carte
            d'une colonne à l'autre pour changer son statut manuellement.</div>
          </div>
        </div>
      </div>
    ),
  },

  // ── 8. Clic sur une tâche → panneau détail ────────────────────────────────
  {
    target: '[data-tour="tasks-header"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '👁️ Panneau de détail d\'une tâche',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
          Clique sur <strong>n'importe quelle tâche</strong> dans la liste pour
          ouvrir le <strong>panneau de détail</strong> à droite.
        </p>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Dans ce panneau tu trouveras :
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.8 }}>
          <li>Les <strong>logs d'exécution</strong> en direct (streaming)</li>
          <li>La <strong>configuration complète</strong> de la tâche</li>
          <li>Les métriques : tokens prompt/completion, coût final</li>
          <li>Le <strong>résultat</strong> retourné par l'agent</li>
        </ul>
        <p style={{ margin: '10px 0 0', opacity: 0.7, fontSize: '0.8rem' }}>
          Appuie sur <Tag label="Échap" color="#64748b" /> ou clique à côté pour fermer le panneau.
        </p>
      </div>
    ),
  },

  // ── 9. Onglet Modèles ──────────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-tab-modeles"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '📄 Modèles — templates réutilisables',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Un <strong>modèle</strong> est une configuration de tâche sauvegardée :
          instructions, LLM, agent, canal, skill, destinataire. En un clic sur
          <strong> "Exécuter"</strong>, une nouvelle tâche est créée et lancée.
        </p>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Chaque carte de modèle affiche :
        </p>
        <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.8 }}>
          <li>Le <strong>compteur d'exécutions</strong> — pour voir l'usage</li>
          <li>Les <strong>badges</strong> : agent, canal, LLM, flag <Tag label="no-preinstr" color="#f59e0b" /></li>
          <li>Un aperçu tronqué des <strong>instructions</strong></li>
        </ul>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          💡 Crée un modèle depuis le formulaire de création de tâche, ou directement
          depuis le bouton <Tag label="+ Créer un modèle" color="var(--brand-accent)" /> dans cet onglet.
        </p>
      </div>
    ),
  },

  // ── 10. Onglet Récurrences ─────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-tab-recurrences"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '🔄 Récurrences — automatisation CRON',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Une <strong>récurrence</strong> lie un modèle à une expression CRON.
          L'agent s'exécute automatiquement selon la planification sans aucune intervention manuelle.
        </p>
        <p style={{ margin: '0 0 8px', lineHeight: 1.6, fontSize: '0.85rem', opacity: 0.85 }}>
          Chaque récurrence affiche :
        </p>
        <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.8 }}>
          <li>L'<strong>expression CRON</strong> et sa traduction humaine (ex. "Toutes les heures")</li>
          <li>La <strong>prochaine exécution</strong> planifiée</li>
          <li>Un <strong>toggle</strong> pour activer / suspendre en 1 clic</li>
          <li>Un bouton <strong>"Lancer"</strong> pour un run immédiat hors planning</li>
        </ul>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          💡 Exemples : <Tag label="*/30 * * * *" color="#a1a1aa" /> = toutes les 30 min ·
          <Tag label="0 8 * * 1" color="#a1a1aa" /> = lundi à 8h
        </p>
      </div>
    ),
  },

  // ── 11. Onglet Pré-instructions ────────────────────────────────────────────
  {
    target: '[data-tour="tasks-tab-preinstructions"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '📖 Pré-instructions — le prompt système global',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Ce texte est automatiquement injecté en <strong>préfixe du system prompt</strong>
          de chaque tâche. C'est l'endroit pour définir les règles, le ton et le contexte
          partagés par tous tes agents.
        </p>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6, fontSize: '0.85rem', opacity: 0.85 }}>
          Exemples d'utilisation :
        </p>
        <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.8 }}>
          <li>Définir la <strong>langue</strong> de réponse (ex. "Réponds toujours en français")</li>
          <li>Fixer un <strong>ton</strong> (professionnel, concis, technique…)</li>
          <li>Partager un <strong>contexte d'entreprise</strong> ou des contraintes métier</li>
        </ul>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          ⚠️ Exception : les modèles avec le flag <Tag label="no-preinstr" color="#f59e0b" /> ignorent ce texte.
          Le compteur de caractères/lignes/mots t'aide à garder un prompt compact.
        </p>
      </div>
    ),
  },

  // ── 12. Onglet Archives ────────────────────────────────────────────────────
  {
    target: '[data-tour="tasks-tab-archives"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '🗂️ Archives — historique & métriques',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Toutes les exécutions terminées (succès <em>et</em> échecs) sont
          archivées ici. C'est ton <strong>journal d'audit</strong> complet.
        </p>
        <p style={{ margin: '0 0 8px', lineHeight: 1.6, fontSize: '0.85rem', opacity: 0.85 }}>
          Chaque ligne contient :
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.83rem', marginBottom: 10 }}>
          <div>📌 <strong>Tâche</strong> — nom + skill</div>
          <div>📅 <strong>Date</strong> — heure précise</div>
          <div>⏱ <strong>Durée</strong> — en secondes</div>
          <div>🔢 <strong>Tokens</strong> — prompt + completion</div>
          <div>💰 <strong>Coût</strong> — en USD, 4 décimales</div>
          <div>🤖 <strong>LLM</strong> — modèle utilisé</div>
        </div>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>
          Utile pour analyser les performances, détecter les régressions et optimiser tes coûts API.
        </p>
      </div>
    ),
  },

  // ── 13. Conclusion — workflow recommandé ───────────────────────────────────
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: '🚀 Workflow recommandé',
    content: (
      <div>
        <p style={{ margin: '0 0 14px', lineHeight: 1.65, opacity: 0.9 }}>
          Voilà le flux optimal pour tirer le meilleur de ClawBoard :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ background: 'color-mix(in srgb, var(--brand-accent) 20%, transparent)', color: 'var(--brand-accent)', borderRadius: 6, padding: '2px 8px', fontWeight: 700, flexShrink: 0, fontSize: '12px' }}>1</span>
            <span><strong>Crée</strong> une tâche avec le formulaire → teste-la une première fois</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ background: 'color-mix(in srgb, var(--brand-accent) 20%, transparent)', color: 'var(--brand-accent)', borderRadius: 6, padding: '2px 8px', fontWeight: 700, flexShrink: 0, fontSize: '12px' }}>2</span>
            <span><strong>Sauvegarde</strong> en modèle réutilisable depuis la page de création</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', borderRadius: 6, padding: '2px 8px', fontWeight: 700, flexShrink: 0, fontSize: '12px' }}>3</span>
            <span><strong>Automatise</strong> avec une récurrence CRON sur ce modèle</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: 6, padding: '2px 8px', fontWeight: 700, flexShrink: 0, fontSize: '12px' }}>4</span>
            <span><strong>Surveille</strong> via le Kanban et les Archives pour optimiser tes coûts</span>
          </div>
        </div>
        <p style={{ margin: '16px 0 0', opacity: 0.6, fontSize: '0.8rem', textAlign: 'center' }}>
          Tu peux relancer ce guide à tout moment depuis le bouton <strong>"Guide"</strong> dans l'en-tête. 🎯
        </p>
      </div>
    ),
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface TasksTourProps {
  forceRun?: boolean;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TasksTour = ({ forceRun = false, onClose }: TasksTourProps) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(TASKS_TOUR_KEY);
    if (forceRun || !done) {
      setRun(false);
      setStepIndex(0);
      const timer = setTimeout(() => setRun(true), 450);
      return () => clearTimeout(timer);
    }
  }, [forceRun]);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, type, action } = data;

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(i => action === 'prev' ? Math.max(0, i - 1) : i + 1);
    }

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      setRun(false);
      setStepIndex(0);
      localStorage.setItem(TASKS_TOUR_KEY, '1');
      onClose?.();
    }
  }, [onClose]);

  return (
    <Joyride
      steps={STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      scrollOffset={120}
      disableOverlayClose
      spotlightPadding={8}
      locale={LOCALE}
      styles={TOUR_STYLES}
      callback={handleCallback}
    />
  );
};
