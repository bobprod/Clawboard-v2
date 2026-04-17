// ─── Settings Routes (API keys, filesystem, notifications) ──────────────────

export function register(router, ctx) {
  const { pool, sanitizeObject, encryptKey, state } = ctx;

  // ── Filesystem access ─────────────────────────────────────────────────────

  router.get("/api/settings/filesystem", ({ json }) => {
    json(200, {
      enabled: state.fsGlobalEnabled,
      allowedPaths: state.fsAllowedPaths,
      blocked: state.FS_BLOCKED,
    });
  });

  router.post("/api/settings/filesystem", ({ json, body }) => {
    body((b) => {
      if (typeof b.enabled === "boolean") state.fsGlobalEnabled = b.enabled;
      if (Array.isArray(b.allowedPaths))
        state.fsAllowedPaths = b.allowedPaths.filter(
          (p) => typeof p === "string" && p.length > 2,
        );
      if (
        b.addPath &&
        typeof b.addPath === "string" &&
        b.addPath.length > 2 &&
        !state.fsAllowedPaths.includes(b.addPath)
      )
        state.fsAllowedPaths.push(b.addPath);
      if (b.removePath)
        state.fsAllowedPaths = state.fsAllowedPaths.filter(
          (p) => p !== b.removePath,
        );
      json(200, {
        ok: true,
        enabled: state.fsGlobalEnabled,
        allowedPaths: state.fsAllowedPaths,
      });
    });
  });

  // ── API Keys (BYOK) ──────────────────────────────────────────────────────

  router.get("/api/settings/keys", ({ json }) => {
    const status = Object.fromEntries(
      Object.entries(state.apiKeys).map(([k, v]) => [
        k,
        v && v.trim().length > 0,
      ]),
    );
    json(200, { configured: status });
  });

  router.post("/api/settings/keys", ({ json, body }) => {
    body(async (b) => {
      const sanitized = sanitizeObject(b);
      for (const [k, v] of Object.entries(sanitized)) {
        if (typeof v === "string" && v.trim().length > 0) {
          const encrypted = encryptKey(v.trim());
          state.apiKeys[k] = encrypted;
          await pool.query(
            `INSERT INTO api_keys (provider, encrypted_value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (provider) DO UPDATE SET encrypted_value=$2, updated_at=NOW()`,
            [k, encrypted],
          );
        } else {
          delete state.apiKeys[k];
          await pool.query("DELETE FROM api_keys WHERE provider=$1", [k]);
        }
      }
      json(200, { ok: true, configured: Object.keys(state.apiKeys) });
    });
  });

  router.delete("/api/settings/keys", ({ json, body }) => {
    body(async (b) => {
      if (b.provider) {
        delete state.apiKeys[b.provider];
        await pool.query("DELETE FROM api_keys WHERE provider=$1", [
          b.provider,
        ]);
      }
      json(200, { ok: true });
    });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  router.get("/api/settings/notifications", ({ json }) => {
    json(200, state.notificationsConfig);
  });

  router.post("/api/settings/notifications", ({ json, body }) => {
    body((b) => {
      const safe = sanitizeObject(b);
      state.notificationsConfig = { ...state.notificationsConfig, ...safe };
      json(200, { ok: true, config: state.notificationsConfig });
    });
  });

  router.post("/api/settings/notifications/test", ({ json, body }) => {
    body((b) => {
      const { channel } = sanitizeObject(b);
      const cfg = state.notificationsConfig;
      const missing =
        channel === "telegram"
          ? !cfg.telegram_token || !cfg.telegram_chat_id
          : channel === "discord"
            ? !cfg.discord_webhook
            : channel === "email"
              ? !cfg.email_smtp || !cfg.email_to
              : channel === "webhook"
                ? !cfg.webhook_url
                : true;
      if (missing)
        return json(400, { message: `Configuration ${channel} incomplète.` });
      json(200, { ok: true, message: `Message test envoyé via ${channel}.` });
    });
  });
}
