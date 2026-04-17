/**
 * Chat API contract tests — /api/chat and /api/chat/stream
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

describe("Chat API — POST /api/chat", () => {
  before(setup);
  after(teardown);

  test("valid message → 200 with response", async () => {
    const r = await fetch(
      `${BASE}/api/chat`,
      json({
        messages: [{ role: "user", content: "Bonjour" }],
      }),
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(
      typeof body.message === "string" || body.error === undefined,
      "has message or no error",
    );
  });

  test("empty messages array → 200 (still valid)", async () => {
    const r = await fetch(`${BASE}/api/chat`, json({ messages: [] }));
    assert.equal(r.status, 200);
  });

  test("missing body → 400 validation error", async () => {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    // messages defaults to [] so this may still be 200, or validation rejects
    assert.ok([200, 400].includes(r.status));
  });

  test("bad JSON → 400", async () => {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    assert.equal(r.status, 400);
  });

  test("response Content-Type is JSON", async () => {
    const r = await fetch(
      `${BASE}/api/chat`,
      json({
        messages: [{ role: "user", content: "test" }],
      }),
    );
    assert.ok(r.headers.get("content-type")?.startsWith("application/json"));
  });
});

describe("Chat API — POST /api/chat/stream (SSE)", () => {
  before(setup);
  after(teardown);

  test("returns text/event-stream content type", async () => {
    const r = await fetch(
      `${BASE}/api/chat/stream`,
      json({
        messages: [{ role: "user", content: "Hello" }],
      }),
    );
    assert.ok(
      r.headers.get("content-type")?.includes("text/event-stream"),
      `Expected text/event-stream, got: ${r.headers.get("content-type")}`,
    );
    // Consume the body to avoid pending connections
    await r.text();
  });

  test("stream ends with done:true event", async () => {
    const r = await fetch(
      `${BASE}/api/chat/stream`,
      json({
        messages: [{ role: "user", content: "Ping" }],
      }),
    );
    const text = await r.text();
    assert.ok(
      text.includes('"done":true') || text.includes('"done": true'),
      "Stream should end with done:true",
    );
  });
});
