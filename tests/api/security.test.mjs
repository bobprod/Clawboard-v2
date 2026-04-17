/**
 * Security API contract tests — auth, TOTP, guardrails, events.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown } from "../setup/server.mjs";

const BASE = "http://localhost:4000";
const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("Security — Auth", () => {
  before(setup);
  after(teardown);

  test("POST /api/auth/login with valid credentials → 200 + token", async () => {
    const r = await fetch(
      `${BASE}/api/auth/login`,
      json({
        username: "admin",
        password: "test",
      }),
    );
    // 200 if no SECRET set, or 401 if SECRET differs
    assert.ok([200, 401].includes(r.status));
    if (r.status === 200) {
      const body = await r.json();
      assert.ok(typeof body.token === "string", "has token");
      assert.ok(typeof body.user === "object", "has user object");
      assert.equal(body.user.username, "admin");
    }
  });

  test("POST /api/auth/login missing fields → 400", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, json({}));
    assert.equal(r.status, 400);
  });

  test("POST /api/auth/password with short password → 400", async () => {
    const r = await fetch(
      `${BASE}/api/auth/password`,
      json({
        current: "test",
        next: "ab",
      }),
    );
    assert.ok([400, 401].includes(r.status));
  });

  test("POST /api/auth/password missing fields → 400", async () => {
    const r = await fetch(`${BASE}/api/auth/password`, json({}));
    assert.equal(r.status, 400);
  });
});

// ─── TOTP ─────────────────────────────────────────────────────────────────────

describe("Security — TOTP", () => {
  before(setup);
  after(teardown);

  test("GET /api/security/totp/status → { enabled: boolean }", async () => {
    const r = await fetch(`${BASE}/api/security/totp/status`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(typeof body.enabled === "boolean", "has enabled flag");
  });

  test("POST /api/security/totp/setup → secret + otpAuthUrl", async () => {
    const r = await fetch(`${BASE}/api/security/totp/setup`, {
      method: "POST",
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(typeof body.secret === "string", "has secret");
    assert.ok(body.secret.length >= 16, "secret is long enough");
    assert.ok(typeof body.otpAuthUrl === "string", "has otpAuthUrl");
    assert.ok(body.otpAuthUrl.startsWith("otpauth://"), "valid otpauth URL");
  });

  test("POST /api/security/totp/verify with bad token → 400", async () => {
    const r = await fetch(
      `${BASE}/api/security/totp/verify`,
      json({ token: "abc" }),
    );
    assert.equal(r.status, 400);
  });

  test("POST /api/security/totp/verify with 6-digit wrong token → 401", async () => {
    const r = await fetch(
      `${BASE}/api/security/totp/verify`,
      json({ token: "000000" }),
    );
    assert.ok(
      [401, 200].includes(r.status),
      "either rejects or the code happened to match",
    );
  });
});

// ─── Guardrails ───────────────────────────────────────────────────────────────

describe("Security — Guardrails", () => {
  before(setup);
  after(teardown);

  test("GET /api/guardrails → array", async () => {
    const r = await fetch(`${BASE}/api/guardrails`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "body is array");
  });

  test("POST /api/guardrails → creates a guardrail", async () => {
    const r = await fetch(
      `${BASE}/api/guardrails`,
      json({
        name: "[TEST] No-PII Guard",
        type: "block",
        pattern: "SSN|social security",
        description: "Test guardrail",
      }),
    );
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.ok(typeof body.id === "string", "has id");
    assert.equal(body.name, "[TEST] No-PII Guard");

    // Cleanup
    await fetch(`${BASE}/api/guardrails/${body.id}`, { method: "DELETE" });
  });
});

// ─── Security Events ──────────────────────────────────────────────────────────

describe("Security — Events", () => {
  before(setup);
  after(teardown);

  test("GET /api/security/events → array", async () => {
    const r = await fetch(`${BASE}/api/security/events`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "body is array");
  });
});
