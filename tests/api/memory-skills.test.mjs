/**
 * Memory & Skills API contract tests.
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

// ─── Memory ───────────────────────────────────────────────────────────────────

describe("Memory API", () => {
  before(setup);
  after(teardown);

  test("GET /api/memory → array of memory docs", async () => {
    const r = await fetch(`${BASE}/api/memory`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "body is array");
  });

  test("memory docs have required fields", async () => {
    const docs = await fetch(`${BASE}/api/memory`).then((r) => r.json());
    for (const doc of docs) {
      assert.ok(typeof doc.id === "string", `${doc.id}: id`);
      assert.ok(typeof doc.name === "string", `${doc.id}: name`);
      assert.ok(typeof doc.type === "string", `${doc.id}: type`);
    }
  });

  test("PATCH /api/memory/:id with content → 200", async () => {
    const docs = await fetch(`${BASE}/api/memory`).then((r) => r.json());
    if (docs.length === 0) return; // skip if no memory docs
    const doc = docs[0];
    const r = await fetch(`${BASE}/api/memory/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: doc.content || "test" }),
    });
    assert.equal(r.status, 200);
  });

  test("PATCH /api/memory/nonexistent → 404", async () => {
    const r = await fetch(`${BASE}/api/memory/nonexistent_xxx`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" }),
    });
    assert.equal(r.status, 404);
  });
});

// ─── Skills ───────────────────────────────────────────────────────────────────

describe("Skills API", () => {
  before(setup);
  after(teardown);

  test("GET /api/skills → array of skills", async () => {
    const r = await fetch(`${BASE}/api/skills`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body), "body is array");
  });

  test("skills have required fields", async () => {
    const skills = await fetch(`${BASE}/api/skills`).then((r) => r.json());
    for (const s of skills) {
      assert.ok(typeof s.id === "string", `${s.id}: id`);
      assert.ok(typeof s.name === "string", `${s.id}: name`);
    }
  });

  test("POST /api/skills → creates a skill", async () => {
    const r = await fetch(
      `${BASE}/api/skills`,
      json({
        name: "[TEST] My Custom Skill",
        category: "local",
        description: "Test skill",
        tags: ["test"],
      }),
    );
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.ok(typeof body.id === "string", "has id");

    // Cleanup
    await fetch(`${BASE}/api/skills/${body.id}`, { method: "DELETE" });
  });
});

// ─── Shell ────────────────────────────────────────────────────────────────────

describe("Shell API", () => {
  before(setup);
  after(teardown);

  test("POST /api/shell with allowed command → 200", async () => {
    const r = await fetch(`${BASE}/api/shell`, json({ command: "echo hello" }));
    // May be 200 or 403 depending on whitelist config
    assert.ok([200, 403].includes(r.status));
    if (r.status === 200) {
      const body = await r.json();
      assert.ok("output" in body || "stdout" in body, "has output");
    }
  });

  test("POST /api/shell with blocked command → 403", async () => {
    const r = await fetch(`${BASE}/api/shell`, json({ command: "rm -rf /" }));
    assert.equal(r.status, 403);
  });

  test("POST /api/shell missing command → 400", async () => {
    const r = await fetch(`${BASE}/api/shell`, json({}));
    assert.equal(r.status, 400);
  });
});
