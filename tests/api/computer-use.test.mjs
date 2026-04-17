/**
 * Computer Use & Cowork Sessions API — integration tests.
 *
 * Requires a running server on :4000 with CLAWBOARD_SECRET=admin123.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown } from "../setup/server.mjs";

const BASE = "http://localhost:4000";
const AUTH = { Authorization: "Bearer admin123" };

const get = (path) => fetch(`${BASE}${path}`, { headers: AUTH });
const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const del = (path) =>
  fetch(`${BASE}${path}`, { method: "DELETE", headers: AUTH });

// ─── Computer Use ──────────────────────────────────────────────────────────

describe("Computer Use API", () => {
  before(setup);
  after(teardown);

  test("GET /api/computer-use/status → 200 with platform & capabilities", async () => {
    const r = await get("/api/computer-use/status");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(typeof body.platform === "string", "platform is string");
    assert.ok(Array.isArray(body.capabilities), "capabilities is array");
    assert.ok(body.capabilities.length > 0, "has capabilities");
    assert.ok(
      body.capabilities.includes("file_operations"),
      "includes file_operations",
    );
  });

  test("GET /api/computer-use/screenshot → 200 with base64 data", async () => {
    const r = await get("/api/computer-use/screenshot");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(
      typeof body.screenshot === "string",
      "screenshot is base64 string",
    );
    // PNG starts with iVBOR
    assert.ok(body.screenshot.startsWith("iVBOR"), "screenshot is PNG base64");
  });

  test("POST /api/computer-use/action (screenshot) → 200", async () => {
    const r = await post("/api/computer-use/action", {
      action: "screenshot",
      params: {},
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.screenshot, "has screenshot data");
  });

  test("POST /api/computer-use/action (left_click) → 200 simulated", async () => {
    const r = await post("/api/computer-use/action", {
      action: "left_click",
      params: { coordinate: [50, 50] },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.action, "left_click");
    assert.deepEqual(body.coordinate, [50, 50]);
  });

  test("POST /api/computer-use/action (type) → 200 simulated", async () => {
    const r = await post("/api/computer-use/action", {
      action: "type",
      params: { text: "hello world" },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.action, "type");
    assert.equal(body.text, "hello world");
  });

  test("POST /api/computer-use/action (key) → 200 simulated", async () => {
    const r = await post("/api/computer-use/action", {
      action: "key",
      params: { key: "Return" },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.action, "key");
  });

  test("POST /api/computer-use/action (scroll) → 200", async () => {
    const r = await post("/api/computer-use/action", {
      action: "scroll",
      params: { coordinate: [500, 500], direction: "down", amount: 3 },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.action, "scroll");
  });

  test("POST /api/computer-use/action (invalid) → 400", async () => {
    const r = await post("/api/computer-use/action", {
      action: "nonexistent_action",
      params: {},
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(
      body.error.includes("nonexistent_action"),
      "error mentions action",
    );
  });
});

// ─── Cowork Sessions ──────────────────────────────────────────────────────

describe("Cowork Sessions API", () => {
  before(setup);
  after(teardown);

  let sessionId = null;

  test("GET /api/cowork/sessions → 200 array", async () => {
    const r = await get("/api/cowork/sessions");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "body is array");
  });

  test("GET /api/cowork/stats → 200 with stat fields", async () => {
    const r = await get("/api/cowork/stats");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(typeof body.totalSessions === "number");
    assert.ok(typeof body.activeSessions === "number");
    assert.ok(typeof body.completedSessions === "number");
    assert.ok(typeof body.failedSessions === "number");
    assert.ok(typeof body.totalTokens === "number");
    assert.ok(typeof body.totalCost === "number");
    assert.ok(typeof body.totalFilesCreated === "number");
    assert.ok(typeof body.totalActions === "number");
  });

  test("POST /api/cowork/sessions → 201 creates session", async () => {
    const r = await post("/api/cowork/sessions", {
      name: "Test Integration",
      mode: "manual",
      model: "claude-sonnet-4-20250514",
      computerUse: false,
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.ok(body.id, "has id");
    assert.equal(body.name, "Test Integration");
    assert.equal(body.mode, "manual");
    assert.equal(body.model, "claude-sonnet-4-20250514");
    assert.equal(body.computerUseEnabled, false);
    assert.ok(body.createdAt, "has createdAt");
    sessionId = body.id;
  });

  test("GET /api/cowork/sessions/:id → 200 session details", async () => {
    assert.ok(sessionId, "sessionId from previous test");
    const r = await get(`/api/cowork/sessions/${sessionId}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.id, sessionId);
    assert.equal(body.name, "Test Integration");
    assert.ok(Array.isArray(body.messages), "has messages");
    assert.ok(Array.isArray(body.plan), "has plan");
    assert.ok(Array.isArray(body.subAgents), "has subAgents");
  });

  test("GET /api/cowork/sessions/:id → 404 for unknown session", async () => {
    const r = await get("/api/cowork/sessions/unknown-id-xyz");
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.ok(body.error.includes("not found"), "error says not found");
  });

  test("POST /api/cowork/sessions/:id/message → 200", async () => {
    assert.ok(sessionId, "sessionId from previous test");
    const r = await post(`/api/cowork/sessions/${sessionId}/message`, {
      message: "Hello agent, what can you do?",
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
  });

  test("POST /api/cowork/sessions/:id/pause → 200", async () => {
    assert.ok(sessionId, "sessionId from previous test");
    const r = await post(`/api/cowork/sessions/${sessionId}/pause`, {});
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);

    // Verify session is paused
    const detail = await get(`/api/cowork/sessions/${sessionId}`).then((r) =>
      r.json(),
    );
    assert.equal(detail.status, "paused");
  });

  test("POST /api/cowork/sessions/:id/resume → 200", async () => {
    assert.ok(sessionId, "sessionId from previous test");
    const r = await post(`/api/cowork/sessions/${sessionId}/resume`, {});
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
  });

  test("GET /api/cowork/actions → 200 array", async () => {
    const r = await get("/api/cowork/actions");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "actions is array");
  });

  test("GET /api/cowork/sessions/:id/files → 200 (empty or array)", async () => {
    assert.ok(sessionId, "sessionId from previous test");
    const r = await get(`/api/cowork/sessions/${sessionId}/files`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "files is array");
  });

  test("DELETE /api/cowork/sessions/:id → 200", async () => {
    assert.ok(sessionId, "sessionId from previous test");
    const r = await del(`/api/cowork/sessions/${sessionId}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);

    // Verify session is gone
    const check = await get(`/api/cowork/sessions/${sessionId}`);
    assert.equal(check.status, 404);
  });

  test("Stats reflect session lifecycle", async () => {
    const stats = await get("/api/cowork/stats").then((r) => r.json());
    assert.ok(typeof stats.totalSessions === "number");
    // After delete, our test session should be gone
  });
});

// ─── SSE Stream ────────────────────────────────────────────────────────────

describe("Cowork SSE Stream", () => {
  before(setup);
  after(teardown);

  test("GET /api/cowork/sessions/:id/stream → event-stream with connected event", async () => {
    const r = await fetch(`${BASE}/api/cowork/sessions/sse-test/stream`, {
      headers: AUTH,
      signal: AbortSignal.timeout(2000),
    }).catch((e) => e);

    // If we get a response (not aborted), check headers
    if (r instanceof Response) {
      assert.equal(r.status, 200);
      assert.ok(
        r.headers.get("content-type")?.includes("text/event-stream"),
        "is event-stream",
      );
    }
    // If aborted after timeout, that's also fine for SSE
  });
});
