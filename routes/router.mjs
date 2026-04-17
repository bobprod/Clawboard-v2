// ─── Mini Router ────────────────────────────────────────────────────────────
// Lightweight path matcher for Clawboard. Supports exact strings and RegExp.

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    this.routes.push({ method, pattern, handler });
    return this;
  }

  get(p, h) {
    return this.add("GET", p, h);
  }
  post(p, h) {
    return this.add("POST", p, h);
  }
  put(p, h) {
    return this.add("PUT", p, h);
  }
  patch(p, h) {
    return this.add("PATCH", p, h);
  }
  delete(p, h) {
    return this.add("DELETE", p, h);
  }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      if (typeof r.pattern === "string") {
        if (r.pattern === pathname) return { handler: r.handler, params: {} };
      } else {
        const m = pathname.match(r.pattern);
        if (m) return { handler: r.handler, params: m };
      }
    }
    return null;
  }
}
