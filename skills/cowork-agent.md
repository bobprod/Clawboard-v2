---
name: cowork-agent
category: automation
tags:
  [cowork, agent, multi-step, file-access, sub-agents, long-running, planning]
description: >
  Agent Cowork autonome — planification multi-étapes, accès fichiers, sous-agents,
  human-in-the-loop. Inspiré de Claude Cowork + OpenWork + Eigent.
models: [claude-sonnet-4, claude-opus-4, gpt-4o, deepseek-v3]
---

# Cowork Agent — Votre Co-Équipier IA Autonome

## Objectif

Exécuter des tâches complexes en multi-étapes comme un vrai collaborateur :
lire/écrire des fichiers, planifier, coordonner des sous-agents, reporter la progression,
demander des approbations humaines quand nécessaire.

## Différence avec un chatbot

```
Chatbot : Répond aux questions → Vous faites le travail
Cowork  : Reçoit un objectif → Planifie → Exécute → Délivre le résultat
```

## Architecture Cowork

```
Utilisateur                  Cowork Agent                    Workspace
    │                            │                              │
    ├─ "Prépare un rapport" ────►│                              │
    │                            ├─ update_plan([...]) ────────►│
    │                            ├─ read_file("data.csv") ─────►│
    │                            ├─ spawn_subagent("analyst") ─►│
    │   ◄── report_progress(30%) ┤                              │
    │                            ├─ write_file("rapport.md") ──►│
    │   ◄── report_progress(80%) ┤                              │
    │                            ├─ write_file("charts.png") ──►│
    │   ◄── ✅ Tâche terminée ──┤                              │
```

## Modes de fonctionnement

### Autonomous (défaut)

L'agent exécute toutes les étapes sans demander. Idéal pour les tâches de routine.

### Supervised

L'agent demande approbation avant chaque écriture de fichier ou commande shell.
Utilise `request_approval` pour les actions à risque.

### Manual

L'agent propose les actions mais ne les exécute pas. L'humain valide étape par étape.

## Outils de l'agent

### Fichiers

- `list_files(path)` — lister le workspace
- `read_file(path)` — lire un fichier
- `write_file(path, content)` — écrire/créer un fichier
- `file_info(path)` — taille, date de modification

### Planification

- `update_plan(steps)` — définir/mettre à jour le plan de travail
  Chaque étape : `{ title, status: pending|in_progress|done|skipped, detail }`

### Sous-agents

- `spawn_subagent(role, task, context)` — déléguer à un spécialiste
  Rôles : researcher, coder, reviewer, writer, analyst

### Shell (sandboxé)

- `exec_command(command, timeout)` — exécuter dans le workspace
  Allowlist : ls, cat, grep, node, python, git, npm, curl, jq, etc.

### Progression

- `report_progress(percent, message)` — informer le frontend
- `request_approval(action, reason, risk)` — demander approbation humaine

### Computer Use (optionnel)

Quand activé, ajoute : screenshot, click, type, key, scroll, mouse_move, wait

## Workflow type d'une session

1. **Réception** — L'utilisateur décrit l'objectif en langage naturel
2. **Planification** — L'agent crée un plan structuré (update_plan)
3. **Exécution** — Chaque étape est réalisée avec les outils disponibles
4. **Vérification** — Après chaque action, l'agent vérifie le résultat
5. **Rapport** — Progression en temps réel via SSE + rapport final
6. **Livraison** — Fichiers générés accessibles dans le workspace

## Sessions longues

Les sessions Cowork persistent au-delà d'une conversation :

- État sauvegardé (plan, fichiers, messages)
- Reprise possible après pause ou approbation
- Workspace isolé par session (`~/.clawboard/cowork/<session-id>/`)
- Historique complet des actions (audit trail)

## Sous-agents (Multi-Agent)

Le Cowork Agent peut déléguer des sous-tâches à des agents spécialisés :

| Rôle       | Spécialité                        |
| ---------- | --------------------------------- |
| researcher | Recherche web, analyse de sources |
| coder      | Génération et correction de code  |
| reviewer   | Relecture, QA, validation         |
| writer     | Rédaction, mise en forme          |
| analyst    | Analyse de données, graphiques    |

Les sous-agents travaillent en parallèle et leurs résultats sont fusionnés.

## Sécurité

- **Workspace isolé** : chaque session a son propre dossier
- **Extensions bloquées** : .exe, .bat, .cmd, .ps1, .msi, .dll
- **Taille max** : 512 KB par fichier
- **Commandes sandboxées** : allowlist stricte, patterns dangereux bloqués
- **Approbation humaine** : mode supervised pour les opérations sensibles
- **Timeout** : 25 itérations max, 30s par commande shell

## Cas d'usage

- Préparer un rapport d'analyse à partir de données
- Organiser et restructurer un dossier de fichiers
- Créer un site web complet (HTML/CSS/JS) à partir d'un brief
- Auditer le code d'un projet et corriger les bugs
- Rédiger de la documentation technique
- Automatiser des tâches administratives récurrentes
- Créer des présentations à partir de notes

## Métriques d'une session

- **Tokens** : consommation entrée/sortie
- **Coût** : estimé en $ (input × 0.003 + output × 0.015 / 1000)
- **Itérations** : nombre de tours dans la boucle agent
- **Fichiers** : créés, modifiés, lus
- **Sous-agents** : nombre et statut
- **Durée** : temps total de la session
