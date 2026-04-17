---
name: computer-use
category: automation
tags:
  [desktop, screen-control, mouse, keyboard, screenshot, computer-use, claude]
description: >
  Contrôle autonome du bureau — capture d'écran, souris, clavier, scroll.
  Inspiré de Claude Computer Use (Anthropic) + alternatives open-source.
models: [claude-sonnet-4, claude-opus-4, gpt-4o]
---

# Computer Use — Contrôle Autonome du Bureau

## Objectif

Permettre à l'agent IA de voir et contrôler un environnement de bureau comme un humain :
captures d'écran, mouvements de souris, clics, saisie clavier, scroll.

## Architecture

```
Agent IA → API /api/computer-use/action → Bridge Desktop → OS
             ↑                                          ↓
         Tool Results ← Screenshot base64 ← Capture écran
```

## Outils disponibles

### Screenshot (capture d'écran)

- Prendre une photo de l'écran actuel
- Retourne une image base64 (PNG)
- Résolution recommandée : 1920×1080 redimensionné à 1024×768 pour l'API

### Mouse Control (souris)

- `left_click(coordinate)` — clic gauche à [x, y]
- `right_click(coordinate)` — clic droit
- `double_click(coordinate)` — double-clic
- `mouse_move(coordinate)` — déplacer le curseur
- `left_click_drag(startCoordinate, coordinate)` — glisser-déposer

### Keyboard (clavier)

- `type(text)` — saisir du texte
- `key(key)` — appuyer sur une touche ou combo (ctrl+s, enter, tab, alt+f4)

### Scroll

- `scroll(coordinate, direction, amount)` — up/down/left/right

### Wait

- `wait(duration)` — attendre N millisecondes entre les actions

## Boucle Agent (Agent Loop)

```
1. L'utilisateur donne un objectif
2. L'agent prend un screenshot
3. L'agent analyse l'écran et décide de l'action
4. L'agent exécute l'action (clic, saisie, etc.)
5. L'agent prend un nouveau screenshot
6. Vérifier le résultat — si OK, continuer, sinon réessayer
7. Répéter jusqu'à objectif atteint ou max itérations
```

## Bonnes pratiques

1. **Toujours prendre un screenshot après chaque action** pour vérifier le résultat
2. **Préférer les raccourcis clavier** aux clics quand possible (plus fiable)
3. **Limiter à 25 itérations max** pour éviter les boucles infinies
4. **Utiliser le mode supervisé** pour les actions à risque (connexion, formulaires)
5. **Redimensionner les screenshots** pour l'API (max 1568px côté long)

## Scaling de coordonnées

Si l'écran natif est 1920×1080 mais le screenshot envoyé à l'IA est 1024×768 :

```
scale = 1024 / 1920 = 0.533
coordonnée_écran = coordonnée_IA / scale
```

Toujours appliquer le scale factor inverse lors de l'exécution des clics.

## Sécurité NemoClaw

- **Environnement sandboxé** : Docker container ou VM dédiée recommandée
- **Pas d'accès aux credentials** : ne jamais remplir des mots de passe automatiquement
- **Isolation réseau** : limiter l'accès aux domaines via allowlist
- **Human-in-the-loop** : demander confirmation avant les actions destructives
- **Protection prompt injection** : les pages web peuvent contenir des instructions malveillantes
- **Timeout** : max 120s par action, max 25 itérations par session

## Cas d'usage

- Remplir des formulaires web automatiquement
- Extraire des données depuis des applications desktop
- Tester des interfaces graphiques
- Automatiser des tâches répétitives dans des apps sans API
- Navigation web complexe (recherche, comparaison, scraping visuel)

## Limitations

- Latence : ~2-5s par itération (screenshot + analyse + action)
- Précision des coordonnées : ±5px possible
- Spreadsheets : interactions complexes, préférer les raccourcis
- Login : risque de prompt injection, toujours superviser
