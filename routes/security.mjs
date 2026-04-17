// ─── Security Routes (auth, TOTP, guardrails, events) ───────────────────────
import crypto from "crypto";

// TOTP helpers (RFC 6238, HMAC-SHA1)
function totpGenerateSecret() {
  return crypto
    .randomBytes(20)
    .toString("base64")
    .replace(/[^A-Z2-7]/gi, "A")
    .toUpperCase()
    .slice(0, 32);
}
function totpHotp(secretBase32, counter) {
  const key = Buffer.from(
    secretBase32.replace(/\s/g, "").toUpperCase().padEnd(32, "="),
    "base64",
  );
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const mac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    (((mac[offset] & 0x7f) << 24) |
      ((mac[offset + 1] & 0xff) << 16) |
      ((mac[offset + 2] & 0xff) << 8) |
      (mac[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}
function totpVerify(secret, token, window = 1) {
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    if (totpHotp(secret, counter + i) === token) return true;
  }
  return false;
}

export function register(router, ctx) {
  const { pool, schemas, checkRateLimit, SECRET } = ctx;

  // ── Auth — login ──────────────────────────────────────────────────────────

  router.post("/api/auth/login", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "login")) return;
    validatedBody(schemas.login, (b) => {
      const { username, password } = b;
      if (!username || !password)
        return json(400, { message: "Identifiant et mot de passe requis." });
      if (SECRET && password !== SECRET)
        return json(401, { message: "Identifiants incorrects." });
      const token =
        SECRET ||
        `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      json(200, {
        token,
        user: {
          username,
          displayName: username,
          role: username === "admin" ? "admin" : "user",
          avatar: null,
        },
      });
    });
  });

  // ── Auth — change password ────────────────────────────────────────────────

  router.post("/api/auth/password", ({ req, res, json, validatedBody }) => {
    if (!checkRateLimit(req, res, "login")) return;
    validatedBody(schemas.changePassword, (b) => {
      const { current, next } = b;
      if (!current || !next) return json(400, { message: "Champs requis." });
      if (SECRET && current !== SECRET)
        return json(401, { message: "Mot de passe actuel incorrect." });
      if (next.length < 6)
        return json(400, {
          message: "Le mot de passe doit contenir au moins 6 caractères.",
        });
      json(200, { ok: true });
    });
  });

  // ── TOTP MFA ──────────────────────────────────────────────────────────────

  router.get("/api/security/totp/status", ({ json }) => {
    pool
      .query(`SELECT value FROM settings WHERE key='totp_enabled' LIMIT 1`)
      .then(({ rows }) => {
        json(200, { enabled: rows[0]?.value === "true" });
      })
      .catch(() => json(200, { enabled: false }));
  });

  router.post("/api/security/totp/setup", ({ json }) => {
    const secret = totpGenerateSecret();
    pool
      .query(
        `INSERT INTO settings (key,value) VALUES ('totp_pending_secret',$1) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
        [secret],
      )
      .catch(() => {});
    const otpAuthUrl = `otpauth://totp/ClawBoard:admin?secret=${secret}&issuer=ClawBoard&algorithm=SHA1&digits=6&period=30`;
    json(200, { secret, otpAuthUrl });
  });

  router.post("/api/security/totp/verify", ({ json, body }) => {
    body(async (b) => {
      const token = String(b.token || "").trim();
      if (!/^\d{6}$/.test(token))
        return json(400, { error: "Token invalide (6 chiffres requis)" });
      const { rows } = await pool
        .query(
          `SELECT value FROM settings WHERE key='totp_pending_secret' LIMIT 1`,
        )
        .catch(() => ({ rows: [] }));
      const secret = rows[0]?.value;
      if (!secret)
        return json(400, {
          error:
            "Aucun setup TOTP en cours. Relancez /api/security/totp/setup.",
        });
      if (!totpVerify(secret, token))
        return json(401, { error: "Code incorrect ou expiré" });
      await pool
        .query(
          `INSERT INTO settings (key,value) VALUES ('totp_secret',$1) ON CONFLICT (key) DO UPDATE SET value=$1`,
          [secret],
        )
        .catch(() => {});
      await pool
        .query(
          `INSERT INTO settings (key,value) VALUES ('totp_enabled','true') ON CONFLICT (key) DO UPDATE SET value='true'`,
        )
        .catch(() => {});
      await pool
        .query(`DELETE FROM settings WHERE key='totp_pending_secret'`)
        .catch(() => {});
      json(200, { ok: true, message: "TOTP activé avec succès" });
    });
  });

  router.post("/api/security/totp/disable", ({ json }) => {
    Promise.all([
      pool.query(
        `INSERT INTO settings (key,value) VALUES ('totp_enabled','false') ON CONFLICT (key) DO UPDATE SET value='false'`,
      ),
      pool.query(
        `DELETE FROM settings WHERE key IN ('totp_secret','totp_pending_secret')`,
      ),
    ])
      .then(() => json(200, { ok: true, message: "TOTP désactivé" }))
      .catch((err) => json(500, { error: err.message }));
  });

  // ── Communication Pairing ──────────────────────────────────────────────────

  router.get("/api/pairing/qr", ({ req, json }) => {
    const defaultPlatform = "telegram";
    const url = new URL(req.url, "http://localhost");
    const platform = url.searchParams.get("platform") || defaultPlatform;
    const targetId = url.searchParams.get("targetId") || "";
    
    const token = crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresIn = 300; // seconds

    let pairingUrl = "";
    let instructions = [];

    if (platform === "telegram") {
      pairingUrl = `https://t.me/nemoclaw_bot?start=${token}`;
      instructions = [
        "Ouvrez Telegram sur votre téléphone",
        "Scannez le QR code ou cliquez sur le lien",
        "Envoyez /start au bot Nemoclaw",
        "Le Chat ID sera lié automatiquement",
      ];
    } else if (platform === "discord") {
      const clientId = process.env.VITE_DISCORD_CLIENT_ID || "CLIENT_ID_NON_CONFIGURE";
      pairingUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&state=${token}`;
      instructions = [
        "Scannez le QR code ou ouvrez le lien",
        "Autorisez le bot Nemoclaw dans votre serveur",
        "Choisissez le salon de destination",
        "L'ID du salon sera enregistré automatiquement",
      ];
    } else {
      pairingUrl = `https://clawboard.local/pair/${token}`;
      instructions = [
        "Scannez le QR code pour initier le pairing",
        "Suivez les instructions dans votre navigateur",
      ];
    }

    json(200, { token, pairingUrl, expiresIn, instructions, targetId, platform });
  });
}
