// ─── Chat Routes (Lia AI assistant) ─────────────────────────────────────────

const PLAN_SYSTEM = `Tu es Lia, l'assistante IA agentique intégrée à ClawBoard (Nemoclaw).

L'utilisateur te décrit ce qu'il veut. Tu dois analyser sa demande et générer un PLAN D'EXÉCUTION structuré en JSON.

IMPORTANT — RÈGLES :
- Analyse la demande et décompose-la en étapes concrètes
- Chaque étape doit avoir un type : "task", "modele", "cron", "skill", ou "note"
- Propose les bons agents, skills, modèles, CRONs selon le besoin
- Identifie les risques éventuels
- Estime les tokens nécessaires
- Sois exhaustif : si l'utilisateur veut un "système de monitoring", crée les tâches, les modèles réutilisables, les CRONs, etc.

SKILLS DISPONIBLES : code-gen, code-fix, web-scraper, data-analysis, report-gen, seo-content, social-post, blog-writer, newsletter-writer, competitor-watch, inbox-monitor, morning-briefing, prompt-optimizer, youtube-analyzer, spreadsheet-gen, document-gen, presentation-gen, pdf-report, capcut-video, premiere-pro-edit

Tu DOIS répondre UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte autour) au format :
{
  "summary": "Description courte du plan",
  "steps": [
    {
      "id": "step_1",
      "type": "task|modele|cron|skill|note",
      "name": "Nom de l'étape",
      "description": "Ce que fait cette étape",
      "prompt": "Instructions détaillées pour l'agent",
      "skill": "nom-du-skill ou null",
      "agent": "nom-agent ou main",
      "recurrence": "expression CRON ou null",
      "approval_needed": false,
      "depends_on": ["step_X"]
    }
  ],
  "risks": ["risque 1", "risque 2"],
  "estimated_tokens": 15000
}`;

