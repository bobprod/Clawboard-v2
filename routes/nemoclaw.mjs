// ─── NemoClaw Routes (sandboxes, approvals, agents, presence) ───────────────
import { exec, spawn } from "child_process";
import https from "https";

// ── Native Fetch Helper (bypasses WSL shell for internal API) ─────────────
function fetchInsecure(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions = {
      method: options.method || "GET",
      rejectUnauthorized: false, // equivalent to curl -k
      ...options,
    };
    const req = https.request(url, reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          text: () => Promise.resolve(data),
          json: async () => JSON.parse(data)
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error("Timeout"));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── WSL Process Queue (prevents host exhaustion) ───────────────────────────
class WslQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await task()); } catch (e) { reject(e); }
      });
      this.next();
    });
  }
  async next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    this.running++;
    const task = this.queue.shift();
    await task();
    this.running--;
    this.next();
  }
}
const execQueue = new WslQueue(2); // Max 2 parallel wsl child processes

export function register(router, ctx) {
  const {
    pool,
    sseClients,
    sanitizeObject,
    AGENTS,
    runNemoClawCmd,
    parseNemoClawList,
    parseNemoClawStatus,
    sandboxesToAgents,
  } = ctx;

  // ── Approvals (Human-in-the-loop + OpenShell) ─────────────────────────────

  router.get("/api/approvals", ({ url, json, sse, res }) => {
    const isSSE = url.searchParams.get("stream") === "1";
    if (isSSE) {
      sse(sseClients.approvals);
      ctx.state.approvalQueue.values().then((items) => {
        res.write(`event: snapshot\ndata: ${JSON.stringify(items)}\n\n`);
      });
    } else {
      ctx.state.approvalQueue.values().then((items) => json(200, items));
    }
  });

  router.post(/^\/api\/approvals\/([^/]+)$/, ({ json, body, params }) => {
    body(async (b) => {
      const id = params[1];
      const decision = b.decision;
      if (!decision) return json(400, { error: "decision required" });
      const item = await ctx.state.approvalQueue.get(id);
      if (!item) return json(404, { error: "approval not found" });
      await ctx.state.approvalQueue.decide(id, decision);
      const event = `event: decision\ndata: ${JSON.stringify({ id, decision })}\n\n`;
      for (const c of sseClients.approvals) {
        try {
          c.write(event);
        } catch {
          sseClients.approvals.delete(c);
        }
      }
      if (item._openShellId) {
        const action = decision === "approve" ? "allow" : "deny";
        fetchInsecure(`https://127.0.0.1:8080/api/v1/requests/${item._openShellId}/${action}`, { method: "POST" })
          .catch(e => console.error("[OpenShell] proxy error:", e.message));
      }
      json(200, { ok: true, id, decision });
    });
  });

  // GET /api/nemoclaw/:name/approvals — poll OpenShell for blocked requests
  router.get(/^\/api\/nemoclaw\/([^/]+)\/approvals$/, async ({ json, params }) => {
    const sbName = params[1].replace(/[^a-z0-9-]/gi, "");
    try {
      // Very fast Node.js network request -> bypasses heavy child_process wsl wrapper
      const res = await fetchInsecure("https://127.0.0.1:8080/api/v1/requests?status=blocked");
      const raw = await res.json();
      
      const requests = (
        Array.isArray(raw) ? raw : raw.requests || raw.items || []
      ).map((r) => ({
        id: `os_${r.id || r.requestId || Math.random().toString(36).slice(2)}`,
        taskId: sbName,
        taskName: `Sandbox ${sbName}`,
        agent: sbName,
        reason: `Requête réseau bloquée : ${r.method || "GET"} ${r.url || r.host || "inconnu"}`,
        riskLevel: r.risk || "medium",
        requestedAt: r.timestamp || new Date().toISOString(),
        payload: r,
        _openShellId: r.id || r.requestId,
      }));

      for (const req of requests) {
        if (!(await ctx.state.approvalQueue.has(req.id))) {
          await ctx.state.approvalQueue.set(req.id, req);
          const event = `event: approval\ndata: ${JSON.stringify(req)}\n\n`;
          for (const c of sseClients.approvals) {
            try { c.write(event); } catch { sseClients.approvals.delete(c); }
          }
        }
      }
      json(200, requests);
    } catch {
      json(200, []); // Fail silently as it is polled frequently
    }
  });

  // ── Sandboxes ─────────────────────────────────────────────────────────────

  router.get("/api/nemoclaw/sandboxes", async ({ json }) => {
    try {
      const raw = await runNemoClawCmd("list");
      json(200, parseNemoClawList(raw));
    } catch (e) {
      json(503, { error: "NemoClaw non disponible", detail: e.message });
    }
  });

  // GET /api/nemoclaw/:name/status
  router.get(/^\/api\/nemoclaw\/([^/]+)\/status$/, async ({ json, params }) => {
    try {
      const raw = await runNemoClawCmd(`${params[1]} status`);
      json(200, parseNemoClawStatus(raw));
    } catch (e) {
      json(503, { error: "NemoClaw non disponible", detail: e.message });
    }
  });

  // GET /api/nemoclaw/:name/logs — SSE
  router.get(/^\/api\/nemoclaw\/([^/]+)\/logs$/, ({ res, req, params }) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(":ok\n\n");
    let child;
    try {
      child = spawn(
        "wsl",
        [
          "-d",
          "Ubuntu",
          "--",
          "bash",
          "-lc",
          `nemoclaw ${params[1]} logs --follow`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      child.stdout.on("data", (d) =>
        res.write(`data: ${JSON.stringify({ line: d.toString() })}\n\n`),
      );
      child.stderr.on("data", (d) =>
        res.write(`data: ${JSON.stringify({ line: d.toString() })}\n\n`),
      );
      child.on("close", () => {
        res.write('data: {"done":true}\n\n');
        res.end();
      });
      req.on("close", () => child.kill());
    } catch (e) {
      res.write(
        `data: ${JSON.stringify({ line: `Erreur: ${e.message}` })}\n\n`,
      );
      res.end();
    }
  });

  // POST /api/nemoclaw/:name/exec
  router.post(/^\/api\/nemoclaw\/([^/]+)\/exec$/, ({ json, body, params }) => {
    body(async (b) => {
      const safe = sanitizeObject(b);
      const command = (safe.command || "").trim();
      if (!command) return json(400, { error: "command required" });
      try {
        // Run safely inside our Queue to prevent WSL/Windows lockups
        const output = await execQueue.add(() => {
          return new Promise((resolve, reject) => {
            const cmd = `wsl -d Ubuntu -- bash -lc "nemoclaw ${params[1]} exec '${command.replace(/'/g, "'\\''")}'  2>&1"`;
            exec(cmd, { timeout: 45000, maxBuffer: 1024 * 512 }, (err, stdout) => {
              if (err && !stdout) reject(err);
              else resolve(stdout);
            });
          });
        });
        json(200, { ok: true, output });
      } catch (e) {
        json(500, { error: e.message });
      }
    });
  });

  // POST /api/nemoclaw/:name/connect
  router.post(/^\/api\/nemoclaw\/([^/]+)\/connect$/, ({ json, params }) => {
    json(200, {
      installed: false,
      sandbox: params[1],
      message: `Sandbox "${params[1]}" not found. NemoClaw is not installed on this server.`,
    });
  });

  // ── NemoClaw CLI proxy (status, logs, onboard, launch) ────────────────────

  router.get("/api/nemoclaw/status", ({ json }) => {
    json(200, {
      installed: false,
      version: null,
      sandboxes: [],
      message:
        'NemoClaw not installed on this host. Run "nemoclaw onboard" to set up.',
    });
  });

  router.get("/api/nemoclaw/logs", ({ json }) => {
    json(200, {
      installed: false,
      logs: [
        "[demo] NemoClaw is not installed on this server.",
        "[demo] Install it via: curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash",
        "[demo] Then run: nemoclaw onboard",
      ],
    });
  });

  router.post("/api/nemoclaw/onboard", ({ json }) => {
    json(200, {
      installed: false,
      message:
        'NemoClaw is not installed on this server. To install it on your machine, run:\n  curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash\nThen rerun "nemoclaw onboard" in your local terminal.',
    });
  });

  router.post("/api/nemoclaw/launch", ({ json }) => {
    json(200, {
      installed: false,
      message:
        'NemoClaw is not installed. Install it first, then run "nemoclaw launch".',
    });
  });

  router.get("/api/nemoclaw/openshell/term", ({ json }) => {
    json(200, {
      installed: false,
      message:
        "openshell is part of the NemoClaw toolkit. Install NemoClaw to use it.",
    });
  });

  router.get("/api/nemoclaw/openclaw/tui", ({ json }) => {
    json(200, {
      installed: false,
      message:
        "openclaw TUI requires NemoClaw to be installed locally. Use the Agent Chat module instead.",
    });
  });

  // ── Agents fleet ──────────────────────────────────────────────────────────

  router.get("/api/agents", async ({ json }) => {
    try {
      const raw = await runNemoClawCmd("list");
      const sandboxes = parseNemoClawList(raw);
      if (sandboxes.length > 0) return json(200, sandboxesToAgents(sandboxes));
    } catch {
      /* fall through to mock */
    }
    json(200, [...AGENTS.values()]);
  });

  router.post(/^\/api\/agents\/([^/]+)\/run$/, ({ json, params }) => {
    const agent = AGENTS.get(params[1]);
    if (!agent) return json(404, { error: "Agent not found" });
    agent.status = "active";
    json(200, agent);
  });

  router.post(/^\/api\/agents\/([^/]+)\/stop$/, ({ json, params }) => {
    const agent = AGENTS.get(params[1]);
    if (!agent) return json(404, { error: "Agent not found" });
    agent.status = "offline";
    json(200, agent);
  });

  // ── Presence ──────────────────────────────────────────────────────────────

  router.get("/api/presence", async ({ json }) => {
    try {
      const raw = await runNemoClawCmd("list");
      const sandboxes = parseNemoClawList(raw);
      const agents = sandboxesToAgents(sandboxes);
      json(
        200,
        agents.map((a) => ({
          id: a.id,
          label: a.label,
          status: a.status,
          model: a.model,
          provider: a.provider,
          lastSeen: new Date().toISOString(),
        })),
      );
    } catch {
      json(
        200,
        [...AGENTS.values()].map((a) => ({
          id: a.id,
          label: a.name || a.id,
          status:
            a.status === "active"
              ? "connected"
              : a.status === "offline"
                ? "offline"
                : "idle",
          model: "unknown",
          provider: "local",
          lastSeen: new Date().toISOString(),
        })),
      );
    }
  });
}
