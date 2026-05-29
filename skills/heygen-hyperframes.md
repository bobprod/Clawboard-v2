# Heygen Hyperframes Skill

## Description
Crée des frames vidéo interactives avec Heygen. Avatars AI, overlays, QR codes, call-to-action dynamiques pour vidéos engageantes.

## Tools
- `hyperframes_create` - Crée un nouveau hyperframe
- `hyperframes_list` - Liste les hyperframes existants
- `hyperframes_update` - Met à jour un hyperframe
- `hyperframes_delete` - Supprime un hyperframe
- `hyperframes_render` - Rend un hyperframe en vidéo
- `avatar_generate` - Génère un avatar parlant
- `avatar_list` - Liste les avatars disponibles
- `overlay_add` - Ajoute un overlay (QR code, CTA, texte)
- `overlay_remove` - Supprime un overlay

## Configuration
```json
{
  "HEYGEN_API_KEY": "your-api-key",
  "HEYGEN_WORKSPACE_ID": "workspace-id",
  "HEYGEN_WEBHOOK_URL": "https://your-server.com/webhook"
}
```

## Usage
```javascript
// Créer un hyperframe avec avatar
const frame = await hyperframes_create({
  name: "Product Demo",
  avatar_id: "avatar-123",
  script: "Bonjour, voici notre produit...",
  overlays: [
    {
      type: "qr_code",
      url: "https://example.com",
      position: "bottom-right",
      start_time: 5,
      end_time: 15
    },
    {
      type: "cta_button",
      text: "Acheter maintenant",
      url: "https://shop.example.com",
      position: "center",
      start_time: 10
    }
  ]
});

// Rendu vidéo
const video = await hyperframes_render({
  hyperframe_id: frame.id,
  resolution: "1080p",
  format: "mp4"
});

// Générer un avatar personnalisé
const avatar = await avatar_generate({
  name: "Mon Avatar",
  image_url: "https://example.com/photo.jpg",
  voice_id: "voice-123"
});
```

## API Reference
- [Heygen Hyperframes Docs](https://hyperframes.heygen.com/)
- [Heygen API Docs](https://docs.heygen.com/)