// Generate a plan using LLM or smart fallback
async function generatePlan(userMessage, ctx) {
  const { runAgenticLoop } = ctx;
  const lower = userMessage.toLowerCase();

  // Try to get plan from LLM with plan-specific system prompt
  try {
    const planMessages = [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: userMessage },
    ];
    const result = await runAgenticLoop(planMessages, "claude-sonnet-4-6", {});
    const text = result?.message || "";
    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      if (plan.steps?.length > 0) return plan;
    }
  } catch {
    /* fallback to smart generation */
  }

  // ── Smart fallback: generate plan from keywords ─────────────────────────
  const steps = [];
  let stepIdx = 0;
  const addStep = (type, name, desc, opts = {}) => {
    stepIdx++;
    steps.push({
      id: `step_${stepIdx}`,
      type,
      name,
      description: desc,
      prompt: opts.prompt || desc,
      skill: opts.skill || null,
      agent: opts.agent || "main",
      recurrence: opts.recurrence || null,
      approval_needed: opts.approval || false,
      depends_on: opts.depends || [],
    });
  };

  // Parse intent from message
  if (lower.match(/monitor|surveill|watch|veille/)) {
    addStep(
      "modele",
      "Template de monitoring",
      "Modèle de tâche pour surveiller des sources web",
      {
        skill: "web-scraper",
        prompt: `Surveiller et analyser : ${userMessage}`,
      },
    );
    addStep("task", "Scan initial", "Premier scan des sources à surveiller", {
      skill: "web-scraper",
      depends: ["step_1"],
      prompt: `Effectuer un premier scan : ${userMessage}`,
    });
    addStep("cron", "Monitoring récurrent", "Automatisation du monitoring", {
      recurrence: "0 */6 * * *",
      depends: ["step_1"],
      prompt: `Monitoring automatique : ${userMessage}`,
    });
    addStep(
      "task",
      "Rapport de synthèse",
      "Générer un rapport de synthèse des résultats",
      {
        skill: "report-gen",
        depends: ["step_2"],
        prompt: `Synthèse des résultats de monitoring`,
      },
    );
  } else if (lower.match(/blog|article|contenu|content/)) {
    addStep(
      "modele",
      "Template article",
      "Modèle pour la rédaction d'articles",
      {
        skill: "blog-writer",
        prompt: `Rédiger des articles sur : ${userMessage}`,
      },
    );
    addStep(
      "task",
      "Recherche SEO",
      "Analyse des mots-clés et intentions de recherche",
      { skill: "seo-content", prompt: `Analyse SEO pour : ${userMessage}` },
    );
    addStep("task", "Rédaction article", "Rédiger l'article optimisé SEO", {
      skill: "blog-writer",
      depends: ["step_2"],
      prompt: `Rédiger l'article : ${userMessage}`,
    });
    addStep("task", "Post réseaux sociaux", "Créer les posts de promotion", {
      skill: "social-post",
      depends: ["step_3"],
      prompt: `Promouvoir l'article sur les réseaux sociaux`,
    });
  } else if (lower.match(/newsletter|email|mailing/)) {
    addStep(
      "modele",
      "Template newsletter",
      "Modèle de newsletter réutilisable",
      { skill: "newsletter-writer", prompt: `Newsletter : ${userMessage}` },
    );
    addStep(
      "task",
      "Collecte de contenu",
      "Rassembler les informations pour la newsletter",
      {
        skill: "data-analysis",
        prompt: `Collecter le contenu pour : ${userMessage}`,
      },
    );
    addStep("task", "Rédaction newsletter", "Rédiger la newsletter", {
      skill: "newsletter-writer",
      depends: ["step_2"],
      prompt: `Rédiger la newsletter : ${userMessage}`,
    });
    addStep("cron", "Envoi automatique", "Planifier l'envoi récurrent", {
      recurrence: "0 9 * * 1",
      depends: ["step_1"],
      prompt: `Envoi automatique newsletter`,
    });
  } else if (lower.match(/code|développ|dev|bug|fix|feature/)) {
    addStep(
      "task",
      "Analyse du code",
      "Analyser le code source et identifier les améliorations",
      { skill: "code-fix", prompt: `Analyser et corriger : ${userMessage}` },
    );
    addStep(
      "task",
      "Génération de code",
      "Implémenter les changements nécessaires",
      {
        skill: "code-gen",
        depends: ["step_1"],
        prompt: `Développer : ${userMessage}`,
      },
    );
    addStep("task", "Revue et tests", "Vérifier la qualité du code généré", {
      skill: "code-fix",
      depends: ["step_2"],
      prompt: `Revue de code pour : ${userMessage}`,
    });
  } else if (lower.match(/rapport|report|analyse|analy[sz]/)) {
    addStep(
      "task",
      "Collecte de données",
      "Récupérer les données nécessaires",
      {
        skill: "data-analysis",
        prompt: `Collecter les données : ${userMessage}`,
      },
    );
    addStep(
      "task",
      "Analyse des données",
      "Analyser et interpréter les résultats",
      {
        skill: "data-analysis",
        depends: ["step_1"],
        prompt: `Analyser : ${userMessage}`,
      },
    );
    addStep("task", "Génération du rapport", "Créer un rapport structuré", {
      skill: "report-gen",
      depends: ["step_2"],
      prompt: `Rapport sur : ${userMessage}`,
    });
  } else if (lower.match(/seo|référencement|search engine/)) {
    addStep("task", "Audit SEO", "Analyser le positionnement actuel", {
      skill: "seo-content",
      prompt: `Audit SEO : ${userMessage}`,
    });
    addStep("modele", "Template contenu SEO", "Modèle de contenu optimisé", {
      skill: "seo-content",
      prompt: `Contenu SEO pour : ${userMessage}`,
    });
    addStep("task", "Rédaction contenu SEO", "Créer du contenu optimisé", {
      skill: "seo-content",
      depends: ["step_1"],
      prompt: `Rédiger contenu SEO : ${userMessage}`,
    });
    addStep("cron", "Suivi positionnement", "Monitoring SEO hebdomadaire", {
      recurrence: "0 8 * * 1",
      depends: ["step_1"],
      prompt: `Suivi SEO automatique`,
    });
  } else if (lower.match(/compét|concurrent|competitor|benchmark/)) {
    addStep(
      "task",
      "Identification concurrents",
      "Lister et analyser les concurrents",
      {
        skill: "competitor-watch",
        prompt: `Analyser les concurrents : ${userMessage}`,
      },
    );
    addStep(
      "modele",
      "Template veille concurrentielle",
      "Modèle réutilisable",
      {
        skill: "competitor-watch",
        prompt: `Veille concurrentielle : ${userMessage}`,
      },
    );
    addStep(
      "cron",
      "Veille automatique",
      "Surveillance continue des concurrents",
      {
        recurrence: "0 7 * * 1-5",
        depends: ["step_2"],
        prompt: `Veille concurrentielle automatique`,
      },
    );
    addStep("task", "Rapport comparatif", "Générer un benchmark", {
      skill: "report-gen",
      depends: ["step_1"],
      prompt: `Benchmark concurrentiel`,
    });
  } else if (lower.match(/youtube|vidéo|video|montage|capcut|premiere|clip/)) {
    if (lower.match(/capcut|tiktok|reel|short/)) {
      addStep(
        "task",
        "Création draft CapCut",
        "Créer le projet vidéo CapCut avec les paramètres adaptés",
        {
          skill: "capcut-video",
          prompt: `Créer vidéo CapCut : ${userMessage}`,
        },
      );
      addStep(
        "task",
        "Ajout médias et effets",
        "Ajouter vidéos, textes, sous-titres et effets",
        {
          skill: "capcut-video",
          depends: ["step_1"],
          prompt: `Monter la vidéo : ${userMessage}`,
        },
      );
      addStep(
        "task",
        "Export final",
        "Exporter le draft et sauvegarder dans CapCut",
        {
          skill: "capcut-video",
          depends: ["step_2"],
          prompt: `Export final CapCut`,
        },
      );
    } else if (lower.match(/premiere|adobe|timeline|color.?grad/)) {
      addStep(
        "task",
        "Import médias Premiere",
        "Importer les fichiers et créer la séquence",
        {
          skill: "premiere-pro-edit",
          prompt: `Setup projet Premiere Pro : ${userMessage}`,
        },
      );
      addStep(
        "task",
        "Montage timeline",
        "Monter, découper, ajouter effets et transitions",
        {
          skill: "premiere-pro-edit",
          depends: ["step_1"],
          prompt: `Montage Premiere : ${userMessage}`,
        },
      );
      addStep(
        "task",
        "Étalonnage et export",
        "Color grading Lumetri et export final",
        {
          skill: "premiere-pro-edit",
          depends: ["step_2"],
          prompt: `Export Premiere Pro : ${userMessage}`,
        },
      );
    } else {
      addStep(
        "task",
        "Analyse YouTube",
        "Analyser les vidéos et chaînes pertinentes",
        {
          skill: "youtube-analyzer",
          prompt: `Analyser YouTube : ${userMessage}`,
        },
      );
      addStep("task", "Rapport d'analyse", "Synthèse des insights YouTube", {
        skill: "report-gen",
        depends: ["step_1"],
        prompt: `Rapport YouTube pour : ${userMessage}`,
      });
    }
  } else if (lower.match(/excel|spreadsheet|tableur|google.?sheet|xlsx|csv/)) {
    addStep("task", "Préparation données", "Structurer les données sources", {
      skill: "data-analysis",
      prompt: `Préparer les données : ${userMessage}`,
    });
    addStep(
      "task",
      "Génération tableur",
      "Créer le fichier Excel/Sheets avec formules et mise en forme",
      {
        skill: "spreadsheet-gen",
        depends: ["step_1"],
        prompt: `Créer tableur : ${userMessage}`,
      },
    );
  } else if (
    lower.match(
      /word|document|docx|google.?doc|compte.?rendu|mémo|cahier.?des.?charges/,
    )
  ) {
    addStep(
      "task",
      "Rédaction document",
      "Rédiger le document Word/Docs avec mise en page professionnelle",
      {
        skill: "document-gen",
        prompt: `Rédiger document : ${userMessage}`,
      },
    );
    addStep("task", "Vérification", "Relecture et mise en forme finale", {
      skill: "document-gen",
      depends: ["step_1"],
      prompt: `Finaliser document : ${userMessage}`,
    });
  } else if (
    lower.match(
      /powerpoint|pptx|présentation|presentation|slide|pitch|google.?slide/,
    )
  ) {
    addStep(
      "task",
      "Structure de la présentation",
      "Définir le plan et le contenu de chaque slide",
      {
        skill: "presentation-gen",
        prompt: `Structurer présentation : ${userMessage}`,
      },
    );
    addStep(
      "task",
      "Génération slides",
      "Créer le fichier PowerPoint/Slides avec design professionnel",
      {
        skill: "presentation-gen",
        depends: ["step_1"],
        prompt: `Créer présentation : ${userMessage}`,
      },
    );
  } else if (
    lower.match(/pdf|rapport.?pdf|export.?pdf|facture|devis|certificat/)
  ) {
    addStep(
      "task",
      "Collecte contenu",
      "Rassembler les données pour le rapport",
      {
        skill: "data-analysis",
        prompt: `Collecter données : ${userMessage}`,
      },
    );
    addStep(
      "task",
      "Génération PDF",
      "Créer le rapport PDF avec mise en page professionnelle",
      {
        skill: "pdf-report",
        depends: ["step_1"],
        prompt: `Générer PDF : ${userMessage}`,
      },
    );
  } else if (lower.match(/morning|briefing|matin|daily/)) {
    addStep("modele", "Template briefing", "Modèle de briefing quotidien", {
      skill: "morning-briefing",
      prompt: `Briefing : ${userMessage}`,
    });
    addStep("cron", "Briefing automatique", "Briefing chaque matin à 8h", {
      recurrence: "0 8 * * 1-5",
      depends: ["step_1"],
      prompt: `Briefing quotidien automatique`,
    });
  } else {
    // Generic plan
    addStep(
      "task",
      "Analyse de la demande",
      `Analyser et planifier : ${userMessage}`,
      {
        skill: "data-analysis",
        prompt: `Analyser la demande : ${userMessage}`,
      },
    );
    addStep("task", "Exécution principale", `Réaliser : ${userMessage}`, {
      depends: ["step_1"],
      prompt: `Exécuter : ${userMessage}`,
    });
    addStep(
      "task",
      "Vérification et rapport",
      "Vérifier les résultats et créer un rapport",
      {
        skill: "report-gen",
        depends: ["step_2"],
        prompt: `Rapport de résultats`,
      },
    );
    addStep(
      "note",
      "Notes de suivi",
      "Mémoriser le contexte et les résultats",
      { depends: ["step_3"], prompt: `Résumé : ${userMessage}` },
    );
  }

  return {
    summary: `Plan pour : ${userMessage.slice(0, 100)}${userMessage.length > 100 ? "…" : ""}`,
    steps,
    risks: steps.length > 5 ? ["Plan complexe — vérifiez chaque étape"] : [],
    estimated_tokens: steps.length * 3000,
  };
}

