/**
 * PWAUpdateToast — affiche une bannière discrète quand une nouvelle version
 * du Service Worker est disponible. Bouton "Mettre à jour" recharge la page.
 * Bouton "Installer" déclenche la prompt d'installation PWA (A2HS).
 */
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Download, RefreshCw, X } from "lucide-react";

export function PWAUpdateToast() {
  // ─── Service Worker update ────────────────────────────────────────────────
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Poll toutes les 60 minutes pour détecter une mise à jour
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });

  // ─── Install prompt (A2HS) ────────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      setShowInstall(false);
    }
  };

  // ─── Rien à afficher ────────────────────────────────────────────────────
  if (!needRefresh && !showInstall) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {/* Update toast */}
      {needRefresh && (
        <div
          style={{
            pointerEvents: "all",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-surface, #1a1a2e)",
            border: "1px solid var(--brand-accent, #8b5cf6)",
            borderRadius: 14,
            padding: "12px 16px",
            boxShadow: "0 8px 32px rgba(139,92,246,0.25)",
            color: "var(--text-primary, #fff)",
            fontSize: "0.875rem",
            maxWidth: 380,
            animation: "slideUp 0.3s ease",
          }}
        >
          <RefreshCw size={16} style={{ color: "var(--brand-accent, #8b5cf6)", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>Mise à jour disponible</strong> — nouvelle version de ClawBoard prête.
          </span>
          <button
            onClick={() => updateServiceWorker(true)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "var(--brand-accent, #8b5cf6)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "12px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Mettre à jour
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted, #6b7280)",
              display: "flex",
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Install toast */}
      {showInstall && (
        <div
          style={{
            pointerEvents: "all",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-surface, #1a1a2e)",
            border: "1px solid rgba(139,92,246,0.4)",
            borderRadius: 14,
            padding: "12px 16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            color: "var(--text-primary, #fff)",
            fontSize: "0.875rem",
            maxWidth: 380,
            animation: "slideUp 0.3s ease",
          }}
        >
          <Download size={16} style={{ color: "#10b981", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>Installer ClawBoard</strong> — accès rapide depuis le bureau.
          </span>
          <button
            onClick={handleInstall}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "#10b981",
              color: "#fff",
              fontWeight: 700,
              fontSize: "12px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Installer
          </button>
          <button
            onClick={() => setShowInstall(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted, #6b7280)",
              display: "flex",
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
