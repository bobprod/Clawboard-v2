# Remotion Video Creation Skill

## Description
Crée des vidéos programmatically avec React et Remotion. Supporte les compositions, animations, rendering MP4, et génération de thumbnails.

## Tools
- `remotion_render` - Rend une composition Remotion en fichier MP4
- `remotion_preview` - Génère un aperçu vidéo (spritesheet)
- `remotion_templates_list` - Liste les templates disponibles
- `remotion_composition_create` - Crée une nouvelle composition
- `remotion_thumbnail_generate` - Génère une thumbnail depuis une vidéo

## Configuration
```json
{
  "REMOTION_TEMPLATE_DIR": "/path/to/templates",
  "REMOTION_OUTPUT_DIR": "/path/to/output",
  "REMOTION_FFMPEG_PATH": "/usr/bin/ffmpeg"
}
```

## Usage
```javascript
// Créer une vidéo depuis un template
const result = await remotion_render({
  template: "intro-video",
  props: {
    title: "Mon Titre",
    subtitle: "Sous-titre",
    duration: 10
  },
  output: "output/video.mp4"
});

// Générer une thumbnail
const thumbnail = await remotion_thumbnail_generate({
  video: "output/video.mp4",
  timestamp: 5 // secondes
});
```

## API Reference
- [Remotion Docs](https://www.remotion.dev/)
- [Remotion MCP Server](https://github.com/remotion-dev/skills)