export function register(router, ctx) {
  const {
    schemas,
    checkRateLimit,
    runAgenticLoop,
    simulateStream,
    pool,
    getAllSkills,
    broadcastTasks,
    sanitizeObject,
  } = ctx;

  // POST /api/chat — synchronous JSON response
  router.post("/api/chat", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "chat")) return;
    validatedBody(schemas.chat, async (b) => {
      try {
        const {
          messages = [],
          model = "claude-sonnet-4-6",
          permissions = {},
        } = b;
        const result = await runAgenticLoop(messages, model, permissions);
        json(200, result);
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });

  // POST /api/chat/stream — SSE streaming response (plan mode aware)
  router.post("/api/chat/stream", ({ req, res, json, body }) => {
    if (!checkRateLimit(req, res, "chat")) return;
    body(async (b) => {
      const {
        messages = [],
        model = "claude-sonnet-4-6",
        permissions = {},
        executionMode = "auto",
      } = b;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(":ok\n\n");
      try {
        // ── Plan mode: generate plan instead of executing ──────────────────
        if (executionMode === "plan") {
          const lastUser =
            messages.filter((m) => m.role === "user").pop()?.content || "";
          const userText = Array.isArray(lastUser)
            ? lastUser.find((c) => c.type === "text")?.text || ""
            : lastUser;

          await simulateStream("🗺️ Je prépare un plan d'exécution…\n\n", res);
          const plan = await generatePlan(userText, ctx);
          // Send plan as a special SSE event
          res.write(`data: ${JSON.stringify({ plan })}\n\n`);
          await simulateStream(
            `J'ai préparé un plan avec **${plan.steps.length} étapes**. Vérifiez-le ci-dessous et confirmez pour lancer l'exécution.`,
            res,
          );
          res.write(
            `data: ${JSON.stringify({ done: true, toolCalls: [] })}\n\n`,
          );
        } else {
          const result = await runAgenticLoop(messages, model, permissions);
          const text = result?.message || "";
          const toolCalls = result?.toolCalls || [];
          await simulateStream(text, res);
          res.write(`data: ${JSON.stringify({ done: true, toolCalls })}\n\n`);
        }
      } catch (err) {
        await simulateStream(`❌ Erreur : ${err.message}`, res);
        res.write(`data: ${JSON.stringify({ done: true, toolCalls: [] })}\n\n`);
      }
      res.end();
    });
  });

  // POST /api/chat/plan — Generate a structured plan from user description
  router.post("/api/chat/plan", ({ req, res, json, body }) => {
    if (!checkRateLimit(req, res, "chat")) return;
    body(async (b) => {
      try {
        const { message = "", context = "" } = b;
        if (!message.trim()) return json(400, { error: "Message requis" });
        const plan = await generatePlan(
          message + (context ? `\n\nContexte : ${context}` : ""),
          ctx,
        );
        json(200, plan);
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });

  // POST /api/chat/plan/execute — Execute a confirmed plan
  router.post("/api/chat/plan/execute", ({ req, res, json, body }) => {
    if (!checkRateLimit(req, res, "write")) return;
    body(async (b) => {
      try {
        const { steps = [] } = b;
        if (!steps.length)
          return json(400, { error: "Aucune étape à exécuter" });

        const results = [];
        const createdIds = {}; // step_id -> created resource id

        for (const step of steps.slice(0, 25)) {
          const now = new Date().toISOString();
          try {
            switch (step.type) {
              case "task": {
                const id = `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                await pool.query(
                  `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, scheduled_at, created_at, updated_at, cout, tokens_in, tokens_out)
                   VALUES ($1,$2,$3,'planned',$4,$5,$6,$7,$7,0,0,0)`,
                  [
                    id,
                    (step.name || "Tâche Lia").slice(0, 200),
                    null,
                    step.agent || "main",
                    step.skill || null,
                    now,
                    now,
                  ],
                );
                await pool.query(
                  `INSERT INTO task_activities (task_id, type, label, message, created_at)
                   VALUES ($1,'created','Créée par plan Lia',$2,$3)`,
                  [id, step.description || step.name, now],
                );
                createdIds[step.id] = id;
                results.push({
                  stepId: step.id,
                  type: "task",
                  resourceId: id,
                  name: step.name,
                  ok: true,
                });
                break;
              }
              case "modele": {
                const id = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`;
                await pool
                  .query(
                    `INSERT INTO modeles (id, name, description, instructions, agent, llm_model, created_at, updated_at, execution_count)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0)
                   ON CONFLICT (id) DO NOTHING`,
                    [
                      id,
                      step.name,
                      step.description || "",
                      step.prompt || "",
                      step.agent || "main",
                      "meta/llama-3.3-70b-instruct",
                      now,
                    ],
                  )
                  .catch(async () => {
                    await pool.query(
                      `INSERT INTO modeles (id, nom, description, instructions, agent, llm_model, created_at, updated_at, execution_count)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0)`,
                      [
                        id,
                        step.name,
                        step.description || "",
                        step.prompt || "",
                        step.agent || "main",
                        "meta/llama-3.3-70b-instruct",
                        now,
                      ],
                    );
                  });
                createdIds[step.id] = id;
                results.push({
                  stepId: step.id,
                  type: "modele",
                  resourceId: id,
                  name: step.name,
                  ok: true,
                });
                break;
              }
              case "cron": {
                const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`;
                const cronExpr = step.recurrence || "0 9 * * 1-5";
                await pool
                  .query(
                    `INSERT INTO recurrences (id, name, cron_expr, human, timezone, modele_id, active, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)`,
                    [
                      id,
                      step.name,
                      cronExpr,
                      step.description || cronExpr,
                      "Europe/Paris",
                      createdIds[step.depends_on?.[0]] || null,
                      now,
                    ],
                  )
                  .catch(() => {});
                createdIds[step.id] = id;
                results.push({
                  stepId: step.id,
                  type: "cron",
                  resourceId: id,
                  name: step.name,
                  ok: true,
                });
                break;
              }
              case "note": {
                const entry = `\n## ${step.name}\n*${new Date().toLocaleString("fr-FR")}*\n\n${step.prompt || step.description || ""}\n`;
                const { rows } = await pool
                  .query(
                    `SELECT id, content FROM memory WHERE filename='NOTES.md' LIMIT 1`,
                  )
                  .catch(() => ({ rows: [] }));
                if (rows.length) {
                  await pool.query(
                    `UPDATE memory SET content=$1, updated_at=NOW() WHERE id=$2`,
                    [(rows[0].content || "") + entry, rows[0].id],
                  );
                } else {
                  await pool
                    .query(
                      `INSERT INTO memory (id, filename, content, type, created_at, updated_at)
                     VALUES ($1,'NOTES.md',$2,'note',NOW(),NOW())`,
                      [`mem_${Date.now()}`, `# Notes Lia\n${entry}`],
                    )
                    .catch(() => {});
                }
                createdIds[step.id] = "NOTES.md";
                results.push({
                  stepId: step.id,
                  type: "note",
                  resourceId: "NOTES.md",
                  name: step.name,
                  ok: true,
                });
                break;
              }
              case "skill": {
                // Skills are file-based; create a reference task instead
                const id = `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                await pool.query(
                  `INSERT INTO tasks (id, titre, modele_id, statut, agent, skill_name, scheduled_at, created_at, updated_at, cout, tokens_in, tokens_out)
                   VALUES ($1,$2,$3,'planned',$4,$5,$6,$7,$7,0,0,0)`,
                  [
                    id,
                    (step.name || "Skill task").slice(0, 200),
                    null,
                    step.agent || "main",
                    step.skill || null,
                    now,
                    now,
                  ],
                );
                createdIds[step.id] = id;
                results.push({
                  stepId: step.id,
                  type: "task",
                  resourceId: id,
                  name: step.name,
                  ok: true,
                });
                break;
              }
              default:
                results.push({
                  stepId: step.id,
                  type: step.type,
                  ok: false,
                  error: "Type inconnu",
                });
            }
          } catch (err) {
            results.push({
              stepId: step.id,
              type: step.type,
              ok: false,
              error: err.message,
            });
          }
          // Small delay to avoid ID collisions
          await new Promise((r) => setTimeout(r, 30));
        }

        await broadcastTasks?.();
        json(200, {
          ok: true,
          created: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
        });
      } catch (err) {
        json(500, { error: err.message });
      }
    });
  });
}
