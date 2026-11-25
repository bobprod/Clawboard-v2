import { useState, useEffect, useCallback } from 'react';
import Joyride, { STATUS, EVENTS } from 'react-joyride';
import type { CallBackProps, Step } from 'react-joyride';

const CREATOR_TOUR_KEY = 'clawboard-task-creator-tour-v2';

export const resetTaskCreatorTour = () => localStorage.removeItem(CREATOR_TOUR_KEY);

// ─── Shared style helpers ─────────────────────────────────────────────────────

const box = (color: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${color} 7%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
  borderRadius: 9,
  padding: '10px 14px',
  fontSize: '0.8rem',
  lineHeight: 1.75,
  marginBottom: 10,
});

const codeBlock: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  lineHeight: 1.65,
  whiteSpace: 'pre-wrap' as const,
  marginBottom: 8,
  color: '#e2e8f0',
};

const inlineCode: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  borderRadius: 4,
  padding: '1px 6px',
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  color: '#93c5fd',
};

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

  // ── 1. Intro ──────────────────────────────────────────────────────────────
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: '🎓 Formation : créer des tâches qui donnent de vrais résultats',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.7, opacity: 0.9 }}>
          Ce guide te forme aux bonnes pratiques pour configurer des agents IA efficaces.
          À la fin, tu sauras :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.855rem' }}>
          {[
            ['📝', 'Rédiger un prompt structuré qui donne des résultats prévisibles'],
            ['🤖', 'Choisir le bon modèle selon le type de tâche'],
            ['⏱️', 'Estimer le timeout avec la formule de la boucle agentique'],
            ['🎯', 'Distinguer instructions et objectifs — deux champs différents'],
            ['🔄', 'Diagnostiquer et corriger un mauvais résultat'],
          ].map(([icon, text]) => (
            <div key={String(text)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0 }}>{icon}</span>
              <span style={{ opacity: 0.85, lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '14px 0 0', opacity: 0.55, fontSize: '0.78rem', textAlign: 'center' }}>
          18 étapes · environ 6 minutes · tu peux relancer ce guide à tout moment
        </p>
      </div>
    ),
  },

  // ── 2. Nom de la tâche ────────────────────────────────────────────────────
  {
    target: '[data-tour="creator-name"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '✏️ Nommer pour retrouver et comprendre',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Le nom est l'<strong>identifiant humain</strong> de ta tâche dans les archives, les modèles et les logs.
          Il doit répondre à : <em>"que fait cette tâche, sur quoi ?"</em>
        </p>
        <div style={box('#ef4444')}>
          <div style={label('#f87171')}>❌ Noms à éviter</div>
          <code style={inlineCode}>Test</code>
          {' '}<code style={inlineCode}>Tâche 1</code>
          {' '}<code style={inlineCode}>Nouveau</code>
          {' '}<code style={inlineCode}>check</code>
          <br />
          <span style={{ opacity: 0.75 }}>Illisibles dans les archives. Impossible de savoir ce que ça fait 3 jours plus tard.</span>
        </div>
        <div style={box('#10b981')}>
          <div style={label('#6ee7b7')}>✅ Format recommandé : <em>[Action] — [Sujet] — [Contexte]</em></div>
          <code style={inlineCode}>Veille IA — résumé Hacker News — matin</code><br />
          <code style={inlineCode}>Analyse logs — prod-api — erreurs critiques</code><br />
          <code style={inlineCode}>Morning briefing — équipe dev — quotidien</code>
        </div>
        <p style={{ margin: 0, opacity: 0.65, fontSize: '0.78rem' }}>
          Ce champ est le seul <strong>obligatoire</strong> pour valider le formulaire.
        </p>
      </div>
    ),
  },

  // ── 3. Instructions — La structure en 5 parties ───────────────────────────
  {
    target: '[data-tour="creator-instructions"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '📝 Le prompt : la structure en 5 parties',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Ce champ est le <strong>prompt envoyé directement au LLM</strong>.
          La qualité de ta réponse dépend à 80% de sa structure.
          La formule qui fonctionne :
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '0.82rem', marginBottom: 10, lineHeight: 1.6 }}>
          <strong style={{ color: '#93c5fd' }}>① Rôle</strong>      <span>"Tu es un analyste en cybersécurité senior"</span>
          <strong style={{ color: '#6ee7b7' }}>② Contexte</strong>   <span>"Pour une startup SaaS avec 50k utilisateurs"</span>
          <strong style={{ color: '#fcd34d' }}>③ Tâche</strong>      <span>"Analyse ces logs et identifie les anomalies"</span>
          <strong style={{ color: '#f9a8d4' }}>④ Format</strong>     <span>"Retourne un JSON avec les champs : niveau, message, action"</span>
          <strong style={{ color: '#a5b4fc' }}>⑤ Contraintes</strong><span>"Max 10 entrées. Ignore les warnings INFO."</span>
        </div>
        <div style={{ ...box('#10b981'), marginBottom: 0 }}>
          <div style={label('#6ee7b7')}>✅ Prompt complet appliquant les 5 parties</div>
          <div style={codeBlock}>{`Tu es un analyste en veille technologique IA.
Pour une newsletter destinée à des développeurs.
Identifie les 3 actualités IA les plus importantes des dernières 24h.
Pour chaque actualité retourne :
- titre (max 10 mots)
- résumé en 2 phrases
- impact pratique pour un dev
Format : Markdown avec headers ##
Contraintes : max 400 mots, ton factuel, pas de sensationnalisme.`}</div>
        </div>
      </div>
    ),
  },

  // ── 4. Mode impératif ─────────────────────────────────────────────────────
  {
    target: '[data-tour="creator-instructions"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '⚡ Mode impératif : une forme qui change tout',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Les LLMs sont entraînés à <strong>exécuter des ordres directs</strong>.
          Le mode conditionnel ("je voudrais que…") déclenche une réponse conversationnelle.
          Le mode impératif déclenche une exécution.
        </p>
        <div style={box('#ef4444')}>
          <div style={label('#f87171')}>❌ Conditionnel — réponse floue, bavarde</div>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.85 }}>
            "Je voudrais que tu regardes ces logs et que tu me dises si tu vois des choses intéressantes ou des problèmes potentiels..."
          </span>
        </div>
        <div style={box('#10b981')}>
          <div style={label('#6ee7b7')}>✅ Impératif — réponse ciblée, structurée</div>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.9 }}>
            "Analyse les logs suivants. Identifie toutes les erreurs de niveau ERROR ou CRITICAL. Retourne une liste JSON triée par fréquence décroissante."
          </span>
        </div>
        <p style={{ margin: '8px 0 0', opacity: 0.65, fontSize: '0.78rem' }}>
          Règle : <strong>chaque phrase du prompt doit être un ordre, pas un souhait.</strong>
        </p>
      </div>
    ),
  },

  // ── 5. Format de sortie ───────────────────────────────────────────────────
  {
    target: '[data-tour="creator-instructions"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '📋 Format de sortie : toujours le spécifier',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Sans consigne de format, le LLM choisit lui-même — et produit quelque chose
          d'inutilisable pour ton pipeline ou ton canal de notification.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
          <div>
            <div style={label('#93c5fd')}>JSON — pour les intégrations et webhooks</div>
            <div style={codeBlock}>{`"Retourne un JSON valide :
{ "errors": [{"level":"ERROR","msg":"...","count":N}] }
Ne retourne rien d'autre que le JSON."`}</div>
          </div>
          <div>
            <div style={label('#6ee7b7')}>Markdown — pour Telegram, Discord, newsletters</div>
            <div style={codeBlock}>{`"Format Markdown :
## Résumé
- Point 1
- Point 2
## Recommandations
1. Action A
2. Action B"`}</div>
          </div>
        </div>
        <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: '0.78rem' }}>
          💡 Pour JSON : ajoute <span style={inlineCode}>"Ne retourne rien d'autre que le JSON."</span> — sinon le LLM ajoute du texte autour.
        </p>
      </div>
    ),
  },

  // ── 6. Few-shot ───────────────────────────────────────────────────────────
  {
    target: '[data-tour="creator-instructions"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '🎯 Few-shot : montrer plutôt qu\'expliquer',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Inclure des <strong>exemples d'entrée → sortie</strong> dans le prompt est la technique la
          plus efficace pour cadrer le comportement. Le LLM détecte le pattern et le reproduit
          fidèlement, même pour des cas inédits.
        </p>
        <div style={{ marginBottom: 8 }}>
          <div style={label('#fcd34d')}>Exemple : classification de tickets support</div>
          <div style={codeBlock}>{`Classifie chaque ticket selon ce schéma.
Exemples :
Input: "Mon serveur est down"
Output: {"catégorie":"Incident","priorité":"P1","équipe":"Infra"}

Input: "Comment exporter mes données ?"
Output: {"catégorie":"Question","priorité":"P3","équipe":"Support"}

Classe maintenant ce ticket :
Input: "[TICKET_CONTENT]"`}</div>
        </div>
        <p style={{ margin: 0, opacity: 0.65, fontSize: '0.78rem' }}>
          Utilise le few-shot pour : classification, extraction de données, reformatage, résumé avec structure fixe.
          2 à 3 exemples suffisent.
        </p>
      </div>
    ),
  },

  // ── 7. Chain-of-thought ───────────────────────────────────────────────────
  {
    target: '[data-tour="creator-instructions"]',
    placement: 'bottom',
    disableBeacon: true,
    title: '🧠 Chain-of-thought : forcer le raisonnement étape par étape',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Sur les tâches complexes, les LLMs sautent des étapes de raisonnement et font des erreurs.
          La formule ci-dessous force une réflexion intermédiaire avant la réponse finale —
          ce qui améliore significativement la précision.
        </p>
        <div style={{ marginBottom: 10 }}>
          <div style={label('#a5b4fc')}>La formule à ajouter à la FIN de ton prompt</div>
          <div style={codeBlock}>{`Avant de répondre, réfléchis étape par étape.
Écris ton raisonnement entre <thinking> et </thinking>.
Donne ta réponse finale après, dans le format demandé.`}</div>
        </div>
        <div style={box('#f59e0b')}>
          <div style={label('#fcd34d')}>⚠️ Quand NE PAS l'utiliser</div>
          <span style={{ opacity: 0.85 }}>Tâches simples (résumé court, extraction directe) : la chain-of-thought consomme
          des tokens inutilement et ralentit l'exécution. Réserve-la aux tâches
          d'analyse, de raisonnement logique ou de débogage.</span>
        </div>
      </div>
    ),
  },

  // ── 8. Enhance IA ─────────────────────────────────────────────────────────
  {
    target: '[data-tour="creator-enhance"]',
    placement: 'left-end',
    disableBeacon: true,
    title: '✨ Enhance IA : quand l\'utiliser et ce qu\'il fait',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Ce bouton <strong>réécrit ton prompt via un LLM</strong> en appliquant automatiquement
          les 5 parties (rôle, contexte, tâche, format, contraintes) et en clarifiant les ambiguïtés.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.82rem', marginBottom: 10 }}>
          <div style={box('#10b981')}>
            <div style={label('#6ee7b7')}>✅ Utilise Enhance si…</div>
            <div>Tu as une idée brute non structurée</div>
            <div>Tu veux gagner du temps sur la rédaction</div>
            <div>Tu ne sais pas comment formuler la tâche</div>
          </div>
          <div style={box('#ef4444')}>
            <div style={label('#f87171')}>❌ Écris toi-même si…</div>
            <div>Le prompt est très technique / domaine spécialisé</div>
            <div>Tu as déjà un prompt éprouvé</div>
            <div>La précision du format de sortie est critique</div>
          </div>
        </div>
        <div style={box('var(--brand-accent)')}>
          <div style={label('#c4b5fd')}>Workflow recommandé</div>
          <span>Écris une phrase brute →
          clique Enhance → <strong>relis et ajuste</strong> (Enhance peut inventer du contexte).
          Ne valide jamais sans relire.</span>
        </div>
      </div>
    ),
  },

  // ── 9. Choix du modèle — matrice ──────────────────────────────────────────
  {
    target: '[data-tour="creator-skill-model"]',
    placement: 'top',
    disableBeacon: true,
    title: '🤖 Choisir le bon modèle : la matrice tâche → LLM',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Il n'y a pas un "meilleur modèle". Il y a le bon modèle pour chaque type de tâche.
          Mauvais choix = résultats médiocres ou coût 10× trop élevé.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.81rem' }}>
          {[
            ['#93c5fd', 'Code, debug, refactoring', 'DeepSeek V3.2 · Claude Sonnet', 'Entraînés spécifiquement sur le code.'],
            ['#6ee7b7', 'Analyse longue (docs, logs, rapports)', 'Claude Sonnet · Gemini Flash', 'Grande fenêtre contexte (200k–1M tokens).'],
            ['#fcd34d', 'CRON haute fréquence (>10/jour)', 'Gemini Flash · Qwen 2.5 local', 'Coût ~20× inférieur aux modèles premium.'],
            ['#f9a8d4', 'Raisonnement complexe, maths, logique', 'Nemotron Ultra · QwQ 32B', 'Modèles de raisonnement avancé.'],
            ['#a5b4fc', 'Données confidentielles / RGPD', 'Ollama local (Qwen, Llama)', 'Aucune donnée ne sort du serveur.'],
          ].map(([color, useCase, models, why]) => (
            <div key={String(useCase)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', background: `${color}10`, border: `1px solid ${color}25`, borderRadius: 7, padding: '7px 10px' }}>
              <span style={{ fontWeight: 700, color: String(color), gridRow: '1 / 3', alignSelf: 'center', fontSize: '1.1rem' }}>→</span>
              <div><strong style={{ color: String(color) }}>{useCase}</strong> : <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{models}</span></div>
              <div style={{ opacity: 0.7, fontSize: '0.78rem' }}>{why}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // ── 10. Fenêtre contextuelle ──────────────────────────────────────────────
  {
    target: '[data-tour="creator-skill-model"]',
    placement: 'top',
    disableBeacon: true,
    title: '📏 Fenêtre contextuelle : pourquoi c\'est critique',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          La <strong>fenêtre contextuelle</strong> est la quantité maximale de texte que le modèle
          peut traiter en une seule fois (prompt + réponse). Si tu la dépasses,
          le modèle <strong>tronque silencieusement</strong> l'entrée — sans erreur, sans avertissement.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: '0.8rem', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4 }}>Modèle</div>
          <div style={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4 }}>Fenêtre</div>
          {[
            ['DeepSeek V3.2', '64k tokens'],
            ['Nemotron Ultra', '128k tokens'],
            ['Claude Sonnet', '200k tokens'],
            ['Gemini Flash', '1M tokens ⚡'],
          ].map(([m, w]) => (
            <>
              <div key={m} style={{ fontFamily: 'monospace', opacity: 0.85 }}>{m}</div>
              <div key={w} style={{ color: '#6ee7b7' }}>{w}</div>
            </>
          ))}
        </div>
        <div style={box('#f59e0b')}>
          <div style={label('#fcd34d')}>Règle de conversion rapide</div>
          <span>1 page Word ≈ 500 tokens · 100 pages ≈ 50k tokens · un repo de code moyen ≈ 80–150k tokens.<br />
          Si tu injectes un gros fichier, utilise <strong>Gemini Flash</strong> ou <strong>Claude Sonnet</strong>.</span>
        </div>
      </div>
    ),
  },

  // ── 11. Timeout ───────────────────────────────────────────────────────────
  {
    target: '[data-tour="creator-agent-timeout"]',
    placement: 'top',
    disableBeacon: true,
    title: '⏱️ Timeout : comprendre la boucle agentique',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Un agent ne fait pas <em>un</em> appel LLM — il fait une <strong>boucle de N appels successifs</strong>
          (planifier → appeler un outil → évaluer → relancer…). Le timeout couvre
          l'ensemble de cette boucle, pas un seul appel.
        </p>
        <div style={{ marginBottom: 10 }}>
          <div style={label('#a5b4fc')}>Formule d'estimation</div>
          <div style={codeBlock}>{`timeout = nb_étapes × durée_moy_par_appel × marge_sécurité

Exemple — analyse de logs en 5 étapes :
  5 étapes × 30s/appel × 2 (marge) = 5 minutes minimum
  → règle timeout à 10–15 min

Exemple — veille web en 12 étapes avec recherches :
  12 étapes × 45s × 2 = 18 min minimum
  → règle timeout à 30 min`}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem' }}>
          <div style={box('var(--brand-accent)')}>
            <strong>5–15 min</strong><br />
            Réponses simples, extraction directe, résumés courts.
          </div>
          <div style={box('var(--brand-accent)')}>
            <strong>30 min</strong><br />
            Analyse standard avec 5–10 étapes. Valeur par défaut sûre.
          </div>
          <div style={box('#f59e0b')}>
            <strong>60+ min</strong><br />
            Veille web, rédaction longue, multi-sources.
          </div>
          <div style={box('#ef4444')}>
            <strong>À l'expiration</strong><br />
            Tâche marquée <span style={{ fontFamily: 'monospace' }}>FAILED</span>. Résultat partiel non sauvegardé.
          </div>
        </div>
      </div>
    ),
  },

  // ── 12. Canal de notification ─────────────────────────────────────────────
  {
    target: '[data-tour="creator-canal"]',
    placement: 'top',
    disableBeacon: true,
    title: '📡 Canal : recevoir le résultat où tu veux',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          L'agent envoie sa <strong>réponse finale sur ce canal</strong> une fois la tâche terminée.
          Utile pour les CRON qui tournent sans surveillance.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem', marginBottom: 10 }}>
          {[
            ['📱 Telegram', 'Chat ID numérique (ex. 123456789) ou @username'],
            ['💬 Discord', 'ID de salon (clic droit sur le salon → Copier l\'ID)'],
            ['📲 WhatsApp', 'Numéro au format international +336…'],
            ['🔗 Webhook', 'URL HTTPS POST — reçoit un payload JSON'],
          ].map(([canal, format]) => (
            <div key={String(canal)} style={{ display: 'flex', gap: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '7px 10px' }}>
              <strong style={{ flexShrink: 0, width: 90 }}>{canal}</strong>
              <span style={{ opacity: 0.8 }}>{format}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.78rem' }}>
          Laisse vide pour consulter les résultats uniquement dans l'interface (onglet Tâches → clic sur la ligne).
        </p>
      </div>
    ),
  },

  // ── 13. Objectifs vs Instructions ─────────────────────────────────────────
  {
    target: '[data-tour="creator-objectives"]',
    placement: 'top',
    disableBeacon: true,
    title: '🎯 Objectifs ≠ Instructions : une distinction fondamentale',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          C'est la source de confusion numéro 1. Ces deux champs ne disent pas la même chose à l'agent :
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem', marginBottom: 10 }}>
          <div style={box('var(--brand-accent)')}>
            <div style={label('#93c5fd')}>📝 Instructions = COMMENT agir</div>
            <div>Définissent le <strong>processus</strong> : les étapes, le rôle, les outils à utiliser, le format de sortie.</div>
          </div>
          <div style={box('#10b981')}>
            <div style={label('#6ee7b7')}>🎯 Objectifs = CRITÈRES DE SUCCÈS</div>
            <div>Définissent ce que <strong>réussir</strong> veut dire. L'agent s'auto-évalue à la fin.</div>
          </div>
        </div>
        <div style={{ fontSize: '0.81rem', marginBottom: 8 }}>
          <div style={{ opacity: 0.75, marginBottom: 6 }}>Pour une tâche <em>"Analyser les logs prod"</em> :</div>
          <div style={box('var(--brand-accent)')}>
            <strong style={{ color: '#93c5fd' }}>Instructions :</strong> "Tu es un SRE. Analyse les logs fournis. Classe chaque entrée par niveau. Retourne un rapport JSON."
          </div>
          <div style={box('#10b981')}>
            <strong style={{ color: '#6ee7b7' }}>Objectifs :</strong> "Identifier au moins 3 erreurs critiques. Fournir une recommandation d'action pour chacune."
          </div>
        </div>
      </div>
    ),
  },

  // ── 14. Objectifs SMART + utilisation par l'agent ────────────────────────
  {
    target: '[data-tour="creator-objectives"]',
    placement: 'top',
    disableBeacon: true,
    title: '📐 Rédiger des objectifs SMART',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          L'agent compare ses résultats à tes objectifs avant de terminer.
          Un objectif vague ne sert à rien — l'agent ne peut pas s'auto-évaluer dessus.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', fontSize: '0.81rem', marginBottom: 10, lineHeight: 1.6 }}>
          <strong style={{ color: '#6ee7b7' }}>S</strong><span><strong>Spécifique</strong> — "Identifier les erreurs 500" et non "trouver des problèmes"</span>
          <strong style={{ color: '#6ee7b7' }}>M</strong><span><strong>Mesurable</strong> — "Au moins 3 erreurs" et non "plusieurs erreurs"</span>
          <strong style={{ color: '#6ee7b7' }}>A</strong><span><strong>Atteignable</strong> — réaliste pour l'agent dans le temps imparti</span>
          <strong style={{ color: '#6ee7b7' }}>R</strong><span><strong>Relevant</strong> — aligné sur la tâche, pas un objectif hors-sujet</span>
          <strong style={{ color: '#6ee7b7' }}>T</strong><span><strong>Time-bound</strong> — contrainte de taille ou de nombre ("max 200 mots")</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem' }}>
          <div style={box('#ef4444')}>
            <div style={label('#f87171')}>❌ Vague / inutilisable</div>
            "Faire un bon résumé"<br />
            "Trouver les informations importantes"<br />
            "Répondre correctement"
          </div>
          <div style={box('#10b981')}>
            <div style={label('#6ee7b7')}>✅ SMART / auto-évaluable</div>
            "Résumer en moins de 200 mots"<br />
            "Retourner exactement 3 chiffres clés"<br />
            "Fournir 5 recommandations actionnables"
          </div>
        </div>
      </div>
    ),
  },

  // ── 15. Pré-instructions ─────────────────────────────────────────────────
  {
    target: '[data-tour="creator-preinstructions"]',
    placement: 'top',
    disableBeacon: true,
    title: '🔒 Pré-instructions : le système global, les conflits',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Les pré-instructions (configurées dans l'onglet Tâches → Pré-instructions) sont injectées
          en <strong>préfixe de chaque prompt</strong>. C'est le "ADN comportemental" partagé par tous les agents.
        </p>
        <div style={{ marginBottom: 10 }}>
          <div style={label('#fcd34d')}>Comment bien les écrire</div>
          <div style={codeBlock}>{`Exemples de bonnes pré-instructions :
• "Réponds toujours en français, sauf si l'utilisateur
   écrit dans une autre langue."
• "Ton professionnel et factuel. Pas d'hyperboles."
• "Tout retour technique doit inclure un exemple de code."
• "Si une information manque, dis-le explicitement
   plutôt que d'improviser."`}</div>
        </div>
        <div style={box('#f59e0b')}>
          <div style={label('#fcd34d')}>⚠️ Conflits pré-instructions vs instructions de la tâche</div>
          <span style={{ opacity: 0.9 }}>
            En cas de contradiction (ex. pré-instructions disent "français", tâche dit "reply in English"),
            les <strong>instructions spécifiques de la tâche prennent le dessus</strong>.
            Si le conflit est systématique, désactive le toggle <em>"Pré-instructions globales"</em>
            pour cette tâche.
          </span>
        </div>
      </div>
    ),
  },

  // ── 16. Sauvegarder comme modèle ─────────────────────────────────────────
  {
    target: '[data-tour="creator-actions"]',
    placement: 'top',
    disableBeacon: true,
    title: '💾 Sauvegarder comme modèle : le pont vers l\'automatisation',
    content: (
      <div>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
          Une tâche bien configurée ne devrait pas être remplie à nouveau à chaque fois.
          En la sauvegardant comme <strong>modèle</strong>, tu peux :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.82rem', marginBottom: 10 }}>
          {[
            ['▶ 1 clic', 'Relancer la tâche depuis l\'onglet Modèles sans remplir le formulaire'],
            ['🔄 CRON', 'Créer une récurrence : "exécute ce modèle tous les matins à 7h"'],
            ['📋 Template', 'Cloner et adapter pour créer des variantes (prod vs staging, FR vs EN)'],
          ].map(([action, desc]) => (
            <div key={String(action)} style={{ display: 'flex', gap: 10, background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-accent) 20%, transparent)', borderRadius: 7, padding: '8px 12px', alignItems: 'flex-start' }}>
              <strong style={{ color: '#c4b5fd', flexShrink: 0, width: 70 }}>{action}</strong>
              <span style={{ opacity: 0.85 }}>{desc}</span>
            </div>
          ))}
        </div>
        <div style={box('var(--brand-accent)')}>
          <div style={label('#93c5fd')}>Workflow d'automatisation en 3 étapes</div>
          <span>Créer → tester → sauvegarder comme modèle → créer une récurrence CRON sur ce modèle.
          C'est comme ça que tu passes d'une tâche manuelle à un pipeline entièrement automatisé.</span>
        </div>
      </div>
    ),
  },

  // ── 17. Itération ────────────────────────────────────────────────────────
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: '🔄 Itérer : diagnostiquer et corriger un mauvais résultat',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
          Un premier résultat décevant est normal. Voici le diagnostic en 5 patterns :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.82rem' }}>
          {[
            ['Réponse vague, générique', 'Instructions insuffisantes', 'Ajouter le rôle + contexte + format de sortie explicite'],
            ['Format de réponse inutilisable', 'Format de sortie non spécifié', 'Ajouter "Retourne uniquement un JSON..." à la fin des instructions'],
            ['Résultat incomplet, tronqué', 'Contexte > fenêtre du modèle', 'Changer pour Gemini Flash (1M tokens) ou réduire l\'entrée'],
            ['Tâche marquée FAILED', 'Timeout trop court', 'Multiplier le timeout par 2, ou simplifier les instructions'],
            ['Réponse hors-sujet', 'Pré-instructions en conflit', 'Désactiver le toggle "Pré-instructions globales" pour cette tâche'],
          ].map(([symptom, cause, fix]) => (
            <div key={String(symptom)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ color: '#f87171', fontSize: '0.8rem' }}>🔴 {symptom}</strong>
                <span style={{ color: '#fcd34d', fontSize: '0.78rem' }}>→ {cause}</span>
              </div>
              <div style={{ color: '#6ee7b7', fontSize: '0.79rem' }}>✅ Fix : {fix}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // ── 18. Checklist finale ──────────────────────────────────────────────────
  {
    target: '[data-tour="creator-actions"]',
    placement: 'top',
    disableBeacon: true,
    title: '✅ Checklist : 5 vérifications avant de lancer',
    content: (
      <div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
          Avant d'appuyer sur <strong>"Créer & Lancer"</strong>, vérifie ces 5 points :
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.84rem' }}>
          {[
            ['Prompt en mode impératif', 'Rôle + Contexte + Tâche + Format + Contraintes. Pas une seule phrase "je voudrais…"'],
            ['Format de sortie explicite', 'JSON, Markdown, liste numérotée. Sans ça, l\'agent invente un format.'],
            ['Bon modèle pour le type de tâche', 'Code → DeepSeek/Claude · Longue analyse → Gemini Flash · Local → Ollama'],
            ['Timeout × 2 par rapport à l\'estimation', 'Ajoute une marge de sécurité. Une tâche FAILED = résultat perdu.'],
            ['Objectifs SMART avec critères mesurables', 'Au moins un chiffre ou une contrainte de taille dans tes objectifs.'],
          ].map(([title, desc], i) => (
            <div key={String(title)} style={{ display: 'flex', gap: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '9px 12px', alignItems: 'flex-start' }}>
              <span style={{ background: 'rgba(16,185,129,0.25)', color: '#6ee7b7', borderRadius: 6, padding: '1px 8px', fontWeight: 700, flexShrink: 0, fontSize: '0.78rem' }}>{i + 1}</span>
              <div>
                <div style={{ fontWeight: 700, color: '#d1fae5', marginBottom: 2 }}>{title}</div>
                <div style={{ opacity: 0.75, fontSize: '0.79rem', lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '12px 0 0', opacity: 0.55, fontSize: '0.78rem', textAlign: 'center' }}>
          🎉 Tu es prêt. Bonne chance avec ta première tâche optimisée !
        </p>
      </div>
    ),
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface TaskCreatorTourProps {
  forceRun?: boolean;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TaskCreatorTour = ({ forceRun = false, onClose }: TaskCreatorTourProps) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(CREATOR_TOUR_KEY);
    if (forceRun || !done) {
      setRun(false);
      setStepIndex(0);
      const timer = setTimeout(() => setRun(true), 400);
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
      localStorage.setItem(CREATOR_TOUR_KEY, '1');
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
      locale={{
        back: '← Précédent',
        close: 'Fermer',
        last: '🎉 Terminer la formation',
        next: 'Suivant →',
        open: 'Ouvrir',
        skip: 'Passer le guide',
      }}
      styles={{
        options: {
          primaryColor: 'var(--brand-accent)',
          backgroundColor: '#1a1625',
          textColor: '#e2e8f0',
          arrowColor: '#1a1625',
          overlayColor: 'rgba(0,0,0,0.62)',
          zIndex: 10000,
          width: 420,
        },
        tooltip: {
          borderRadius: 14,
          boxShadow: '0 10px 48px rgba(0,0,0,0.6), 0 0 0 1px color-mix(in srgb, var(--brand-accent) 28%, transparent)',
          padding: '22px 26px 18px',
        },
        tooltipTitle: {
          fontSize: '1rem',
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
          borderTop: '1px solid rgba(255,255,255,0.07)',
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
          borderRadius: 12,
          boxShadow: '0 0 0 2px color-mix(in srgb, var(--brand-accent) 45%, transparent), 0 0 0 9999px rgba(0,0,0,0.62)',
        },
        buttonClose: {
          color: '#64748b',
        },
      }}
      callback={handleCallback}
    />
  );
};
