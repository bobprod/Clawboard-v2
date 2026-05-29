// MCP Logger — simple wrapper around console
export function createLogger(prefix = "MCP") {
  const log = (level, msg, ...args) => console[level === "error" ? "error" : "log"](`[${prefix}] ${msg}`, ...args);
  return { info: (msg, ...a) => log("info", msg, ...a), warn: (msg, ...a) => log("warn", msg, ...a), error: (msg, ...a) => log("error", msg, ...a), debug: () => {} };
}
